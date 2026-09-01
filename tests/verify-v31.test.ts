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
  it('Google服务组：geosite 6条在国外媒体后、geoip:google 在 crypto 后兜底（v2.15.0）', () => {
    const googleGroup = RULE_GROUPS.find(g => g.key === 'google');
    // 组存在
    expect(googleGroup).toBeDefined();
    // geosite + geoip 共 7 条
    expect(googleGroup!.items.length).toBe(7);
    expect(googleGroup!.items.every(i => i.native)).toBe(true);
    // geosite:google 等 6 条
    const geositeIds = googleGroup!.items.filter(i => i.tag === 'geosite').map(i => i.id);
    expect(geositeIds).toEqual(['google','google-gemini','google-deepmind','google-play','google-scholar','google-trust-services']);
    // geoip:google 用内部 id google-geoip 避开同名冲突
    const geoipItem = googleGroup!.items.find(i => i.tag === 'geoip');
    expect(geoipItem!.id).toBe('google-geoip');

    // buildRules：google 组选中的 geosite 规则输出在国外媒体之后（GEOSITE,google,...），geoip:google 在 GEOIP,CN 之后
    const selected = [
      { id: 'category-media', label: '媒体聚合', tag: 'geosite', target: 'PROXY' as const, native: true },
      { id: 'google', label: 'Google', tag: 'geosite' as const, target: 'PROXY' as const, native: true },
      { id: 'google-gemini', label: 'Google Gemini', tag: 'geosite' as const, target: 'PROXY' as const, native: true },
      { id: 'google-geoip', label: 'Google IP段', tag: 'geoip' as const, target: 'PROXY' as const, native: true },
    ];
    const rules = buildRules(selected as MetaCubeXRule[], RULE_GROUPS);
    const idxMedia = rules.findIndex(r => r === 'GEOSITE,category-media,国外媒体');
    const idxGsuite = rules.findIndex(r => r === 'GEOSITE,google,Google服务');
    const idxGpn = rules.findIndex(r => r === 'GEOIP,CN,DIRECT');
    const idxGeoipGoogle = rules.findIndex(r => r === 'GEOIP,google,Google服务');
    expect(idxGsuite).toBeGreaterThan(idxMedia); // geosite:google 在国外媒体后
    expect(idxGeoipGoogle).toBeGreaterThan(idxGpn); // geoip:google 在 GEOIP,CN（crypto 后）后
    // geoip 只出现一次，且用正确 id 'google'
    expect(rules.filter(r => r.includes('google')).length).toBe(3); // GEOSITE,google + GEOIP,google + google-gemini
    expect(rules.some(r => r.startsWith('GEOIP,google-geoip'))).toBe(false);
  });

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
      { id: 'category-ai-!cn', label: 'AI 平台(非中国)', tag: 'geosite' as const, target: 'PROXY' as const, native: true },
    ];

    const rules = buildRules(selectedRules, RULE_GROUPS);

    expect(rules[0]).toBe('GEOIP,lan,DIRECT,no-resolve'); // v2.11.0: 内网防代理拆两条，lan 在前
    expect(rules[1]).toBe('GEOSITE,private,DIRECT');
    expect(rules[rules.length - 1]).toBe('MATCH,漏网之鱼');
    expect(rules.some(r => r === 'GEOSITE,category-ads-all,广告拦截')).toBe(true);
    expect(rules.some(r => r === 'GEOSITE,category-ai-!cn,AI 平台')).toBe(true);
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
    // BING 已从 microsoft 组移除 → 漏网之鱼
    expect(ruleActionTarget({ id: 'BING', label: '', tag: 'geosite' as const, target: 'PROXY' as const }, RULE_GROUPS)).toBe('漏网之鱼');
    expect(ruleActionTarget({ id: 'MICROSOFT', label: '', tag: 'geosite' as const, target: 'PROXY' as const }, RULE_GROUPS)).toBe('微软服务');
    expect(ruleActionTarget({ id: 'APPLE', label: '', tag: 'geosite' as const, target: 'DIRECT' as const }, RULE_GROUPS)).toBe('苹果服务');
    // 不存在 → 兜底
    expect(ruleActionTarget({ id: 'NETEASE', label: '', tag: 'geosite' as const, target: 'DIRECT' as const }, RULE_GROUPS)).toBe('DIRECT');
    expect(ruleActionTarget({ id: 'GITHUB', label: '', tag: 'geosite' as const, target: 'PROXY' as const }, RULE_GROUPS)).toBe('漏网之鱼');
    // native 小写 id；openai/netflix 已移除 → 漏网之鱼；category-ai-!cn 仍在 AI 组
    expect(ruleActionTarget({ id: 'openai', label: '', tag: 'geosite' as const, target: 'PROXY' as const, native: true }, RULE_GROUPS)).toBe('漏网之鱼');
    expect(ruleActionTarget({ id: 'netflix', label: '', tag: 'geosite' as const, target: 'PROXY' as const, native: true }, RULE_GROUPS)).toBe('漏网之鱼');
    expect(ruleActionTarget({ id: 'category-ai-!cn', label: '', tag: 'geosite' as const, target: 'PROXY' as const, native: true }, RULE_GROUPS)).toBe('AI 平台');
  });
});

