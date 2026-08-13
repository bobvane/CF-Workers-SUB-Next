/**
 * CF-Workers-SUB-Next V2 Worker 入口
 * 装配所有依赖：KV → 仓储 → 服务 → API 路由
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
import { fetchSubscription } from '@/engine/fetcher';

export interface Env {
  /** Cloudflare KV 数据存储 */
  DATABASE: KVNamespace;
  /** 管理员密码（Secret） */
  ADMIN_PASSWORD?: string;
  /** Session 加密密钥（Secret） */
  SESSION_SECRET?: string;
}

/**
 * 构建并初始化应用
 * 首次运行时从 ADMIN_PASSWORD 创建管理员密码哈希
 */
async function buildApp(env: Env): Promise<Hono> {
  const kv = new KvAdapter(env.DATABASE);
  const repos = createRepositories(kv);

  // 初始化：首次部署时从 ADMIN_PASSWORD 创建管理员密码哈希
  try {
    const existing = await kv.get('admin:hash');
    if (!existing && env.ADMIN_PASSWORD) {
      const { hash, salt } = await createPasswordHash(env.ADMIN_PASSWORD);
      await kv.put('admin:hash', JSON.stringify({ hash, salt }));
    }
  } catch (err) {
    console.error('Failed to initialize admin password:', (err as Error).message);
  }

  // 认证服务
  const auth = createAuthService(repos.sessions, async () => {
    const raw = await kv.get('admin:hash');
    if (raw) {
      try {
        return JSON.parse(raw) as { hash: string; salt: string };
      } catch {
        return null;
      }
    }
    return null;
  });

  // 订阅服务（接入 parser 管线 + SSRF 防护 fetcher）
  const subscriptions = createSubscriptionService(
    repos,
    fetchSubscription,
    async () => (await repos.rules.list()).map((r) => ({
      type: r.type,
      pattern: r.pattern,
      enabled: r.enabled,
    }))
  );

  // 配置输出服务
  const config = createConfigService(repos);

  // 应用路由
  return createApp({
    repos,
    auth,
    subscriptions,
    config,
    adminPassword: env.ADMIN_PASSWORD ?? '',
    fetchRaw: fetchSubscription,
    parseContent: async () => [],
  });
}

// 缓存应用实例，避免每次请求都重新初始化
let appPromise: Promise<Hono> | null = null;

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (!appPromise) {
      appPromise = buildApp(env);
    }
    const app = await appPromise;
    return app.fetch(request, env);
  },
};