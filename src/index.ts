/**
 * CF-Workers-SUB-Next V2 Worker 入口
 * TASK 1.1: 项目骨架 — 最小可构建入口
 */

import { Hono } from 'hono';

export interface Env {
  /** Cloudflare KV 数据存储 */
  DATABASE: KVNamespace;
  /** 管理员密码（Secret） */
  ADMIN_PASSWORD?: string;
  /** Session 加密密钥（Secret） */
  SESSION_SECRET?: string;
}

const app = new Hono<{ Bindings: Env }>();

app.get('/api/health', (c) => {
  return c.json({ status: 'ok' });
});

export default app;