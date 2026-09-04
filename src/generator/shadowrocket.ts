/**
 * Shadowrocket 配置生成器
 * 输出 .conf 格式（纯节点聚合，无分流规则）
 * 完整覆盖所有支持协议：VLESS / VMess / Trojan / SS / Hysteria2 / TUIC / WireGuard
 */
import { Node } from '@/models/node';
import { makeUniqueNames } from './mihomo';

/**
 * 将 Node 转换为 Shadowrocket [Proxy] 一行
 * 无字段则跳过，有字段才输出
 */
export function nodeToShadowrocketProxy(node: Node): string | null {
  const name = srEscape(node.name);
  switch (node.protocol) {
    case 'vless':
      return buildVless(node, name);
    case 'vmess':
      return buildVmess(node, name);
    case 'trojan':
      return buildTrojan(node, name);
    case 'ss':
      return buildSs(node, name);
    case 'hysteria2':
      return buildHysteria2(node, name);
    case 'tuic':
      return buildTuic(node, name);
    case 'wireguard':
      return buildWireguard(node, name);
    default:
      return null;
  }
}

// ── VLESS ──────────────────────────────────────────────────────────────────

function buildVless(n: Node, name: string): string | null {
  const p: string[] = [name, 'type=vless'];
  p.push(`server=${n.server}`);
  p.push(`port=${n.port}`);
  if (n.uuid) p.push(`password=${n.uuid}`);
  if (n.tls) p.push('tls=true');
  if (n.pbk || n.sid) p.push('security=reality');
  if (n.flow) p.push(`flow=${n.flow}`);
  if (n.sni) p.push(`sni=${n.sni}`);
  if (n.metadata?.fingerprint) p.push(`fp=${n.metadata.fingerprint}`);
  if (n.alpn?.length) p.push(`alpn=${n.alpn.join(',')}`);
  if (n.allowInsecure) p.push('skip-cert-verify=true');
  if (n.transport?.type === 'ws') {
    p.push('obfs=websocket');
    if (n.transport.path) p.push(`path=${n.transport.path}`);
    if (n.transport.host) p.push(`host=${n.transport.host}`);
  } else if (n.transport?.type === 'grpc') {
    p.push('obfs=gRPC');
    if (n.transport.path) p.push(`path=${n.transport.path.replace(/^\//, '')}`);
  } else if (n.transport?.type === 'xhttp') {
    p.push('obfs=xhttp');
    if (n.transport.mode) p.push(`mode=${n.transport.mode}`);
    if (n.transport.path) p.push(`path=${n.transport.path}`);
    if (n.transport.host) p.push(`host=${n.transport.host}`);
  }
  if (n.ports) p.push(`port-hopping=${n.ports}`);
  return p.length > 2 ? p.join(' ') : null;
}

// ── VMess ──────────────────────────────────────────────────────────────────

function buildVmess(n: Node, name: string): string | null {
  const p: string[] = [name, 'type=vmess'];
  p.push(`server=${n.server}`);
  p.push(`port=${n.port}`);
  if (n.uuid) p.push(`username=${n.uuid}`);
  const method = n.metadata?.tags?.[0] || 'aes-128-gcm';
  if (method !== 'aes-128-gcm') p.push(`cipher=${method}`);
  if (n.tls) p.push('tls=true');
  if (n.sni) p.push(`sni=${n.sni}`);
  if (n.metadata?.fingerprint) p.push(`fp=${n.metadata.fingerprint}`);
  if (n.alpn?.length) p.push(`alpn=${n.alpn.join(',')}`);
  if (n.allowInsecure) p.push('skip-cert-verify=true');
  if (n.transport?.type === 'ws') {
    p.push('obfs=websocket');
    if (n.transport.path) p.push(`path=${n.transport.path}`);
    if (n.transport.host) p.push(`host=${n.transport.host}`);
  } else if (n.transport?.type === 'grpc') {
    p.push('obfs=gRPC');
    if (n.transport.path) p.push(`path=${n.transport.path.replace(/^\//, '')}`);
  }
  return p.length > 2 ? p.join(' ') : null;
}

// ── Trojan ─────────────────────────────────────────────────────────────────

function buildTrojan(n: Node, name: string): string | null {
  const p: string[] = [name, 'type=trojan'];
  p.push(`server=${n.server}`);
  p.push(`port=${n.port}`);
  if (n.password) p.push(`password=${n.password}`);
  p.push('tls=true');
  if (n.sni) p.push(`sni=${n.sni}`);
  if (n.metadata?.fingerprint) p.push(`fp=${n.metadata.fingerprint}`);
  if (n.alpn?.length) p.push(`alpn=${n.alpn.join(',')}`);
  if (n.allowInsecure) p.push('skip-cert-verify=true');
  if (n.transport?.type === 'ws') {
    p.push('obfs=websocket');
    if (n.transport.path) p.push(`path=${n.transport.path}`);
    if (n.transport.host) p.push(`host=${n.transport.host}`);
  } else if (n.transport?.type === 'grpc') {
    p.push('obfs=gRPC');
    if (n.transport.path) p.push(`path=${n.transport.path.replace(/^\//, '')}`);
  }
  return p.length > 2 ? p.join(' ') : null;
}

