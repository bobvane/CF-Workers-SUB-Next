/**
 * CF-Workers-SUB-Next 入口
 * Cloudflare Workers 订阅汇聚与规则生成工具
 */

import { initAdmin, login, logout, validateSession, changePassword } from './auth.js';
import { kvGet, kvPut, kvDelete } from './kv.js';
import { jsonOk, jsonError, setCookieHeader, clearCookieHeader } from './utils.js';
import { fetchNodes, deduplicateNodes, parseNode } from './parser.js';
import { generateOutput } from './formatter.js';
import { fullHealthCheck } from './health.js';
import DEFAULT_HTML from './html.js';

// ── 配置 ──
// 注意：环境变量通过 env 参数传入，不能在模块顶层直接引用
const VERSION = 'v0.1.0';

// ── 请求路由 ──
export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;
    const method = request.method;
    const kv = env.SUB_NEXT_DATA;

    // 全局 SUB_TOKEN 校验（保护整个站点免受爬虫扫描）
    const subToken = env.SUB_TOKEN || '';
    if (subToken) {
      const requestToken = url.searchParams.get('token');
      // 白名单：登录、登出、会话检查、订阅输出不需要 SUB_TOKEN（它们有自己的认证）
      const publicPaths = ['/api/login', '/api/logout', '/api/session'];
      const isPublicApi = publicPaths.some(p => path === p || path.startsWith(p + '/'));
      
      if (requestToken !== subToken) {
        // 如果是公开 API，允许通过（它们有自己的认证机制）
        if (isPublicApi) {
          // 继续处理
        } else if (path.startsWith('/api/') || path === '/sub' || path === '/sub/') {
          return jsonError('Token 无效', 403);
        } else {
          // 如果是页面请求，返回简约页面提示
          return new Response(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>访问受限</title><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{font-family:-apple-system,BlinkMacSystemFont,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;background:#f6f8fa;color:#1f2328}.card{text-align:center;padding:40px;max-width:400px}h1{font-size:22px;margin-bottom:8px}p{color:#656d76;font-size:14px;line-height:1.6}code{background:#eaeef2;padding:3px 8px;border-radius:4px;font-size:13px}</style></head><body><div class="card"><h1>🔒 访问受限</h1><p>此页面需要访问令牌。<br>请在 URL 中添加 <code>?token=你的令牌</code></p></div></body></html>`, {
            status: 403,
            headers: { 'Content-Type': 'text/html; charset=utf-8' }
          });
        }
      }
    }

    // 确保管理员已初始化
    await initAdmin(kv);

    try {
      // ── API 路由 ──
      if (path.startsWith('/api/')) {
        return handleApi(request, path, method, kv, url, env);
      }

      // ── 订阅输出 ──
      if (path === '/sub' || path === '/sub/') {
        return handleSubscription(request, kv, url, env);
      }

      // ── 前端页面 ──
      return serveFrontend();
    } catch (err) {
      console.error('Unhandled error:', err);
      return jsonError('服务器内部错误', 500);
    }
  }
};

