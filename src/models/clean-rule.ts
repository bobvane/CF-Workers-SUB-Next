/**
 * 节点名清洗规则模型 - 持久化的自动清洗规则
 * 每次订阅更新完成后按序自动应用到该订阅的全部节点名。
 */

export interface CleanRule {
  id: string;
  /** 匹配内容：普通模式为字面片段，正则模式为正则表达式 */
  pattern: string;
  /** 替换为的内容；空串 = 删除 */
  replacement: string;
  regex: boolean;
  enabled: boolean;
  createdAt: number;
}

export function createCleanRule(partial: Partial<CleanRule> & { pattern: string }): CleanRule {
  return {
    id: partial.id ?? crypto.randomUUID(),
    pattern: partial.pattern,
    replacement: partial.replacement ?? '',
    regex: partial.regex ?? false,
    enabled: partial.enabled ?? true,
    createdAt: partial.createdAt ?? Date.now(),
  };
}

/** 构建单条规则的变换函数；正则非法时返回 null */
export function buildCleanTransform(rule: CleanRule): ((name: string) => string) | null {
  if (rule.regex) {
    try {
      const re = new RegExp(rule.pattern, 'g');
      return (name) => name.replace(re, rule.replacement);
    } catch {
      return null;
    }
  }
  return (name) => name.split(rule.pattern).join(rule.replacement);
}

/** 按序应用全部启用规则到单个名字（跳过非法正则） */
export function applyCleanRules(name: string, rules: CleanRule[]): string {
  let result = name;
  for (const rule of rules) {
    if (!rule.enabled) continue;
    const fn = buildCleanTransform(rule);
    if (fn) result = fn(result);
  }
  return result.trim();
}
