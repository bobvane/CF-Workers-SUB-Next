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
import { deduplicateNodes } from '@/parser';
import { APP_META, isNewerVersion } from '@/meta';
import { createCatalogSyncService, CatalogSyncService } from '@/services/catalog-sync.service';
import { RuleCatalogMeta } from '@/models/rule-catalog';

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
  /** 规则目录同步服务（可选注入，默认内部构造） */
  catalogSync?: CatalogSyncService;
}

export function createApp(deps: AppDeps): Hono {
  const app = new Hono();
  const { repos, auth, subscriptions, config } = deps;
  // 规则目录同步服务：默认用 Workers 全局 fetch 拉 GitHub；测试可注入 mock
  const catalogSync: CatalogSyncService =
    deps.catalogSync ??
    createCatalogSyncService(repos, (url) => fetch(url).then((r) => {
      if (!r.ok) throw new Error(`fetch ${url} failed: ${r.status}`);
      return r.text();
    }));

  // ============ 全局错误处理 ============
  app.onError(errorHandler);

  // ============ Health ============
  app.get('/api/health', (c) => c.json({ status: 'ok' }));

  // ============ Meta（项目信息，公开） ============
  // app_name：用户自定义站点名（设置页保存），登录前也需显示，故放公开接口
  app.get('/api/meta', async (c) => {
    const appName = await repos.settings.get('app_name');
    return c.json({
      success: true,
      data: { meta: APP_META, app_name: appName ?? APP_META.name },
    });
  });

  // 升级检测：查 GitHub releases 最新版本（服务端代理，避免前端 CORS/限流）
  app.get('/api/meta/check-upgrade', async (c) => {
    const GITHUB_REPO = 'bobvane/CF-Workers-SUB-Next';
    try {
      const res = await fetch(
        `https://api.github.com/repos/${GITHUB_REPO}/releases/latest`,
        { headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'cf-workers-sub-next' } }
      );
      if (!res.ok) {
        return c.json({
          success: true,
          data: { current: APP_META.version, latest: APP_META.version, hasUpdate: false, checked: true },
        });
      }
      const release = (await res.json()) as { tag_name?: string; html_url?: string };
      const latest = (release.tag_name || APP_META.version).replace(/^v/, '');
      const hasUpdate = isNewerVersion(latest, APP_META.version);
      return c.json({
        success: true,
        data: {
          current: APP_META.version,
          latest,
          hasUpdate,
          releaseUrl: release.html_url || APP_META.repo,
          checked: true,
        },
      });
    } catch {
      return c.json({
        success: true,
        data: { current: APP_META.version, latest: APP_META.version, hasUpdate: false, checked: false },
      });
    }
  });

  // ============ Auth ============
  // 登录接口限流：防暴力破解（10 次/分钟/IP）
  app.post('/api/auth/login', rateLimit({ windowSeconds: 60, maxRequests: 10 }), async (c) => {
    const body = await readBody<{ username?: string; password?: string }>(c);
    if (!body.password || typeof body.password !== 'string') {
      throw ERRORS.INVALID_PARAMETER('password is required');
    }
    // 兼容旧客户端：未传 username 时默认 'admin'
    const username = (body.username || 'admin').trim();

    const token = await auth.login(username, body.password);
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
  app.use('/api/subscriptions/*', requireAuth(auth));
  app.use('/api/nodes/*', requireAuth(auth));
  app.use('/api/rules/*', requireAuth(auth));
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

  // ============ 持久化清洗规则（订阅更新后自动应用） ============

  app.get('/api/nodes/clean-rules', requireAuth(auth), async (c) => {
    return c.json({ success: true, data: await config.getCleanRules() });
  });

  app.post('/api/nodes/clean-rules', requireAuth(auth), async (c) => {
    const body = await readBody<{ pattern?: string; replacement?: string; regex?: boolean }>(c);
    const pattern = (body.pattern || '').trim();
    if (!pattern) return c.json({ success: false, error: { code: 'INVALID_PARAMETER', message: 'pattern 必填' } }, 400);
    if (body.regex) {
      try { new RegExp(pattern); } catch {
        return c.json({ success: false, error: { code: 'INVALID_PARAMETER', message: '正则表达式无效' } }, 400);
      }
    }
    const created = await config.addCleanRule({ pattern, replacement: body.replacement ?? '', regex: body.regex ?? false });
    return c.json({ success: true, data: created });
  });

  app.delete('/api/nodes/clean-rules/:id', requireAuth(auth), async (c) => {
    await config.deleteCleanRule(c.req.param('id')!);
    return c.json({ success: true });
  });

  app.put('/api/nodes/clean-rules/:id/toggle', requireAuth(auth), async (c) => {
    const body = await readBody<{ enabled?: boolean }>(c);
    try {
      await config.toggleCleanRule(c.req.param('id')!, body.enabled ?? true);
      return c.json({ success: true });
    } catch {
      return c.json({ success: false, error: { code: 'NOT_FOUND', message: '规则不存在' } }, 404);
    }
  });

  // 立即执行持久化规则集（手动触发）
  app.post('/api/nodes/clean-rules/apply', requireAuth(auth), async (c) => {
    const changed = await config.applyCleanRulesNow();
    return c.json({ success: true, data: { changed } });
  });

  // 获取节点列表（可选按订阅过滤）；统一按 server:port:protocol 去重
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
    const original = all.length;
    const unique = deduplicateNodes(all);
    return c.json({
      success: true,
      data: unique.map(mapper),
      stats: { original, duplicates: original - unique.length, unique: unique.length },
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
    const disabled = await config.getDisabledNodes();
    const enabledNodes = nodes.filter(n => !disabled.includes(nodeFingerprint(n)));
    // 按协议统计
    const protoCount: Record<string, number> = {};
    nodes.forEach(n => { const p = n.protocol || 'unknown'; protoCount[p] = (protoCount[p] || 0) + 1; });
    return c.json({
      success: true,
      data: {
        subscriptions: subs.length,
        nodes: nodes.length,
        enabledNodes: enabledNodes.length,
        disabledNodes: disabled.length,
        protoCount,
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

  // ============ Rules API (分流规则) ============

  // 获取预定义规则大类（已合并用户自定义规则，前端规则页的数据源）
  app.get('/api/rules/groups', async (c) => {
    const groups = await config.getMergedGroups();
    return c.json({ success: true, data: { groups } });
  });

  // 获取规则分类目录（动态：KV 优先，KV 空回退内置 seed）
  // 供扫描/搜索/添加。可搜索 q 过滤、type 过滤、limit 截断。
  app.get('/api/rules/catalog', async (c) => {
    const { entries, fromKv } = await catalogSync.getCatalog();
    const q = (c.req.query('q') || '').trim().toLowerCase();
    const typeFilter = (c.req.query('type') || '').trim().toLowerCase();
    const limit = Math.min(Number(c.req.query('limit') || 5000), 5000);
    let catalog = entries;
    if (typeFilter && ['aggregate', 'site', 'tld'].includes(typeFilter)) {
      catalog = catalog.filter((e) => e.type === typeFilter);
    }
    if (q) {
      catalog = catalog.filter((e) => e.id.toLowerCase().includes(q));
    }
    // 返回各类型计数，前端用于渲染 chips 徽标
    const typeCounts = {
      aggregate: entries.filter((e) => e.type === 'aggregate').length,
      site: entries.filter((e) => e.type === 'site').length,
      tld: entries.filter((e) => e.type === 'tld').length,
    };
    return c.json({
      success: true,
      data: {
        meta: { source: 'MetaCubeX/meta-rules-dat', total: entries.length, fromKv, typeCounts },
        catalog: catalog.slice(0, limit),
      },
    });
  });

  // 获取规则目录状态（需登录，含内部状态）
  app.get('/api/rules/catalog/meta', requireAuth(auth), async (c) => {
    const catalogMeta: RuleCatalogMeta = await repos.ruleCatalog.getMeta();
    return c.json({ success: true, data: { meta: catalogMeta } });
  });

  // 手动刷新规则库（需登录；触发一次扫描，失败时返回 stale 状态）
  app.post('/api/rules/catalog/refresh', requireAuth(auth), async (c) => {
    const result = await catalogSync.sync();
    if (result.status === 'stale') {
      return c.json({
        success: false,
        error: { code: 'UPSTREAM_UNAVAILABLE', message: result.error ?? '上游不可达，已保留旧库' },
      }, 502);
    }
    return c.json({ success: true, data: { ...result } });
  });

  // 获取用户勾选的规则 id 列表
  app.get('/api/rules/selection', async (c) => {
    const ids = await config.getSelectedRuleIds();
    return c.json({ success: true, data: { ids } });
  });

  // 保存用户勾选的规则 id 列表
  app.put('/api/rules/selection', async (c) => {
    const body = await readBody<{ ids?: string[] }>(c);
    if (!Array.isArray(body.ids)) {
      return c.json({ success: false, error: { code: 'INVALID_PARAMETER', message: 'ids 必须为数组' } }, 400);
    }
    await config.setSelectedRuleIds(body.ids);
    return c.json({ success: true, data: { ids: body.ids } });
  });

  // 获取用户自定义规则列表
  app.get('/api/rules/custom', async (c) => {
    const rules = await config.getCustomRules();
    return c.json({ success: true, data: { rules } });
  });

  // 添加/更新一条自定义规则
  app.post('/api/rules/custom', async (c) => {
    const body = await readBody<{ id?: string; label?: string; groupKey?: string; target?: string }>(c);
    const id = (body.id || '').trim().toUpperCase();
    if (!id) {
      return c.json({ success: false, error: { code: 'INVALID_PARAMETER', message: 'id 不能为空' } }, 400);
    }
    // 规则 id 会流入属性/JS 字符串/RULE-SET 语法，限制字符集防止 XSS 与配置损坏
    if (!/^[A-Z0-9][A-Z0-9_-]{0,63}$/.test(id)) {
      return c.json({ success: false, error: { code: 'INVALID_PARAMETER', message: 'id 仅允许字母、数字、-_，且不超过 64 字符' } }, 400);
    }
    const groupKey = (body.groupKey || 'user').trim();
    const target = (['PROXY', 'DIRECT', 'REJECT'].includes(body.target || '') ? body.target : 'PROXY') as 'PROXY' | 'DIRECT' | 'REJECT';
    const label = (body.label || id).trim();
    await config.upsertCustomRule({ id, label, groupKey, target });
    return c.json({ success: true, data: { id } });
  });

  // 删除一条自定义规则
  app.delete('/api/rules/custom/:id', async (c) => {
    const id = c.req.param('id').toUpperCase();
    await config.deleteCustomRule(id);
    return c.json({ success: true, data: { id } });
  });

  // ============ Settings ============

  app.get('/api/settings', requireAuth(auth), async (c) => {
    const appName = await repos.settings.get('app_name');
    const subHour = await repos.settings.get('sub_auto_update_hour');
    return c.json({
      success: true,
      data: {
        app_name: appName ?? 'CF-Workers-SUB-Next',
        sub_auto_update_hour: subHour !== null ? parseInt(subHour, 10) : 7,
      },
    });
  });

  app.put('/api/settings', requireAuth(auth), async (c) => {
    const body = await readBody<{ app_name?: string; sub_auto_update_hour?: number }>(c);
    if (body.app_name) {
      await repos.settings.set('app_name', body.app_name);
    }
    if (body.sub_auto_update_hour !== undefined) {
      const h = Number(body.sub_auto_update_hour);
      if (!Number.isInteger(h) || h < 0 || h > 23) {
        return c.json({ success: false, error: { code: 'INVALID_PARAMETER', message: '更新时间须为 0-23 的整数（北京时间）' } }, 400);
      }
      await repos.settings.set('sub_auto_update_hour', String(h));
    }
    return c.json({ success: true });
  });

  // 获取当前用户名
  app.get('/api/auth/username', requireAuth(auth), async (c) => {
    const username = await auth.getUsername();
    return c.json({ success: true, data: { username } });
  });

  // 修改用户名（需当前密码）
  app.post('/api/auth/username', requireAuth(auth), rateLimit({ windowSeconds: 60, maxRequests: 5 }), async (c) => {
    const body = await readBody<{ currentPassword?: string; newUsername?: string }>(c);
    if (!body.currentPassword || !body.newUsername) {
      return c.json({ success: false, error: { code: 'INVALID_PARAMETER', message: 'currentPassword 和 newUsername 必填' } }, 400);
    }
    const ok = await auth.setUsername(body.currentPassword, body.newUsername);
    if (!ok) {
      return c.json({ success: false, error: { code: 'CHANGE_FAILED', message: '密码错误或用户名不合法（2-32位字母数字_-）' } }, 400);
    }
    return c.json({ success: true });
  });

  // 修改密码（需旧密码；成功后建议前端重新登录）
  app.post('/api/auth/password', requireAuth(auth), rateLimit({ windowSeconds: 60, maxRequests: 5 }), async (c) => {
    const body = await readBody<{ currentPassword?: string; newPassword?: string }>(c);
    if (!body.currentPassword || !body.newPassword) {
      return c.json({ success: false, error: { code: 'INVALID_PARAMETER', message: 'currentPassword 和 newPassword 必填' } }, 400);
    }
    const ok = await auth.changePassword(body.currentPassword, body.newPassword);
    if (!ok) {
      return c.json({ success: false, error: { code: 'CHANGE_FAILED', message: '旧密码错误或新密码不足6位' } }, 400);
    }
    // 吊销当前 session，强制重新登录
    const token = getToken(c);
    if (token) await auth.logout(token);
    c.header('Set-Cookie', createClearCookie());
    return c.json({ success: true, data: { relogin: true } });
  });

  // ============ 根路径（前端由 static 服务，后续实现） ============

  app.notFound((c) =>
    c.json({ success: false, error: { code: 'NOT_FOUND', message: 'Not found' } }, 404)
  );

  return app;
}