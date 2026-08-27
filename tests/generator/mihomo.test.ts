import { describe, it, expect } from 'vitest';
import { generateMihomoConfig, generateProxyGroups, nodeToMihomoProxy, validateMihomo } from '@/generator/mihomo';
import { Node } from '@/models/node';
import { RULE_GROUPS, MetaCubeXRule } from '@/data/metacubex-rules';

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

  it('vless ws + tls 无显式 sni 时用 Host 头兜底作 servername（Cloudflare/CDN 不拒握）', async () => {
    const proxy = nodeToMihomoProxy(
      makeNode({
        tls: true,
        transport: { type: 'ws', path: '/path', host: 'ai.wenb.dpdns.org' },
      })
    );
    expect(proxy.servername).toBe('ai.wenb.dpdns.org');
    expect((proxy['ws-opts'] as Record<string, unknown>).headers).toMatchObject({ Host: 'ai.wenb.dpdns.org' });
  });

  it('vless ws + tls 有显式 sni 时用 sni，不用 Host 覆盖', async () => {
    const proxy = nodeToMihomoProxy(
      makeNode({
        tls: true,
        sni: 'explicit.sni.dev',
        transport: { type: 'ws', path: '/path', host: 'other.host.dev' },
      })
    );
    expect((proxy as Record<string, unknown>).servername).toBe('explicit.sni.dev');
    expect((proxy['ws-opts'] as Record<string, unknown>).headers).toMatchObject({ Host: 'other.host.dev' });
  });

  it('trojan ws + tls 无显式 sni 时用 Host 头兜底作 sni', async () => {
    const proxy = nodeToMihomoProxy(
      makeNode({
        protocol: 'trojan',
        password: 'pw',
        tls: true,
        transport: { type: 'ws', path: '/ws', host: 'tj.example.com' },
      })
    );
    expect((proxy as Record<string, unknown>).sni).toBe('tj.example.com');
    expect((proxy['ws-opts'] as Record<string, unknown>).headers).toMatchObject({ Host: 'tj.example.com' });
  });
});

