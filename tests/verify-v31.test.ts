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
  it('策略组数量约 22 个，无应用净化/国内媒体，GLOBAL默认 DIRECT', async () => {
    const nodes = [makeNode({ name: 'JP-01' }), makeNode({ id: 'n2', name: 'US-01', server: 'us.example.com' })];
    const selectedRules = [
      { id: 'category-ads-all', label: '广告拦截', tag: 'geosite' as const, target: 'REJECT' as const, native: true },
      { id: 'googlefcm', label: '谷歌FCM', tag: 'geosite' as const, target: 'PROXY' as const, native: true },
      { id: 'bing', label: '微软Bing', tag: 'geosite' as const, target: 'PROXY' as const, native: true },
      { id: 'microsoft', label: '微软服务', tag: 'geosite' as const, target: 'PROXY' as const, native: true },
      { id: 'apple', label: '苹果服务', tag: 'geosite' as const, target: 'DIRECT' as const, native: true },
      { id: 'OPENAI', label: 'OpenAI', tag: 'geosite' as const, target: 'PROXY' as const },
      { id: 'NETFLIX', label: 'Netflix', tag: 'geosite' as const, target: 'PROXY' as const },
    ];

    const groups = await generateProxyGroups(nodes, selectedRules, RULE_GROUPS);
    const groupNames = groups.map(g => g.name);

    expect(groupNames).not.toContain('应用净化');
    expect(groupNames).not.toContain('国内媒体');
    expect(groups.find(g => g.name === 'GLOBAL')?.['default-selected']).toBe('DIRECT');
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

    expect(rules[0]).toBe('GEOIP,lan,DIRECT,no-resolve'); // v2.11.0: 内网防代理拆两条，lan 在前
    expect(rules[1]).toBe('GEOSITE,private,DIRECT');
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
    // v2.11.0: geoip,cn 已从 china-direct 组移除（剥离为独立硬编码），无归属 → DIRECT
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
  it('自定义规则在 ① 用户规则位输出（最前），随后是内网防代理，且不重复出现', () => {
    const customRule: MetaCubeXRule = { id: 'my-custom-site', label: '我的自定义', tag: 'geosite' as const, target: 'PROXY' as const, custom: true };
    const selectedRules = [customRule, { id: 'category-ads-all', label: '广告拦截', tag: 'geosite' as const, target: 'REJECT' as const, native: true }, { id: 'openai', label: 'OpenAI', tag: 'geosite' as const, target: 'PROXY' as const, native: true }];
    const groups: RuleGroup[] = RULE_GROUPS.map(g => ({ ...g, items: g.key === 'user' ? [...g.items, customRule] : [...g.items] }));
    const rules = buildRules(selectedRules, groups);
    expect(rules[0]).toContain('geosite-my-custom-site'); // ① 用户规则最前
    expect(rules[1]).toBe('GEOIP,lan,DIRECT,no-resolve'); // ② 内网防代理
    expect(rules[2]).toBe('GEOSITE,private,DIRECT');
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
  });

  it('地理组：美国/马来西亚/日本/新加坡/台湾/韩国 六组 url-test，其余 select', async () => {
    const groups = await generateProxyGroups([
      makeNode({ name: '🇭🇰 香港 01' }),
      makeNode({ id: 'n2', name: '🇹🇷 土耳其 01' }),
      makeNode({ id: 'n3', name: '🇯🇵 日本 01' }),
      makeNode({ id: 'n3b', name: '🇯🇵 日本 02' }),
      makeNode({ id: 'n4', name: '🇸🇬 新加坡 01' }),
      makeNode({ id: 'n4b', name: '🇸🇬 新加坡 02' }),
      makeNode({ id: 'n5', name: '🇺🇸 美国 01' }),
      makeNode({ id: 'n5b', name: '🇺🇸 美国 02' }),
      makeNode({ id: 'n6', name: '🇲🇾 马来西亚 01' }),
      makeNode({ id: 'n6b', name: '🇲🇾 马来西亚 02' }),
      makeNode({ id: 'n7', name: '🇹🇼 台湾 01' }),
      makeNode({ id: 'n7b', name: '🇹🇼 台湾 02' }),
      makeNode({ id: 'n8', name: '🇰🇷 韩国 01' }),
      makeNode({ id: 'n8b', name: '🇰🇷 韩国 02' }),
    ]);
    const byName = new Map(groups.map(g => [g.name, g]));
    // 六国 → url-test + 指定测速参数
    for (const name of ['🇯🇵 日本', '🇸🇬 新加坡', '🇺🇸 美国', '🇲🇾 马来西亚', '🇹🇼 台湾', '🇰🇷 韩国']) {
      expect(byName.get(name)?.type).toBe('url-test');
      expect(byName.get(name)?.url).toBe('https://cp.cloudflare.com/generate_204');
      expect(byName.get(name)?.interval).toBe(300);
      expect(byName.get(name)?.tolerance).toBe(50);
      expect(byName.get(name)?.lazy).toBe(true);
      expect(byName.get(name)?.timeout).toBe(5000);
    }
    // 其余地理组 → select
    expect(byName.get('🇭🇰 香港')?.type).toBe('select');
    expect(byName.get('🇹🇷 土耳其')?.type).toBe('select');
  });
});
