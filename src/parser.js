/**
 * 节点解析器
 * 支持 vmess/vless/trojan/ss/ssr/hysteria2 协议解析
 * 纯 JS 实现，无外部依赖，适配 CF Workers 运行时
 */

// ── 主解析入口 ──

/**
 * 解析单个节点链接，返回统一格式的节点对象
 * @param {string} link - 节点链接（如 vmess://xxx, trojan://xxx 等）
 * @returns {object|null} 节点对象，解析失败返回 null
 */
export function parseNode(link) {
  if (!link || typeof link !== 'string') return null;
  link = link.trim();
  if (!link) return null;

  try {
    if (link.startsWith('vmess://')) return parseVmess(link);
    if (link.startsWith('vless://')) return parseVless(link);
    if (link.startsWith('trojan://')) return parseTrojan(link);
    if (link.startsWith('ss://')) return parseSS(link);
    if (link.startsWith('ssr://')) return parseSSR(link);
    if (link.startsWith('hysteria2://') || link.startsWith('hy2://')) return parseHysteria2(link);
    if (link.startsWith('hysteria://') || link.startsWith('hy://')) return parseHysteria(link);
    if (link.startsWith('tuic://')) return parseTuic(link);
    // 未知协议
    return null;
  } catch (e) {
    // 解析失败时静默跳过
    return null;
  }
}

/**
 * 批量解析节点（支持多行文本、Base64 编码的订阅内容等）
 * @param {string} text - 原始订阅内容或节点文本
 * @returns {Array<object>} 节点对象数组
 */
export function parseNodes(text) {
  if (!text) return [];
  const nodes = [];

  // 尝试 Base64 解码（订阅格式通常是 Base64）
  let decoded = tryBase64Decode(text);

  // 按行分割
  const lines = (decoded || text).split('\n').filter(l => l.trim());

  for (const line of lines) {
    const node = parseNode(line.trim());
    if (node) nodes.push(node);
  }

  return nodes;
}

/**
 * 从订阅 URL 抓取并解析节点
 * @param {string} url - 订阅链接
 * @returns {Promise<Array<object>>} 节点对象数组
 */
export async function fetchNodes(url) {
  try {
    const response = await fetch(url, {
      headers: { 'User-Agent': 'CF-Workers-SUB-Next/1.0' },
      timeout: 15000
    });
    if (!response.ok) return [];
    const text = await response.text();
    return parseNodes(text);
  } catch {
    return [];
  }
}

// ── 节点去重 ──

/**
 * 按 server:port 去重
 * @param {Array<object>} nodes
 * @returns {Array<object>}
 */
