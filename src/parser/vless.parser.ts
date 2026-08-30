/**
 * VLESS 解析器
 * TASK 4.4 - VLESS Parser
 * 08_PARSER_SPEC.md §10
 * 输入: vless://uuid@server:port?params#name
 * 支持: TLS, Reality(flow/pbk/sid/sni), WS, gRPC
 */

import { Node, createNode, Transport } from '@/models/node';
import { ParserResult, makeError } from './types';

export function parseVless(input: string): ParserResult {
  try {
    const payload = input.replace(/^vless:\/\//i, '');

    // 分离 name (#fragment)
    const hashIndex = payload.indexOf('#');
    const name = hashIndex >= 0 ? decodeURIComponent(payload.slice(hashIndex + 1).trim()) : '';

    // 分离 query (?) 与 authority
    const authPart = hashIndex >= 0 ? payload.slice(0, hashIndex) : payload;
    const queryIndex = authPart.indexOf('?');
    const authority = queryIndex >= 0 ? authPart.slice(0, queryIndex) : authPart;
    const queryStr = queryIndex >= 0 ? authPart.slice(queryIndex + 1) : '';

    const params = new URLSearchParams(queryStr);

    // 解析 authority: uuid@server:port
    const atIndex = authority.lastIndexOf('@');
    if (atIndex < 0) return makeError('INVALID_FORMAT', 'VLESS missing @ separator');

    const uuid = authority.slice(0, atIndex);
    const hostPort = authority.slice(atIndex + 1);

    if (!uuid) return makeError('MISSING_UUID', 'VLESS missing uuid');

    // server:port(支持 IPv6 [::1]:443)
    const server = parseHost(hostPort).server;
    const port = parseHost(hostPort).port;
    if (!server) return makeError('MISSING_SERVER', 'VLESS missing server');
    if (!port) return makeError('MISSING_PORT', 'VLESS missing port');

    const security = params.get('security') ?? '';
    const tls = security === 'tls' || security === 'reality';
    const flow = params.get('flow') ?? undefined;
    const pbk = params.get('pbk') ?? undefined;
    const sid = params.get('sid') ?? undefined;
    const sni = params.get('sni') ?? undefined;
    const type = params.get('type') ?? 'tcp';
    const path = params.get('path') ?? undefined;
    const host = params.get('host') ?? params.get('sni') ?? undefined;
    const mode = params.get('mode') ?? undefined;
    // alpn:TLS 握手 ALPN 列表(逗号分隔,如 h2,http/1.1;XHTTP 必需 h2)
    const alpn = params.get('alpn')?.split(',').filter(Boolean) ?? undefined;
    // 保真:识别指纹与保留未知参数(ech/extra/insecure 等都不丢)
    const fp = params.get('fp') ?? undefined;
    const allowInsecure =
      params.get('insecure') === '1' ||
      params.get('insecure') === 'true' ||
      params.get('allowInsecure') === '1';
    const extra = collectExtraParams(
      params,
      new Set(['security', 'flow', 'pbk', 'sid', 'sni', 'type', 'path', 'host', 'mode', 'fp', 'alpn'])
    );

    const transport: Transport = {
      type: type === 'ws' ? 'ws' 
          : type === 'grpc' ? 'grpc' 
          : type === 'xhttp' ? 'xhttp' 
          : 'tcp',
      path,
      host,
      mode,
    };

    const node: Node = createNode({
      name: name || `${server}:${port}`,
      protocol: 'vless',
      server,
      port,
      uuid,
      tls,
      flow,
      pbk,
      sid,
      sni,
      allowInsecure,
      alpn,
      transport,
      metadata: {
        source: 'unknown',
        originalName: name || `${server}:${port}`,
        tags: [],
        fingerprint: fp ?? undefined,
        extra,
        originalUrl: input.trim(),
      },
    });

    return { success: true, node };
  } catch {
    return makeError('PARSE_FAILED', 'VLESS parse failed');
  }
}

/**
 * 收集链接中未被结构化字段吸收的全部 query 参数(保真用)。
 * 生成器写客户端配置时可从 metadata.extra 按需读取。
 */
function collectExtraParams(params: URLSearchParams, ignored: Set<string>): Record<string, string> | undefined {
  const extra: Record<string, string> = {};
  for (const [k, v] of params.entries()) {
    if (!ignored.has(k)) extra[k] = v;
  }
  return Object.keys(extra).length > 0 ? extra : undefined;
}

/**
 * 解析 host:port（支持 IPv6 字面量）
 */
function parseHost(input: string): { server: string; port: number } {
  const trimmed = input.trim();
  // IPv6 形式 [::1]:443
  if (trimmed.startsWith('[')) {
    const bracketEnd = trimmed.indexOf(']');
    if (bracketEnd > 0) {
      const server = trimmed.slice(1, bracketEnd);
      const rest = trimmed.slice(bracketEnd + 1);
      const port = rest.startsWith(':') ? parseInt(rest.slice(1), 10) : 0;
      return { server, port: Number.isFinite(port) && port > 0 ? port : 0 };
    }
  }
  // 普通 host:port
  const lastColon = trimmed.lastIndexOf(':');
  if (lastColon > 0) {
    const server = trimmed.slice(0, lastColon);
    const port = parseInt(trimmed.slice(lastColon + 1), 10);
    return { server, port: Number.isFinite(port) && port > 0 ? port : 0 };
  }
  return { server: trimmed, port: 0 };
}