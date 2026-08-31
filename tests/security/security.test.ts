/**
 * 安全测试
 * TASK 7.2 - XSS 防护 / TASK 7.4 - Rate Limit / 密码安全
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createPasswordHash, verifyPassword } from '@/services/auth.service';
import { rateLimit, createKvRateLimit } from '@/api/rate-limit';
import { MemoryKvAdapter } from '@/storage/kv';
import { Context } from 'hono';

// ============ XSS 防护（验证前端实际使用的 escHtml，而非测试副本） ============
describe('XSS escaping', () => {
  // 真实实现位于 public/index.html（前端浏览器实际运行的版本）
  // 直接从真源文件提取函数体并实例化，确保测的是"真函数"而非抄写的副本
  const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
  let escHtml: (s: string) => string;

  beforeAll(() => {
    const html = readFileSync(join(root, 'public', 'index.html'), 'utf-8');
    // escHtml 是单行函数，按行定位后再取函数体（避免正则被内层 } 截断）
    const line = html.split('\n').find(l => l.includes('function escHtml'));
    if (!line) throw new Error('escHtml 未在 public/index.html 中找到');
    const body = line.slice(line.indexOf('{'));
    escHtml = new Function(`return function(s) ${body}`)() as (s: string) => string;
  });

  it('真实实现存在且可调用', () => {
    expect(escHtml).toBeTypeOf('function');
  });

  it('产出的前端代码确实把 escHtml 接进 renderRulesTree（XSS 路径被守卫）', () => {
    const htmlJs = readFileSync(join(root, 'src', 'html.js'), 'utf-8');
    // renderRulesTree 渲染规则项时必须经 escHtml 转义 id/label，不得裸插
    expect(htmlJs).toContain('${escHtml(it.id)}');
    expect(htmlJs).toContain('${escHtml(it.label)}');
    // 页面上不得出现未转义直接内插的 it.id / it.label（防回归）
    expect(htmlJs).not.toContain('${it.id}');
    expect(htmlJs).not.toContain('${it.label}');
  });

  it('should escape script tags', () => {
    const output = escHtml('<script>alert(1)</script>');
    expect(output).not.toContain('<script>');
    expect(output).toContain('&lt;script&gt;');
  });

  it('should escape event handlers (neutralize payload)', () => {
    const output = escHtml('"><img src=x onerror=alert(1)>');
    expect(output).not.toContain('<img');
    expect(output).not.toContain('>');
    expect(output).toContain('&quot;');
    expect(output).toContain('&lt;');
    expect(output).toContain('&gt;');
  });

  it('should escape quotes and angle brackets', () => {
    expect(escHtml('"')).toContain('&quot;');
    expect(escHtml("'")).toContain('&#39;');
    expect(escHtml('<')).toContain('&lt;');
    expect(escHtml('>')).toContain('&gt;');
  });

  it('should escape ampersand', () => {
    expect(escHtml('&')).toBe('&amp;');
  });

  it('should pass through normal text unchanged', () => {
    expect(escHtml('🇯🇵 日本节点')).toBe('🇯🇵 日本节点');
    expect(escHtml('node-01')).toBe('node-01');
  });
});

// ============ 密码安全 ============
describe('password security', () => {
  it('should not store plaintext password', async () => {
    const { hash, salt } = await createPasswordHash('super-secret-123');
    expect(hash).not.toBe('super-secret-123');
    expect(salt).not.toBe('super-secret-123');
  });

  it('should generate unique salts', async () => {
    const a = await createPasswordHash('pw');
    const b = await createPasswordHash('pw');
    expect(a.salt).not.toBe(b.salt);
  });

  it('should use PBKDF2 (256-bit = 64 hex chars)', async () => {
    const { hash } = await createPasswordHash('pw');
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('should verify correct password and reject wrong', async () => {
    const { hash, salt } = await createPasswordHash('correct-horse');
    expect(await verifyPassword('correct-horse', salt, hash)).toBe(true);
    expect(await verifyPassword('wrong', salt, hash)).toBe(false);
  });
});

// ============ Rate Limit（内存） ============
describe('rate limit middleware', () => {
  function mockContext(): Context {
    const state: Record<string, unknown> = {};
    return {
      req: {
        header: () => '192.0.2.1',
        path: '/api/auth/login',
      },
      json: (body: unknown, status?: number) => ({ body, status }),
      set: (k: string, v: unknown) => {
        state[k] = v;
      },
    } as unknown as Context;
  }

  it('should allow requests under limit', async () => {
    const limit = rateLimit({ windowSeconds: 60, maxRequests: 3 });
    let passed = 0;
    const next = async () => {
      passed++;
    };
    const ctx = mockContext();

    for (let i = 0; i < 3; i++) {
      await limit(ctx, next);
    }
    expect(passed).toBe(3);
  });

  it('should block requests over limit', async () => {
    const limit = rateLimit({ windowSeconds: 60, maxRequests: 2 });
    const ctx = mockContext();
    const next = async () => {};

    await limit(ctx, next);
    await limit(ctx, next);
    const blocked = (await limit(ctx, next)) as unknown as {
      status?: number;
      body?: { error?: { code?: string } };
    };
    expect(blocked.status).toBe(429);
    expect(blocked.body?.error?.code).toBe('RATE_LIMITED');
  });
});

// ============ KV 限流 ============
describe('KV rate limit', () => {
  it('should count and block with KV storage', async () => {
    const kv = new MemoryKvAdapter();
    const limit = createKvRateLimit(kv, { windowSeconds: 60, maxRequests: 2 });
    const ctx = {
      req: { header: () => '192.0.2.2', path: '/api/auth/login' },
      json: (body: unknown, status?: number) => ({ body, status }),
      set: () => {},
    } as unknown as Context;
    const next = async () => {};

    await limit(ctx, next);
    await limit(ctx, next);
    const blocked = (await limit(ctx, next)) as unknown as { status?: number };
    expect(blocked.status).toBe(429);
  });
});