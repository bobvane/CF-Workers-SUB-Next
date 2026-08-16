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
import { createAuthService, createPasswordHash } from '@/services/auth.service';
import { createSubscriptionService } from '@/services/subscription.service';
import { createConfigService } from '@/services/config.service';
import { createCatalogSyncService } from '@/services/catalog-sync.service';
import { fetchSubscription } from '@/engine/fetcher';
import HTML from '@/html';

export interface Env {
  DATABASE: KVNamespace;
  ADMIN_PASSWORD?: string;
  SESSION_SECRET?: string;
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
  } catch (err) {
    console.error('Failed to initialize admin password:', (err as Error).message);
  }

  const auth = createAuthService(repos.sessions, async () => {
    const raw = await kv.get('admin:hash');
    if (raw) {
      try { return JSON.parse(raw) as { hash: string; salt: string }; } catch { return null; }
    }
    return null;
  });

  const subscriptions = createSubscriptionService(
    repos,
    fetchSubscription,
    async () => (await repos.rules.list()).map((r) => ({ type: r.type, pattern: r.pattern, enabled: r.enabled }))
  );

  const config = createConfigService(repos);

  // 规则目录同步服务（供 scheduled handler + API 共用）
  const catalogSync = createCatalogSyncService(repos, (url) => fetch(url).then((r) => {
    if (!r.ok) throw new Error(`fetch ${url} failed: ${r.status}`);
    return r.text();
  }));

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

  /** 规则目录定时同步（每月 1 号 03:00 UTC） */
  async scheduled(_controller: ScheduledController, env: Env): Promise<void> {
    const kv = new KvAdapter(env.DATABASE);
    const repos = createRepositories(kv);
    const catalogSync = createCatalogSyncService(repos, (url) => fetch(url).then((r) => {
      if (!r.ok) throw new Error(`fetch ${url} failed: ${r.status}`);
      return r.text();
    }));
    const result = await catalogSync.sync();
    if (result.status === 'stale') {
      console.error(`[CatalogSync] 扫描失败: ${result.error}`);
    } else {
      console.log(`[CatalogSync] 扫描完成: ${result.total} 个分类, 新增 ${result.added.length}, 移除 ${result.removed.length}`);
    }
  },
};