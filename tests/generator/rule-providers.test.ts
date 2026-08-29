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

function rule(id: string, target: 'PROXY' | 'DIRECT' | 'REJECT' = 'PROXY', opts: { native?: boolean; fixed?: boolean; tag?: 'geosite' | 'geoip' } = {}): MetaCubeXRule {
  return { id, label: id, tag: (opts.tag || 'geosite') as 'geosite' | 'geoip' | 'ruleset', target, ...opts };
}

describe('providerName / providerUrl', () => {
  it('provider 名用小写 geosite- 前缀', () => {
    expect(providerName('NETFLIX')).toBe('geosite-netflix');
  });

  it('URL 指向 meta 分支 mrs（小写 id）', () => {
    expect(providerUrl('NETFLIX')).toBe(`${META_DAT_BASE}netflix.mrs`);
  });

  it('ruleSetLine 原生 GEOSITE 输出（native=true）', () => {
    const line = ruleSetLine(rule('netflix', 'PROXY', { native: true }), RULE_GROUPS);
    expect(line).toBe('GEOSITE,netflix,国外媒体');
  });

  it('ruleSetLine GEOIP 原生输出', () => {
    const line = ruleSetLine(rule('PRIVATE', 'DIRECT', { native: true, tag: 'geoip' }));
    expect(line).toBe('GEOIP,private,DIRECT');
  });

  it('ruleSetLine 无 native 标记 → RULE-SET provider', () => {
    const line = ruleSetLine(rule('GOOGLEFCM'));
    expect(line.startsWith('RULE-SET,geosite-googlefcm,')).toBe(true);
  });

  it('ruleActionTarget REJECT → 广告拦截', () => {
    expect(ruleActionTarget(rule('CATEGORY-ADS-ALL', 'REJECT'), RULE_GROUPS)).toBe('广告拦截');
  });

  it('ruleActionTarget DIRECT (china-direct) → 直接 DIRECT', () => {
    expect(ruleActionTarget(rule('cn', 'DIRECT', { native: true, fixed: true }), RULE_GROUPS)).toBe('DIRECT');
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
  it('为每条勾选的 non-native 规则生成一个 http provider', () => {
    const providers = buildRuleProviders([rule('NETFLIX'), rule('GOOGLEFCM')]);
    const keys = Object.keys(providers);
    expect(keys).toContain('geosite-netflix');
    expect(keys).toContain('geosite-googlefcm');
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

  it('native 规则不生成 provider', () => {
    const providers = buildRuleProviders([rule('NETFLIX', 'PROXY', { native: true })]);
    expect(Object.keys(providers)).toHaveLength(0);
  });
});

describe('buildRules 原生规则输出', () => {
  it('输出顺序：PRIVATE最前 → 广告拦截(native) → 业务分类 → china-direct(native) → MATCH', () => {
    const rules = buildRules([
      rule('openai', 'PROXY', { native: true }),         // ai 组
      rule('category-ads-all', 'REJECT', { native: true }), // ads 组
      rule('cn', 'DIRECT', { native: true, fixed: true }),            // china-direct 组
    ], RULE_GROUPS);

    // 验证关键顺序
    const privateIdx = rules.indexOf('GEOIP,private,DIRECT');
    const adsIdx = rules.indexOf('GEOSITE,category-ads-all,广告拦截');
    const openaiIdx = rules.indexOf('GEOSITE,openai,AI 平台');
    const cnIdx = rules.indexOf('GEOSITE,cn,DIRECT');
    const matchIdx = rules.indexOf('MATCH,漏网之鱼');

    expect(privateIdx).toBe(0); // PRIVATE 必须最前
    expect(privateIdx).toBeLessThan(adsIdx);      // PRIVATE < 广告拦截
    expect(adsIdx).toBeLessThan(openaiIdx);       // 广告拦截 < 业务分类
    expect(openaiIdx).toBeLessThan(cnIdx);        // 业务分类 < 国内直连规则
    expect(cnIdx).toBeLessThan(matchIdx);          // 国内规则 < MATCH
  });

  it('REJECT 必须排在 PROXY 前（广告拦截优先）', () => {
    const rules = buildRules([
      rule('openai', 'PROXY', { native: true }),
      rule('category-ads-all', 'REJECT', { native: true }),
    ], RULE_GROUPS);
    const rejectIdx = rules.indexOf('GEOSITE,category-ads-all,广告拦截');
    const proxyIdx = rules.indexOf('GEOSITE,openai,AI 平台');
    expect(rejectIdx).toBeLessThan(proxyIdx);
  });

  it('最后两行是 MATCH,漏网之鱼（不再硬编码 GEOSITE,cn / GEOIP,CN）', () => {
    const rules = buildRules([rule('netflix', 'PROXY', { native: true })], RULE_GROUPS);
    // china-direct 组的 native 规则不一定有 GEOIP,CN（取决于用户是否勾选了该组）
    // 但只要 MATCH 是最后一行即可
    expect(rules[rules.length - 1]).toBe('MATCH,漏网之鱼');
  });

  it('google-fcm 例外组仍生成 RULE-SET provider', () => {
    const rules = buildRules([rule('googlefcm', 'PROXY')], RULE_GROUPS);
    const googlefcm = rules.find(r => r.startsWith('RULE-SET,geosite-googlefcm'));
    expect(googlefcm).toBeDefined();
  });

  it('@属性原生规则正确输出（如 microsoft@cn）', () => {
    const rules = buildRules([rule('microsoft@cn', 'DIRECT', { native: true })], RULE_GROUPS);
    expect(rules).toContain('GEOSITE,microsoft@cn,DIRECT');
  });

  it('!属性原生规则正确输出（如 category-ai-chat-!cn）', () => {
    const rules = buildRules([rule('category-ai-chat-!cn', 'PROXY', { native: true })], RULE_GROUPS);
    expect(rules).toContain('GEOSITE,category-ai-chat-!cn,AI 平台');
  });
});
