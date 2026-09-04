import { describe, it, expect } from 'vitest';
import { generateShadowrocketConfig, nodeToShadowrocketProxy, validateShadowrocket } from '@/generator/shadowrocket';
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

describe('nodeToShadowrocketProxy', () => {
  it('should convert vless reality node', () => {
    const node = makeNode({ pbk: 'pubkey', sid: 'sid123', sni: 'real.com' });
    const line = nodeToShadowrocketProxy(node);
    expect(line).toContain('type=vless');
    expect(line).toContain('server=jp.example.com');
    expect(line).toContain('port=443');
    expect(line).toContain('security=reality');
    expect(line).toContain('password=550e8400');
    expect(line).toContain('sni=real.com');
  });

  it('should convert vless ws node', () => {
    const node = makeNode({
      transport: { type: 'ws', path: '/ws', host: 'cdn.example.com' },
    });
    const line = nodeToShadowrocketProxy(node);
    expect(line).toContain('obfs=websocket');
    expect(line).toContain('path=/ws');
    expect(line).toContain('host=cdn.example.com');
  });

  it('should convert vmess node', () => {
    const node = makeNode({ protocol: 'vmess', uuid: 'uuid1', transport: { type: 'ws', path: '/v' } });
    const line = nodeToShadowrocketProxy(node);
    expect(line).toContain('type=vmess');
    expect(line).toContain('username=uuid1');
    expect(line).toContain('obfs=websocket');
    expect(line).toContain('path=/v');
  });

  it('should convert trojan node', () => {
    const node = makeNode({ protocol: 'trojan', password: 'trpw', sni: 't.com', allowInsecure: true });
    const line = nodeToShadowrocketProxy(node);
    expect(line).toContain('type=trojan');
    expect(line).toContain('password=trpw');
    expect(line).toContain('sni=t.com');
    expect(line).toContain('skip-cert-verify=true');
  });

  it('should convert ss node', () => {
    const node = makeNode({
      protocol: 'ss',
      password: 'sspw',
      metadata: { source: 'test', originalName: 'SS', tags: ['chacha20-ietf-poly1305'] },
    });
    const line = nodeToShadowrocketProxy(node);
    expect(line).toContain('type=ss');
    expect(line).toContain('method=chacha20-ietf-poly1305');
    expect(line).toContain('password=sspw');
  });

  it('should convert hysteria2 node', () => {
    const node = makeNode({
      protocol: 'hysteria2',
      password: 'hy2pw',
      sni: 'hy.com',
      allowInsecure: true,
      obfs: 'salamander',
      obfsPassword: 'obfspw',
      ports: '443-8443',
    });
    const line = nodeToShadowrocketProxy(node);
    expect(line).toContain('type=hysteria2');
    expect(line).toContain('password=hy2pw');
    expect(line).toContain('sni=hy.com');
    expect(line).toContain('skip-cert-verify=true');
    expect(line).toContain('obfs-type=salamander');
    expect(line).toContain('obfs-password=obfspw');
    expect(line).toContain('port-hopping=443-8443');
  });

  it('should convert tuic v5 node', () => {
    const node = makeNode({
      protocol: 'tuic',
      uuid: 'tuic-uuid',
      password: 'tuic-pw',
      sni: 'tuic.com',
      congestionController: 'bbr',
      disableSni: true,
      fastOpen: true,
    });
    const line = nodeToShadowrocketProxy(node);
    expect(line).toContain('type=tuic');
    expect(line).toContain('uuid=tuic-uuid');
    expect(line).toContain('password=tuic-pw');
    expect(line).toContain('congestion=bbr');
    expect(line).toContain('disable-sni=true');
    expect(line).toContain('fast-open=true');
  });

  it('should convert wireguard node', () => {
    const node = makeNode({
      protocol: 'wireguard',
      wgPrivateKey: 'wgpriv',
      wgPublicKey: 'wgpub',
      wgIp: '10.0.0.2',
      wgMtu: 1400,
    });
    const line = nodeToShadowrocketProxy(node);
    expect(line).toContain('type=wireguard');
    expect(line).toContain('private-key=wgpriv');
    expect(line).toContain('peer-public-key=wgpub');
    expect(line).toContain('local-address=10.0.0.2');
    expect(line).toContain('mtu=1400');
  });

  it('should skip unsupported protocols', () => {
    const line = nodeToShadowrocketProxy(makeNode({ protocol: 'ssr' }));
    expect(line).toBeNull();
  });
});

describe('generateShadowrocketConfig', () => {
  it('should generate valid config', () => {
    const config = generateShadowrocketConfig([makeNode()]);
    expect(validateShadowrocket(config)).toBe(true);
    expect(config).toContain('[Proxy]');
    expect(config).not.toContain('[Rule]');
  });

  it('should include all node proxies', () => {
    const config = generateShadowrocketConfig([
      makeNode({ name: 'A' }),
      makeNode({ name: 'B', protocol: 'vmess', metadata: { source: 'test', originalName: 'B', tags: [] } }),
    ]);
    expect(config).toContain('A');
    expect(config).toContain('B');
  });

  it('should not include rules section (node-only)', () => {
    const config = generateShadowrocketConfig([makeNode()]);
    expect(config).not.toContain('RULE-SET');
    expect(config).not.toContain('GEOIP');
    expect(config).not.toContain('FINAL');
  });
});
