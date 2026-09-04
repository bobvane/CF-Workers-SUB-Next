/**
 * CF-Workers-SUB-Next V2 Worker 入口
 * 装配所有依赖：KV → 仓储 → 服务 → API 路由 → 前端
 */

import { Hono } from 'hono';
import { createApp } from '@/api/routes';
import {
  KvAdapter,
  createRepositories,
} from '@/storage/kv';
import { createAuthService, createPasswordHash, ADMIN_USERNAME_KEY, DEFAULT_USERNAME } from '@/services/auth.service';
import { createSubscriptionService } from '@/services/subscription.service';
import { createConfigService } from '@/services/config.service';
import { createCatalogSyncService } from '@/services/catalog-sync.service';
import { deduplicateNodes } from '@/parser';
import { fetchSubscription } from '@/engine/fetcher';
import { CleanRule } from '@/models/clean-rule';
import HTML from '@/html';

export interface Env {
  DATABASE: KVNamespace;
  ADMIN_PASSWORD?: string;
  SESSION_SECRET?: string;
  /** GitHub Personal Access Token（提升 API 限流至 5000/h，用于规则目录同步） */
  GITHUB_TOKEN?: string;
}

/** 创建带 GitHub Token 的 fetcher（用于 rule-catalog 同步） */
function createCatalogFetcher(token?: string) {
  return (url: string) => {
    const headers: Record<string, string> = {};
    if (token && url.includes('api.github.com')) {
      // Fine-grained PAT 只认 Bearer，不认 token 前缀
      headers['Authorization'] = `Bearer ${token}`;
      headers['User-Agent'] = 'cf-workers-sub-next';
    }
    return fetch(url, { headers }).then((r) => {
      if (!r.ok) throw new Error(`fetch ${url} failed: ${r.status}`);
      return r.text();
    });
  };
}

async function buildApp(env: Env): Promise<Hono> {
  const kv = new KvAdapter(env.DATABASE);
  const repos = createRepositories(kv);

  // 首次部署初始化
  try {
    const existing = await kv.get('admin:hash');
    if (!existing && env.ADMIN_PASSWORD) {
      const { hash, salt } = await createPasswordHash(env.ADMIN_PASSWORD);
      await kv.put('admin:hash', JSON.stringify({ hash, salt }));
    }
    // 用户名初始化：旧部署自动补上默认 'admin'，不覆盖已有自定义用户名
    const existingUsername = await kv.get(ADMIN_USERNAME_KEY);
    if (!existingUsername) {
      await kv.put(ADMIN_USERNAME_KEY, DEFAULT_USERNAME);
    }
    // 密码版本号初始化（v2.21.0）：旧部署若无记录则写入版本 0
    const versionRaw = await kv.get('setting:password_version');
    if (!versionRaw) {
      await kv.put('setting:password_version', '0');
    }
  } catch (err) {
    console.error('Failed to initialize admin password:', (err as Error).message);
  }

  const auth = createAuthService(repos.sessions, async () => {
    const raw = await kv.get('admin:hash');
    if (raw) {
      try { return JSON.parse(raw) as { hash: string; salt: string }; } catch { return null; }
    }
    return null;
  }, { get: (key) => kv.get(key), put: (key, value) => kv.put(key, value) });

  const subscriptions = createSubscriptionService(
    repos,
    fetchSubscription,
    async () => (await repos.rules.list()).map((r) => ({ type: r.type, pattern: r.pattern, enabled: r.enabled })),
    async () => {
      const raw = await repos.settings.get('clean_rules');
      if (!raw) return [];
      try { return JSON.parse(raw) as CleanRule[]; } catch { return []; }
    }
  );

  const config = createConfigService(repos);

  // 规则目录同步服务（供 scheduled handler + API 共用）
  const catalogSync = createCatalogSyncService(repos, createCatalogFetcher(env.GITHUB_TOKEN));

  return createApp({
    repos, auth, subscriptions, config,
    adminPassword: env.ADMIN_PASSWORD ?? '',
    fetchRaw: fetchSubscription,
    parseContent: async () => [],
    catalogSync,
    storage: kv,
  });
}