// ── Shadowsocks ────────────────────────────────────────────────────────────

function buildSs(n: Node, name: string): string | null {
  const method = n.metadata?.tags?.[0] || n.username || 'aes-256-gcm';
  const p: string[] = [name, 'type=ss', `server=${n.server}`, `port=${n.port}`, `method=${method}`];
  if (n.password) p.push(`password=${n.password}`);
  if (n.plugin) {
    p.push(`plugin=${n.plugin}`);
  }
  return p.length > 2 ? p.join(' ') : null;
}

// ── Hysteria2 ──────────────────────────────────────────────────────────────

function buildHysteria2(n: Node, name: string): string | null {
  const p: string[] = [name, 'type=hysteria2'];
  p.push(`server=${n.server}`);
  p.push(`port=${n.port}`);
  if (n.password) p.push(`password=${n.password}`);
  if (n.sni) p.push(`sni=${n.sni}`);
  if (n.allowInsecure) p.push('skip-cert-verify=true');
  if (n.obfs) {
    p.push(`obfs-type=${n.obfs}`);
    if (n.obfsPassword) p.push(`obfs-password=${n.obfsPassword}`);
  }
  if (n.ports) p.push(`port-hopping=${n.ports}`);
  if (n.up) p.push(`up=${n.up}`);
  if (n.down) p.push(`down=${n.down}`);
  return p.length > 2 ? p.join(' ') : null;
}

// ── TUIC ───────────────────────────────────────────────────────────────────

function buildTuic(n: Node, name: string): string | null {
  const p: string[] = [name, 'type=tuic'];
  p.push(`server=${n.server}`);
  p.push(`port=${n.port}`);
  if (n.uuid) p.push(`uuid=${n.uuid}`);
  if (n.token) {
    // V4: token-based
    p.push(`password=${n.token}`);
  } else if (n.password) {
    // V5: password-based
    p.push(`password=${n.password}`);
  }
  if (n.sni) p.push(`sni=${n.sni}`);
  if (n.allowInsecure) p.push('skip-cert-verify=true');
  if (n.congestionController) p.push(`congestion=${n.congestionController}`);
  if (n.udpRelayMode) p.push(`udp-relay-mode=${n.udpRelayMode}`);
  if (n.disableSni) p.push('disable-sni=true');
  if (n.fastOpen) p.push('fast-open=true');
  return p.length > 2 ? p.join(' ') : null;
}

// ── WireGuard ──────────────────────────────────────────────────────────────

function buildWireguard(n: Node, name: string): string | null {
  const p: string[] = [name, 'type=wireguard'];
  p.push(`server=${n.server}`);
  p.push(`port=${n.port}`);
  if (n.wgPrivateKey) p.push(`private-key=${n.wgPrivateKey}`);
  if (n.wgPublicKey) p.push(`peer-public-key=${n.wgPublicKey}`);
  if (n.wgPreSharedKey) p.push(`pre-shared-key=${n.wgPreSharedKey}`);
  if (n.wgIp) p.push(`local-address=${n.wgIp}`);
  if (n.wgIpv6) p.push(`ipv6=${n.wgIpv6}`);
  if (n.wgAllowedIps) p.push(`allowed-ips=${n.wgAllowedIps}`);
  if (n.wgReserved?.length) p.push(`reserved=${n.wgReserved.join(',')}`);
  if (n.wgMtu) p.push(`mtu=${n.wgMtu}`);
  return p.length > 2 ? p.join(' ') : null;
}

// ── 工具函数 ────────────────────────────────────────────────────────────────

function srEscape(value: string): string {
  if (value.includes(' ') || value.includes('=')) {
    return `"${value.replace(/"/g, '\\"')}"`;
  }
  return value;
}

/**
 * 生成 Shadowrocket 配置（纯节点聚合，无分流规则）
 */
export function generateShadowrocketConfig(nodes: Node[]): string {
  const uniqueNodes = makeUniqueNames(nodes).filter((n) => n.protocol !== 'ssr');
  const lines: string[] = ['# Shadowrocket 订阅配置', '', '[Proxy]'];

  for (const node of uniqueNodes) {
    const proxy = nodeToShadowrocketProxy(node);
    if (proxy) lines.push(proxy);
  }

  lines.push('');
  return lines.join('\n');
}

/**
 * 校验生成的配置
 */
export function validateShadowrocket(config: string): boolean {
  return config.includes('[Proxy]');
}
