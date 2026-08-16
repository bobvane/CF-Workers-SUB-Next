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
  it('should convert vless node', async () => {
    const proxy = nodeToMihomoProxy(makeNode());
    expect(proxy.name).toBe('JP-01');
    expect(proxy.type).toBe('vless');
    expect(proxy.server).toBe('jp.example.com');
    expect(proxy.port).toBe(443);
    expect(proxy.uuid).toBe('550e8400-e29b-41d4-a716-446655440000');
    expect(proxy.tls).toBe(true);
  });

  it('should convert vmess node with ws transport', async () => {
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

  it('should convert trojan node', async () => {
    const proxy = nodeToMihomoProxy(
      makeNode({ protocol: 'trojan', password: 'pass123' })
    );
    expect(proxy.type).toBe('trojan');
    expect(proxy.password).toBe('pass123');
  });

  it('should convert ss node with cipher from tags', async () => {
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

  it('should convert vless with reality params', async () => {
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
  it('should generate single node config', async () => {
    const yaml = await generateMihomoConfig([makeNode()]);
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

  it('should generate multiple proxies', async () => {
    const yaml = await generateMihomoConfig([
      makeNode({ name: 'JP-01' }),
      makeNode({ id: 'n2', name: 'US-01', server: 'us.example.com' }),
    ]);
    expect(yaml).toContain('JP-01');
    expect(yaml).toContain('US-01');
  });

  it('should be valid YAML with proxies array', async () => {
    const yaml = await generateMihomoConfig([makeNode()]);
    expect(validateMihomo(yaml)).toBe(true);
  });

  it('should include proxy groups with correct structure', async () => {
    const yaml = await generateMihomoConfig([makeNode({ name: 'JP-01' })]);
    expect(yaml).toContain('漏网之鱼');
    expect(yaml).toContain('节点选择');
    expect(yaml).toContain('自动选择');
    expect(yaml).toContain('GLOBAL');
  });

  it('should not enable allow-lan by default (security)', async () => {
    const yaml = await generateMihomoConfig([makeNode()]);
    expect(yaml).toContain('allow-lan: false');
  });

  it('should support custom template', async () => {
    const yaml = await generateMihomoConfig([makeNode()], {
      mixedPort: 1080,
      allowLan: true,
      logLevel: 'debug',
    });
    expect(yaml).toContain('mixed-port: 1080');
    expect(yaml).toContain('allow-lan: true');
    expect(yaml).toContain('log-level: debug');
  });

  it('should handle empty node list', async () => {
    const yaml = await generateMihomoConfig([]);
    expect(yaml).toContain('proxies: []');
    expect(validateMihomo(yaml)).toBe(true);
  });

  it('should generate rule-class groups when rules selected', async () => {
    const yaml = await generateMihomoConfig(
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

  it('should generate geo groups for recognized node names', async () => {
    const yaml = await generateMihomoConfig([
      makeNode({ name: 'HK-01', server: 'hk.example.com' }),
      makeNode({ id: 'n2', name: 'JP-01', protocol: 'vmess', server: 'jp.example.com', uuid: '1111' }),
      makeNode({ id: 'n3', name: 'US-01', protocol: 'trojan', server: 'us.example.com', password: 'p' }),
    ]);
    expect(yaml).toContain('🇭🇰 香港');
    expect(yaml).toContain('🇯🇵 日本');
    expect(yaml).toContain('🇺🇸 美国');
    expect(validateMihomo(yaml)).toBe(true);
  });

  it('should handle Chinese node names', async () => {
    const yaml = await generateMihomoConfig([
      makeNode({ name: '香港 01', server: 'hk.example.com' }),
      makeNode({ id: 'n2', name: '日本节点', protocol: 'vmess', server: 'jp.example.com', uuid: '1111' }),
    ]);
    expect(yaml).toContain('🇭🇰 香港');
    expect(yaml).toContain('🇯🇵 日本');
  });

  it('should put ungrouped nodes into "其他" group', async () => {
    const yaml = await generateMihomoConfig([
      makeNode({ name: 'Node-001', server: 'x.example.com' }),
    ]);
    expect(yaml).toContain('其他');
    expect(yaml).toContain('Node-001');
  });

  // —— 地理识别增强（2026-08-17）——

  it('should recognize HK via emoji flag 🇭🇰 (airport triple-code node names)', async () => {
    const yaml = await generateMihomoConfig([
      makeNode({ name: '🇭🇰 移动-HKG-01', server: 'hk1.example.com' }),
      makeNode({ id: 'n2', name: '🇭🇰 移动-HKG-02', protocol: 'vmess', server: 'hk2.example.com', uuid: '2222' }),
      makeNode({ id: 'n3', name: '🇭🇰 移动-HKG-03', protocol: 'trojan', server: 'hk3.example.com', password: 'p' }),
    ]);
    expect(yaml).toContain('🇭🇰 香港');
    // 香港节点不应落进"其他"
    expect(yaml).not.toContain('其他');
  });

  it('should recognize triple-code IATA (HKG/LAX/SIN) even without emoji', async () => {
    const yaml = await generateMihomoConfig([
      makeNode({ name: '移动-HKG-01', server: 'hk1.example.com' }),
      makeNode({ id: 'n2', name: '联通-LAX-01', protocol: 'vmess', server: 'us.example.com', uuid: '2222' }),
      makeNode({ id: 'n3', name: '电信-SIN-01', protocol: 'trojan', server: 'sg.example.com', password: 'p' }),
    ]);
    expect(yaml).toContain('🇭🇰 香港');
    expect(yaml).toContain('🇺🇸 美国');
    expect(yaml).toContain('🇸🇬 新加坡');
    expect(yaml).not.toContain('其他');
  });

  it('should not mis-match two-letter code inside triple-code (no false HKG→HK→香港-Japan)', async () => {
    // HKG 里含 HK，但应通过三字码归香港；SIN 里不是 SG
    const yaml = await generateMihomoConfig([
      makeNode({ name: '移动-HKG-01', server: 'hk1.example.com' }),
    ]);
    // HKG(香港) 不应被二字码误判为其它地区；应该命中三字码 → 香港
    expect(yaml).toContain('🇭🇰 香港');
  });

  it('should use IP geo resolver as fallback for name-unrecognizable nodes', async () => {
    const ipResolver = async (server: string): Promise<string | null> => {
      if (server.includes('hongkong')) return '🇭🇰 香港';
      return null;
    };
    const yaml = await generateMihomoConfig(
      [
        makeNode({ name: '移动-01', server: 'hk-hongkong.example.com' }),
        makeNode({ id: 'n2', name: '不可识别-02', server: 'unknown.example.com' }),
      ],
      undefined,
      [],
      [],
      ipResolver
    );
    // 移动-01 通过 IP 兜底归香港
    expect(yaml).toContain('🇭🇰 香港');
    // 不可识别-02 仍落"其他"
    expect(yaml).toContain('其他');
  });
});