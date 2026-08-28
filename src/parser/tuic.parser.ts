/**
 * TUIC 解析器
 * 输入: tuic://uuid:password@server:port?params#name  (V5)
 *       tuic://token@server:port?params#name           (V4)
 * 支持: TLS, SNI, alpn, udp-relay-mode, congestion-controller, disable-sni, reduce-rtt
 */

import { Node, createNode } from '@/models/node';
import { ParserResult, makeError } from './types';

export function parseTuic(input: string): ParserResult {
  try {
    const payload = input.replace(/^tuic:\/\//i, '');

    // 分离 name (#fragment)
    const hashIndex = payload.indexOf('#');
    const name = hashIndex >= 0 ? decodeURIComponent(payload.slice(hashIndex + 1).trim()) : '';

    // 分离 query (?) 与 authority
    const authPart = hashIndex >= 0 ? payload.slice(0, hashIndex) : payload;
    const queryIndex = authPart.indexOf('?');
    const authority = queryIndex >= 0 ? authPart.slice(0, queryIndex) : authPart;
    const queryStr = queryIndex >= 0 ? authPart.slice(queryIndex + 1) : '';

    const params = new URLSearchParams(queryStr);

    // 解析 authority: [uuid:password]@server:port  或  token@server:port
    const atIndex = authority.lastIndexOf('@');
    if (atIndex < 0) return makeError('INVALID_FORMAT', 'TUIC missing @ separator');
    const userInfo = authority.slice(0, atIndex);
    const hostPort = authority.slice(atIndex + 1);

    if (!userInfo) return makeError('MISSING_CREDENTIALS', 'TUIC missing credentials');

    // server:port
    const lastColon = hostPort.lastIndexOf(':');
    if (lastColon <= 0) return makeError('MISSING_SERVER', 'TUIC missing server');
    const server = hostPort.slice(0, lastColon);
    const port = parseInt(hostPort.slice(lastColon + 1), 10);
    if (!server) return makeError('MISSING_SERVER', 'TUIC missing server');
    if (!Number.isFinite(port) || port <= 0) return makeError('MISSING_PORT', 'TUIC missing port');

    // 区分 V4/V5: V5 用 uuid:password 格式，V4 用纯 token
    let uuid: string | undefined;
    let password: string | undefined;
    let token: string | undefined;

    if (userInfo.includes(':')) {
      // V5: uuid:password
      const colonIdx = userInfo.indexOf(':');
      uuid = userInfo.slice(0, colonIdx);
      password = userInfo.slice(colonIdx + 1);
    } else {
      // V4: token
      token = userInfo;
    }

    const sni = params.get('sni') ?? undefined;
    const alpn = params.get('alpn') ?? undefined;
    const udpRelayMode = params.get('udp-relay-mode') ?? params.get('udp_relay_mode') ?? undefined;
    const congestionController = params.get('congestion-controller') ?? params.get('congestion_control') ?? undefined;
    const disableSni = params.get('disable-sni') === '1' || params.get('disable-sni') === 'true';
    const reduceRtt = params.get('reduce-rtt') === '1' || params.get('reduce-rtt') === 'true';
    const fastOpen = params.get('fast-open') === '1' || params.get('fast-open') === 'true';
    const allowInsecure = params.get('allowInsecure') === '1' || params.get('insecure') === '1';
    const tls = params.get('security') !== 'none';

    const node: Node = createNode({
      name: name || `${server}:${port}`,
      protocol: 'tuic',
      server,
      port,
      uuid,
      password,
      token,
      tls,
      sni,
      allowInsecure,
      udpRelayMode,
      congestionController,
      disableSni,
      reduceRtt,
      fastOpen,
      alpn: alpn ? alpn.split(',').filter(Boolean) : undefined,
      metadata: {
        source: 'unknown',
        originalName: name || `${server}:${port}`,
        tags: [],
      },
    });

    return { success: true, node };
  } catch {
    return makeError('PARSE_FAILED', 'TUIC parse failed');
  }
}
