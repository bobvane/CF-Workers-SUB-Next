/**
 * 测试 - V3.1 / 原生规则集验证
 * 验证：原生 GEOSITE/GEOIP 输出、策略组结构、ruleActionTarget 路由
 */
import { describe, it, expect } from 'vitest';
import { generateProxyGroups, generateMihomoConfig } from '@/generator/mihomo';
import { buildRules, ruleActionTarget } from '@/generator/rule-providers';
import { RULE_GROUPS, MetaCubeXRule, RuleGroup } from '@/data/metacubex-rules';
import { Node } from '@/models/node';

function makeNode(overrides: Partial<Node> = {}): Node {
  return {
    id: 'n1',
    name: 'JP-01',
    protocol: 'vless',
    server: 'jp.example.com',
    port: 443,
    uuid: '550e8400-e29b-41d4-a716-446655440000',
    tls: true,
    metadata: { source: 'test', originalName: 'JP-01', tags: [] },
    version: 1,
    ...overrides,
  } as Node;
}

describe('V3.1 验证', () => {
  it('策略组数量约 22 个，无应用净化/国内媒体，GLOBAL默认节点选择', async () => {
    const nodes = [makeNode({ name: 'JP-01' }), makeNode({ id: 'n2', name: 'US-01', server: 'us.example.com' })];
    const selectedRules = [
      { id: 'category-ads-all', label: '广告拦截', tag: 'geosite' as const, target: 'REJECT' as const, native: true },
      { id: 'googlefcm', label: '谷歌FCM', tag: 'geosite' as const, target: 'PROXY' as const },
      { id: 'BING', label: '微软Bing', tag: 'geosite' as const, target: 'PROXY' as const },
      { id: 'MICROSOFT', label: '微软服务', tag: 'geosite' as const, target: 'PROXY' as const },
      { id: 'APPLE', label: '苹果服务', tag: 'geosite' as const, target: 'DIRECT' as const },
      { id: 'OPENAI', label: 'OpenAI', tag: 'geosite' as const, target: 'PROXY' as const },
      { id: 'NETFLIX', label: 'Netflix', tag: 'geosite' as const, target: 'PROXY' as const },
    ];

    const groups = await generateProxyGroups(nodes, selectedRules, RULE_GROUPS);
    const groupNames = groups.map(g => g.name);

    expect(groupNames).not.toContain('应用净化');
    expect(groupNames).not.toContain('国内媒体');
    expect(groups.find(g => g.name === 'GLOBAL')?.['default-selected']).toBe('节点选择');
    expect(groupNames.length).toBeGreaterThanOrEqual(11);
  });

  it('原生规则输出：PRIVATE最前 → 广告(native REJECT) → 业务(native) → MATCH', async () => {
    const selectedRules = [
      { id: 'category-ads-all', label: '广告拦截', tag: 'geosite' as const, target: 'REJECT' as const, native: true },
      { id: 'googlefcm', label: '谷歌FCM', tag: 'geosite' as const, target: 'PROXY' as const },
      { id: 'openai', label: 'OpenAI', tag: 'geosite' as const, target: 'PROXY' as const, native: true },
      { id: 'netflix', label: 'Netflix', tag: 'geosite' as const, target: 'PROXY' as const, native: true },
    ];

    const rules = buildRules(selectedRules, RULE_GROUPS);

    expect(rules[0]).toBe('GEOIP,private,DIRECT');
    expect(rules[rules.length - 1]).toBe('MATCH,漏网之鱼');
    expect(rules.some(r => r === 'GEOSITE,category-ads-all,广告拦截')).toBe(true);
    expect(rules.some(r => r === 'GEOSITE,openai,AI 平台')).toBe(true);
    expect(rules.some(r => r === 'GEOSITE,netflix,国外媒体')).toBe(true);
    // googlefcm 是非 native，走 RULE-SET provider
    expect(rules.some(r => r.startsWith('RULE-SET,geosite-googlefcm,谷歌FCM'))).toBe(true);
  });

  it('ruleActionTarget 路由正确', () => {
    // REJECT → 广告拦截
    expect(ruleActionTarget({ id: 'category-ads-all', label: '', tag: 'geosite' as const, target: 'REJECT' as const, native: true }, RULE_GROUPS)).toBe('广告拦截');
    expect(ruleActionTarget({ id: 'tracker', label: '', tag: 'geosite' as const, target: 'REJECT' as const, native: true }, RULE_GROUPS)).toBe('广告拦截');
    // china-direct native 规则 → DIRECT
    expect(ruleActionTarget({ id: 'cn', label: '', tag: 'geosite' as const, target: 'DIRECT' as const, native: true }, RULE_GROUPS)).toBe('DIRECT');
    expect(ruleActionTarget({ id: 'geoip,cn', label: '', tag: 'geoip' as const, target: 'DIRECT' as const, native: true }, RULE_GROUPS)).toBe('DIRECT');
    // 非 native 大写 id → 匹配对应组
    expect(ruleActionTarget({ id: 'googlefcm', label: '', tag: 'geosite' as const, target: 'PROXY' as const }, RULE_GROUPS)).toBe('谷歌FCM');
    // BING 在 microsoft 组（大写），find 先匹配到 microsoft 组 → 微软服务
    expect(ruleActionTarget({ id: 'BING', label: '', tag: 'geosite' as const, target: 'PROXY' as const }, RULE_GROUPS)).toBe('微软服务');
    expect(ruleActionTarget({ id: 'MICROSOFT', label: '', tag: 'geosite' as const, target: 'PROXY' as const }, RULE_GROUPS)).toBe('微软服务');
    expect(ruleActionTarget({ id: 'APPLE', label: '', tag: 'geosite' as const, target: 'DIRECT' as const }, RULE_GROUPS)).toBe('苹果服务');
    // 不存在 → 兜底
    expect(ruleActionTarget({ id: 'NETEASE', label: '', tag: 'geosite' as const, target: 'DIRECT' as const }, RULE_GROUPS)).toBe('DIRECT');
    expect(ruleActionTarget({ id: 'GITHUB', label: '', tag: 'geosite' as const, target: 'PROXY' as const }, RULE_GROUPS)).toBe('漏网之鱼');
    // native 小写 id
    expect(ruleActionTarget({ id: 'openai', label: '', tag: 'geosite' as const, target: 'PROXY' as const, native: true }, RULE_GROUPS)).toBe('AI 平台');
    expect(ruleActionTarget({ id: 'netflix', label: '', tag: 'geosite' as const, target: 'PROXY' as const, native: true }, RULE_GROUPS)).toBe('国外媒体');
  });
});

