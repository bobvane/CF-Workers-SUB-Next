/**
 * ShadowsocksR 解析器
 * 支持标准 SSR 格式: ssr://base64(host:port:protocol:method:obfs:base64(password)?obfsparam=...&protoparam=...&remarks=...&group=...)
 * 注：SSR 链接的整个 payload（含 query）都是 base64 编码
 */

import { Node, createNode } from '@/models/node';
import { ParserResult, makeError } from './types';
import { safeBase64Decode, safeUrlDecode } from './decoder';

export function parseShadowsocksR(input: string): ParserResult {
  try {
    const payload = input.replace(/^ssr:\/\//i, '').trim();
    if (!payload) return makeError('EMPTY_PAYLOAD', 'SSR payload is empty');

    // SSR 整个 payload 是 base64（含 query 部分）
    const decoded = safeBase64Decode(payload);
    if (!decoded) return makeError('INVALID_BASE64', 'SSR payload is not valid base64');

    // 分离 query（obfsparam/protoparam/remarks/group 等）
    const queryIndex = decoded.indexOf('?');
    const core = queryIndex >= 0 ? decoded.slice(0, queryIndex) : decoded;
    const queryStr = queryIndex >= 0 ? decoded.slice(queryIndex + 1) : '';
    const params = new URLSearchParams(queryStr);

    // core 结构: host:port:protocol:method:obfs:password
    // host 可能是 IPv6（含冒号），从后往前取字段
    const parts = core.split(':');
    if (parts.length < 6) return makeError('INVALID_FORMAT', 'SSR missing required fields');

    const passwordRaw = parts[parts.length - 1];
    const obfs = parts[parts.length - 2];
    const method = parts[parts.length - 3];
    const protocol = parts[parts.length - 4];
    const portStr = parts[parts.length - 5];
    const server = parts.slice(0, parts.length - 5).join(':');

    const port = parseInt(portStr, 10);
    if (!server) return makeError('MISSING_SERVER', 'SSR missing server');
    if (!Number.isFinite(port) || port <= 0) return makeError('MISSING_PORT', 'SSR missing port');

    // SSR 标准 password 是 base64，但存在明文实现，需兼容
    const password = decodePassword(passwordRaw);

    const obfsParam = decodeParam(params.get('obfsparam'));
    const protocolParam = decodeParam(params.get('protoparam'));
    const group = decodeParam(params.get('group'));
    const remarks = decodeParam(params.get('remarks'));

    const name = remarks || `${server}:${port}`;

    // 收集未吸收的 query 参数进 metadata.extra（保真）
    const knownKeys = new Set(['obfsparam', 'protoparam', 'remarks', 'group']);
    const extra: Record<string, string> = {};
    params.forEach((v, k) => {
      if (!knownKeys.has(k)) extra[k] = v;
    });

    const node: Node = createNode({
      name,
      protocol: 'ssr',
      server,
      port,
      password,
      username: method, // method 存 username 位（与 SS 一致）
      obfs,
      ssrProtocol: protocol,
      ssrProtocolParam: protocolParam,
      ssrObfsParam: obfsParam,
      ssrGroup: group,
      metadata: {
        source: 'unknown',
        originalName: name,
        tags: [method],
        originalUrl: input.trim(),
        extra: Object.keys(extra).length > 0 ? extra : undefined,
      },
    });

    return { success: true, node };
  } catch {
    return makeError('PARSE_FAILED', 'SSR parse failed');
  }
}

/**
 * SSR query 参数解码：标准为 base64，失败则 URL 解码兜底
 */
function decodeParam(value: string | null): string {
  if (!value) return '';
  return safeBase64Decode(value) ?? safeUrlDecode(value);
}

/**
 * SSR password 解码：标准为 base64，明文实现兜底
 */
function decodePassword(raw: string): string {
  const urlDecoded = safeUrlDecode(raw);
  const b64 = safeBase64Decode(urlDecoded);
  if (b64 && isReadable(b64)) return b64;
  return urlDecoded;
}

/**
 * 判断解码结果是否"可读"（大部分为可打印字符），
 * 用于区分 base64 解码产物与乱码
 */
function isReadable(s: string): boolean {
  if (!s) return false;
  let printable = 0;
  for (const ch of s) {
    const code = ch.charCodeAt(0);
    if (code === 10 || code === 13 || (code >= 32 && code < 127)) printable++;
  }
  return printable / s.length > 0.8;
}
