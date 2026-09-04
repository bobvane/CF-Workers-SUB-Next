/**
 * Sing-box 配置生成器
 * TASK 5.2 - Sing-box Generator
 * 09_CONFIG_GENERATOR_SPEC.md §8：输出 JSON，outbounds 映射
 * v2.24.0: 全面补全所有协议字段（Hysteria2/TUIC/WireGuard/AnyTLS/VMess/VLESS/SS/Trojan）
 */

import { Node } from '@/models/node';
import { makeUniqueNames } from './mihomo';

export interface SingboxTemplate {
  logLevel?: string;
}

export const DEFAULT_SINGBOX_TEMPLATE: SingboxTemplate = {
  logLevel: 'info',
};

/**
 * 将 Node 转换为 Sing-box outbound 配置对象
 * 有参数则输出，无参数则跳过
 */
export function nodeToSingboxOutbound(node: Node): Record<string, unknown> | null {
  switch (node.protocol) {
    case 'vmess':
      return buildVmess(node);
    case 'vless':
      return buildVless(node);
    case 'trojan':
      return buildTrojan(node);
    case 'ss':
      return buildShadowsocks(node);
    case 'hysteria2':
      return buildHysteria2(node);
    case 'tuic':
      return buildTuic(node);
    case 'wireguard':
      return buildWireguard(node);
    case 'anytls':
      return buildAnytls(node);
    default:
      return null;
  }
}

// ── VMess ───────────────────────────────────────────────────────────────────

function buildVmess(n: Node): Record<string, unknown> {
  const out: Record<string, unknown> = { type: 'vmess', tag: n.name, server: n.server, server_port: n.port };
  if (n.uuid) out.uuid = n.uuid;
  // method: tags[0] 是解析器写入的加密方式；无则留空让客户端 auto
  if (n.metadata?.tags?.[0]) out.method = n.metadata.tags[0];
  if (n.transport?.type) {
    const tr: Record<string, unknown> = { type: n.transport.type };
    if (n.transport.path) tr.path = n.transport.path;
    if (n.transport.host) tr.headers = { Host: n.transport.host };
    out.transport = tr;
  }
  if (n.tls) {
    const tls: Record<string, unknown> = { enabled: true, server_name: n.sni ?? n.server };
    if (n.alpn?.length) tls.alpn = n.alpn;
    if (n.metadata?.fingerprint) tls.utls = { enabled: true, fingerprint: n.metadata.fingerprint };
    out.tls = tls;
  }
  // fast_open、packet_encoding 等可选字段
  if (n.fastOpen) out.fast_open = true;
  if (n.metadata?.extra?.['packet-encoding']) out.packet_encoding = n.metadata.extra['packet-encoding'];
  if (n.metadata?.extra?.['global-padding']) out.global_padding = true;
  if (n.metadata?.extra?.['authenticated-noise']) out.authenticated_noise = true;
  if (n.metadata?.extra?.['multi-server']) out.multi_server = true;
  return out;
}

// ── VLESS ───────────────────────────────────────────────────────────────────

function buildVless(n: Node): Record<string, unknown> {
  const out: Record<string, unknown> = { type: 'vless', tag: n.name, server: n.server, server_port: n.port };
  if (n.uuid) out.uuid = n.uuid;
  if (n.flow) out.flow = n.flow;
  if (n.transport?.type) {
    const tr: Record<string, unknown> = { type: n.transport.type };
    if (n.transport.path) tr.path = n.transport.path;
    if (n.transport.host) tr.headers = { Host: n.transport.host };
    if (n.transport.mode) tr.mode = n.transport.mode;
    out.transport = tr;
  }
  if (n.tls) {
    const tls: Record<string, unknown> = {
      enabled: true,
      server_name: n.sni ?? n.server,
    };
    if (n.alpn?.length) tls.alpn = n.alpn;
    if (n.metadata?.fingerprint) tls.utls = { enabled: true, fingerprint: n.metadata.fingerprint };
    if (n.pbk || n.sid) {
      const reality: Record<string, unknown> = { enabled: true };
      if (n.pbk) reality.public_key = n.pbk;
      if (n.sid) reality.short_id = n.sid;
      tls.reality = reality;
    }
    out.tls = tls;
  }
  if (n.fastOpen) out.fast_open = true;
  if (n.metadata?.extra?.['packet-encoding']) out.packet_encoding = n.metadata.extra['packet-encoding'];
  return out;
}