// 缓存应用实例
let appPromise: Promise<Hono> | null = null;

export default {
  async fetch(request: Request, env: Env, executionCtx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    // 前端页面：非 API 和非 /sub 请求返回 HTML
    if (!url.pathname.startsWith('/api/') && !url.pathname.startsWith('/sub/')) {
      return new Response(HTML, {
        headers: { 'Content-Type': 'text/html; charset=utf-8' },
      });
    }

    if (!appPromise) {
      appPromise = buildApp(env);
    }
    const app = await appPromise;
    // Hono v4：第三参 executionCtx 传入，c.executionCtx 才可用（IP 地理预填充后台 waitUntil）
    return app.fetch(request, env, executionCtx);
  },

  /** 定时任务：每月 1 号 03:00 UTC 规则目录同步；每天按用户设定时间(默认北京时间07:00)自动更新全部订阅 */
  async scheduled(controller: ScheduledController, env: Env): Promise<void> {
    const kv = new KvAdapter(env.DATABASE);
    const repos = createRepositories(kv);
    const cron = controller.cron;

    // 每月 1 号规则目录同步
    if (cron === '0 3 1 * *') {
      const catalogSync = createCatalogSyncService(repos, createCatalogFetcher(env.GITHUB_TOKEN));
      const result = await catalogSync.sync();
      if (result.status === 'stale') {
        console.warn(`[CatalogSync] 扫描失败: ${result.error}`);
      } else {
        console.warn(`[CatalogSync] 扫描完成: ${result.total} 个分类, 新增 ${result.added.length}, 移除 ${result.removed.length}`);
      }
      return;
    }

    // 每分钟未识别国家码自动重试（v2.19.1）：发现未识别 IP 全量批量重查，连续重试 10 次后停止并提示检查节点
    // v2.25.0：任务门闩（active 哨兵）——正常态（无未识别 IP）直接短路，0 KV 写，不再每分钟跑全量/写归零状态
    if (cron === '* * * * *') {
      try {
        const { prewarmIpGeo, filterUnlocatedServers, getGeoRetryGate, setGeoRetryGate, deactivateGeoRetry, GEO_RETRY_MAX } = await import('@/services/ip-geo.service');
        const ipGeoCache = { get: (k: string): Promise<string | null> => repos.settings.get(k), set: (k: string, v: string) => repos.settings.set(k, v) };

        // ① 门闩短路：无激活重试任务 → 直接 return（0 KV 写，不跑 getAll、不查 IP）
        const gate = await getGeoRetryGate(repos.settings);
        if (!gate.active) return;

        const allNodes = deduplicateNodes(await repos.nodes.getAll());
        const servers = [...new Set(allNodes.map((n) => n.server).filter((v): v is string => typeof v === 'string'))];
        if (servers.length === 0) {
          await deactivateGeoRetry(repos.settings);
          return;
        }
        const unlocated = await filterUnlocatedServers(servers, ipGeoCache);

        if (unlocated.length === 0) {
          // 全部已识别：关闭门闩，回到 0 KV 写睡眠态
          await deactivateGeoRetry(repos.settings);
          await repos.settings.set('geo_pending_result', JSON.stringify({ ts: Date.now(), unlocatedServers: [] }));
          return;
        }

        if (gate.count >= GEO_RETRY_MAX) {
          // 连续 N 次仍有未识别：关闭门闩停止重试，记录剩余 IP 供界面提示「建议检查节点正确性」
          await deactivateGeoRetry(repos.settings);
          await repos.settings.set('geo_pending_result', JSON.stringify({ ts: Date.now(), unlocatedServers: unlocated }));
          return;
        }

        // 全量批量重查（batchQuery 内部 15 次/分钟限流兜底，未识别 IP 全在池子里一次查完）
        const res = await prewarmIpGeo(unlocated, ipGeoCache);
        const after = await filterUnlocatedServers(servers, ipGeoCache);
        await setGeoRetryGate(repos.settings, { ts: Date.now(), count: gate.count + 1, active: true });
        if (after.length === 0) {
          // 本次查完清零并关闭门闩
          await deactivateGeoRetry(repos.settings);
          await repos.settings.set('geo_pending_result', JSON.stringify({ ts: Date.now(), unlocatedServers: [] }));
          return;
        }
        // 仍有残留：更新提示结果（界面实时可见剩余 IP），保持 active 继续下一分钟重试
        await repos.settings.set('geo_pending_result', JSON.stringify({ ts: Date.now(), unlocatedServers: after }));
        console.warn(`[GeoRetry] 第${gate.count + 1}次重试: 查${res.queried} 剩${after.length}`);
      } catch (e) {
        console.warn(`[GeoRetry] 重试失败(不阻塞): ${(e as Error).message}`);
      }
      return;
    }

    // 每日订阅自动更新（时间由设置页 sub_auto_update_hour 控制，北京时间）
    const hourSetting = await repos.settings.get('sub_auto_update_hour');
    const hour = hourSetting !== null ? parseInt(hourSetting, 10) : 7;
    if (Number.isNaN(hour) || hour < 0 || hour > 23) return;
    // UTC 时间 = 北京时间 - 8
    const utcHourNow = controller.scheduledTime ? new Date(controller.scheduledTime).getUTCHours() : new Date().getUTCHours();
    if (utcHourNow !== ((hour - 8 + 24) % 24)) return;

    const subs = createSubscriptionService(
      repos,
      fetchSubscription,
      async () => (await repos.rules.list()).map((r) => ({ type: r.type, pattern: r.pattern, enabled: r.enabled })),
      async () => {
        const raw = await repos.settings.get('clean_rules');
        if (!raw) return [];
        try { return JSON.parse(raw) as CleanRule[]; } catch { return []; }
      }
    );
    const results: string[] = [];
    for (const s of await subs.list()) {
      try {
        const { nodeCount } = await subs.update(s.id, fetchSubscription);
        results.push(`${s.name}:${nodeCount}节点`);
      } catch (e) {
        results.push(`${s.name}:失败(${(e as Error).message})`);
      }
    }
    // 主动预填充 IP 地理缓存：全部订阅更新后，批量查一遍 server 归属地
    // v2.25.0：cache 统一走 repos.settings（setting: 前缀，与手动更新/前端统计同口径）；
    //          预热后若有未识别 IP 则激活 GeoRetry 门闩，唤醒每分钟 cron 继续重查
    try {
      const { prewarmIpGeo, filterUnlocatedServers, activateGeoRetry } = await import('@/services/ip-geo.service');
      const allNodes = deduplicateNodes(await repos.nodes.getAll());
      const servers = [...new Set(allNodes.map((n) => n.server).filter((v): v is string => typeof v === 'string'))];
      if (servers.length > 0) {
        const ipGeoCache = { get: (k: string) => repos.settings.get(k), set: (k: string, v: string) => repos.settings.set(k, v) };
        const geoResult = await prewarmIpGeo(servers, ipGeoCache);
        const unlocated = await filterUnlocatedServers(servers, ipGeoCache);
        await activateGeoRetry(unlocated.length, repos.settings);
        console.warn(`[SubAutoUpdate] IP地理预填充完成: 总数 ${geoResult.total}，已缓存 ${geoResult.cached}，新查 ${geoResult.queried}，解析成功 ${geoResult.resolved}，失败 ${geoResult.failed}，剩余未识别 ${unlocated.length}`);
      }
    } catch (e) {
      console.warn(`[SubAutoUpdate] IP地理预填充失败(不阻塞): ${(e as Error).message}`);
    }
    console.warn(`[SubAutoUpdate] 每日订阅更新完成: ${results.join(', ')}`);
  },
};