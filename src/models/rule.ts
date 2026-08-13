/**
 * 规则模型 - 节点处理规则
 * 06_DATA_MODEL.md §8
 */

export type RuleType = 'include' | 'exclude' | 'replace';

export interface Rule {
  id: string;
  name: string;
  type: RuleType;
  pattern: string;
  enabled: boolean;
  createdAt: number;
  version: number;
}

export function createRule(
  partial: Partial<Rule> & { name: string; type: RuleType; pattern: string }
): Rule {
  return {
    id: partial.id ?? '',
    name: partial.name,
    type: partial.type,
    pattern: partial.pattern,
    enabled: partial.enabled ?? true,
    createdAt: partial.createdAt ?? Date.now(),
    version: 1,
  };
}