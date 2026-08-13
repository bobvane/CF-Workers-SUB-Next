/**
 * Shadowsocks 解析器
 * TASK 4.6 - Shadowsocks Parser
 * 08_PARSER_SPEC.md §12
 * 支持 SIP002 格式: ss://method:password@server:port#name 或 ss://base64
 */

import { Node, createNode } from '@/models/node';
import { ParserResult, makeError } from './types';
import { safeBase64Decode } from './decoder';

export function parseShadowsocks(input: string): ParserResult {
  try {
    const payload = input.replace(/^ss:\/\//i, '');
    if (!payload) return makeError('EMPTY_PAYLOAD', 'SS payload is empty');

    // 分离 fragment (name)
    const hashIndex = payload.indexOf('#');
    const fragment = hashIndex >= 0 ? payload.slice(hashIndex + 1) : '';
    const name = fragment ? safeUrlDecode(fragment.trim()) : '';
    const body = hashIndex >= 0 ? payload.slice(0, hashIndex) : payload;

    // 分离 query (plugin 等)
    const queryIndex = body.indexOf('?');
    const authPart = queryIndex >= 0 ? body.slice(0, queryIndex) : body;
    const queryStr = queryIndex >= 0 ? body.slice(queryIndex + 1) : '';
    const params = new URLSearchParams(queryStr);
    const plugin = params.get('plugin') ?? undefined;

    // 两种形式：userinfo@host 或 base64(完整 userinfo@host)
    let userinfo = authPart;
    let hostPort = '';

    // 尝试直接解析 userinfo@host:port
    const atIndex = authPart.lastIndexOf('@');
    if (atIndex > 0 && !authPart.includes('=')) {
      userinfo = authPart.slice(0, atIndex);
      hostPort = authPart.slice(atIndex + 1);
    } else {
      // 可能是 base64 编码（整体）
      const decoded = safeBase64Decode(authPart);
      if (!decoded) {
        return makeError('INVALID_BASE64', 'SS payload is not valid');
      }
      const innerAt = decoded.lastIndexOf('@');
      if (innerAt < 0) return makeError('INVALID_FORMAT', 'SS missing @ separator');
      userinfo = decoded.slice(0, innerAt);
      hostPort = decoded.slice(innerAt + 1);
    }

    if (!userinfo) return makeError('INVALID_FORMAT', 'SS missing method:password');
    const colonIndex = userinfo.indexOf(':');
    if (colonIndex < 0) return makeError('INVALID_FORMAT', 'SS missing method:password separator');
    const method = userinfo.slice(0, colonIndex);
    const password = userinfo.slice(colonIndex + 1);

    if (!method) return makeError('INVALID_FORMAT', 'SS missing method');
    if (!password) return makeError('INVALID_FORMAT', 'SS missing password');

    const lastColon = hostPort.lastIndexOf(':');
    if (lastColon <= 0) return makeError('MISSING_SERVER', 'SS missing server');
    const server = hostPort.slice(0, lastColon);
    const port = parseInt(hostPort.slice(lastColon + 1), 10);
    if (!server) return makeError('MISSING_SERVER', 'SS missing server');
    if (!Number.isFinite(port) || port <= 0) return makeError('MISSING_PORT', 'SS missing port');

    const decodedPassword = safeUrlDecode(password);

    const node: Node = createNode({
      name: name || `${server}:${port}`,
      protocol: 'ss',
      server,
      port,
      password: decodedPassword,
      username: method, // method 存 username 位
      plugin,
      metadata: {
        source: 'unknown',
        originalName: name || `${server}:${port}`,
        tags: [],
      },
    });

    // SS 节点用 username 字段存加密方式会更语义化，但在 Node 模型里 username 冗余
    // 这里用 metadata 额外存 cipher
    node.metadata.tags = [method];
    return { success: true, node };
  } catch {
    return makeError('PARSE_FAILED', 'SS parse failed');
  }
}

function safeUrlDecode(input: string): string {
  try {
    return decodeURIComponent(input);
  } catch {
    return input;
  }
}