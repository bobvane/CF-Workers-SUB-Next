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
import { fetchSubscription } from '@/engine/fetcher';
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
    async () => (await repos.rules.list()).map((r) => ({ type: r.type, pattern: r.pattern, enabled: r.enabled }))
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
  });
}

// 缓存应用实例
let appPromise: Promise<Hono> | null = null;

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
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
    return app.fetch(request, env);
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
      async () => (await repos.rules.list()).map((r) => ({ type: r.type, pattern: r.pattern, enabled: r.enabled }))
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
    console.warn(`[SubAutoUpdate] 每日订阅更新完成: ${results.join(', ')}`);
  },
};