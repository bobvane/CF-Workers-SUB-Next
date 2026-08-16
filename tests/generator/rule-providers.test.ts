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
  ruleActionTarget,
  META_DAT_BASE,
} from '@/generator/rule-providers';
import { MetaCubeXRule, RULE_GROUPS } from '@/data/metacubex-rules';

function rule(id: string, target: 'PROXY' | 'DIRECT' | 'REJECT' = 'PROXY'): MetaCubeXRule {
  return { id, label: id, tag: 'geosite', target };
}

describe('providerName / providerUrl', () => {
  it('provider 名用小写 geosite- 前缀', () => {
    expect(providerName('NETFLIX')).toBe('geosite-netflix');
  });

  it('URL 指向 meta 分支 mrs（小写 id）', () => {
    expect(providerUrl('NETFLIX')).toBe(`${META_DAT_BASE}netflix.mrs`);
  });

  it('ruleSetLine 路由到分组名（无分组时回退到漏网之鱼）', () => {
    const line = ruleSetLine(rule('NETFLIX'));
    expect(line.startsWith('RULE-SET,geosite-netflix,')).toBe(true);
    // 无分组时 PROXY 规则回退到漏网之鱼
    expect(line.endsWith('漏网之鱼')).toBe(true);
  });

  it('ruleSetLine 使用分组路由', () => {
    // NETFLIX 在流媒体组 → 国外媒体
    const line = ruleSetLine(rule('NETFLIX'), RULE_GROUPS);
    expect(line).toBe('RULE-SET,geosite-netflix,国外媒体');
  });

  it('ruleActionTarget REJECT → 广告拦截', () => {
    expect(ruleActionTarget(rule('CATEGORY-ADS-ALL', 'REJECT'), RULE_GROUPS)).toBe('广告拦截');
  });

  it('ruleActionTarget DIRECT → 国内直连', () => {
    expect(ruleActionTarget(rule('BILIBILI', 'DIRECT'), RULE_GROUPS)).toBe('国内直连');
  });

  it('ruleActionTarget 流媒体 PROXY → 国外媒体', () => {
    expect(ruleActionTarget(rule('NETFLIX'), RULE_GROUPS)).toBe('国外媒体');
  });

  it('ruleActionTarget AI 服务 PROXY → AI 服务', () => {
    expect(ruleActionTarget(rule('OPENAI'), RULE_GROUPS)).toBe('AI 服务');
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
    expect(p.format).toBe('mrs');
    expect(p.url).toBe(`${META_DAT_BASE}netflix.mrs`);
    expect(p.interval).toBe(86400);
  });

  it('空选择生成空 providers', () => {
    expect(buildRuleProviders([])).toEqual({});
  });
});

describe('buildRules 优先级', () => {
  it('输出顺序：按 RULE_GROUPS 分组优先级（ads → china-direct → ai...）', () => {
    const rules = buildRules([
      rule('BILIBILI', 'DIRECT'),
      rule('OPENAI', 'PROXY'),
      rule('CATEGORY-ADS-ALL', 'REJECT'),
    ], RULE_GROUPS);
    expect(rules).toEqual([
      'RULE-SET,geosite-category-ads-all,广告拦截', // ads 组 REJECT 优先
      'RULE-SET,geosite-bilibili,国内直连',        // china-direct 组 DIRECT 次之
      'RULE-SET,geosite-openai,AI 服务',           // ai 组 PROXY
      // 硬编码兜底
      'GEOIP,private,DIRECT',
      'GEOSITE,cn,DIRECT',
      'GEOIP,CN,DIRECT',
      'MATCH,漏网之鱼',
    ]);
  });

  it('REJECT 必须排在 PROXY 前（广告拦截优先）', () => {
    const rules = buildRules([
      rule('OPENAI', 'PROXY'),
      rule('CATEGORY-ADS-ALL', 'REJECT'),
    ], RULE_GROUPS);
    const rejectIdx = rules.indexOf('RULE-SET,geosite-category-ads-all,广告拦截');
    const proxyIdx = rules.indexOf('RULE-SET,geosite-openai,AI 服务');
    expect(rejectIdx).toBeLessThan(proxyIdx);
  });

  it('最后两行始终是 GEOIP,CN,DIRECT 和 MATCH,漏网之鱼', () => {
    const rules = buildRules([rule('NETFLIX')], RULE_GROUPS);
    expect(rules[rules.length - 2]).toBe('GEOIP,CN,DIRECT');
    expect(rules[rules.length - 1]).toBe('MATCH,漏网之鱼');
  });
});