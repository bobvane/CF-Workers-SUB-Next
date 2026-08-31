/**
 * IP 地理定位服务（纯 IP 批量）
 *
 * 用途：节点不具备国家/地区识别能力时，用其 server 查 IP 归属地 → 地区（emoji中文名）或 null。
 * 数据源：ip-api.com（免费，无需 key，支持批量接口，一次 HTTP 最多 100 个 IP）
 * 实现：批量 IP 定位（≤100IP/次），15 次/分钟滑动窗口限流，L1 内存+KV 兜底（7 天 TTL），失败回退到单个 IP 查询，不阻塞主流程。
 *
 * 注意：ip-api 免费版限 15 次 Batch HTTP 请求/分钟，不缓存批量查询结果（每次都重新查询，但批量查询不触发 rate limit，rate limit 指的是 Batch HTTP 请求次数，不是单个 IP 查询次数）。第一批查询瞬间可能超过 rate limit，但后续小批量可以容错；失效回退到单个 IP 请求。
 */

import { countryDisplayName } from '@/data/country-codes';

const IP_GEO_KEY_PREFIX = 'ip_geo:';
const IP_API_URL = 'http://ip-api.com/batch';
const IP_API_JSON_URL = 'http://ip-api.com/json/';
// Batch 限额：一次最多 100 个 IP，15 次/分钟滑动窗口
const BATCH_LIMIT = 100;
const RATE_LIMIT_REQUESTS = 15;
const RATE_LIMIT_WINDOW_MS = 60 * 1000; // 1 分钟
const IP_GEO_CACHE_MS = 30 * 24 * 60 * 60 * 1000; // 30 天缓存

interface IpApiBatchResponse {
  status: 'success' | 'fail';
  countryCode?: string;
  message?: string;
  query?: string;
}

export interface IpGeoCache {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
}