// ── API 处理 ──
async function handleApi(request, path, method, kv, url, env) {
  const SESSION_EXPIRY = parseInt(env.SESSION_EXPIRY_HOURS || '168', 10);
  // ── 认证（登录/登出/会话检查）─
  if (path === '/api/login' && method === 'POST') {
    const body = await request.json();
    const result = await login(kv, body.password);
    if (!result.ok) return jsonError(result.error, 401);

    const headers = new Headers();
    headers.append('Set-Cookie', setCookieHeader('session', result.token, SESSION_EXPIRY));
    headers.append('Content-Type', 'application/json');
    return new Response(JSON.stringify({ ok: true, data: { username: 'admin', role: 'admin' } }), {
      status: 200, headers
    });
  }

  if (path === '/api/logout' && method === 'POST') {
    const session = await getSession(kv, request);
    if (session.valid) {
      await logout(kv, session.token);
    }
    const headers = new Headers();
    headers.append('Set-Cookie', clearCookieHeader('session'));
    headers.append('Content-Type', 'application/json');
    return new Response(JSON.stringify({ ok: true, data: null }), { status: 200, headers });
  }

  if (path === '/api/session' && method === 'GET') {
    const session = await getSession(kv, request);
    if (!session.valid) return jsonError('未登录', 401);
    return jsonOk({ username: session.user.username, role: session.user.role });
  }

  // ── 以下路由需要认证 ──
  const session = await getSession(kv, request);
  if (!session.valid) return jsonError('未登录', 401);
  const isAdmin = session.user.role === 'admin';

  // ── 规则管理 ──
  if (path === '/api/rules/list' && method === 'GET') {
    return jsonOk(getRulesetList());
  }

  if (path === '/api/rules/enabled' && method === 'GET') {
    const enabled = await kvGet(kv, 'rules:enabled');
    return jsonOk(enabled || []);
  }

  if (path === '/api/rules/enabled' && method === 'PUT') {
    const body = await request.json();
    await kvPut(kv, 'rules:enabled', body.ids || []);
    return jsonOk({ saved: true });
  }

  // ── 订阅管理 ──
  if (path === '/api/subscriptions' && method === 'GET') {
    const subs = await kvGet(kv, 'subscriptions');
    return jsonOk(subs || []);
  }

  if (path === '/api/subscriptions' && method === 'POST') {
    const body = await request.json();
    const current = (await kvGet(kv, 'subscriptions')) || [];
    if (body.url) {
      // 存储为对象 {url, remark}，兼容旧格式纯字符串
      current.push({ url: body.url, remark: body.remark || '' });
      await kvPut(kv, 'subscriptions', current);
    }
    return jsonOk(current);
  }

  if (path === '/api/subscriptions' && method === 'DELETE') {
    const body = await request.json();
    const current = (await kvGet(kv, 'subscriptions')) || [];
    // 兼容新旧格式：纯字符串或 {url, remark}
    const filtered = current.filter(u => {
      const url = typeof u === 'string' ? u : u.url;
      return url !== body.url;
    });
    await kvPut(kv, 'subscriptions', filtered);
    return jsonOk(filtered);
  }

  // ── 配置预览 ──
  if (path === '/api/config/preview' && method === 'GET') {
    const enabled = (await kvGet(kv, 'rules:enabled')) || [];
    const subs = (await kvGet(kv, 'subscriptions')) || [];
    const linkReplace = {
      from: await kvGet(kv, 'link_replace:from') || '',
      to: await kvGet(kv, 'link_replace:to') || ''
    };
    const yaml = await generateClashConfig(enabled, subs, linkReplace);
    return new Response(yaml, {
      status: 200,
      headers: { 'Content-Type': 'text/yaml; charset=utf-8' }
    });
  }

  // ── 管理后台（仅管理员）──
  if (!isAdmin) return jsonError('无权限', 403);

  if (path === '/api/admin/password' && method === 'PUT') {
    const body = await request.json();
    const result = await changePassword(kv, body.oldPassword, body.newPassword);
    if (!result.ok) return jsonError(result.error, 400);
    return jsonOk({ changed: true });
  }

  if (path === '/api/admin/link-replace' && method === 'GET') {
    return jsonOk({
      from: await kvGet(kv, 'link_replace:from') || '',
      to: await kvGet(kv, 'link_replace:to') || ''
    });
  }

  if (path === '/api/admin/link-replace' && method === 'PUT') {
    const body = await request.json();
    await kvPut(kv, 'link_replace:from', body.from || '');
    await kvPut(kv, 'link_replace:to', body.to || '');
    return jsonOk({ saved: true });
  }

  // ── 节点管理 ──
  if (path === '/api/nodes/list' && method === 'GET') {
    const subs = (await kvGet(kv, 'subscriptions')) || [];
    const allNodes = [];
    for (const item of subs) {
      const url = typeof item === 'string' ? item : item.url;
      const nodes = await fetchNodes(url);
      allNodes.push(...nodes);
    }
    const unique = deduplicateNodes(allNodes);
    return jsonOk({ total: unique.length, nodes: unique });
  }

  if (path === '/api/nodes/health-check' && method === 'POST' && isAdmin) {
    const subs = (await kvGet(kv, 'subscriptions')) || [];
    const result = await fullHealthCheck(subs);
    // 缓存检测结果（保留最近一次）
    await kvPut(kv, 'health_check_result', {
      time: new Date().toISOString(),
      total: result.all.length,
      valid: result.valid.length,
      invalid: result.invalid.length,
      nodes: result.valid,
    });
    return jsonOk(result);
  }

  if (path === '/api/nodes/health-check' && method === 'GET') {
    const cached = await kvGet(kv, 'health_check_result');
    return jsonOk(cached || { time: null, total: 0, valid: 0, invalid: 0, nodes: [] });
  }

  // ── 版本信息 ──
  if (path === '/api/version' && method === 'GET') {
    return jsonOk({ version: VERSION, repo: 'BobVane/CF-Workers-SUB-Next' });
  }

  return jsonError('接口不存在', 404);
}