export function deduplicateNodes(nodes) {
  const seen = new Set();
  return nodes.filter(n => {
    if (!n || !n.server || !n.port) return false;
    const key = `${n.server}:${n.port}:${n.protocol}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// ── 协议解析器 ──

/**
 * 解析 vmess:// 链接
 * 格式：vmess://base64(JSON) 或 vmess://base64(节点配置)
 */
function parseVmess(link) {
  const b64 = link.slice(8);
  let json;
  try {
    json = JSON.parse(atob(b64));
  } catch {
    // 尝试标准 Base64
    try {
      json = JSON.parse(base64Decode(b64));
    } catch {
      return null;
    }
  }

  const node = {
    protocol: 'vmess',
    server: json.add || json.host || json.address || '',
    port: parseInt(json.port) || 0,
    uuid: json.id || json.uuid || '',
    aid: parseInt(json.aid || json.alterId || '0'),
    security: json.scy || json.security || 'auto',
    network: json.net || json.network || 'tcp',
    tls: json.tls === 'tls' || json.tls === true,
    name: json.ps || json.remark || json.name || `vmess-${json.add || ''}`,
    // 额外字段
    path: json.path || '',
    host: json.host || '',
    sni: json.sni || '',
    fingerprint: json.fp || '',
    alpn: json.alpn || '',
  };

  return node;
}

/**
 * 解析 vless:// 链接
 * 格式：vless://uuid@server:port?params#name
 */
function parseVless(link) {
  const parsed = new URL(link);
  const node = {
    protocol: 'vless',
    server: parsed.hostname || '',
    port: parseInt(parsed.port) || 443,
    uuid: parsed.username || '',
    flow: parsed.searchParams.get('flow') || '',
    encryption: parsed.searchParams.get('encryption') || 'none',
    network: parsed.searchParams.get('type') || 'tcp',
    tls: parsed.searchParams.get('security') === 'tls' || parsed.searchParams.get('security') === 'reality',
    security: parsed.searchParams.get('security') || 'none',
    name: decodeURIComponent(parsed.hash?.replace(/^#/, '') || '') || `vless-${parsed.hostname}`,
    // 额外字段
    path: parsed.searchParams.get('path') || parsed.searchParams.get('serviceName') || '',
    host: parsed.searchParams.get('host') || parsed.searchParams.get('sni') || '',
    sni: parsed.searchParams.get('sni') || '',
    fingerprint: parsed.searchParams.get('fp') || '',
    alpn: parsed.searchParams.get('alpn') || '',
    pbk: parsed.searchParams.get('pbk') || '',
    sid: parsed.searchParams.get('sid') || '',
  };

  return node;
}

/**
 * 解析 trojan:// 链接
 * 格式：trojan://password@server:port?params#name
 */
function parseTrojan(link) {
  const parsed = new URL(link);
  const node = {
    protocol: 'trojan',
    server: parsed.hostname || '',
    port: parseInt(parsed.port) || 443,
    password: parsed.username || '',
    sni: parsed.searchParams.get('sni') || parsed.hostname || '',
    network: parsed.searchParams.get('type') || 'tcp',
    tls: true, // trojan 默认 TLS
    name: decodeURIComponent(parsed.hash?.replace(/^#/, '') || '') || `trojan-${parsed.hostname}`,
    alpn: parsed.searchParams.get('alpn') || '',
    fingerprint: parsed.searchParams.get('fp') || '',
    path: parsed.searchParams.get('path') || '',
    host: parsed.searchParams.get('host') || '',
  };

  return node;
}

/**
 * 解析 ss:// 链接
 * 格式：ss://base64(method:password)@server:port#name 或 ss://base64(method:password@server:port)#name
 */
function parseSS(link) {
  let str = link.slice(5);

  // 尝试解析完整 URI 格式
  if (str.includes('@')) {
    // ss://method:password@server:port#name
    try {
      const parsed = new URL(link);
      const node = {
        protocol: 'ss',
        server: parsed.hostname || '',
        port: parseInt(parsed.port) || 0,
        method: '',
        password: '',
        name: decodeURIComponent(parsed.hash?.replace(/^#/, '') || '') || `ss-${parsed.hostname}`,
        plugin: parsed.searchParams.get('plugin') || '',
      };

      // 解析 method:password 部分
      const userInfo = parsed.username || '';
      if (userInfo.includes(':')) {
        const parts = userInfo.split(':');
        node.method = parts[0];
        node.password = parts.slice(1).join(':');
      } else {
        // Base64 编码的 method:password
        try {
          const decoded = atob(userInfo);
          const parts = decoded.split(':');
          node.method = parts[0];
          node.password = parts.slice(1).join(':');
        } catch {
          node.method = userInfo;
        }
      }

      return node;
    } catch {
      // fallback 到手动解析
    }
  }

  // 旧格式：ss://base64(method:password@server:port)#name
  const hashIdx = str.indexOf('#');
  const name = hashIdx >= 0 ? decodeURIComponent(str.slice(hashIdx + 1)) : `ss-${str.slice(0, 20)}`;
  if (hashIdx >= 0) str = str.slice(0, hashIdx);

  try {
    const decoded = atob(str);
    const atIdx = decoded.indexOf('@');
    if (atIdx >= 0) {
      const methodPass = decoded.slice(0, atIdx);
      const serverPort = decoded.slice(atIdx + 1);
      const [server, portStr] = serverPort.split(':');
      const colonIdx = methodPass.indexOf(':');
      return {
        protocol: 'ss',
        server: server || '',
        port: parseInt(portStr) || 0,
        method: colonIdx >= 0 ? methodPass.slice(0, colonIdx) : '',
        password: colonIdx >= 0 ? methodPass.slice(colonIdx + 1) : methodPass,
        name: name,
      };
    }
  } catch {
    // 解析失败
  }

  return null;
}

/**
 * 解析 ssr:// 链接
 * 格式：ssr://base64(server:port:protocol:method:obfs:base64(password)/?params)#name
 */
function parseSSR(link) {
  let b64 = link.slice(6);
  // 移除 fragment
  const hashIdx = b64.indexOf('#');
  const name = hashIdx >= 0 ? decodeURIComponent(b64.slice(hashIdx + 1)) : '';
  if (hashIdx >= 0) b64 = b64.slice(0, hashIdx);

  let decoded;
  try {
    decoded = base64Decode(b64);
  } catch {
    return null;
  }

  // 格式：server:port:protocol:method:obfs:base64(password)
  const parts = decoded.split(':');
  if (parts.length < 6) return null;

  const server = parts[0];
  const port = parseInt(parts[1]);
  const protocol = parts[2];
  const method = parts[3];
  const obfs = parts[4];
  let password = '';
  try {
    password = base64Decode(parts[5]);
  } catch {
    password = parts[5];
  }

  // 解析参数
  const paramsIdx = decoded.indexOf('/?');
  let obfsParam = '';
  let protocolParam = '';
  let group = '';

  if (paramsIdx >= 0) {
    const paramsStr = decoded.slice(paramsIdx + 2);
    const params = new URLSearchParams(paramsStr.replace(/_/g, '&').replace(/&/g, '&'));
    try {
      obfsParam = params.get('obfsparam') ? base64Decode(params.get('obfsparam')) : '';
    } catch {}
    try {
      protocolParam = params.get('protoparam') ? base64Decode(params.get('protoparam')) : '';
    } catch {}
    try {
      group = params.get('group') ? base64Decode(params.get('group')) : '';
    } catch {}
  }

  return {
    protocol: 'ssr',
    server,
    port,
    method,
    password,
    obfs,
    protocol,
    obfsParam,
    protocolParam,
    name: name || `ssr-${server}`,
    group,
  };
}

/**
 * 解析 hysteria2:// 链接
 * 格式：hysteria2://password@server:port?params#name
 */
function parseHysteria2(link) {
  try {
    const parsed = new URL(link);
    const node = {
      protocol: 'hysteria2',
      server: parsed.hostname || '',
      port: parseInt(parsed.port) || 443,
      password: parsed.username || '',
      name: decodeURIComponent(parsed.hash?.replace(/^#/, '') || '') || `hy2-${parsed.hostname}`,
      sni: parsed.searchParams.get('sni') || parsed.hostname || '',
      insecure: parsed.searchParams.get('insecure') === '1' || parsed.searchParams.get('allowInsecure') === '1',
      obfs: parsed.searchParams.get('obfs') || '',
      obfsPassword: parsed.searchParams.get('obfs-password') || '',
      fingerprint: parsed.searchParams.get('pinSHA256') || '',
    };
    return node;
  } catch {
    return null;
  }
}

/**
 * 解析 hysteria:// 链接
 */
function parseHysteria(link) {
  try {
    const parsed = new URL(link);
    const node = {
      protocol: 'hysteria',
      server: parsed.hostname || '',
      port: parseInt(parsed.port) || 443,
      name: decodeURIComponent(parsed.hash?.replace(/^#/, '') || '') || `hy-${parsed.hostname}`,
      authStr: parsed.searchParams.get('auth') || parsed.username || '',
      protocol: parsed.searchParams.get('protocol') || 'udp',
      upMbps: parsed.searchParams.get('up') || '100',
      downMbps: parsed.searchParams.get('down') || '100',
      sni: parsed.searchParams.get('sni') || parsed.hostname || '',
      insecure: parsed.searchParams.get('insecure') === '1',
      alpn: parsed.searchParams.get('alpn') || 'h3',
    };
    return node;
  } catch {
    return null;
  }
}

/**
 * 解析 tuic:// 链接
 */
function parseTuic(link) {
  try {
    const parsed = new URL(link);
    const node = {
      protocol: 'tuic',
      server: parsed.hostname || '',
      port: parseInt(parsed.port) || 443,
      token: parsed.username || '',
      name: decodeURIComponent(parsed.hash?.replace(/^#/, '') || '') || `tuic-${parsed.hostname}`,
      congestion: parsed.searchParams.get('congestion_control') || 'bbr',
      udpRelayMode: parsed.searchParams.get('udp_relay_mode') || 'native',
      sni: parsed.searchParams.get('sni') || parsed.hostname || '',
      alpn: parsed.searchParams.get('alpn') || 'h3',
      disableSni: parsed.searchParams.get('disable_sni') === 'true',
    };
    return node;
  } catch {
    return null;
  }
}

// ── 工具函数 ──

/**
 * Base64 解码（兼容 URL-safe 格式）
 */
function base64Decode(str) {
  let s = str.replace(/-/g, '+').replace(/_/g, '/');
  while (s.length % 4) s += '=';
  return atob(s);
}

/**
 * 尝试 Base64 解码，如果失败返回原文
 */
function tryBase64Decode(str) {
  // 检查是否看起来像 Base64（订阅内容通常是 Base64）
  const trimmed = str.trim();
  if (/^[A-Za-z0-9+/=_-]+$/.test(trimmed) && trimmed.length > 40) {
    try {
      const decoded = base64Decode(trimmed);
      // 如果解码后包含常见协议前缀，说明是有效的 Base64 订阅
      if (decoded.includes('://')) return decoded;
    } catch {
      // 不是 Base64，返回原文
    }
  }
  return null;
}

/**
 * 将节点对象转换为 Clash 代理配置格式
 */
export function nodeToClashProxy(node) {
  if (!node) return null;

  const base = {
    name: node.name,
    server: node.server,
    port: node.port,
    type: node.protocol,
  };

  switch (node.protocol) {
    case 'vmess':
      return {
        ...base,
        uuid: node.uuid,
        alterId: node.aid || 0,
        cipher: node.security || 'auto',
        tls: node.tls || false,
        'skip-cert-verify': node.tls === false,
        network: node.network || 'tcp',
        'ws-opts': node.network === 'ws' ? {
          path: node.path || '/',
          headers: node.host ? { Host: node.host } : undefined,
        } : undefined,
        servername: node.sni || '',
      };
    case 'vless':
      return {
        ...base,
        uuid: node.uuid,
        tls: node.tls || false,
        'skip-cert-verify': node.tls === false,
        network: node.network || 'tcp',
        flow: node.flow || '',
        'ws-opts': node.network === 'ws' ? {
          path: node.path || '/',
          headers: node.host ? { Host: node.host } : undefined,
        } : undefined,
        'grpc-opts': node.network === 'grpc' ? {
          'grpc-service-name': node.path || '',
        } : undefined,
        servername: node.sni || '',
        'reality-opts': node.security === 'reality' ? {
          'public-key': node.pbk || '',
          'short-id': node.sid || '',
        } : undefined,
      };
    case 'trojan':
      return {
        ...base,
        password: node.password,
        sni: node.sni || node.server,
        'skip-cert-verify': false,
        alpn: node.alpn ? node.alpn.split(',') : undefined,
      };
    case 'ss':
      return {
        ...base,
        cipher: node.method,
        password: node.password,
        plugin: node.plugin || undefined,
        pluginOpts: node.plugin ? {} : undefined,
      };
    case 'ssr':
      return {
        ...base,
        cipher: node.method,
        password: node.password,
        protocol: node.protocol,
        'protocol-param': node.protocolParam || '',
        obfs: node.obfs,
        'obfs-param': node.obfsParam || '',
      };
    case 'hysteria2':
    case 'hy2':
      return {
        ...base,
        type: 'hysteria2',
        password: node.password,
        sni: node.sni || node.server,
        'skip-cert-verify': node.insecure || false,
        obfs: node.obfs || undefined,
        'obfs-password': node.obfsPassword || undefined,
      };
    case 'hysteria':
      return {
        ...base,
        type: 'hysteria',
        'auth-str': node.authStr,
        protocol: node.protocol || 'udp',
        'up-speed': parseInt(node.upMbps) || 100,
        'down-speed': parseInt(node.downMbps) || 100,
        sni: node.sni || node.server,
        'skip-cert-verify': node.insecure || false,
        alpn: node.alpn ? [node.alpn] : ['h3'],
      };
    case 'tuic':
      return {
        ...base,
        type: 'tuic',
        token: node.token,
        'congestion-controller': node.congestion || 'bbr',
        'udp-relay-mode': node.udpRelayMode || 'native',
        sni: node.sni || node.server,
        alpn: node.alpn ? [node.alpn] : ['h3'],
        'disable-sni': node.disableSni || false,
      };
    default:
      return null;
  }
}