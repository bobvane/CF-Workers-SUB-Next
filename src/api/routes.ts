/**
 * API 路由
 * TASK 2.4 - API Router
 * 07_API_SPECIFICATION.md：所有端点 /api 前缀，统一响应格式
 */

import { Hono } from 'hono';
import { Repositories } from '@/storage/kv';
import { AuthService } from '@/services/auth.service';
import {
  createSessionCookie,
  createClearCookie,
} from '@/services/auth.service';
import { SubscriptionService } from '@/services/subscription.service';
import { ConfigService } from '@/services/config.service';
import { requireAuth, errorHandler, readBody, AppError, ERRORS, getToken } from './middleware';
import { rateLimit } from './rate-limit';
import { nodeToLink } from '@/services/config.service';
import { nodeFingerprint } from '@/models/node';

export interface AppDeps {
  repos: Repositories;
  auth: AuthService;
  subscriptions: SubscriptionService;
  config: ConfigService;
  adminPassword: string;
  /** 订阅内容抓取函数（含 SSRF 防护） */
  fetchRaw: (url: string) => Promise<string>;
  /** 节点解析管线（parser 完成后注入） */
  parseContent: (content: string, source: string) => Promise<unknown[]>;
}

export function createApp(deps: AppDeps): Hono {
  const app = new Hono();
  const { repos, auth, subscriptions, config } = deps;

  // ============ 全局错误处理 ============
  app.onError(errorHandler);

  // ============ Health ============
  app.get('/api/health', (c) => c.json({ status: 'ok' }));

  // ============ Auth ============
  // 登录接口限流：防暴力破解（10 次/分钟/IP）
  app.post('/api/auth/login', rateLimit({ windowSeconds: 60, maxRequests: 10 }), async (c) => {
    const body = await readBody<{ password?: string }>(c);
    if (!body.password || typeof body.password !== 'string') {
      throw ERRORS.INVALID_PARAMETER('password is required');
    }

    const token = await auth.login(body.password);
    if (!token) {
      return c.json(
        { success: false, error: { code: 'INVALID_PASSWORD', message: 'Invalid password' } },
        401
      );
    }

    c.header('Set-Cookie', createSessionCookie(token));
    return c.json({ success: true, data: { token } });
  });

  app.post('/api/auth/logout', async (c) => {
    const token = getToken(c);
    if (token) {
      await auth.logout(token);
    }
    c.header('Set-Cookie', createClearCookie());
    return c.json({ success: true });
  });

  app.get('/api/auth/session', async (c) => {
    const token = getToken(c);
    const authenticated = token ? await auth.validateSession(token) : false;
    return c.json({ success: true, data: { authenticated } });
  });

  // ============ 受保护路由（需认证） ============
  app.use('/api/subscriptions*', requireAuth(auth));
  app.use('/api/nodes*', requireAuth(auth));
  app.use('/api/rules*', requireAuth(auth));
  app.use('/api/dashboard', requireAuth(auth));

  // ============ Subscription API ============

  // 获取订阅列表
  app.get('/api/subscriptions', async (c) => {
    const list = await subscriptions.list();
    return c.json({
      success: true,
      data: list.map((s) => ({
        id: s.id,
        name: s.name,
        status: s.status,
        nodeCount: s.nodeCount ?? 0,
        updatedAt: s.updatedAt,
      })),
    });
  });

  // 创建订阅
  app.post('/api/subscriptions', async (c) => {
    const body = await readBody<{ name?: string; url?: string }>(c);
    if (!body.name || typeof body.name !== 'string' || body.name.trim().length === 0) {
      throw ERRORS.INVALID_PARAMETER('name is required');
    }
    if (!body.url || typeof body.url !== 'string') {
      throw ERRORS.INVALID_PARAMETER('url is required');
    }

    const sub = await subscriptions.create(body.name.trim(), body.url.trim());
    return c.json({ success: true, data: { id: sub.id } }, 201);
  });

  // 获取单个订阅
  app.get('/api/subscriptions/:id', async (c) => {
    const id = c.req.param('id');
    const sub = await subscriptions.getById(id);
    if (!sub) throw ERRORS.SUBSCRIPTION_NOT_FOUND();
    return c.json({ success: true, data: { id: sub.id, name: sub.name, url: sub.url } });
  });

  // 删除订阅
  app.delete('/api/subscriptions/:id', async (c) => {
    const id = c.req.param('id');
    const deleted = await subscriptions.delete(id);
    if (!deleted) throw ERRORS.SUBSCRIPTION_NOT_FOUND();
    return c.json({ success: true });
  });

  // 更新订阅（重新抓取解析）
  app.post('/api/subscriptions/:id/update', async (c) => {
    const id = c.req.param('id');
    try {
      const { nodeCount } = await subscriptions.update(id, deps.fetchRaw);
      return c.json({ success: true, data: { nodeCount } });
    } catch (err) {
      if (err instanceof AppError) throw err;
      throw ERRORS.FETCH_FAILED((err as Error).message);
    }
  });

  // ============ Node API ============

  // 获取节点列表（可选按订阅过滤）
  app.get('/api/nodes', async (c) => {
    const subscriptionId = c.req.query('subscriptionId');
    const disabled = new Set(await config.getDisabledNodes());
    const mapper = (n: { name: string; protocol: string; server: string; port: number; tls?: boolean }) => ({
      name: n.name,
      protocol: n.protocol,
      server: n.server,
      port: n.port,
      tls: n.tls ?? false,
      link: nodeToLink(n as import('@/models/node').Node),
      fingerprint: nodeFingerprint(n as import('@/models/node').Node),
      enabled: !disabled.has(nodeFingerprint(n as import('@/models/node').Node)),
    });
    if (subscriptionId) {
      const nodes = await repos.nodes.getBySubscription(subscriptionId);
      return c.json({
        success: true,
        data: nodes.map(mapper),
      });
    }
    const all = await repos.nodes.getAll();
    return c.json({
      success: true,
      data: all.map(mapper),
    });
  });

  // 设置节点启用状态（保存禁用列表）
  app.put('/api/nodes/enabled', async (c) => {
    const body = await readBody<{ enabled?: string[] }>(c);
    const enabled = Array.isArray(body.enabled) ? body.enabled : [];
    // 传入的是启用列表，反向存储为禁用列表
    const all = await repos.nodes.getAll();
    const allFingerprints = all.map((n) => nodeFingerprint(n));
    const enabledSet = new Set(enabled);
    const disabled = allFingerprints.filter((fp) => !enabledSet.has(fp));
    await config.setDisabledNodes(disabled);
    return c.json({ success: true, data: { disabledCount: disabled.length } });
  });

  // ============ Rule API ============

  // 获取规则列表
  app.get('/api/rules', async (c) => {
    const rules = await repos.rules.list();
    return c.json({ success: true, data: rules });
  });

  // 创建规则
  app.post('/api/rules', async (c) => {
    const body = await readBody<{ name?: string; type?: string; pattern?: string }>(c);
    if (!body.name || !body.type || !body.pattern) {
      throw ERRORS.INVALID_PARAMETER('name, type, pattern are required');
    }
    if (!['include', 'exclude', 'replace'].includes(body.type)) {
      throw ERRORS.INVALID_PARAMETER('type must be include|exclude|replace');
    }
    const rule = await repos.rules.create({
      name: body.name,
      type: body.type as 'include' | 'exclude' | 'replace',
      pattern: body.pattern,
    });
    return c.json({ success: true, data: { id: rule.id } }, 201);
  });

  // 删除规则
  app.delete('/api/rules/:id', async (c) => {
    const id = c.req.param('id');
    const deleted = await repos.rules.delete(id);
    if (!deleted) throw ERRORS.NOT_FOUND('Rule not found');
    return c.json({ success: true });
  });

  // ============ Dashboard API ============

  app.get('/api/dashboard', async (c) => {
    const subs = await subscriptions.list();
    const nodes = await repos.nodes.getAll();
    const lastUpdate = subs.reduce((max, s) => Math.max(max, s.updatedAt), 0);
    return c.json({
      success: true,
      data: {
        subscriptions: subs.length,
        nodes: nodes.length,
        lastUpdate: lastUpdate || null,
        status: 'ok',
      },
    });
  });

  // ============ Output API ============

  // 通用配置输出：/api/output/{format}（需登录）
  // 支持: mihomo / singbox / v2ray / v2rayn / nekoray / shadowrocket / loon / surge / quantumultx
  app.get('/api/output/:format', requireAuth(auth), async (c) => {
    const format = c.req.param('format') ?? '';
    const allowedFormats = ['mihomo', 'singbox', 'v2ray', 'v2rayn', 'nekoray', 'shadowrocket', 'loon', 'surge', 'quantumultx'];
    if (!allowedFormats.includes(format)) {
      throw ERRORS.INVALID_PARAMETER('Unsupported format');
    }
    const result = await config.generateOutput(format as Parameters<typeof config.generateOutput>[0]);
    c.header('Content-Type', result.contentType);
    c.header('Content-Disposition', `attachment; filename="${result.filename}"`);
    return c.body(result.content);
  });

  // ============ 订阅输出端点（无需登录，供客户端直接使用） ============

  // 获取持久订阅访问密钥（前端用它拼订阅链接）
  // 存 KV：首次生成，长期有效；不随 session 过期
  app.get('/api/sub-key', requireAuth(auth), async (c) => {
    let key = await repos.settings.get('sub_key');
    if (!key) {
      key = crypto.randomUUID();
      await repos.settings.set('sub_key', key);
    }
    return c.json({ success: true, data: { key } });
  });

  // 校验订阅访问令牌：
  // 1. 命中的是持久订阅 key（sub_key，推荐，客户端长期可用）
  // 2. 兼容旧版：命中的是 session token（仅浏览器会话内有效）
  async function validateSubToken(token: string): Promise<boolean> {
    if (!token) return false;
    const subKey = await repos.settings.get('sub_key');
    if (subKey && token === subKey) return true;
    // 兼容旧版 session token
    return auth.validateSession(token);
  }

  // 通用订阅端点：/sub/{format}/{token}
  // 支持: mihomo / singbox / v2ray / v2rayn / nekoray / shadowrocket / loon / surge / quantumultx
  app.get('/sub/:format/:token', async (c) => {
    const token = c.req.param('token') ?? '';
    const format = c.req.param('format') ?? '';
    const valid = await validateSubToken(token);
    if (!valid) {
      return c.json({ success: false, error: { code: 'AUTH_REQUIRED', message: 'Invalid token' } }, 401);
    }

    const allowedFormats = ['mihomo', 'singbox', 'v2ray', 'v2rayn', 'nekoray', 'shadowrocket', 'loon', 'surge', 'quantumultx'];
    if (!allowedFormats.includes(format)) {
      return c.json({ success: false, error: { code: 'INVALID_PARAMETER', message: 'Unsupported format' } }, 400);
    }

    const result = await config.generateOutput(format as Parameters<typeof config.generateOutput>[0]);
    return new Response(result.content, {
      headers: {
        'Content-Type': result.contentType,
        'Content-Disposition': `attachment; filename="${result.filename}"`,
      },
    });
  });

  // ============ Settings ============

  app.get('/api/settings', requireAuth(auth), async (c) => {
    const appName = await repos.settings.get('app_name');
    return c.json({
      success: true,
      data: {
        app_name: appName ?? 'CF-Workers-SUB-Next',
      },
    });
  });

  app.put('/api/settings', requireAuth(auth), async (c) => {
    const body = await readBody<{ app_name?: string }>(c);
    if (body.app_name) {
      await repos.settings.set('app_name', body.app_name);
    }
    return c.json({ success: true });
  });

  // ============ 根路径（前端由 static 服务，后续实现） ============

  app.notFound((c) =>
    c.json({ success: false, error: { code: 'NOT_FOUND', message: 'Not found' } }, 404)
  );

  return app;
}