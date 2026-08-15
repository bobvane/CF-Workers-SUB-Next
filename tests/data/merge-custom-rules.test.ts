/**
 * 测试 - 自定义规则（规则库）合并 + API
 */
import { describe, it, expect } from 'vitest';
import { mergeCustomRules, CustomRule } from '@/data/metacubex-rules';

describe('mergeCustomRules', () => {
  it('空自定义规则返回原 RULE_GROUPS', () => {
    const merged = mergeCustomRules([]);
    expect(merged.length).toBeGreaterThanOrEqual(10);
  });

  it('自定义规则合并到对应分组', () => {
    const custom: CustomRule[] = [
      { id: 'MY-NEW-SITE', label: '我的新站', groupKey: 'ai', target: 'PROXY' },
    ];
    const merged = mergeCustomRules(custom);
    const aiGroup = merged.find(g => g.key === 'ai');
    expect(aiGroup).toBeDefined();
    expect(aiGroup!.items.some(i => i.id === 'MY-NEW-SITE')).toBe(true);
  });

  it('自定义规则分组不存在时归入 other', () => {
    const custom: CustomRule[] = [
      { id: 'ORPHAN-RULE', label: '孤儿', groupKey: 'nonexistent', target: 'DIRECT' },
    ];
    const merged = mergeCustomRules(custom);
    const other = merged.find(g => g.key === 'other');
    expect(other!.items.some(i => i.id === 'ORPHAN-RULE')).toBe(true);
  });

  it('自定义规则去重：同分组同id替换', () => {
    const custom: CustomRule[] = [
      { id: 'NETFLIX', label: '自定义Netflix', groupKey: 'stream', target: 'DIRECT' },
    ];
    const merged = mergeCustomRules(custom);
    const stream = merged.find(g => g.key === 'stream');
    const netflix = stream!.items.find(i => i.id === 'NETFLIX');
    expect(netflix).toBeDefined();
    expect(netflix!.label).toBe('自定义Netflix');
    expect(netflix!.target).toBe('DIRECT'); // 原始是 PROXY，被替换为 DIRECT
  });
});