// ── Trojan ──────────────────────────────────────────────────────────────────

function buildTrojan(n: Node): Record<string, unknown> {
  const out: Record<string, unknown> = { type: 'trojan', tag: n.name, server: n.server, server_port: n.port };
  if (n.password) out.password = n.password;
  if (n.tls) {
    const tls: Record<string, unknown> = {
      enabled: true,
      server_name: n.sni ?? n.server,
    };
    if (n.allowInsecure) tls.insecure = true;
    if (n.alpn?.length) tls.alpn = n.alpn;
    if (n.metadata?.fingerprint) tls.utls = { enabled: true, fingerprint: n.metadata.fingerprint };
    out.tls = tls;
  }
  if (n.fastOpen) out.fast_open = true;
  return out;
}

// ── Shadowsocks ─────────────────────────────────────────────────────────────

function buildShadowsocks(n: Node): Record<string, unknown> {
  const method = n.metadata?.tags?.[0] || n.username || 'aes-256-gcm';
  const out: Record<string, unknown> = { type: 'ss', tag: n.name, server: n.server, server_port: n.port, method, password: n.password };
  if (n.plugin) {
    const pluginParts = n.plugin.split(';');
    out.plugin = pluginParts[0];
    const opts: Record<string, string> = {};
    for (const part of pluginParts.slice(1)) {
      if (part.includes('=')) {
        const [k, v] = part.split('=');
        opts[k] = v;
      } else {
        opts.mode = part;
      }
    }
    if (Object.keys(opts).length > 0) out.plugin_opts = formatPluginOpts(opts);
  }
  if (n.fastOpen) out.fast_open = true;
  return out;
}

// ── Hysteria2 ───────────────────────────────────────────────────────────────

function buildHysteria2(n: Node): Record<string, unknown> {
  const out: Record<string, unknown> = { type: 'hysteria2', tag: n.name, server: n.server, server_port: n.port, password: n.password };
  if (n.ports) out.ports = n.ports;
  if (n.sni) out.sni = n.sni;
  if (n.allowInsecure) out.insecure = true;
  if (n.obfs) {
    const obfs: Record<string, unknown> = { type: n.obfs };
    if (n.obfsPassword) obfs.password = n.obfsPassword;
    out.obfs = obfs;
  }
  if (n.up) out.up = n.up;
  if (n.down) out.down = n.down;
  if (n.alpn?.length) out.alpn = n.alpn;
  if (n.fastOpen) out.fast_open = true;
  if (n.metadata?.extra?.['disable-mtu-discovery']) out.disable_mtu_discovery = true;
  // socks64: 当节点为 SSR 类时使用（通常来自 metadata.extra）
  if (n.metadata?.extra?.['socks64']) out.socks64 = true;
  return out;
}

// ── TUIC ────────────────────────────────────────────────────────────────────

function buildTuic(n: Node): Record<string, unknown> {
  const out: Record<string, unknown> = {
    type: 'tuic', tag: n.name, server: n.server, server_port: n.port,
    uuid: n.uuid,
  };
  // V4 用 token，V5 用 password
  if (n.token) out.token = n.token;
  if (n.password && !n.token) out.password = n.password;
  if (n.sni) out.sni = n.sni;
  if (n.allowInsecure) out.insecure = true;
  if (n.congestionController) out.congestion_control = n.congestionController;
  if (n.udpRelayMode) out.udp_relay_mode = n.udpRelayMode;
  if (n.disableSni) out.disable_sni = true;
  if (n.reduceRtt) out.reduce_rtt = true;
  if (n.fastOpen) out.fast_open = true;
  if (n.alpn?.length) out.alpn = n.alpn;
  if (n.metadata?.extra?.['heartbeat-interval']) out.heartbeat_interval = parseInt(n.metadata.extra['heartbeat-interval'], 10);
  return out;
}

// ── WireGuard ───────────────────────────────────────────────────────────────

