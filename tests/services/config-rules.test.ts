/**
 * 测试 - ConfigService 生成配置时注入已保存的分流规则
 */
import { describe, it, expect } from 'vitest';
import { MemoryKvAdapter, createRepositories } from '@/storage/kv';
import { createConfigService } from '@/services/config.service';
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

async function setup() {
  const kv = new MemoryKvAdapter();
  const repos = createRepositories(kv);
  await repos.nodes.setBySubscription('sub1', [makeNode()]);
  const svc = createConfigService(repos);
  return svc;
}

describe('ConfigService 分流规则注入', () => {
  it('未保存规则时，mihomo 配置只有默认规则 + 始终生成的分组', async () => {
    const svc = await setup();
    const yaml = await svc.generate('mihomo');
    // 无 rule-providers（因为没有勾选规则）
    expect(yaml).not.toContain('rule-providers');
    // 始终生成的分组都在
    expect(yaml).toContain('漏网之鱼');
    expect(yaml).toContain('节点选择');
    expect(yaml).toContain('GLOBAL');
    // 默认 MATCH 到漏网之鱼
    expect(yaml).toContain('MATCH,漏网之鱼');
  });

  it('保存规则后，mihomo 配置包含 rule-providers + 规则分类分组', async () => {
    const svc = await setup();
    await svc.setSelectedRuleIds(['NETFLIX', 'OPENAI', 'CATEGORY-ADS-ALL']);
    const yaml = await svc.generate('mihomo');
    // rule-providers
    expect(yaml).toContain('rule-providers:');
    expect(yaml).toContain('geosite-netflix');
    expect(yaml).toContain('netflix.mrs');
    expect(yaml).toContain('geosite-openai');
    expect(yaml).toContain('geosite-category-ads-all');
    // 规则分类分组出现
    expect(yaml).toContain('AI 平台'); // V3.1: 名称改为"AI 平台"
    expect(yaml).toContain('国外媒体');
    // 流媒体不生成独立分组（合并到国外媒体）
    expect(yaml).not.toContain('- 流媒体\n');
    // 有序 rules：REJECT 路由到广告拦截，OPENAI 路由到 AI 平台
    expect(yaml.indexOf('RULE-SET,geosite-category-ads-all,广告拦截')).toBeLessThan(
      yaml.indexOf('RULE-SET,geosite-openai,AI 平台')
    );
    expect(yaml.indexOf('GEOIP,CN,DIRECT')).toBeLessThan(
      yaml.indexOf('MATCH,漏网之鱼')
    );
  });

  it('getSelectedRules 只返回存在的规则对象', async () => {
    const svc = await setup();
    await svc.setSelectedRuleIds(['NETFLIX', 'NONEXISTENT']);
    const rules = await svc.getSelectedRules();
    expect(rules.map((r) => r.id)).toEqual(['NETFLIX']);
  });
});