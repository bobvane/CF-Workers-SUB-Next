
import { describe, it, expect } from 'vitest';
import { buildRules } from '@/generator/rule-providers';
import { RULE_GROUPS } from '@/data/metacubex-rules';
describe('rule order', () => {
  it('github (dev) before microsoft', () => {
    const all = RULE_GROUPS.flatMap(g => g.items).filter(i => !i.custom);
    const lines = buildRules(all, RULE_GROUPS);
    const gh = lines.findIndex(l => l.includes('geosite-github,'));
    const ms = lines.findIndex(l => l.includes('geosite-microsoft,'));
    console.log('github idx', gh, 'microsoft idx', ms);
    expect(gh).toBeGreaterThan(-1);
    expect(ms).toBeGreaterThan(-1);
    expect(gh).toBeLessThan(ms);
  });
});
