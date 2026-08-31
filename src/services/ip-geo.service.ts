/**
 * IP 地理定位服务（IP 兜底）
 *
 * 用途：节点名无法识别地区时，用节点 server 查 IP 归属地 → 地区（emoji中文名）。
 * 数据源：ip-api.com Batch API（免费、无需 key、单次 POST ≤100 IP）
 * 缓存：L1 模块级内存 Map（单请求内 single-flight + 跨请求 TTL）
 *       + L2 KV（settings，TTL 7 天）
 *
 * v2.11.9 架构：
 *   1. createIpGeoResolver 接口签名不变（(server)=>Promise<string|null>）— QA 关注：纯函数签名零破坏
 *   2. 内部 deferred batch：首次调用某 IP 时把任务入队，await 微任务聚合（Promise 链）
 *      → 攒到 ≤100 IP 或 1 个微任务周期后，单次 Batch POST 落地
 *   3. 内存 L1 Map（TTL 与 KV 一致）作第一层缓存层 + L1 内 single-flight 合并同 IP 并发请求
 *   4. 模块级信号灯：硬控 Batch ≤15 次/分钟（多用户全局共享）— SRE 关注
 *   5. fail-open：网络/超时/限频/解析失败 → 返回 null → 名字加权评分兜底 — 全员共识
 *   6. KV 写 fire-and-forget，不 await 关键路径
 *   7. KV TTL 7 天（评论家：IP 归属变化快，别固化错误 30 天）
 *
 * 决策依据：v2.11.9 五方评审综合方案（架构师/产品经理/评论家/QA/SRE，2026-08-31）
 */

import { countryDisplayName } from '@/data/country-codes';

const IP_GEO_KEY_PREFIX = 'ip_geo:';
const IP_API_BATCH_URL = 'http://ip-api.com/batch'; // Batch 端点（POST，单次 ≤100 IP）
/** IP 缓存有效期 7 天（评论家建议：IP 归属变化快，别固化错误 30 天） */
export const IP_GEO_CACHE_MS = 7 * 24 * 60 * 60 * 1000;
/** Batch 单批最大 IP 数（ip-api 官方 ≤100） */
const BATCH_MAX_SIZE = 100;
/** 模块级信号灯：硬控 Batch ≤15 次/分钟（ip-api batch 官方限频） */
const BATCH_RPM_LIMIT = 15;
const BATCH_RPM_WINDOW_MS = 60 * 1000;

interface IpApiBatchItem {
  query: string;
  status: 'success' | 'fail';
  countryCode?: string;
  message?: string;
}

interface IpApiBatchResponse extends Array<IpApiBatchItem> {}

export interface IpGeoCache {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
}

/**
 * 模块级 L1 缓存：server → { displayName | null, exp }。
 * KV 一致性短窗内（写后立即读未落 KV）靠 L1 兜底。
 */
interface L1Entry {
  /** 已解析的显示名（'🇭🇰 香港' 等）；null 表示已查询但无结果（避免重复打 ip-api） */
  display: string | null;
  exp: number;
}
const L1_CACHE = new Map<string, L1Entry>();

/** 模块级 pending 集合：deferred batch 攒批 */
interface PendingTask {
  server: string;
  resolve: (display: string | null) => void;
  reject: (err: Error) => void;
}
let pendingBatch: PendingTask[] = [];
let batchScheduled = false;
let batchFlushing: Promise<void> | null = null;

/** 模块级信号灯：记录近 60s 内的 Batch 提交时间戳 */
const batchTimestamps: number[] = [];

/**
 * 判断是否纯 IPv4 地址（域名/IPv6 跳过，CDN/前置代理会污染结果）
 */
function isPureIpv4(host: string): boolean {
  return /^\d{1,3}(\.\d{1,3}){3}$/.test(host);
}

/**
 * 读 L1 缓存（命中且未过期即返回）
 */
function readL1(server: string): string | null | undefined {
  const entry = L1_CACHE.get(server);
  if (!entry) return undefined;
  if (Date.now() > entry.exp) {
    L1_CACHE.delete(server);
    return undefined;
  }
  return entry.display;
}

/**
 * 写 L1 缓存
 */
function writeL1(server: string, display: string | null): void {
  L1_CACHE.set(server, { display, exp: Date.now() + IP_GEO_CACHE_MS });
}

/**
 * 检查 Batch 信号灯：若近 60s 内已 ≥15 次，限流（返回 true 表示应限流）
 */