// ── 订阅输出 ──
async function handleSubscription(request, kv, url, env) {
  const format = url.searchParams.get('format') || 'auto';
  const token = url.searchParams.get('token');
  const subToken = env.SUB_TOKEN || '';

  // 如果设置了 SUB_TOKEN，需要校验
  if (subToken && token !== subToken) {
    return jsonError('Token 无效', 403);
  }

  const subs = (await kvGet(kv, 'subscriptions')) || [];
  const enabled = (await kvGet(kv, 'rules:enabled')) || [];

  // 获取已启用的规则列表
  const rulesets = getRulesetList();
  const enabledRules = rulesets.filter(r => enabled.includes(r.id) || r.builtin);
  const linkReplace = {
    from: await kvGet(kv, 'link_replace:from') || '',
    to: await kvGet(kv, 'link_replace:to') || ''
  };

  // 抓取并解析节点
  const allNodes = [];
  for (const item of subs) {
    const url = typeof item === 'string' ? item : item.url;
    const nodes = await fetchNodes(url);
    allNodes.push(...nodes);
  }
  const nodes = deduplicateNodes(allNodes);

  // 生成 rule-provider 引用列表
  const rules = enabledRules.map(r => {
    let url = r.url;
    if (linkReplace.from && linkReplace.to) {
      url = url.replace(linkReplace.from, linkReplace.to);
    }
    return `RULE-SET,${r.id},🚀 节点选择`;
  });

  // 生成输出
  const output = generateOutput(nodes, format, {
    rules,
    linkReplace,
    subscriptionUrls: subs,
  });

  const contentTypes = {
    clash: 'text/yaml; charset=utf-8',
    base64: 'text/plain; charset=utf-8',
    singbox: 'application/json; charset=utf-8',
    surge: 'text/plain; charset=utf-8',
    loon: 'text/plain; charset=utf-8',
    auto: 'text/yaml; charset=utf-8',
  };

  const filenames = {
    clash: 'config.yaml',
    base64: 'nodes.txt',
    singbox: 'config.json',
    surge: 'surge.conf',
    loon: 'loon.conf',
    auto: 'config.yaml',
  };

  return new Response(output, {
    status: 200,
    headers: {
      'Content-Type': contentTypes[format] || 'text/plain; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filenames[format] || 'config'}"`,
      'Cache-Control': 'no-cache',
      'Access-Control-Allow-Origin': '*',
    }
  });
}

// ── 前端页面 ──
async function serveFrontend() {
  // 从 KV 读取或使用默认 HTML
  // 生产环境建议将 HTML 打包到 Worker 中
  const html = DEFAULT_HTML;
  return new Response(html, {
    status: 200,
    headers: { 'Content-Type': 'text/html; charset=utf-8' }
  });
}

