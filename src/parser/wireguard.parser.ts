/**
 * WireGuard 解析器
 * 输入: wireguard://uuid@server:port?params#name  (或 wg://)
 *       或标准 WireGuard conf 格式 [Interface]/[Peer]
 * 支持: private-key, public-key, ip, ipv6, allowed-ips, pre-shared-key, reserved, mtu
 *
 * 分享链接格式约定（参考 v2rayN/Nekoray 惯例）:
 *   wireguard://private-key@server:port?ip=xxx&public-key=xxx&allowed-ips=0.0.0.0/0#name
 *   wg://private-key@server:port?ip=xxx&public-key=xxx&allowed-ips=0.0.0.0/0#name
 *
 * 也支持直接解析标准 WireGuard conf 文件（[Interface] + [Peer]）。
 */

import { Node, createNode } from '@/models/node';
import { ParserResult, makeError } from './types';

export function parseWireguard(input: string): ParserResult {
  try {
    const trimmed = input.trim();

    // 检测是否为标准 WireGuard conf 文件格式
    if (trimmed.startsWith('[Interface]') || trimmed.startsWith('[Peer]')) {
      return parseWireguardConf(trimmed);
    }

    // 分享链接格式
    const payload = trimmed.replace(/^wireguard:\/\/|^wg:\/\//i, '');

    // 分离 name (#fragment)
    const hashIndex = payload.indexOf('#');
    const name = hashIndex >= 0 ? decodeURIComponent(payload.slice(hashIndex + 1).trim()) : '';

    // 分离 query (?) 与 authority
    const authPart = hashIndex >= 0 ? payload.slice(0, hashIndex) : payload;
    const queryIndex = authPart.indexOf('?');
    const authority = queryIndex >= 0 ? authPart.slice(0, queryIndex) : authPart;
    const queryStr = queryIndex >= 0 ? authPart.slice(queryIndex + 1) : '';

    const params = new URLSearchParams(queryStr);

    // 解析 authority: private-key@server:port
    const atIndex = authority.lastIndexOf('@');
    if (atIndex < 0) return makeError('INVALID_FORMAT', 'WireGuard missing @ separator');
    const privateKey = authority.slice(0, atIndex);
    const hostPort = authority.slice(atIndex + 1);

    if (!privateKey) return makeError('MISSING_PRIVATE_KEY', 'WireGuard missing private-key');

    // server:port
    const lastColon = hostPort.lastIndexOf(':');
    if (lastColon <= 0) return makeError('MISSING_SERVER', 'WireGuard missing server');
    const server = hostPort.slice(0, lastColon);
    const port = parseInt(hostPort.slice(lastColon + 1), 10);
    if (!server) return makeError('MISSING_SERVER', 'WireGuard missing server');
    if (!Number.isFinite(port) || port <= 0) return makeError('MISSING_PORT', 'WireGuard missing port');

    const wgIp = params.get('ip') ?? undefined;
    const wgIpv6 = params.get('ipv6') ?? undefined;
    const wgPublicKey = params.get('public-key') ?? undefined;
    const wgAllowedIps = params.get('allowed-ips') ?? '0.0.0.0/0';
    const wgPreSharedKey = params.get('pre-shared-key') ?? params.get('preshared-key') ?? undefined;
    const reserved = params.get('reserved') ?? undefined;
    const mtuStr = params.get('mtu') ?? undefined;
    const wgMtu = mtuStr ? parseInt(mtuStr, 10) : undefined;

    // reserved 可能是 "U4An" 字符串或 "209,98,59" 逗号分隔
    let wgReserved: number[] | undefined;
    if (reserved) {
      if (reserved.includes(',')) {
        wgReserved = reserved.split(',').map((n) => parseInt(n.trim(), 10)).filter((n) => Number.isFinite(n));
      }
      // 字符串格式如 "U4An" 暂不解析为 number[]，保留原样
    }

    const node: Node = createNode({
      name: name || `${server}:${port}`,
      protocol: 'wireguard',
      server,
      port,
      tls: false,
      wgIp,
      wgIpv6,
      wgPrivateKey: privateKey,
      wgPublicKey,
      wgAllowedIps,
      wgPreSharedKey,
      wgReserved,
      wgMtu,
      metadata: {
        source: 'unknown',
        originalName: name || `${server}:${port}`,
        tags: [],
      },
    });

    return { success: true, node };
  } catch {
    return makeError('PARSE_FAILED', 'WireGuard parse failed');
  }
}

/**
 * 解析标准 WireGuard conf 文件
 * [Interface] PrivateKey=... Address=... DNS=... MTU=...
 * [Peer] PublicKey=... AllowedIPs=... Endpoint=... PresharedKey=... PersistentKeepalive=...
 */
function parseWireguardConf(content: string): ParserResult {
  try {
    let privateKey: string | undefined;
    let ip: string | undefined;
    let ipv6: string | undefined;
    let mtu: number | undefined;
    let publicKey: string | undefined;
    let allowedIps: string | undefined;
    let preSharedKey: string | undefined;
    let server: string | undefined;
    let port: number | undefined;
    let reserved: number[] | undefined;

    for (const line of content.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith('//')) continue;

      const eqIdx = trimmed.indexOf('=');
      if (eqIdx < 0) continue;
      const key = trimmed.slice(0, eqIdx).trim().toLowerCase();
      const value = trimmed.slice(eqIdx + 1).trim();

      switch (key) {
        case 'privatekey':
          privateKey = value;
          break;
        case 'address': {
          // 可能是 "10.6.0.2/32, fd01:..."
          const parts = value.split(',').map((s) => s.trim());
          for (const part of parts) {
            const addr = part.split('/')[0];
            if (addr.includes(':')) {
              ipv6 = addr;
            } else {
              ip = addr;
            }
          }
          break;
        }
        case 'dns': {
          // 暂不处理
          break;
        }
        case 'mtu':
          mtu = parseInt(value, 10);
          if (!Number.isFinite(mtu)) mtu = undefined;
          break;
        case 'publickey':
          publicKey = value;
          break;
        case 'allowedips':
          allowedIps = value.split(',').map((s) => s.trim())[0] ?? '0.0.0.0/0';
          break;
        case 'endpoint': {
          // server:port
          const lastColon = value.lastIndexOf(':');
          if (lastColon > 0) {
            server = value.slice(0, lastColon);
            port = parseInt(value.slice(lastColon + 1), 10);
          }
          break;
        }
        case 'presharedkey':
          preSharedKey = value;
          break;
        case 'reserved': {
          if (value.includes(',')) {
            reserved = value.split(',').map((n) => parseInt(n.trim(), 10)).filter((n) => Number.isFinite(n));
          }
          break;
        }
      }
    }

    if (!privateKey) return makeError('MISSING_PRIVATE_KEY', 'WireGuard conf missing PrivateKey');
    if (!server || !port) return makeError('MISSING_SERVER', 'WireGuard conf missing Endpoint');

    const node: Node = createNode({
      name: `${server}:${port}`,
      protocol: 'wireguard',
      server,
      port,
      tls: false,
      wgIp: ip,
      wgIpv6: ipv6,
      wgPrivateKey: privateKey,
      wgPublicKey: publicKey,
      wgAllowedIps: allowedIps ?? '0.0.0.0/0',
      wgPreSharedKey: preSharedKey,
      wgReserved: reserved,
      wgMtu: mtu,
      metadata: {
        source: 'unknown',
        originalName: `${server}:${port}`,
        tags: [],
      },
    });

    return { success: true, node };
  } catch {
    return makeError('PARSE_FAILED', 'WireGuard conf parse failed');
  }
}
