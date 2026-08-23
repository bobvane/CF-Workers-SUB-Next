import { describe, it, expect } from 'vitest';
import { generateProxyGroups } from '@/generator/mihomo';
import { buildRules, ruleActionTarget } from '@/generator/rule-providers';
import { RULE_GROUPS } from '@/data/metacubex-rules';
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
      { id: 'CATEGORY-ADS-ALL', label: '广告拦截', tag: 'geosite' as const, target: 'REJECT' as const },
      { id: 'GOOGLEFCM', label: '谷歌FCM', tag: 'geosite' as const, target: 'PROXY' as const },
      { id: 'BING', label: '微软Bing', tag: 'geosite' as const, target: 'PROXY' as const },
      { id: 'ONEDRIVE', label: '微软云盘', tag: 'geosite' as const, target: 'PROXY' as const },
      { id: 'MICROSOFT', label: '微软服务', tag: 'geosite' as const, target: 'PROXY' as const },
      { id: 'APPLE', label: '苹果服务', tag: 'geosite' as const, target: 'DIRECT' as const },
      { id: 'NETEASE', label: '网易音乐', tag: 'geosite' as const, target: 'DIRECT' as const },
      { id: 'OPENAI', label: 'OpenAI', tag: 'geosite' as const, target: 'PROXY' as const },
      { id: 'NETFLIX', label: 'Netflix', tag: 'geosite' as const, target: 'PROXY' as const },
      { id: 'BILIBILI', label: '哔哩哔哩', tag: 'geosite' as const, target: 'DIRECT' as const },
      { id: 'CN', label: '中国直连', tag: 'geosite' as const, target: 'DIRECT' as const },
    ];
    
    const groups = await generateProxyGroups(nodes, selectedRules, RULE_GROUPS);
    const groupNames = groups.map(g => g.name);
    
    // 核心验证
    expect(groupNames).not.toContain('应用净化');
    expect(groupNames).not.toContain('国内媒体');
    expect(groups.find(g => g.name === 'GLOBAL')?.['default-selected']).toBe('节点选择');
    expect(groupNames.length).toBeGreaterThanOrEqual(14);
    console.log('策略组:', groupNames.join(', '));
  });

  it('规则优先级正确：PRIVATE最前 → 广告 → 业务 → 国内DIRECT → GEOSITE,cn → GEOIP,CN → MATCH', async () => {
    const selectedRules = [
      { id: 'CATEGORY-ADS-ALL', label: '广告拦截', tag: 'geosite' as const, target: 'REJECT' as const },
      { id: 'GOOGLEFCM', label: '谷歌FCM', tag: 'geosite' as const, target: 'PROXY' as const },
      { id: 'BING', label: '微软Bing', tag: 'geosite' as const, target: 'PROXY' as const },
      { id: 'ONEDRIVE', label: '微软云盘', tag: 'geosite' as const, target: 'PROXY' as const },
      { id: 'MICROSOFT', label: '微软服务', tag: 'geosite' as const, target: 'PROXY' as const },
      { id: 'APPLE', label: '苹果服务', tag: 'geosite' as const, target: 'DIRECT' as const },
      { id: 'NETEASE', label: '网易音乐', tag: 'geosite' as const, target: 'DIRECT' as const },
      { id: 'OPENAI', label: 'OpenAI', tag: 'geosite' as const, target: 'PROXY' as const },
      { id: 'NETFLIX', label: 'Netflix', tag: 'geosite' as const, target: 'PROXY' as const },
      { id: 'BILIBILI', label: '哔哩哔哩', tag: 'geosite' as const, target: 'DIRECT' as const },
      { id: 'CN', label: '中国直连', tag: 'geosite' as const, target: 'DIRECT' as const },
    ];
    
    const rules = buildRules(selectedRules, RULE_GROUPS);
    
    // 关键顺序验证
    expect(rules[0]).toBe('GEOIP,private,DIRECT'); // PRIVATE最前
    expect(rules[rules.length - 1]).toBe('MATCH,漏网之鱼'); // MATCH兜底
    expect(rules[rules.length - 2]).toBe('GEOIP,CN,DIRECT'); // GEOIP,CN
    expect(rules[rules.length - 3]).toBe('GEOSITE,cn,DIRECT'); // GEOSITE,cn
    
    // 国内规则直接 DIRECT，不指向策略组
    const bilibiliRule = rules.find(r => r.includes('bilibili'));
    const cnRule = rules.find(r => r.startsWith('RULE-SET,geosite-cn,'));
    expect(bilibiliRule?.endsWith(',DIRECT')).toBe(true);
    expect(cnRule?.endsWith(',DIRECT')).toBe(true);
    expect(bilibiliRule).not.toContain('国内媒体');
    expect(cnRule).not.toContain('国内媒体');
    
    console.log('规则总数:', rules.length);
    console.log('前10条:', rules.slice(0, 10));
    console.log('后5条:', rules.slice(-5));
  });

  it('ruleActionTarget 路由正确', () => {
    // REJECT → 广告拦截
    expect(ruleActionTarget({ id: 'CATEGORY-ADS-ALL', label: '', tag: 'geosite' as const, target: 'REJECT' as const }, RULE_GROUPS)).toBe('广告拦截');
    expect(ruleActionTarget({ id: 'CATEGORY-ADS', label: '', tag: 'geosite' as const, target: 'REJECT' as const }, RULE_GROUPS)).toBe('广告拦截');
    
    // 国内规则 → 直接 DIRECT
    expect(ruleActionTarget({ id: 'BILIBILI', label: '', tag: 'geosite' as const, target: 'DIRECT' as const }, RULE_GROUPS)).toBe('DIRECT');
    expect(ruleActionTarget({ id: 'CN', label: '', tag: 'geosite' as const, target: 'DIRECT' as const }, RULE_GROUPS)).toBe('DIRECT');
    
    // 业务条件组
    expect(ruleActionTarget({ id: 'GOOGLEFCM', label: '', tag: 'geosite' as const, target: 'PROXY' as const }, RULE_GROUPS)).toBe('谷歌FCM');
    expect(ruleActionTarget({ id: 'BING', label: '', tag: 'geosite' as const, target: 'PROXY' as const }, RULE_GROUPS)).toBe('微软Bing');
    expect(ruleActionTarget({ id: 'ONEDRIVE', label: '', tag: 'geosite' as const, target: 'PROXY' as const }, RULE_GROUPS)).toBe('微软云盘');
    expect(ruleActionTarget({ id: 'MICROSOFT', label: '', tag: 'geosite' as const, target: 'PROXY' as const }, RULE_GROUPS)).toBe('微软服务');
    expect(ruleActionTarget({ id: 'APPLE', label: '', tag: 'geosite' as const, target: 'DIRECT' as const }, RULE_GROUPS)).toBe('苹果服务');
    expect(ruleActionTarget({ id: 'NETEASE', label: '', tag: 'geosite' as const, target: 'DIRECT' as const }, RULE_GROUPS)).toBe('网易音乐');
    expect(ruleActionTarget({ id: 'OPENAI', label: '', tag: 'geosite' as const, target: 'PROXY' as const }, RULE_GROUPS)).toBe('AI 平台');
    expect(ruleActionTarget({ id: 'NETFLIX', label: '', tag: 'geosite' as const, target: 'PROXY' as const }, RULE_GROUPS)).toBe('国外媒体');
  });
});