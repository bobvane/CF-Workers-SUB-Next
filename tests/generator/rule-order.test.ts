import { describe, it, expect } from 'vitest';
import { buildRules } from '@/generator/rule-providers';
import { RULE_GROUPS } from '@/data/metacubex-rules';
describe('rule order', () => {
  it('category-ai-!cn (ai) before microsoft', () => {
    // 使用 native=true 模拟已定稿组的原生规则输出
    const all = RULE_GROUPS.flatMap(g => g.items.filter(i => !i.custom)).map(i => ({ ...i, native: true }));
    const lines = buildRules(all, RULE_GROUPS);
    // 精确匹配业务分类行（避免误匹配 microsoft@cn 国内直连行）
    const oi = lines.findIndex(l => l === 'GEOSITE,category-ai-!cn,AI 平台');
    const ms = lines.findIndex(l => l === 'GEOSITE,microsoft,微软服务');
    expect(oi).toBeGreaterThan(-1);
    expect(ms).toBeGreaterThan(-1);
    expect(oi).toBeLessThan(ms);
  });
});
