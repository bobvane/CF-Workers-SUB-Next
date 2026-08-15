/**
 * 测试 - 分流规则生成（rule-providers + 有序 rules）
 */
import { describe, it, expect } from 'vitest';
import {
  buildRuleProviders,
  buildRules,
  providerName,
  providerUrl,
  ruleSetLine,
  META_DAT_BASE,
} from '@/generator/rule-providers';
import { MetaCubeXRule } from '@/data/metacubex-rules';

function rule(id: string, target: 'PROXY' | 'DIRECT' | 'REJECT' = 'PROXY'): MetaCubeXRule {
  return { id, label: id, tag: 'geosite', target };
}

describe('providerName / providerUrl', () => {
  it('provider 名用小写 geosite- 前缀', () => {
    expect(providerName('NETFLIX')).toBe('geosite-netflix');
  });

  it('URL 指向 meta 分支 yaml（小写 id）', () => {
    expect(providerUrl('NETFLIX')).toBe(`${META_DAT_BASE}netflix.yaml`);
  });

  it('ruleSetLine 输出 RULE-SET 行', () => {
    expect(ruleSetLine(rule('NETFLIX'))).toBe('RULE-SET,geosite-netflix,PROXY');
  });
});

describe('buildRuleProviders', () => {
  it('为每条勾选规则生成一个 http provider', () => {
    const providers = buildRuleProviders([rule('NETFLIX'), rule('OPENAI')]);
    const keys = Object.keys(providers);
    expect(keys).toEqual(['geosite-netflix', 'geosite-openai']);
    const p = providers['geosite-netflix'] as Record<string, unknown>;
    expect(p.type).toBe('http');
    expect(p.behavior).toBe('domain');
    expect(p.format).toBe('yaml');
    expect(p.url).toBe(`${META_DAT_BASE}netflix.yaml`);
    expect(p.interval).toBe(86400);
  });

  it('空选择生成空 providers', () => {
    expect(buildRuleProviders([])).toEqual({});
  });
});

describe('buildRules 优先级', () => {
  it('输出顺序：硬编码直连 → REJECT → PROXY → DIRECT → GEOIP,CN → MATCH', () => {
    const rules = buildRules([
      rule('BILIBILI', 'DIRECT'),
      rule('OPENAI', 'PROXY'),
      rule('CATEGORY-ADS-ALL', 'REJECT'),
    ]);
    expect(rules).toEqual([
      'GEOIP,private,DIRECT',
      'GEOSITE,cn,DIRECT',
      'GEOSITE,category-ads-all,REJECT',
      'RULE-SET,geosite-category-ads-all,REJECT',
      'RULE-SET,geosite-openai,PROXY',
      'RULE-SET,geosite-bilibili,DIRECT',
      'GEOIP,CN,DIRECT',
      'MATCH,PROXY',
    ]);
  });

  it('REJECT 必须排在 PROXY 前（广告拦截优先）', () => {
    const rules = buildRules([
      rule('OPENAI', 'PROXY'),
      rule('CATEGORY-ADS-ALL', 'REJECT'),
    ]);
    const rejectIdx = rules.indexOf('RULE-SET,geosite-category-ads-all,REJECT');
    const proxyIdx = rules.indexOf('RULE-SET,geosite-openai,PROXY');
    expect(rejectIdx).toBeLessThan(proxyIdx);
  });

  it('最后两行始终是 GEOIP,CN,DIRECT 和 MATCH,PROXY', () => {
    const rules = buildRules([rule('NETFLIX')]);
    expect(rules[rules.length - 2]).toBe('GEOIP,CN,DIRECT');
    expect(rules[rules.length - 1]).toBe('MATCH,PROXY');
  });
});