function buildWireguard(n: Node): Record<string, unknown> {
  const out: Record<string, unknown> = {
    type: 'wireguard', tag: n.name, server: n.server, server_port: n.port,
  };
  if (n.wgPrivateKey) out.private_key = n.wgPrivateKey;
  if (n.wgPublicKey) out.peer_public_key = n.wgPublicKey;
  if (n.wgPreSharedKey) out.pre_shared_key = n.wgPreSharedKey;
  if (n.wgIp) {
    const ips: string[] = [n.wgIp];
    if (n.wgIpv6) ips.push(n.wgIpv6);
    out.local_address = ips;
  }
  if (n.wgAllowedIps) {
    // allowed-ips 可以是逗号分隔或单个 IP/mask
    out.allowed_ips = n.wgAllowedIps.split(',').map((s) => s.trim());
  } else {
    // 默认路由全部流量
    out.allowed_ips = ['0.0.0.0/0', '::/0'];
  }
  if (n.wgReserved?.length) out.reserved = n.wgReserved;
  if (n.wgMtu) out.mtu = n.wgMtu;
  // persistent_keepalive 来自 extra（标准链接用 keepalive 参数）
  if (n.metadata?.extra?.['persistent-keepalive']) {
    out.persistent_keepalive_period = parseInt(n.metadata.extra['persistent-keepalive'], 10);
  }
  return out;
}

// ── AnyTLS ──────────────────────────────────────────────────────────────────

function buildAnytls(n: Node): Record<string, unknown> {
  const out: Record<string, unknown> = {
    type: 'anytls', tag: n.name, server: n.server, server_port: n.port,
    password: n.password,
  };
  if (n.sni) out.sni = n.sni;
  if (n.clientMetadata) out.client_metadata = n.clientMetadata;
  if (n.idleSessionCheckInterval) out.idle_session_check_interval = n.idleSessionCheckInterval;
  if (n.idleSessionTimeout) out.idle_session_timeout = n.idleSessionTimeout;
  if (n.minIdleSession) out.min_idle_session = n.minIdleSession;
  if (n.allowInsecure) out.insecure = true;
  if (n.alpn?.length) out.alpn = n.alpn;
  return out;
}

// ── 工具函数 ────────────────────────────────────────────────────────────────

function formatPluginOpts(opts: Record<string, string>): string {
  return Object.entries(opts)
    .map(([k, v]) => `${k}=${v}`)
    .join(';');
}

/**
 * 生成 Sing-box JSON 配置（不含分流规则 — 仅节点聚合）
 */
export function generateSingboxConfig(nodes: Node[], template: SingboxTemplate = DEFAULT_SINGBOX_TEMPLATE): string {
  const uniqueNodes = makeUniqueNames(nodes).filter((n) => n.protocol !== 'ssr');
  const nodeTags = uniqueNodes.map((n) => n.name);
  const outbounds: Record<string, unknown>[] = [
    { type: 'direct', tag: 'direct' },
    ...uniqueNodes.map(nodeToSingboxOutbound).filter((o): o is Record<string, unknown> => o !== null),
    {
      type: 'selector',
      tag: 'proxy',
      outbounds: ['auto', ...nodeTags],
      default: nodeTags.length > 0 ? 'auto' : 'direct',
    },
    {
      type: 'urltest',
      tag: 'auto',
      outbounds: nodeTags.length > 0 ? nodeTags : ['direct'],
      url: 'https://cp.cloudflare.com/generate_204',
      interval: '10m',
      tolerance: 50,
    },
  ];

  const config: Record<string, unknown> = {
    log: { level: template.logLevel ?? 'info' },
    dns: {
      servers: [
        { tag: 'dns-proxy', address: 'https://1.1.1.1/dns-query', detour: 'proxy' },
        { tag: 'dns-direct', address: 'https://223.5.5.5/dns-query', detour: 'direct' },
        { tag: 'dns-local', address: 'local' },
      ],
      final: 'dns-proxy',
      independent_cache: true,
    },
    inbounds: [
      { type: 'tun', tag: 'tun-in', address: ['172.19.0.1/30'], auto_route: true, strict_route: true },
      { type: 'mixed', tag: 'mixed-in', listen: '127.0.0.1', listen_port: 7890 },
    ],
    outbounds,
    route: {
      final: 'proxy',
      auto_detect_interface: true,
      rules: [
        { action: 'sniff' },
        { protocol: 'dns', action: 'hijack-dns' },
        { ip_is_private: true, outbound: 'direct' },
        { clash_mode: 'Direct', outbound: 'direct' },
        { clash_mode: 'Global', outbound: 'proxy' },
      ],
    },
    experimental: { cache_file: { enabled: true } },
  };

  return JSON.stringify(config, null, 2);
}

/**
 * 验证生成的 JSON 格式正确
 */
export function validateSingbox(json: string): boolean {
  try {
    const parsed = JSON.parse(json);
    return !!parsed && Array.isArray((parsed as Record<string, unknown>).outbounds);
  } catch {
    return false;
  }
}
