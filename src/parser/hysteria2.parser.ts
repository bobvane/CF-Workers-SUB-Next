/**
 * Hysteria2 解析器
 * 输入: hysteria2://password@server:port?params#name  或  hy2://...
 * 支持: TLS, SNI, obfs(salamander), ports(端口跳跃), up/down(限速)
 */

import { Node, createNode } from '@/models/node';
import { ParserResult, makeError } from './types';

export function parseHysteria2(input: string): ParserResult {
  try {
    const payload = input.replace(/^hysteria2:\/\/|^hy2:\/\//i, '');

    // 分离 name (#fragment)
    const hashIndex = payload.indexOf('#');
    const name = hashIndex >= 0 ? decodeURIComponent(payload.slice(hashIndex + 1).trim()) : '';

    // 分离 query (?) 与 authority
    const authPart = hashIndex >= 0 ? payload.slice(0, hashIndex) : payload;
    const queryIndex = authPart.indexOf('?');
    const authority = queryIndex >= 0 ? authPart.slice(0, queryIndex) : authPart;
    const queryStr = queryIndex >= 0 ? authPart.slice(queryIndex + 1) : '';

    const params = new URLSearchParams(queryStr);

    // 解析 authority: password@server:port
    const atIndex = authority.lastIndexOf('@');
    if (atIndex < 0) return makeError('INVALID_FORMAT', 'Hysteria2 missing @ separator');
    const password = authority.slice(0, atIndex);
    const hostPort = authority.slice(atIndex + 1);

    if (!password) return makeError('MISSING_PASSWORD', 'Hysteria2 missing password');

    // server:port
    const lastColon = hostPort.lastIndexOf(':');
    if (lastColon <= 0) return makeError('MISSING_SERVER', 'Hysteria2 missing server');
    const server = hostPort.slice(0, lastColon);
    const port = parseInt(hostPort.slice(lastColon + 1), 10);
    if (!server) return makeError('MISSING_SERVER', 'Hysteria2 missing server');
    if (!Number.isFinite(port) || port <= 0) return makeError('MISSING_PORT', 'Hysteria2 missing port');

    const sni = params.get('sni') ?? undefined;
    const obfs = params.get('obfs') ?? undefined;
    const obfsPassword = params.get('obfs-password') ?? undefined;
    const ports = params.get('mport') ?? undefined;
    const up = params.get('up') ?? undefined;
    const down = params.get('down') ?? undefined;
    const alpn = params.get('alpn') ?? undefined;
    const allowInsecure = params.get('insecure') === '1' || params.get('insecure') === 'true' || params.get('allowInsecure') === '1';
    const tls = params.get('security') !== 'none';

    const node: Node = createNode({
      name: name || `${server}:${port}`,
      protocol: 'hysteria2',
      server,
      port,
      password,
      tls,
      sni,
      allowInsecure,
      ports,
      up,
      down,
      obfs,
      obfsPassword,
      alpn: alpn ? alpn.split(',').filter(Boolean) : undefined,
      metadata: {
        source: 'unknown',
        originalName: name || `${server}:${port}`,
        tags: [],
      },
    });

    return { success: true, node };
  } catch {
    return makeError('PARSE_FAILED', 'Hysteria2 parse failed');
  }
}