/** 批量 IP 查询（最多 100 个 IP），返回 Map<ip, country>，失败或无 countryCode 则为 null */
export async function batchQuery(
  ips: string[],
  cache: IpGeoCache,
  fetchFn: typeof fetch = fetch
): Promise<Map<string, string | null>> {
  if (!ips.length) return new Map();
  // 1. 检查缓存（仅用于单个 IP）
  const uncached: string[] = [];
  const result = new Map<string, string | null>();

  for (const ip of ips) {
    const cacheKey = IP_GEO_KEY_PREFIX + ip;
    try {
      const cached = await cache.get(cacheKey);
      if (cached) {
        const [ts, name] = cached.split('|');
        if (ts && name) {
          if (Date.now() - Number(ts) < IP_GEO_CACHE_MS) {
            result.set(ip, name === '__NULL__' ? null : name);
            continue;
          }
        } else {
          result.set(ip, cached === '__NULL__' ? null : cached);
          continue;
        }
      }
    } catch {
      // 缓存不可用不阻塞
    }
    uncached.push(ip);
  }

  if (!uncached.length) return result;

  // 2. 批量查询
  // 滑动窗口速率限制（简单实现，不持久化）
  const windowStart = Date.now() - RATE_LIMIT_WINDOW_MS;
  const history: number[] = [];
  try {
    const historyRaw = await cache.get('__ip_geo_batch_history');
    if (historyRaw) {
      const entries = JSON.parse(historyRaw) as number[];
      history.push(...entries.filter((ts) => ts > windowStart));
    }
  } catch {}

  if (history.length >= RATE_LIMIT_REQUESTS) {
    // 超过速率限制 -> 退回单个查询
    for (const ip of uncached) {
      try {
        const singleRes = await singleQuery(ip, fetchFn);
        result.set(ip, singleRes);
        // 缓存单查询结果
        try {
          await cache.set(IP_GEO_KEY_PREFIX + ip, `${Date.now()}|${singleRes || '__NULL__'}`);
        } catch {}
      } catch {
        result.set(ip, null);
      }
    }
    return result;
  }

  // 批量请求（最多 100 个 IP）
  const batch = uncached.slice(0, BATCH_LIMIT);
  const payload = batch.map((ip) => ({ query: ip }));
  const body = JSON.stringify(payload);

  let responses: IpApiBatchResponse[];
  try {
    const res = await fetchFn(IP_API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
      signal: AbortSignal.timeout(10000), // 10 秒超时
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    responses = (await res.json()) as IpApiBatchResponse[];
    if (!Array.isArray(responses)) throw new Error('Batch response format error');

    // 记录本次批量请求时间戳
    history.push(Date.now());
    try {
      await cache.set('__ip_geo_batch_history', JSON.stringify(history));
    } catch {}
  } catch {
    // 批量请求失败 -> 退回单个查询
    for (const ip of batch) {
      try {
        const singleRes = await singleQuery(ip, fetchFn);
        result.set(ip, singleRes);
        try {
          await cache.set(IP_GEO_KEY_PREFIX + ip, `${Date.now()}|${singleRes || '__NULL__'}`);
        } catch {}
      } catch {
        result.set(ip, null);
      }
    }
    // 处理剩余 uncached 项
    for (const ip of uncached.slice(batch.length)) {
      try {
        const singleRes = await singleQuery(ip, fetchFn);
        result.set(ip, singleRes);
        try {
          await cache.set(IP_GEO_KEY_PREFIX + ip, `${Date.now()}|${singleRes || '__NULL__'}`);
        } catch {}
      } catch {
        result.set(ip, null);
      }
    }
    return result;
  }

  // 批量成功 -> 映射结果
  const ipToCountry: Map<string, string | null> = new Map();
  for (let i = 0; i < batch.length && i < responses.length; i++) {
    const ip = batch[i];
    const resp = responses[i];
    let country: string | null = null;
    if (resp?.status === 'success' && resp.countryCode) {
      const display = countryDisplayName(resp.countryCode);
      country = display || null;
    }
    ipToCountry.set(ip, country);
    // 缓存结果
    try {
      await cache.set(IP_GEO_KEY_PREFIX + ip, `${Date.now()}|${country || '__NULL__'}`);
    } catch {}
  }

  // 合并到主结果
  for (const [ip, country] of ipToCountry) {
    result.set(ip, country);
  }

  // 剩余 uncached 项 -> 单个查询
  for (const ip of uncached.slice(batch.length)) {
    try {
      const singleRes = await singleQuery(ip, fetchFn);
      result.set(ip, singleRes);
      try {
        await cache.set(IP_GEO_KEY_PREFIX + ip, `${Date.now()}|${singleRes || '__NULL__'}`);
      } catch {}
    } catch {
      result.set(ip, null);
    }
  }

  return result;
}

/** 单个 IP 查询（备用） */
export async function singleQuery(
  ip: string,
  fetchFn: typeof fetch = fetch
): Promise<string | null> {
  try {
    const res = await fetchFn(`${IP_API_JSON_URL}${encodeURIComponent(ip)}`, {
      signal: AbortSignal.timeout(5000), // 5 秒超时
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { status: 'success' | 'fail'; countryCode?: string };
    if (data.status !== 'success' || !data.countryCode) return null;
    const display = countryDisplayName(data.countryCode);
    return display || null;
  } catch {
    return null;
  }
}

export interface PrewarmResult {
  total: number;
  cached: number;
  queried: number;
  resolved: number;
  failed: number;
}

/**
 * 主动预填充（Pre-warm）：批量合并查询一批 server 的 IP 归属地并写入 KV 缓存。
 *
 * 作用：把 IP 地理查询与「配置生成」解耦。配置生成时 resolver 直接命中 KV 缓存，
 * 不再触发任何 HTTP；真正的外网查询只在此处发生。
 *
 * 流程：
 *   1. 逐个 server 先查 KV 缓存（30 天 TTL），命中且未过期则跳过
 *   2. 未命中项交给 batchQuery 合并成单次批量查询（≤100/IP/次自动分批 + 15 次/分钟限流）
 *   3. batchQuery 逐 IP 写回 KV 缓存（失败/无归属写 __NULL__，同样防重复查询）
 *
 * @returns 统计信息（供日志/返回体展示本次查询情况）
 */
export async function prewarmIpGeo(
  servers: string[],
  cache: IpGeoCache,
  fetchFn: typeof fetch = fetch
): Promise<PrewarmResult> {
  const unique = [...new Set(servers.filter(Boolean))];
  const result: PrewarmResult = {
    total: unique.length,
    cached: 0,
    queried: 0,
    resolved: 0,
    failed: 0,
  };
  if (unique.length === 0) return result;

  // 1. 剔除缓存命中项（命中且未过期）
  const uncached: string[] = [];
  for (const ip of unique) {
    const cacheKey = IP_GEO_KEY_PREFIX + ip;
    try {
      const cached = await cache.get(cacheKey);
      if (cached) {
        const [ts, name] = cached.split('|');
        const fresh = ts && name
          ? Date.now() - Number(ts) < IP_GEO_CACHE_MS
          : true; // 旧格式无时间戳视为有效
        if (fresh) {
          result.cached++;
          continue;
        }
      }
    } catch {
      // 缓存不可用不阻塞
    }
    uncached.push(ip);
  }

  if (uncached.length === 0) return result;

  // 2. 批量合并查询（batchQuery 内部自动分批 ≤100/IP + 限流 + 写回缓存）
  result.queried = uncached.length;
  const map = await batchQuery(uncached, cache, fetchFn);
  for (const country of map.values()) {
    if (country) result.resolved++;
    else result.failed++;
  }
  return result;
}

/** 创建纯 IP 地理定位 resolver */
export function createIpGeoResolver(
  cache: IpGeoCache,
  fetchFn: typeof fetch = fetch
): (server: string) => Promise<string | null> {
  // 用于批量查询的内存缓存，过期清理（LRU 风格，简单实现）
  const batchCache = new Map<string, { country: string | null; ts: number }>();

  return async (server: string): Promise<string | null> => {
    if (!server) return null;
    const cacheKey = IP_GEO_KEY_PREFIX + server;

    // 1. 查本批缓存
    const cached = batchCache.get(cacheKey);
    if (cached && Date.now() - cached.ts < 5000) { // 5 秒新鲜
      return cached.country;
    }

    // 2. 查持久化缓存
    try {
      const persisted = await cache.get(cacheKey);
      if (persisted) {
        const [ts, name] = persisted.split('|');
        if (ts && name) {
          if (Date.now() - Number(ts) < IP_GEO_CACHE_MS) {
            const country = name === '__NULL__' ? null : name;
            batchCache.set(cacheKey, { country, ts: Date.now() });
            return country;
          }
        } else {
          const country = persisted === '__NULL__' ? null : persisted;
          batchCache.set(cacheKey, { country, ts: Date.now() });
          return country;
        }
      }
    } catch {
      // 缓存不可用不阻塞
    }

    // 3. 批量查询 IP（每个请求最多 100 个 IP）
    // 注意：这里为了简化，实现为每次查询都发一个批量请求，生产环境可以做请求合并
    const ips = [server];
    const map = await batchQuery(ips, cache, fetchFn);
    const country = map.get(server) || null;
    batchCache.set(cacheKey, { country, ts: Date.now() });

    return country;
  };
}