describe('generateMihomoConfig', () => {
  it('should generate P0 policy groups with explicit defaults', async () => {
    const groups = await generateProxyGroups(
      [makeNode({ name: 'JP-01' }), makeNode({ id: 'n2', name: 'US-01', server: 'us.example.com' })],
      [],
      RULE_GROUPS
    );
    const byName = new Map(groups.map(group => [group.name, group]));

    // V3.1: 核心层(3) + 固化业务层(2) + 条件业务层(0,因无规则) + 兜底层(2) + 地理组
    expect([...byName.keys()]).toEqual(expect.arrayContaining([
      '节点选择', '手动切换', '自动选择',
      '广告拦截', '国外媒体',
      '漏网之鱼', 'GLOBAL',
    ]));
    expect(byName.get('节点选择')?.['default-selected']).toBe('自动选择');
    expect(byName.get('广告拦截')?.['default-selected']).toBe('REJECT');
    expect(byName.get('国外媒体')?.['default-selected']).toBe('自动选择');
    expect(byName.get('GLOBAL')?.['default-selected']).toBe('节点选择'); // V3.1: GLOBAL默认节点选择
    // V3.1+: 国内直连/国内媒体为条件组（勾选国内规则才生成，空规则不生成）
    expect(byName.has('应用净化')).toBe(false);
    expect(byName.has('国内媒体')).toBe(false);
    expect(byName.has('国内直连')).toBe(false);
    for (const name of ['节点选择', '广告拦截', '国外媒体', '漏网之鱼', 'GLOBAL']) {
      const group = byName.get(name);
      expect(group?.proxies).toContain(group?.['default-selected']);
    }
  });

  it('should generate single node config', async () => {
    const yaml = await generateMihomoConfig([makeNode()]);
    expect(yaml).toContain('mixed-port: 7890');
    expect(yaml).toContain('allow-lan: true');
    expect(yaml).toContain('mode: rule');
    expect(yaml).toContain('proxies:');
    expect(yaml).toContain('proxy-groups:');
    // 新分组层级 V3.1
    expect(yaml).toContain('漏网之鱼');
    expect(yaml).toContain('节点选择');
    expect(yaml).toContain('手动切换');
    expect(yaml).toContain('自动选择');
    expect(yaml).toContain('国外媒体');
    expect(yaml).toContain('广告拦截');
    expect(yaml).not.toContain('国内媒体'); // 国内规则 →DIRECT，面板按归类显示，不生成独立组（与 v2.8.1 一致）
    expect(yaml).not.toContain('国内直连'); // 同上
    expect(yaml).not.toContain('应用净化'); // V3.1: 移除
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

  it('国内直连规则保持 RULE-SET,xxx,DIRECT（面板按 →DIRECT 自动归类为「国内直连」，与 v2.8.1 分组方式一致）', async () => {
    const selectedRules: MetaCubeXRule[] = [
      { id: 'CN', label: '中国直连', tag: 'geosite' as const, target: 'DIRECT' as const },
      { id: 'BILIBILI', label: '哔哩哔哩', tag: 'geosite' as const, target: 'DIRECT' as const },
    ];
    const groups = await generateProxyGroups(
      [makeNode({ name: 'JP-01' })],
      selectedRules,
      RULE_GROUPS
    );
    const byName = new Map(groups.map(g => [g.name, g]));
    // v2.8.1 行为：国内直连不生成独立 proxy-group，靠规则 →DIRECT 在面板自动归类
    expect(byName.has('国内直连')).toBe(false);
    expect(byName.has('国内媒体')).toBe(false);
    // 规则层面国内规则保持 →DIRECT（不被改指向组名，否则破坏面板归类）
    const yaml = await generateMihomoConfig([makeNode({ name: 'JP-01' })], undefined, selectedRules, RULE_GROUPS);
    expect(yaml).toContain('RULE-SET,geosite-cn,DIRECT');
    expect(yaml).toContain('RULE-SET,geosite-bilibili,DIRECT');
    expect(yaml).not.toContain('RULE-SET,geosite-cn,国内直连');
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

  it('should enable allow-lan by default (旁路由/局域网设备走 7890)', async () => {
    const yaml = await generateMihomoConfig([makeNode()]);
    expect(yaml).toContain('allow-lan: true');
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
    // AI 服务组（OPENAI 属于 AI 服务） - V3.1: ai 组条件生成
    expect(yaml).toContain('AI 平台'); // V3.1: 名称改为"AI 平台"
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

describe('VLESS + XHTTP 传输层支持（v2.8.x 修复）', () => {
  it('nodeToMihomoProxy 应输出 network: xhttp + xhttp-opts', async () => {
    const proxy = nodeToMihomoProxy(
      makeNode({
        tls: true,
        transport: { type: 'xhttp', path: '/upload', host: 'x.example.com', mode: 'stream-one' },
      })
    );
    expect(proxy.network).toBe('xhttp');
    const xhttpOpts = proxy['xhttp-opts'] as Record<string, unknown>;
    expect(xhttpOpts.path).toBe('/upload');
    expect(xhttpOpts.host).toBe('x.example.com');
    expect(xhttpOpts.mode).toBe('stream-one');
  });

  it('xhttp 节点不应退化为裸 TCP（generateMihomoConfig 全链路）', async () => {
    const yaml = await generateMihomoConfig([
      makeNode({
        name: 'XHTTP-节点',
        transport: { type: 'xhttp', path: '/', host: 'x.example.com' },
      }),
    ]);
    expect(yaml).toContain('network: xhttp');
    expect(yaml).toContain('xhttp-opts');
    expect(yaml).not.toMatch(/XHTTP-节点[\s\S]*?network: tcp/);
  });
});