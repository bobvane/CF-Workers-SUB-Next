/**
 * Fetcher 模块 - 订阅内容抓取
 * TASK 3.3 - External Fetch Service
 * 11_SECURITY.md §4-5：SSRF 防护 + Timeout + Size Limit + Redirect 限制
 */

const ALLOWED_PROTOCOLS = ['https:', 'http:'];
const MAX_RESPONSE_SIZE = 5 * 1024 * 1024; // 5 MB
const FETCH_TIMEOUT_MS = 10_000; // 10 秒
const MAX_REDIRECTS = 3;

// 私有/保留 IP 前缀（IPv4 + IPv6）
const BLOCKED_IP_PATTERNS: { name: string; test: (ip: string) => boolean }[] = [
  {
    name: 'loopback',
    test: (ip) => ip === '127.0.0.1' || ip === '::1' || ip.startsWith('127.'),
  },
  {
    name: 'link-local',
    test: (ip) => ip.startsWith('169.254.') || ip.startsWith('fe80:'),
  },
  {
    name: 'private-10',
    test: (ip) => ip.startsWith('10.'),
  },
  {
    name: 'private-172',
    test: (ip) => {
      const match = ip.match(/^172\.(\d+)\./);
      if (!match) return false;
      const second = parseInt(match[1], 10);
      return second >= 16 && second <= 31;
    },
  },
  {
    name: 'private-192',
    test: (ip) => ip.startsWith('192.168.'),
  },
  {
    name: 'unique-local-v6',
    test: (ip) => ip.startsWith('fc') || ip.startsWith('fd'),
  },
  {
    name: 'unspecified',
    test: (ip) => ip === '0.0.0.0' || ip === '::',
  },
];

/**
 * 判断 IP 是否为禁止访问的地址（SSRF 防护）
 */
export function isBlockedIp(ip: string): boolean {
  return BLOCKED_IP_PATTERNS.some((p) => p.test(ip));
}

/**
 * 从 URL 提取主机名并检查是否合法
 * 只做静态检查（域名→IP 解析后的检查在 Workers 运行时不可控，尽力而为）
 */
export function validateUrl(url: string): { ok: true; parsed: URL } | { ok: false; reason: string } {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return { ok: false, reason: 'Invalid URL format' };
  }

  if (!ALLOWED_PROTOCOLS.includes(parsed.protocol)) {
    return { ok: false, reason: `Protocol ${parsed.protocol} not allowed` };
  }

  const hostname = parsed.hostname.toLowerCase();

  // 禁止 localhost / IP 形式
  if (hostname === 'localhost') {
    return { ok: false, reason: 'localhost is not allowed' };
  }

  // 检查是否为 IP 字面量
  const ipv4Match = hostname.match(/^\d{1,3}(\.\d{1,3}){3}$/);
  if (ipv4Match) {
    if (isBlockedIp(hostname)) {
      return { ok: false, reason: 'Private or reserved IP is not allowed' };
    }
  }

  // IPv6 字面量 [::1] 形式
  if (hostname.includes(':')) {
    const cleanIp = hostname.replace(/^\[|\]$/g, '');
    if (isBlockedIp(cleanIp)) {
      return { ok: false, reason: 'Private or reserved IP is not allowed' };
    }
  }

  return { ok: true, parsed };
}

/**
 * 带超时的 fetch
 */
async function fetchWithTimeout(input: RequestInfo | URL, init: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * 抓取订阅内容
 * 校验：URL 合法 → 超时 → 重定向限制 → 响应大小限制
 */
export async function fetchSubscription(url: string): Promise<string> {
  const validation = validateUrl(url);
  if (!validation.ok) {
    throw new Error(`SSRF check failed: ${validation.reason}`);
  }

  let currentUrl: string = url;

  try {
    for (let i = 0; i <= MAX_REDIRECTS; i++) {
      const res = await fetchWithTimeout(currentUrl, {
        headers: {
          'User-Agent': 'CF-Workers-SUB-Next/2.0',
          Accept: 'text/plain,text/html,application/json,*/*',
        },
        redirect: 'manual', // 手动处理重定向以计数
      });

      if (res.status >= 300 && res.status < 400 && res.headers.get('location')) {
        const location = res.headers.get('location')!;
        currentUrl = new URL(location, currentUrl).toString();
        // 每次重定向都重新校验目标 URL（防 SSRF 绕过）
        const redirectValidation = validateUrl(currentUrl);
        if (!redirectValidation.ok) {
          throw new Error(`Redirect SSRF check failed: ${redirectValidation.reason}`);
        }
        continue;
      }

      if (!res.ok) {
        throw new Error(`Fetch failed with status ${res.status}`);
      }

      const contentLength = res.headers.get('content-length');
      if (contentLength && parseInt(contentLength, 10) > MAX_RESPONSE_SIZE) {
        throw new Error('Response too large (content-length)');
      }

      const text = await res.text();
      if (text.length > MAX_RESPONSE_SIZE) {
        throw new Error('Response too large');
      }
      return text;
    }
    throw new Error('Too many redirects');
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      throw new Error('Fetch timeout');
    }
    throw err;
  }
}