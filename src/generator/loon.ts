/**
 * Loon 配置生成器
 * 输出 Loon .conf 格式
 * 支持：VMess / VLESS / Trojan / Shadowsocks
 * 规则：Remote Rule 引用 blackmatrix7 .list
 */
import { Node } from '@/models/node';
import { MetaCubeXRule, RuleGroup } from '@/data/metacubex-rules';
import { makeUniqueNames } from './mihomo';
import { ruleActionTarget } from './rule-providers';
import { getBlackmatrix7Name, blackmatrix7LoonUrl } from '@/data/rule-format-mapping';

/**
 * 生成 Loon 配置
 */
export function generateLoonConfig(
  nodes: Node[],
  selectedRules: MetaCubeXRule[] = [],
  ruleGroups: RuleGroup[] = []
): string {
  const uniqueNodes = makeUniqueNames(nodes);
  const lines: string[] = [];

  lines.push('# Loon 订阅配置');
  lines.push('');

  // [Proxy] 段（与 Surge 兼容的 proxy 语法）
  lines.push('[Proxy]');
  lines.push('Direct = direct');
  lines.push('REJECT = reject');
  for (const node of uniqueNodes) {
    const proxy = nodeToLoonProxy(node);
    if (proxy) lines.push(proxy);
  }
  lines.push('');

  // [Remote Rule] 段 — 远程分流规则订阅
  lines.push('[Remote Rule]');
  for (const rule of selectedRules) {
    const bmName = getBlackmatrix7Name(rule.id);
    if (!bmName) continue;
    const url = blackmatrix7LoonUrl(bmName);
    const target = ruleActionTarget(rule, ruleGroups);
    // Loon 策略名映射：DIRECT → DIRECT, REJECT → REJECT, 其余 → PROXY
    const policy = target === 'DIRECT' ? 'DIRECT' : target === 'REJECT' ? 'REJECT' : 'PROXY';
    lines.push(`${url}, policy=${policy}, tag=${bmName}, enabled=true`);
  }
  lines.push('');

  // [Rule] 段 — 本地兜底规则
  lines.push('[Rule]');
  lines.push('GEOIP,CN,DIRECT');
  lines.push('FINAL,PROXY');
  lines.push('');

  // [Proxy Group] 段
  lines.push('[Proxy Group]');
  lines.push(`PROXY = select, ${uniqueNodes.map(n => n.name).join(', ') || 'Direct'}`);
  lines.push('');

  // [General] 段
  lines.push('[General]');
  lines.push('ipv6 = false');
  lines.push('skip-proxy = 127.0.0.1,192.168.0.0/16,10.0.0.0/8,172.16.0.0/12,100.64.0.0/10,localhost,.local');

  return lines.join('\n');
}

/**
 * 将 Node 转换为 Loon proxy 行（与 Surge 兼容）
 */
function nodeToLoonProxy(node: Node): string {
  const name = escapeValue(node.name);

  switch (node.protocol) {
    case 'ss': {
      const method = node.metadata?.tags?.[0] || 'aes-256-gcm';
      const parts = [name, 'ss', node.server, String(node.port), `encrypt-method=${method}`];
      if (node.password) parts.push(`password=${node.password}`);
      if (node.plugin) parts.push(`plugin=${node.plugin}`);
      return parts.join(', ');
    }
    case 'trojan': {
      const parts = [name, 'trojan', node.server, String(node.port)];
      if (node.password) parts.push(`password=${node.password}`);
      if (node.sni) parts.push(`sni=${node.sni}`);
      if (node.allowInsecure) parts.push('skip-cert-verify=true');
      parts.push('tls=true');
      return parts.join(', ');
    }
    case 'vmess': {
      // Loon 原生语法：name = vmess,server,port,method,"uuid",transport=ws,path=…,host=…,over-tls=…
      const method = node.metadata?.tags?.[0] || 'auto';
      const parts = [name, 'vmess', node.server, String(node.port), method, `"${node.uuid || ''}"`];
      const transport = node.transport?.type === 'ws' ? 'ws' : node.transport?.type === 'grpc' ? 'grpc' : 'tcp';
      parts.push(`transport=${transport}`);
      if (transport === 'ws') {
        if (node.transport?.path) parts.push(`path=${node.transport.path}`);
        if (node.transport?.host) parts.push(`host=${node.transport.host}`);
      }
      parts.push(`over-tls=${node.tls ? 'true' : 'false'}`);
      if (node.tls) {
        parts.push(node.sni ? `sni=${node.sni}` : `sni=${node.server}`);
      }
      if (node.allowInsecure) parts.push('skip-cert-verify=true');
      return parts.join(', ');
    }
    case 'vless': {
      // Loon 原生支持 VLESS（含 Reality / XTLS Vision）
      // 格式：name = VLESS,server,port,"uuid",transport=tcp|ws,flow=…,over-tls=…,sni=…
      const parts = [name, 'VLESS', node.server, String(node.port), `"${node.uuid || ''}"`];
      const transport = node.transport?.type === 'ws' ? 'ws' : 'tcp';
      parts.push(`transport=${transport}`);
      if (node.flow) parts.push(`flow=${node.flow}`);
      const isReality = !!node.pbk;
      parts.push(`over-tls=${node.tls || isReality ? 'true' : 'false'}`);
      if (node.tls || isReality) {
        parts.push(node.sni ? `sni=${node.sni}` : `sni=${node.server}`);
        if (isReality) {
          parts.push(`public-key="${node.pbk}"`);
          if (node.sid) parts.push(`short-id=${node.sid}`);
        }
      }
      if (transport === 'ws') {
        if (node.transport?.path) parts.push(`path=${node.transport.path}`);
        if (node.transport?.host) parts.push(`host=${node.transport.host}`);
      }
      if (node.allowInsecure) parts.push('skip-cert-verify=true');
      parts.push('udp=true');
      return parts.join(', ');
    }
    default:
      return '';
  }
}

function escapeValue(value: string): string {
  if (value.includes(',') || value.includes('"')) {
    return `"${value.replace(/"/g, '\\"')}"`;
  }
  return value;
}

/**
 * 校验 Loon 配置
 */
export function validateLoon(config: string): boolean {
  return config.includes('[Proxy]') && config.includes('[Rule]');
}