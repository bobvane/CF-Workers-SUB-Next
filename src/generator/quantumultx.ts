/**
 * Quantumult X 配置生成器
 * 输出 server_local 格式（iOS）
 * 支持：VMess / Shadowsocks / Trojan（HTTP/SOCKS 基础）
 */

import { Node } from '@/models/node';
import { makeUniqueNames } from './mihomo';

/**
 * 将 Node 转换为 Quantumult X server_local 行
 */
export function nodeToQXServer(node: Node): string {
  const name = qxEscape(node.name);

  switch (node.protocol) {
    case 'ss': {
      // ss=server:port, method=xxx, password=xxx
      const method = node.metadata?.tags?.[0] || 'aes-256-gcm';
      const parts = [`ss=${node.server}:${node.port}`, `method=${method}`];
      if (node.password) parts.push(`password=${qxEscape(node.password)}`);
      return `${name} = ${parts.join(', ')}`;
    }

    case 'trojan': {
      // trojan=server:port, password=xxx, over-tls=true, tls-host=xxx
      const parts = [`trojan=${node.server}:${node.port}`];
      if (node.password) parts.push(`password=${qxEscape(node.password)}`);
      parts.push('over-tls=true');
      if (node.sni) parts.push(`tls-host=${node.sni}`);
      else parts.push(`tls-host=${node.server}`);
      if (node.allowInsecure) parts.push('tls-verification=false');
      return `${name} = ${parts.join(', ')}`;
    }

    case 'vmess': {
      // vmess=server:port, method=chacha20-ietf-poly1305, password=uuid, over-tls=true, tls-host=xxx
      const parts = [`vmess=${node.server}:${node.port}`, 'method=chacha20-ietf-poly1305'];
      if (node.uuid) parts.push(`password=${node.uuid}`);
      if (node.tls) {
        parts.push('over-tls=true');
        parts.push(`tls-host=${node.sni || node.server}`);
      }
      return `${name} = ${parts.join(', ')}`;
    }

    case 'vless': {
      // QuantumultX 不原生支持 VLESS，尝试用 vmess 语法（部分版本可用）
      const parts = [`vmess=${node.server}:${node.port}`, 'method=chacha20-ietf-poly1305'];
      if (node.uuid) parts.push(`password=${node.uuid}`);
      if (node.tls) {
        parts.push('over-tls=true');
        parts.push(`tls-host=${node.sni || node.server}`);
      }
      return `${name} = ${parts.join(', ')}`;
    }

    default:
      return '';
  }
}

/**
 * 生成 Quantumult X 配置
 */
export function generateQuantumultXConfig(nodes: Node[]): string {
  const uniqueNodes = makeUniqueNames(nodes);
  const lines: string[] = [];

  lines.push('; Quantumult X 订阅配置');
  lines.push('[server_local]');
  for (const node of uniqueNodes) {
    const server = nodeToQXServer(node);
    if (server) lines.push(server);
  }
  lines.push('');

  lines.push('[filter_local]');
  lines.push('Final,Proxy');
  lines.push('');

  lines.push('[policy]');
  lines.push('static=Proxy, DIRECT, ' + (uniqueNodes.map((n) => n.name).join(', ') || 'DIRECT'));

  return lines.join('\n');
}

/**
 * 转义 Quantumult X 配置值
 */
function qxEscape(value: string): string {
  // 密码中含特殊字符时加引号
  if (/[,=:#\s]/.test(value)) {
    return `"${value.replace(/"/g, '\\"')}"`;
  }
  return value;
}

/**
 * 校验 Quantumult X 配置
 */
export function validateQuantumultX(config: string): boolean {
  return config.includes('[server_local]') && config.includes('[filter_local]');
}