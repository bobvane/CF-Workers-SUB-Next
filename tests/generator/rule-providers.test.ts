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
    const line = ruleSetLine(rule('cn', 'DIRECT', { native: true, fixed: true }), RULE_GROUPS);
    expect(line).toBe('GEOSITE,cn,DIRECT');
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

  it('ruleActionTarget 无归属组 PROXY → 漏网之鱼', () => {
    // 用一个确定不属于任何组的 id 验证兜底路径（openai/anthropic 已于 2026-09-19 归入 AI 平台组）
    expect(ruleActionTarget(rule('UNGROUPED-TEST-SITE'), RULE_GROUPS)).toBe('漏网之鱼');
  });

  it('ruleActionTarget TikTok / Netflix → 国外媒体（2026-09-19 归入国外媒体组）', () => {
    expect(ruleActionTarget(rule('NETFLIX'), RULE_GROUPS)).toBe('国外媒体');
    expect(ruleActionTarget(rule('TIKTOK'), RULE_GROUPS)).toBe('国外媒体');
  });

  it('ruleActionTarget AI 平台点名规则 → AI 平台（2026-09-19 四家补入并锁死）', () => {
    expect(ruleActionTarget(rule('OPENAI'), RULE_GROUPS)).toBe('AI 平台');
    expect(ruleActionTarget(rule('ANTHROPIC'), RULE_GROUPS)).toBe('AI 平台');
    expect(ruleActionTarget(rule('GOOGLE-GEMINI'), RULE_GROUPS)).toBe('AI 平台');
    expect(ruleActionTarget(rule('PERPLEXITY'), RULE_GROUPS)).toBe('AI 平台');
  });

  it('ruleActionTarget 谷歌FCM PROXY → DIRECT（并入国内直连组，2026-09-19）', () => {
    expect(ruleActionTarget(rule('GOOGLEFCM'), RULE_GROUPS)).toBe('DIRECT');
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
  it('输出顺序：内网防代理最前 → 广告拦截(native) → china-direct → 业务分类 → GEOIP,CN → MATCH', () => {
    const rules = buildRules([
      rule('category-ai-!cn', 'PROXY', { native: true }),   // ai 组
      rule('category-ads-all', 'REJECT', { native: true }), // ads 组
      rule('cn', 'DIRECT', { native: true, fixed: true }),            // china-direct 组
    ], RULE_GROUPS);

    // 验证关键顺序（v2.11.0）
    const lanIdx = rules.indexOf('GEOIP,lan,DIRECT,no-resolve');
    const privateIdx = rules.indexOf('GEOSITE,private,DIRECT');
    const adsIdx = rules.indexOf('GEOSITE,category-ads-all,广告拦截');
    const cnIdx = rules.indexOf('GEOSITE,cn,DIRECT');
    const aiIdx = rules.indexOf('GEOSITE,category-ai-!cn,AI 平台');
    const geoipCnIdx = rules.indexOf('GEOIP,CN,DIRECT');
    const matchIdx = rules.indexOf('MATCH,漏网之鱼');

    expect(lanIdx).toBe(0); // lan 必须最前
    expect(privateIdx).toBe(1); // private 紧随
    expect(lanIdx).toBeLessThan(privateIdx);
    expect(privateIdx).toBeLessThan(adsIdx);      // 内网 < 广告拦截
    expect(adsIdx).toBeLessThan(cnIdx);           // 广告拦截 < 国内直连
    expect(cnIdx).toBeLessThan(aiIdx);            // 国内直连 < 业务分类
    expect(aiIdx).toBeLessThan(geoipCnIdx);       // 业务分类 < GEOIP,CN
    expect(geoipCnIdx).toBeLessThan(matchIdx);    // GEOIP,CN < MATCH
  });

  it('REJECT 必须排在 PROXY 前（广告拦截优先）', () => {
    const rules = buildRules([
      rule('category-ai-!cn', 'PROXY', { native: true }),
      rule('category-ads-all', 'REJECT', { native: true }),
    ], RULE_GROUPS);
    const rejectIdx = rules.indexOf('GEOSITE,category-ads-all,广告拦截');
    const proxyIdx = rules.indexOf('GEOSITE,category-ai-!cn,AI 平台');
    expect(rejectIdx).toBeLessThan(proxyIdx);
  });

  it('最后一行是 MATCH,漏网之鱼；GEOIP,CN,DIRECT 在 MATCH 前（v2.11.0 剥离承重墙）', () => {
    const rules = buildRules([rule('netflix', 'PROXY', { native: true })], RULE_GROUPS);
    // v2.11.0: GEOIP,CN,DIRECT 无条件硬编码在 MATCH 之前
    expect(rules[rules.length - 1]).toBe('MATCH,漏网之鱼');
    expect(rules[rules.length - 2]).toBe('GEOIP,CN,DIRECT');
  });

  it('googlefcm 并入国内直连组 → 原生 GEOSITE,DIRECT（不再生成 RULE-SET，v2.27.0）', () => {
    const rules = buildRules([rule('googlefcm', 'PROXY')], RULE_GROUPS);
    expect(rules).toContain('GEOSITE,googlefcm,DIRECT');
    expect(rules.some(r => r.startsWith('RULE-SET,geosite-googlefcm'))).toBe(false);
  });

  it('@属性原生规则正确输出（如 category-social-media-!cn → 社交）', () => {
    const rules = buildRules([rule('category-social-media-!cn', 'PROXY', { native: true })], RULE_GROUPS);
    expect(rules).toContain('GEOSITE,category-social-media-!cn,社交');
  });

  it('!属性原生规则正确输出（如 category-ai-chat-!cn）', () => {
    const rules = buildRules([rule('category-ai-chat-!cn', 'PROXY', { native: true })], RULE_GROUPS);
    expect(rules).toContain('GEOSITE,category-ai-chat-!cn,AI 平台');
  });
});