function isRateLimited(): boolean {
  const now = Date.now();
  // 清理窗口外时间戳
  while (batchTimestamps.length > 0 && batchTimestamps[0]! < now - BATCH_RPM_WINDOW_MS) {
    batchTimestamps.shift();
  }
  return batchTimestamps.length >= BATCH_RPM_LIMIT;
}

/**
 * 标记一次 Batch 提交（加入时间戳）
 */
function markBatchSent(): void {
  batchTimestamps.push(Date.now());
}

/**
 * 调度 flush：下一微任务触发 batch POST
 */
function scheduleFlush(): void {
  if (batchScheduled) return;
  batchScheduled = true;
  // 微任务（queueMicrotask）保证同一 await tick 内的多次调用合并
  queueMicrotask(() => {
    batchScheduled = false;
    flushBatch().catch(() => {
      // flush 失败已被内部 try/catch 吞掉，这里再吞一层防止 unhandled rejection
    });
  });
}

/**
 * 真正执行 Batch POST：≤100 IP 一批，循环处理所有 pending。
 * 失败：所有未解析任务 resolve(null)，走名字加权评分兜底。
 */
async function flushBatch(): Promise<void> {
  if (batchFlushing) {
    // 上一批还在飞，pending 已在 pendingBatch 中，等下批
    return;
  }
  if (pendingBatch.length === 0) return;

  // 限流检查：超限则全部任务立即 resolve(null)
  if (isRateLimited()) {
    const tasks = pendingBatch;
    pendingBatch = [];
    for (const t of tasks) t.resolve(null);
    return;
  }

  batchFlushing = (async () => {
    while (pendingBatch.length > 0) {
      if (isRateLimited()) {
        // 限流：剩余任务全 null
        const tasks = pendingBatch;
        pendingBatch = [];
        for (const t of tasks) t.resolve(null);
        return;
      }

      // 取一批
      const tasks = pendingBatch.splice(0, BATCH_MAX_SIZE);
      const ips = tasks.map((t) => t.server);
      markBatchSent();

      let results: IpApiBatchResponse | null = null;
      try {
        const res = await CURRENT_FETCH(IP_API_BATCH_URL, {
          method: 'POST',
          // ip-api batch 接受：JSON 字符串数组 ['1.1.1.1','2.2.2.2'] 或单 IP query string
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(ips.map((ip) => ({ query: ip }))),
        });
        if (res.ok) {
          results = (await res.json()) as IpApiBatchResponse;
        }
      } catch {
        // 网络异常 → null
      }

      // 分发结果：成功且 countryCode 有效才返回显示名，否则 null
      for (let i = 0; i < tasks.length; i++) {
        const task = tasks[i]!;
        const item = results?.[i];
        let display: string | null = null;
        if (item && item.status === 'success' && item.countryCode) {
          display = countryDisplayName(item.countryCode) ?? null;
        }
        // 写 L1
        writeL1(task.server, display);
        // 写 L2 KV（fire-and-forget）
        fireAndForgetWriteKv(task.server, display);
        // resolve
        task.resolve(display);
      }
    }
  })().finally(() => {
    batchFlushing = null;
  });

  return batchFlushing;
}

/**
 * 异步写 KV（fire-and-forget，失败不阻塞）
 */
function fireAndForgetWriteKv(server: string, display: string | null): void {
  // 闭包捕获 cache 引用通过 L1 写入：直接通过全局 cache 引用
  const cache = CURRENT_CACHE;
  if (!cache) return;
  const cacheKey = IP_GEO_KEY_PREFIX + server;
  const value = display === null ? '__NULL__' : display;
  cache
    .set(cacheKey, `${Date.now()}|${value}`)
    .catch(() => {
      // KV 写失败不阻塞
    });
}

/** 当前 cache 引用（fire-and-forget 写 KV 用） */
let CURRENT_CACHE: IpGeoCache | null = null;
/** 当前 fetch 实现（默认全局 fetch，测试时可注入） */
let CURRENT_FETCH: typeof fetch = (...args) => fetch(...(args as Parameters<typeof fetch>));

/**
 * 创建 IP 地理定位 resolver（deferred batch 模式）
 *
 * 接口签名 v2.11.9 保持与 v2.11.8 完全一致 — QA 关注：纯函数签名零破坏。
 * 内部行为：首次调用某 IP 时入队；同 tick 内多次调用合并为一次 Batch POST。
 *
 * @param cache KV 缓存适配器（复用 settings repo 的 KV 能力）
 * @param fetchFn 可注入 fetch（测试用，默认全局 fetch）
 */
