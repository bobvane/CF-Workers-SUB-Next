/**
 * Rate Limit 中间件
 * TASK 7.4 - Rate Limit：保护登录接口 + 订阅抓取，防暴力破解/资源滥用
 * 11_SECURITY.md / 07_API_SPECIFICATION.md §14
 */

import { Context, Next } from 'hono';

interface CounterEntry {
  count: number;
  expiresAt: number;
}

// 内存计数器（单 Worker 实例内有效）
const memoryCounters = new Map<string, CounterEntry>();

/**
 * 内存速率限制中间件
 * 按 IP + 路径 + 时间窗口计数
 */
export function rateLimit(options: { windowSeconds: number; maxRequests: number }) {
  return async (c: Context, next: Next) => {
    const ip = c.req.header('cf-connecting-ip') ?? 'unknown';
    const path = c.req.path;
    const windowStart = Math.floor(Date.now() / (options.windowSeconds * 1000));
    const key = `${ip}:${path}:${windowStart}`;
    const now = Date.now();

    const entry = memoryCounters.get(key);
    const count = entry && entry.expiresAt > now ? entry.count : 0;
    const newEntry: CounterEntry = { count: count + 1, expiresAt: now + options.windowSeconds * 1000 };
    memoryCounters.set(key, newEntry);

    if (newEntry.count > options.maxRequests) {
      return c.json(
        { success: false, error: { code: 'RATE_LIMITED', message: 'Too many requests' } },
        429
      );
    }

    await next();
  };
}

/**
 * KV 速率限制中间件（跨实例，生产可用）
 * 需要 KV get/put。注意：KV 为最终一致性，count 在极端并发下可能短暂低估，
 * 但相比单实例内存计数器，跨实例共享已大幅提升限流可靠性。
 */
export function createKvRateLimit(
  kv: { get(key: string): Promise<string | null>; put(key: string, value: string, options?: { expirationTtl?: number }): Promise<void> },
  options: { windowSeconds: number; maxRequests: number }
) {
  return async (c: Context, next: Next) => {
    const ip = c.req.header('cf-connecting-ip') ?? 'unknown';
    const path = c.req.path;
    const windowStart = Math.floor(Date.now() / (options.windowSeconds * 1000));
    const key = `rate:${ip}:${path}:${windowStart}`;

    const raw = await kv.get(key);
    const count = raw ? parseInt(raw, 10) : 0;
    const newCount = count + 1;

    await kv.put(key, String(newCount), { expirationTtl: options.windowSeconds });

    if (newCount > options.maxRequests) {
      return c.json(
        { success: false, error: { code: 'RATE_LIMITED', message: 'Too many requests' } },
        429
      );
    }

    await next();
  };
}