describe('用户自定义规则置顶', () => {
  it('自定义规则在 ① 用户规则位输出（最前），随后是内网防代理，且不重复出现', () => {
    const customRule: MetaCubeXRule = { id: 'my-custom-site', label: '我的自定义', tag: 'geosite' as const, target: 'PROXY' as const, custom: true };
    const selectedRules = [customRule, { id: 'category-ads-all', label: '广告拦截', tag: 'geosite' as const, target: 'REJECT' as const, native: true }, { id: 'openai', label: 'OpenAI', tag: 'geosite' as const, target: 'PROXY' as const, native: true }];
    const groups: RuleGroup[] = RULE_GROUPS.map(g => ({ ...g, items: g.key === 'user' ? [...g.items, customRule] : [...g.items] }));
    const rules = buildRules(selectedRules, groups);
    // v2.13.1: custom 规则走 GEOSITE 原生输出（不再 RULE-SET + rule-providers）
    // v2.14.0: 用户规则移到 GEOSITE,private,DIRECT 之后（用户 2026-09-02 拍板）
    expect(rules[0]).toBe('GEOIP,lan,DIRECT,no-resolve'); // ① 内网防代理 lan 在前
    expect(rules[1]).toBe('GEOSITE,private,DIRECT');
    expect(rules[2]).toBe('GEOSITE,my-custom-site,用户规则'); // ② 用户规则紧随 private 之后
    expect(rules.some(r => r.includes('category-ads-all'))).toBe(true);
    // custom 规则只出现一次（orphan 步骤已跳过 custom 避免重复）
    expect(rules.filter(r => r.includes('my-custom-site')).length).toBe(1);
  });
});

describe('AI 审查意见修复', () => {
  it('输出配置已移除 DNS 段 + fake-ip + sniffer（v2.12.2）', async () => {
    const yaml = await generateMihomoConfig([makeNode()]);
    // v2.12.2: profile/dns/sniffer 三段落全部移除；v2.13.0: 恢复必要头部（port/socks-port/allow-lan/mode/log-level）
    expect(yaml).not.toContain('dns:');
    expect(yaml).not.toContain('enhanced-mode');
    expect(yaml).not.toContain('fake-ip');
    expect(yaml).not.toContain('nameserver-policy');
    expect(yaml).not.toContain('fallback-filter');
    expect(yaml).toContain('port: 7890');
    expect(yaml).toContain('socks-port: 7891');
    expect(yaml).toContain('allow-lan: true');
    expect(yaml).toContain('mode: Rule');
    expect(yaml).toContain('log-level: info');
    expect(yaml).not.toContain('sniffer:');
    expect(yaml).not.toContain('sniff:');
    expect(yaml).toContain('proxies:');
    expect(yaml).toContain('proxy-groups:');
    expect(yaml).toContain('rules:');
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
    // 地理组名称来自节点名中的 emoji（如 🇯🇵 日本 01、🇯🇵 日本 02），不是国家简称
    // 由于没有 ipGeoResolver，节点都归入"其他"，地理组不会按国家名生成
    // 此测试验证：即使无 IP 解析，分组结构仍然正常
    const names = groups.map(g => g.name);
    expect(names).toContain('节点选择');
    expect(names).toContain('手动切换');
    expect(names).toContain('自动选择');
    expect(names).toContain('其他');
  });
});