export function createIpGeoResolver(
  cache: IpGeoCache,
  fetchFn: typeof fetch = fetch
): (server: string) => Promise<string | null> {
  // 同步全局引用（fire-and-forget 写 KV 用）
  CURRENT_CACHE = cache;
  // 同步 fetch 实现（默认全局 fetch，测试时可注入）
  CURRENT_FETCH = fetchFn;

  return async (server: string): Promise<string | null> => {
    if (!server) return null;
    // 域名/IPv6 跳过：CDN/前置代理会污染 ip-api 结果（v2.11.9 共识）
    if (!isPureIpv4(server)) return null;

    // L1 命中
    const l1 = readL1(server);
    if (l1 !== undefined) return l1;

    // L2 KV 命中（同步读后再写 L1）
    const cacheKey = IP_GEO_PREFIX_FOR_L2(server);
    try {
      const cached = await cache.get(cacheKey);
      if (cached) {
        const [ts, name] = cached.split('|');
        if (ts && name) {
          if (Date.now() - Number(ts) < IP_GEO_CACHE_MS) {
            const display = name === '__NULL__' ? null : name;
            writeL1(server, display);
            return display;
          }
        } else {
          // 旧格式（无时间戳）— 视为有效
          const display = cached === '__NULL__' ? null : cached;
          writeL1(server, display);
          return display;
        }
      }
    } catch {
      // KV 读失败不阻塞
    }

    // L1+L2 都未命中：入 deferred batch
    return new Promise<string | null>((resolve, reject) => {
      // single-flight：去重（同一 server 已在 pending 中则合并）
      const existing = pendingBatch.find((t) => t.server === server);
      if (existing) {
        // 多个并发调用共享同一结果
        const originalResolve = existing.resolve;
        existing.resolve = (display) => {
          originalResolve(display);
          resolve(display);
        };
        return;
      }
      pendingBatch.push({ server, resolve, reject });
      scheduleFlush();
    });
  };
}

/** 内部 helper：构造 L2 KV key */
function IP_GEO_PREFIX_FOR_L2(server: string): string {
  return IP_GEO_KEY_PREFIX + server;
}

/**
 * 清空模块级状态（仅供测试使用）。
 * 重置 L1 缓存、pending batch、信号灯。
 */
export function __resetIpGeoStateForTests(): void {
  L1_CACHE.clear();
  pendingBatch = [];
  batchScheduled = false;
  batchFlushing = null;
  batchTimestamps.length = 0;
  CURRENT_CACHE = null;
  CURRENT_FETCH = (...args) => fetch(...(args as Parameters<typeof fetch>));
}

/**
 * 当前 pending 任务数（仅供测试 / 监控使用）
 */
export function __getIpGeoPendingCount(): number {
  return pendingBatch.length;
}

/**
 * 重新定位单个 IP（低调「重新定位」次级动作，v2.11.9 产品经理方案）
 *
 * 流程：清 L1 缓存 → 清 KV 缓存 → 强制走一次新的 IP 查询（Batch + 信号灯护栏）。
 * 返回新解析的显示名（'🇭🇰 香港' 等），失败返回 null（fail-open，调用方回落名字加权）。
 *
 * @param cache KV 缓存适配器（复用 settings repo 的 KV 能力）
 * @param server 节点 server（必须是纯 IPv4；非 IPv4 调用方应前置拦截）
 */
export async function relocateIpGeo(
  cache: IpGeoCache,
  server: string
): Promise<string | null> {
  // 非纯 IPv4 直接 null（与 resolver 内部一致：域名跳过）
  if (!isPureIpv4(server)) return null;

  // 1. 清 L1 缓存
  L1_CACHE.delete(server);
  // 2. 清 KV 缓存（异步；失败不阻塞重查）
  try {
    await cache.set(IP_GEO_KEY_PREFIX + server, ''); // 置空标记失效；不删除键避免并发读读到旧值
  } catch {
    // 忽略
  }
  // 3. 强制新查：直接复用 createIpGeoResolver 的批处理 + 信号灯护栏
  const resolver = createIpGeoResolver(cache, CURRENT_FETCH);
  return resolver(server);
}

/** 判断是否为纯 IPv4 地址（供路由层/前端暴露 relocatable 用） */
export function isIpv4(host: string): boolean {
  return isPureIpv4(host);
}
