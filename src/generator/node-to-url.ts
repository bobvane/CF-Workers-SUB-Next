/**
 * Node → 标准节点链接序列化
 * 用于 Base64 输出格式（V2RAY/V2RAYNG/NEKORAY/Shadowrocket/Loon）
 * 把统一 Node 模型转回 vless:// vmess:// trojan:// ss:// 链接
 */

import { Node } from '@/models/node';
import { safeBase64Encode } from './base64';

/**
 * 将 Node 序列化为标准链接
 */
export function nodeToUrl(node: Node): string {
  switch (node.protocol) {
    case 'vless':
      return nodeToVlessUrl(node);
    case 'vmess':
      return nodeToVmessUrl(node);
    case 'trojan':
      return nodeToTrojanUrl(node);
    case 'ss':
      return nodeToSsUrl(node);
    default:
      return '';
  }
}

/**
 * VLESS → vless://uuid@server:port?params#name
 */
function nodeToVlessUrl(node: Node): string {
  const params = new URLSearchParams();
  params.set('encryption', 'none');
  params.set('security', node.tls ? (node.pbk ? 'reality' : 'tls') : 'none');
  if (node.flow) params.set('flow', node.flow);
  if (node.sni) params.set('sni', node.sni);
  if (node.pbk) params.set('pbk', node.pbk);
  if (node.sid) params.set('sid', node.sid);
  if (node.transport?.type === 'ws') {
    params.set('type', 'ws');
    if (node.transport.path) params.set('path', node.transport.path);
    if (node.transport.host) params.set('host', node.transport.host);
  } else if (node.transport?.type === 'grpc') {
    params.set('type', 'grpc');
    if (node.transport.path) params.set('serviceName', node.transport.path.replace(/^\//, ''));
  } else if (node.transport?.type === 'xhttp') {
    params.set('type', 'xhttp');
    if (node.transport.path) params.set('path', node.transport.path);
    if (node.transport.host) params.set('host', node.transport.host);
    if (node.transport.mode) params.set('mode', node.transport.mode);
  } else {
    params.set('type', 'tcp');
  }

  const query = params.toString();
  const server = formatHost(node.server, node.port);
  const name = encodeURIComponent(node.metadata?.originalName || node.name);
  return `vless://${node.uuid}@${server}?${query}#${name}`;
}

/**
 * VMess → vmess://base64(JSON)#name
 */
function nodeToVmessUrl(node: Node): string {
  const json = JSON.stringify({
    v: '2',
    ps: node.metadata?.originalName || node.name,
    add: node.server,
    port: node.port,
    id: node.uuid,
    aid: '0',
    scy: 'auto',
    net: node.transport?.type === 'ws' ? 'ws' : node.transport?.type === 'grpc' ? 'grpc' : 'tcp',
    type: 'none',
    host: node.transport?.host || '',
    path: node.transport?.path || '',
    tls: node.tls ? 'tls' : '',
  });
  const payload = safeBase64Encode(json);
  const name = encodeURIComponent(node.metadata?.originalName || node.name);
  return `vmess://${payload}#${name}`;
}

/**
 * Trojan → trojan://password@server:port?params#name
 */
function nodeToTrojanUrl(node: Node): string {
  const params = new URLSearchParams();
  if (node.sni) params.set('sni', node.sni);
  if (node.allowInsecure) params.set('allowInsecure', '1');
  const query = params.toString();
  const server = formatHost(node.server, node.port);
  const name = encodeURIComponent(node.metadata?.originalName || node.name);
  const qs = query ? '?' + query : '';
  return `trojan://${encodeURIComponent(node.password || '')}@${server}${qs}#${name}`;
}

/**
 * SS → ss://base64(method:password@server:port)#name
 * 或 SIP002: ss://method:password@server:port?plugin=#name
 */
function nodeToSsUrl(node: Node): string {
  const method = node.metadata?.tags?.[0] || 'aes-256-gcm';
  const userinfo = `${method}:${node.password || ''}`;
  const server = formatHost(node.server, node.port);

  let url: string;
  if (node.plugin) {
    // SIP002 格式（支持 plugin）
    url = `ss://${userinfo}@${server}?plugin=${encodeURIComponent(node.plugin)}`;
  } else {
    // 标准 base64 格式
    url = `ss://${safeBase64Encode(userinfo)}@${server}`;
  }
  const name = encodeURIComponent(node.metadata?.originalName || node.name);
  return `${url}#${name}`;
}

/**
 * host:port 格式化（IPv6 加方括号）
 */
function formatHost(server: string, port: number): string {
  if (server.includes(':')) {
    return `[${server}]:${port}`;
  }
  return `${server}:${port}`;
}