// ── Session 提取 ──
async function getSession(kv, request) {
  const cookieHeader = request.headers.get('Cookie') || '';
  // 从 auth.js 获取 token
  const { getCookie } = await import('./utils.js');
  const token = getCookie(cookieHeader, 'session');
  if (!token) return { valid: false };

  const session = await kvGet(kv, 'sessions:' + token);
  if (!session) return { valid: false };
  if (session.expires && session.expires < Math.floor(Date.now() / 1000)) {
    await kvDelete(kv, 'sessions:' + token);
    return { valid: false };
  }
  return { valid: true, user: { username: session.username, role: session.role }, token };
}

// ── 规则集清单 ──
function getRulesetList() {
  return [
    // 内置安全规则（始终启用）
    { id: 'ChinaDomain', name: '国内直连', desc: '国内域名列表，走直连', group: 'system', url: 'https://raw.githubusercontent.com/ACL4SSR/ACL4SSR/master/Clash/Providers/ChinaDomain.yaml', builtin: true, common: true },
    { id: 'ChinaCompanyIp', name: '国内 IP 段', desc: '国内 IP 地址段，直连', group: 'system', url: 'https://raw.githubusercontent.com/ACL4SSR/ACL4SSR/master/Clash/Providers/ChinaCompanyIp.yaml', builtin: true, common: true },
    { id: 'LocalAreaNetwork', name: '内网地址', desc: '局域网、私有地址不走代理', group: 'system', url: 'https://raw.githubusercontent.com/ACL4SSR/ACL4SSR/master/Clash/Providers/LocalAreaNetwork.yaml', builtin: true, common: true },

    // 广告过滤
    { id: 'BanAD', name: '全球拦截', desc: '拦截常见广告、跟踪器、挖矿域名', group: 'ad', url: 'https://raw.githubusercontent.com/ACL4SSR/ACL4SSR/master/Clash/Providers/BanAD.yaml', builtin: false, common: true },
    { id: 'BanProgramAD', name: '应用净化', desc: '拦截 App 内广告、SDK 统计', group: 'ad', url: 'https://raw.githubusercontent.com/ACL4SSR/ACL4SSR/master/Clash/Providers/BanProgramAD.yaml', builtin: false, common: true },

    // 流媒体
    { id: 'Netflix', name: 'Netflix', desc: '奈飞视频分流', group: 'media', url: 'https://raw.githubusercontent.com/ACL4SSR/ACL4SSR/master/Clash/Providers/Ruleset/Netflix.yaml', builtin: false, common: true },
    { id: 'YouTube', name: 'YouTube', desc: '油管视频分流', group: 'media', url: 'https://raw.githubusercontent.com/ACL4SSR/ACL4SSR/master/Clash/Providers/Ruleset/YouTube.yaml', builtin: false, common: true },
    { id: 'DisneyPlus', name: 'Disney+', desc: 'Disney+ 流媒体分流', group: 'media', url: 'https://raw.githubusercontent.com/ACL4SSR/ACL4SSR/master/Clash/Providers/Ruleset/DisneyPlus.yaml', builtin: false, common: false },
    { id: 'TikTok', name: 'TikTok', desc: 'TikTok 国际版分流', group: 'media', url: 'https://raw.githubusercontent.com/ACL4SSR/ACL4SSR/master/Clash/Providers/Ruleset/TikTok.yaml', builtin: false, common: false },
    { id: 'ProxyMedia', name: '国外媒体', desc: '其他海外媒体平台合集', group: 'media', url: 'https://raw.githubusercontent.com/ACL4SSR/ACL4SSR/master/Clash/Providers/ProxyMedia.yaml', builtin: false, common: true },

    // Google
    { id: 'Google', name: 'Google 服务', desc: 'Google 搜索、Gmail、Drive 等核心服务', group: 'google', url: 'https://raw.githubusercontent.com/ACL4SSR/ACL4SSR/master/Clash/Providers/Ruleset/Google.yaml', builtin: false, common: true },
    { id: 'GoogleFCM', name: 'Google FCM', desc: 'Google 推送通知服务', group: 'google', url: 'https://raw.githubusercontent.com/ACL4SSR/ACL4SSR/master/Clash/Providers/Ruleset/GoogleFCM.yaml', builtin: false, common: true },
    { id: 'GoogleCN', name: 'Google CN', desc: 'Google 国内可访问服务（直连）', group: 'google', url: 'https://raw.githubusercontent.com/ACL4SSR/ACL4SSR/master/Clash/Providers/Ruleset/GoogleCN.yaml', builtin: false, common: false },

    // AI 服务
    { id: 'OpenAi', name: 'OpenAI', desc: 'ChatGPT、GPT API、OpenAI 全系服务', group: 'ai', url: 'https://raw.githubusercontent.com/ACL4SSR/ACL4SSR/master/Clash/Providers/Ruleset/OpenAi.yaml', builtin: false, common: true },
    { id: 'Claude', name: 'Claude', desc: 'Anthropic Claude 系列服务', group: 'ai', url: 'https://raw.githubusercontent.com/ACL4SSR/ACL4SSR/master/Clash/Providers/Ruleset/Claude.yaml', builtin: false, common: true },
    { id: 'Gemini', name: 'Gemini', desc: 'Google Gemini AI 服务', group: 'ai', url: 'https://raw.githubusercontent.com/ACL4SSR/ACL4SSR/master/Clash/Providers/Ruleset/Gemini.yaml', builtin: false, common: false },
    { id: 'Github', name: 'GitHub', desc: 'GitHub 开发平台', group: 'ai', url: 'https://raw.githubusercontent.com/ACL4SSR/ACL4SSR/master/Clash/Providers/Ruleset/Github.yaml', builtin: false, common: true },

    // 游戏
    { id: 'Steam', name: 'Steam', desc: 'Steam 商店、社区、下载加速', group: 'game', url: 'https://raw.githubusercontent.com/ACL4SSR/ACL4SSR/master/Clash/Providers/Ruleset/Steam.yaml', builtin: false, common: true },
    { id: 'SteamCN', name: 'Steam CN', desc: 'Steam 国区服务（直连）', group: 'game', url: 'https://raw.githubusercontent.com/ACL4SSR/ACL4SSR/master/Clash/Providers/Ruleset/SteamCN.yaml', builtin: false, common: true },
    { id: 'Epic', name: 'Epic', desc: 'Epic 游戏商店', group: 'game', url: 'https://raw.githubusercontent.com/ACL4SSR/ACL4SSR/master/Clash/Providers/Ruleset/Epic.yaml', builtin: false, common: false },
    { id: 'GameDownload', name: '游戏下载', desc: '游戏平台下载流量分流', group: 'game', url: 'https://raw.githubusercontent.com/ACL4SSR/ACL4SSR/master/Clash/Providers/Ruleset/GameDownload.yaml', builtin: false, common: false },

    // 系统服务
    { id: 'Apple', name: 'Apple 服务', desc: 'iCloud、App Store、Apple 全系服务', group: 'system', url: 'https://raw.githubusercontent.com/ACL4SSR/ACL4SSR/master/Clash/Providers/Apple.yaml', builtin: false, common: true },
    { id: 'Microsoft', name: 'Microsoft', desc: '微软服务、Office 365、Azure', group: 'system', url: 'https://raw.githubusercontent.com/ACL4SSR/ACL4SSR/master/Clash/Providers/Ruleset/Microsoft.yaml', builtin: false, common: true },
    { id: 'Telegram', name: 'Telegram', desc: 'Telegram 消息服务', group: 'system', url: 'https://raw.githubusercontent.com/ACL4SSR/ACL4SSR/master/Clash/Providers/Ruleset/Telegram.yaml', builtin: false, common: true },
  ];
}