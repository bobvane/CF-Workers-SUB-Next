import { describe, it, expect } from 'vitest';
import { buildRules } from '@/generator/rule-providers';
import { RULE_GROUPS } from '@/data/metacubex-rules';
describe('rule order', () => {
  it('openai (ai) before microsoft', () => {
    const all = RULE_GROUPS.flatMap(g => g.items).filter(i => !i.custom);
    const lines = buildRules(all, RULE_GROUPS);
    const oi = lines.findIndex(l => l.includes('geosite-openai,'));
    const ms = lines.findIndex(l => l.includes('geosite-microsoft,'));
    console.log('openai idx', oi, 'microsoft idx', ms);
    expect(oi).toBeGreaterThan(-1);
    expect(ms).toBeGreaterThan(-1);
    expect(oi).toBeLessThan(ms);
  });
});