describe('用户自定义规则置顶', () => {
  it('自定义规则紧跟 PRIVATE 之后输出，且不重复出现', () => {
    const customRule: MetaCubeXRule = { id: 'my-custom-site', label: '我的自定义', tag: 'geosite' as const, target: 'PROXY' as const, custom: true };
    const selectedRules = [customRule, { id: 'category-ads-all', label: '广告拦截', tag: 'geosite' as const, target: 'REJECT' as const, native: true }, { id: 'openai', label: 'OpenAI', tag: 'geosite' as const, target: 'PROXY' as const, native: true }];
    const groups: RuleGroup[] = RULE_GROUPS.map(g => ({ ...g, items: g.key === 'user' ? [...g.items, customRule] : [...g.items] }));
    const rules = buildRules(selectedRules, groups);
    expect(rules[0]).toBe('GEOIP,private,DIRECT');
    expect(rules[1]).toContain('geosite-my-custom-site');
    expect(rules.some(r => r.includes('category-ads-all'))).toBe(true);
    expect(rules.filter(r => r.includes('geosite-my-custom-site')).length).toBe(1);
  });
});

describe('AI 审查意见修复', () => {
  it('输出配置包含完整 DNS 配置 + fake-ip + DoH', async () => {
    const yaml = await generateMihomoConfig([makeNode()]);
    expect(yaml).toContain('dns:');
    expect(yaml).toContain('enhanced-mode: fake-ip');
    expect(yaml).toContain('fake-ip-range');
    expect(yaml).toContain('https://223.5.5.5/dns-query');
    expect(yaml).toContain('nameserver-policy');
    expect(yaml).not.toContain('fallback-filter');
    expect(yaml).toContain('log-level: warning');
    expect(yaml).toContain('+.push.apple.com');
    expect(yaml).toContain('+.icloud.com');
    expect(yaml).toContain('default-nameserver');
    expect(yaml).toContain('proxy-server-nameserver');
    expect(yaml).toContain('interval: 1800');
    expect(yaml).not.toContain('interval: 300');
  });

  it('地理组全部为 select', async () => {
    const groups = await generateProxyGroups([makeNode({ name: '🇭🇰 香港 01' }), makeNode({ name: '🇹🇷 土耳其 01' })]);
    expect(groups.find(g => g.name === '🇭🇰 香港')?.type).toBe('select');
    expect(groups.find(g => g.name === '🇹🇷 土耳其')?.type).toBe('select');
  });
});
