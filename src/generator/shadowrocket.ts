/**
 * Shadowrocket 配置生成器
 * 输出 Surge 兼容的 .conf 格式
 * Shadowrocket 完全兼容 Surge 的 [Proxy] 和 [Rule] 语法
 */
import { Node } from '@/models/node';
import { MetaCubeXRule, RuleGroup } from '@/data/metacubex-rules';
import { makeUniqueNames } from './mihomo';
import { nodeToSurgeProxy } from './surge';
import { ruleActionTarget } from './rule-providers';
import { getBlackmatrix7Name, blackmatrix7Url } from '@/data/rule-format-mapping';

/**
 * 生成 Shadowrocket 配置
 */
export function generateShadowrocketConfig(
  nodes: Node[],
  selectedRules: MetaCubeXRule[] = [],
  ruleGroups: RuleGroup[] = []
): string {
  const uniqueNodes = makeUniqueNames(nodes);
  const lines: string[] = [];

  lines.push('# Shadowrocket 订阅配置');
  lines.push('');

  // [Proxy] 段（与 Surge 兼容）
  lines.push('[Proxy]');
  lines.push('Direct = direct');
  lines.push('REJECT = reject');
  for (const node of uniqueNodes) {
    const proxy = nodeToSurgeProxy(node);
    if (proxy) lines.push(proxy);
  }
  lines.push('');

  // [Rule] 段
  lines.push('[Rule]');
  // 用户勾选的规则
  for (const rule of selectedRules) {
    const bmName = getBlackmatrix7Name(rule.id);
    if (!bmName) continue;
    const url = blackmatrix7Url(bmName);
    const target = ruleActionTarget(rule, ruleGroups);
    const policy = target === 'DIRECT' ? 'Direct' : target === 'REJECT' ? 'REJECT' : 'PROXY';
    lines.push(`RULE-SET,${url},${policy}`);
  }
  // 兜底规则
  lines.push('GEOIP,CN,Direct');
  lines.push('FINAL,PROXY');
  lines.push('');

  // [Host] 段（可选，保持空）
  lines.push('[Host]');
  lines.push('');

  return lines.join('\n');
}

/**
 * 校验 Shadowrocket 配置
 */
export function validateShadowrocket(config: string): boolean {
  return config.includes('[Proxy]') && config.includes('[Rule]');
}