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

  it('ruleActionTarget REJECT → 广告拦截（应用净化已移除）', () => {
    expect(ruleActionTarget(rule('CATEGORY-ADS-ALL', 'REJECT'), RULE_GROUPS)).toBe('广告拦截');
    expect(ruleActionTarget(rule('CATEGORY-ADS', 'REJECT'), RULE_GROUPS)).toBe('广告拦截');
  });

  it('ruleActionTarget DIRECT (china-direct) → 直接 DIRECT', () => {
    // V3.1: 国内规则直接 DIRECT，不走策略组
    expect(ruleActionTarget(rule('BILIBILI', 'DIRECT'), RULE_GROUPS)).toBe('DIRECT');
    expect(ruleActionTarget(rule('CN', 'DIRECT'), RULE_GROUPS)).toBe('DIRECT');
  });

  it('ruleActionTarget 流媒体 PROXY → 国外媒体', () => {
    expect(ruleActionTarget(rule('NETFLIX'), RULE_GROUPS)).toBe('国外媒体');
  });

  it('ruleActionTarget AI 平台 PROXY → AI 平台', () => {
    expect(ruleActionTarget(rule('OPENAI'), RULE_GROUPS)).toBe('AI 平台');
  });

  it('ruleActionTarget 谷歌FCM PROXY → 谷歌FCM', () => {
    expect(ruleActionTarget(rule('GOOGLEFCM'), RULE_GROUPS)).toBe('谷歌FCM');
  });

  it('ruleActionTarget 苹果服务 DIRECT → 苹果服务', () => {
    expect(ruleActionTarget(rule('APPLE', 'DIRECT'), RULE_GROUPS)).toBe('苹果服务');
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

describe('buildRules 优先级 V3.1', () => {
  it('输出顺序：PRIVATE最前 → 广告拦截 → 业务分类 → 国内规则DIRECT → GEOSITE,cn → GEOIP,CN → MATCH', () => {
    const rules = buildRules([
      rule('OPENAI', 'PROXY'),         // ai 组
      rule('CATEGORY-ADS-ALL', 'REJECT'), // ads 组
      rule('CN', 'DIRECT'),            // china-direct 组
    ], RULE_GROUPS);
    
    // 验证关键顺序
    const privateIdx = rules.indexOf('GEOIP,private,DIRECT');
    const adsIdx = rules.indexOf('RULE-SET,geosite-category-ads-all,广告拦截');
    const openaiIdx = rules.indexOf('RULE-SET,geosite-openai,AI 平台');
    const cnIdx = rules.indexOf('RULE-SET,geosite-cn,DIRECT');          // china-direct 组
    const geoSiteCnIdx = rules.indexOf('GEOSITE,cn,DIRECT');
    const geoIpCnIdx = rules.indexOf('GEOIP,CN,DIRECT');
    const matchIdx = rules.indexOf('MATCH,漏网之鱼');
    
    expect(privateIdx).toBe(0); // PRIVATE 必须最前
    expect(privateIdx).toBeLessThan(adsIdx);      // PRIVATE < 广告拦截
    expect(adsIdx).toBeLessThan(openaiIdx);       // 广告拦截 < 业务分类
    expect(openaiIdx).toBeLessThan(cnIdx);        // 业务分类 < 国内直连规则
    expect(cnIdx).toBeLessThan(geoSiteCnIdx); // 国内规则 < GEOSITE,cn
    expect(geoSiteCnIdx).toBeLessThan(geoIpCnIdx);  // GEOSITE,cn < GEOIP,CN
    expect(geoIpCnIdx).toBeLessThan(matchIdx);      // GEOIP,CN < MATCH
  });

  it('REJECT 必须排在 PROXY 前（广告拦截优先）', () => {
    const rules = buildRules([
      rule('OPENAI', 'PROXY'),
      rule('CATEGORY-ADS-ALL', 'REJECT'),
    ], RULE_GROUPS);
    const rejectIdx = rules.indexOf('RULE-SET,geosite-category-ads-all,广告拦截');
    const proxyIdx = rules.indexOf('RULE-SET,geosite-openai,AI 平台');
    expect(rejectIdx).toBeLessThan(proxyIdx);
  });

  it('最后三行始终是 GEOSITE,cn,DIRECT / GEOIP,CN,DIRECT / MATCH,漏网之鱼', () => {
    const rules = buildRules([rule('NETFLIX')], RULE_GROUPS);
    expect(rules[rules.length - 3]).toBe('GEOSITE,cn,DIRECT');
    expect(rules[rules.length - 2]).toBe('GEOIP,CN,DIRECT');
    expect(rules[rules.length - 1]).toBe('MATCH,漏网之鱼');
  });

  it('国内规则直接写 RULE-SET,xxx,DIRECT（不指向策略组）', () => {
    const rules = buildRules([
      rule('BILIBILI', 'DIRECT'),
      rule('CN', 'DIRECT'),
    ], RULE_GROUPS);
    // 所有国内规则行的 target 必须是 DIRECT
    for (const line of rules) {
      if (line.startsWith('RULE-SET,geosite-bilibili') || 
          line.startsWith('RULE-SET,geosite-cn')) {
        expect(line.endsWith(',DIRECT')).toBe(true);
      }
    }
  });
});