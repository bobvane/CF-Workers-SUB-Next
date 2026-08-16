import { describe, it, expect } from 'vitest';
import { generateMihomoConfig, nodeToMihomoProxy, validateMihomo } from '@/generator/mihomo';
import { Node } from '@/models/node';
import { RULE_GROUPS } from '@/data/metacubex-rules';

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

describe('nodeToMihomoProxy', () => {
  it('should convert vless node', () => {
    const proxy = nodeToMihomoProxy(makeNode());
    expect(proxy.name).toBe('JP-01');
    expect(proxy.type).toBe('vless');
    expect(proxy.server).toBe('jp.example.com');
    expect(proxy.port).toBe(443);
    expect(proxy.uuid).toBe('550e8400-e29b-41d4-a716-446655440000');
    expect(proxy.tls).toBe(true);
  });

  it('should convert vmess node with ws transport', () => {
    const proxy = nodeToMihomoProxy(
      makeNode({
        protocol: 'vmess',
        transport: { type: 'ws', path: '/ws', host: 'cdn.example.com' },
      })
    );
    expect(proxy.type).toBe('vmess');
    expect(proxy.network).toBe('ws');
    expect((proxy['ws-opts'] as Record<string, unknown>).path).toBe('/ws');
  });

  it('should convert trojan node', () => {
    const proxy = nodeToMihomoProxy(
      makeNode({ protocol: 'trojan', password: 'pass123' })
    );
    expect(proxy.type).toBe('trojan');
    expect(proxy.password).toBe('pass123');
  });

  it('should convert ss node with cipher from tags', () => {
    const proxy = nodeToMihomoProxy(
      makeNode({
        protocol: 'ss',
        password: 'p',
        metadata: { source: 'test', originalName: 'SS', tags: ['aes-256-gcm'] },
      })
    );
    expect(proxy.type).toBe('ss');
    expect(proxy.cipher).toBe('aes-256-gcm');
    expect(proxy.password).toBe('p');
  });

  it('should convert vless with reality params', () => {
    const proxy = nodeToMihomoProxy(
      makeNode({ flow: 'xtls-rprx-vision', pbk: 'pubkey', sid: 'abc' })
    );
    expect(proxy.flow).toBe('xtls-rprx-vision');
    const realityOpts = proxy['reality-opts'] as Record<string, unknown>;
    expect(realityOpts['public-key']).toBe('pubkey');
    expect(realityOpts['short-id']).toBe('abc');
    expect(proxy['client-fingerprint']).toBe('chrome');
  });
});

describe('generateMihomoConfig', () => {
  it('should generate single node config', () => {
    const yaml = generateMihomoConfig([makeNode()]);
    expect(yaml).toContain('mixed-port: 7890');
    expect(yaml).toContain('allow-lan: false');
    expect(yaml).toContain('mode: rule');
    expect(yaml).toContain('proxies:');
    expect(yaml).toContain('proxy-groups:');
    // 新分组层级
    expect(yaml).toContain('漏网之鱼');
    expect(yaml).toContain('节点选择');
    expect(yaml).toContain('手动切换');
    expect(yaml).toContain('自动选择');
    expect(yaml).toContain('国外媒体');
    expect(yaml).toContain('国内媒体');
    expect(yaml).toContain('广告拦截');
    expect(yaml).toContain('应用净化');
    expect(yaml).toContain('GLOBAL');
    // MATCH 兜底到漏网之鱼
    expect(yaml).toContain('MATCH,漏网之鱼');
  });

  it('should generate multiple proxies', () => {
    const yaml = generateMihomoConfig([
      makeNode({ name: 'JP-01' }),
      makeNode({ id: 'n2', name: 'US-01', server: 'us.example.com' }),
    ]);
    expect(yaml).toContain('JP-01');
    expect(yaml).toContain('US-01');
  });

  it('should be valid YAML with proxies array', () => {
    const yaml = generateMihomoConfig([makeNode()]);
    expect(validateMihomo(yaml)).toBe(true);
  });

  it('should include proxy groups with correct structure', () => {
    const yaml = generateMihomoConfig([makeNode({ name: 'JP-01' })]);
    expect(yaml).toContain('漏网之鱼');
    expect(yaml).toContain('节点选择');
    expect(yaml).toContain('自动选择');
    expect(yaml).toContain('GLOBAL');
  });

  it('should not enable allow-lan by default (security)', () => {
    const yaml = generateMihomoConfig([makeNode()]);
    expect(yaml).toContain('allow-lan: false');
  });

  it('should support custom template', () => {
    const yaml = generateMihomoConfig([makeNode()], {
      mixedPort: 1080,
      allowLan: true,
      logLevel: 'debug',
    });
    expect(yaml).toContain('mixed-port: 1080');
    expect(yaml).toContain('allow-lan: true');
    expect(yaml).toContain('log-level: debug');
  });

  it('should handle empty node list', () => {
    const yaml = generateMihomoConfig([]);
    expect(yaml).toContain('proxies: []');
    expect(validateMihomo(yaml)).toBe(true);
  });

  it('should generate rule-class groups when rules selected', () => {
    const yaml = generateMihomoConfig(
      [makeNode()],
      undefined,
      [
        { id: 'OPENAI', label: 'OpenAI', tag: 'geosite', target: 'PROXY' },
        { id: 'NETFLIX', label: 'Netflix', tag: 'geosite', target: 'PROXY' },
      ],
      RULE_GROUPS
    );
    // AI 服务组（OPENAI 属于 AI 服务）
    expect(yaml).toContain('AI 服务');
    // 流媒体规则 → 国外媒体（不生成独立流媒体组）
    expect(yaml).toContain('国外媒体');
  });

  it('should generate geo groups for recognized node names', () => {
    const yaml = generateMihomoConfig([
      makeNode({ name: 'HK-01', server: 'hk.example.com' }),
      makeNode({ id: 'n2', name: 'JP-01', protocol: 'vmess', server: 'jp.example.com', uuid: '1111' }),
      makeNode({ id: 'n3', name: 'US-01', protocol: 'trojan', server: 'us.example.com', password: 'p' }),
    ]);
    expect(yaml).toContain('🇭🇰 香港');
    expect(yaml).toContain('🇯🇵 日本');
    expect(yaml).toContain('🇺🇸 美国');
    expect(validateMihomo(yaml)).toBe(true);
  });

  it('should handle Chinese node names', () => {
    const yaml = generateMihomoConfig([
      makeNode({ name: '香港 01', server: 'hk.example.com' }),
      makeNode({ id: 'n2', name: '日本节点', protocol: 'vmess', server: 'jp.example.com', uuid: '1111' }),
    ]);
    expect(yaml).toContain('🇭🇰 香港');
    expect(yaml).toContain('🇯🇵 日本');
  });

  it('should put ungrouped nodes into "其他" group', () => {
    const yaml = generateMihomoConfig([
      makeNode({ name: 'Node-001', server: 'x.example.com' }),
    ]);
    expect(yaml).toContain('其他');
    expect(yaml).toContain('Node-001');
  });
});