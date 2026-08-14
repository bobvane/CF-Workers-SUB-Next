/**
 * Surge 配置生成器
 * 输出 Surge .conf 格式（Section-based）
 * 支持：VMess / VLESS / Trojan / Shadowsocks
 */

import { Node } from '@/models/node';
import { makeUniqueNames } from './mihomo';

/**
 * 将 Node 转换为 Surge proxy section 配置
 */
export function nodeToSurgeProxy(node: Node): string {
  const name = escapeSectionValue(node.name);

  switch (node.protocol) {
    case 'ss': {
      const method = node.metadata?.tags?.[0] || 'aes-256-gcm';
      const parts = [name, 'ss', node.server, String(node.port), `encrypt-method=${method}`];
      if (node.password) parts.push(`password=${node.password}`);
      if (node.plugin) {
        parts.push(`plugin=${node.plugin}`);
      }
      return parts.join(', ');
    }

    case 'trojan': {
      const parts = [name, 'trojan', node.server, String(node.port)];
      if (node.password) parts.push(`password=${node.password}`);
      if (node.sni) parts.push(`sni=${node.sni}`);
      if (node.allowInsecure) parts.push(`skip-cert-verify=true`);
      parts.push('tls=true');
      return parts.join(', ');
    }

    case 'vmess': {
      const parts = [name, 'vmess', node.server, String(node.port)];
      if (node.uuid) parts.push(`username=${node.uuid}`);
      if (node.tls) parts.push('tls=true');
      if (node.transport?.type === 'ws') {
        parts.push('ws=true');
        if (node.transport.path) parts.push(`ws-path=${node.transport.path}`);
        if (node.transport.host) parts.push(`ws-headers=Host:${node.transport.host}`);
      }
      return parts.join(', ');
    }

    case 'vless': {
      // Surge 不原生支持 VLESS，用 vmess 兼容（部分版本支持）
      const parts = [name, 'vmess', node.server, String(node.port)];
      if (node.uuid) parts.push(`username=${node.uuid}`);
      if (node.tls) parts.push('tls=true');
      if (node.transport?.type === 'ws') {
        parts.push('ws=true');
        if (node.transport.path) parts.push(`ws-path=${node.transport.path}`);
        if (node.transport.host) parts.push(`ws-headers=Host:${node.transport.host}`);
      }
      return parts.join(', ');
    }

    default:
      return '';
  }
}

/**
 * 生成 Surge 配置
 */
export function generateSurgeConfig(nodes: Node[]): string {
  const uniqueNodes = makeUniqueNames(nodes);
  const lines: string[] = [];

  // [Proxy] 段
  lines.push('[Proxy]');
  lines.push('Direct = direct');
  lines.push('REJECT = reject');
  for (const node of uniqueNodes) {
    const proxy = nodeToSurgeProxy(node);
    if (proxy) lines.push(proxy);
  }
  lines.push('');

  // [Proxy Group] 段
  lines.push('[Proxy Group]');
  const nodeNames = uniqueNodes.map((n) => n.name).join(', ');
  lines.push(`PROXY = select, ${nodeNames || 'Direct'}`);
  lines.push('');

  // [Rule] 段
  lines.push('[Rule]');
  lines.push('FINAL,PROXY');
  lines.push('');

  return lines.join('\n');
}

/**
 * 转义 Section 值中的逗号和引号
 */
function escapeSectionValue(value: string): string {
  if (value.includes(',') || value.includes('"')) {
    return `"${value.replace(/"/g, '\\"')}"`;
  }
  return value;
}

/**
 * 校验 Surge 配置
 */
export function validateSurge(config: string): boolean {
  return config.includes('[Proxy]') && config.includes('[Rule]') && config.includes('FINAL');
}