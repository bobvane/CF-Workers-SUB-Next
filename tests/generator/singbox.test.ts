import { describe, it, expect } from 'vitest';
import {
  generateSingboxConfig,
  nodeToSingboxOutbound,
  validateSingbox,
} from '@/generator/singbox';
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

describe('nodeToSingboxOutbound', () => {
  it('should convert vless node', () => {
    const out = nodeToSingboxOutbound(makeNode());
    expect(out).not.toBeNull();
    expect(out!.type).toBe('vless');
    expect(out!.tag).toBe('JP-01');
    expect(out!.server).toBe('jp.example.com');
    expect(out!.server_port).toBe(443);
    expect(out!.uuid).toBe('550e8400-e29b-41d4-a716-446655440000');
    expect((out!.tls as Record<string, unknown>).enabled).toBe(true);
  });

  it('should convert vmess with ws transport', () => {
    const out = nodeToSingboxOutbound(
      makeNode({
        protocol: 'vmess',
        transport: { type: 'ws', path: '/ws', host: 'cdn.example.com' },
      })
    );
    expect(out).not.toBeNull();
    expect(out!.type).toBe('vmess');
    expect((out!.transport as Record<string, unknown>).type).toBe('ws');
  });

  it('should convert trojan with tls and insecure', () => {
    const out = nodeToSingboxOutbound(
      makeNode({ protocol: 'trojan', password: 'pw', allowInsecure: true })
    );
    expect(out).not.toBeNull();
    expect(out!.type).toBe('trojan');
    expect(out!.password).toBe('pw');
    expect((out!.tls as Record<string, unknown>).insecure).toBe(true);
  });

  it('should convert ss with method', () => {
    const out = nodeToSingboxOutbound(
      makeNode({
        protocol: 'ss',
        password: 'p',
        metadata: { source: 'test', originalName: 'SS', tags: ['chacha20-ietf-poly1305'] },
      })
    );
    expect(out).not.toBeNull();
    expect(out!.type).toBe('ss');
    expect(out!.method).toBe('chacha20-ietf-poly1305');
    expect(out!.password).toBe('p');
  });

  it('should include reality tls config', () => {
    const out = nodeToSingboxOutbound(
      makeNode({ pbk: 'pubkey', sid: 'sid123', sni: 'real.com' })
    );
    expect(out).not.toBeNull();
    const tls = out!.tls as Record<string, unknown>;
    expect(tls.reality).toBeTruthy();
    expect((tls.reality as Record<string, unknown>).public_key).toBe('pubkey');
  });

  it('should convert hysteria2 node', () => {
    const node = makeNode({
      protocol: 'hysteria2',
      password: 'hy2pw',
      sni: 'hy.example.com',
      allowInsecure: true,
      ports: '443-8443',
      obfs: 'salamander',
      obfsPassword: 'obfspw',
    });
    const out = nodeToSingboxOutbound(node);
    expect(out).not.toBeNull();
    expect(out!.type).toBe('hysteria2');
    expect(out!.password).toBe('hy2pw');
    expect(out!.ports).toBe('443-8443');
    expect(out!.sni).toBe('hy.example.com');
    expect(out!.insecure).toBe(true);
    const obfs = out!.obfs as Record<string, unknown>;
    expect(obfs?.type).toBe('salamander');
    expect(obfs?.password).toBe('obfspw');
  });

  it('should convert tuic node', () => {
    const node = makeNode({
      protocol: 'tuic',
      uuid: 'uuid1',
      password: 'pw1',
      sni: 'tuic.example.com',
      congestionController: 'bbr',
      disableSni: true,
      fastOpen: true,
    });
    const out = nodeToSingboxOutbound(node);
    expect(out).not.toBeNull();
    expect(out!.type).toBe('tuic');
    expect(out!.uuid).toBe('uuid1');
    expect(out!.password).toBe('pw1');
    expect(out!.congestion_control).toBe('bbr');
    expect(out!.disable_sni).toBe(true);
    expect(out!.fast_open).toBe(true);
  });

  it('should convert wireguard node', () => {
    const node = makeNode({
      protocol: 'wireguard',
      wgPrivateKey: 'wgpriv',
      wgPublicKey: 'wgpub',
      wgIp: '10.0.0.2',
      wgIpv6: 'fd00::2',
      wgMtu: 1400,
    });
    const out = nodeToSingboxOutbound(node);
    expect(out).not.toBeNull();
    expect(out!.type).toBe('wireguard');
    expect(out!.private_key).toBe('wgpriv');
    expect(out!.peer_public_key).toBe('wgpub');
    expect(out!.local_address).toContain('10.0.0.2');
    expect(out!.local_address).toContain('fd00::2');
    expect(out!.mtu).toBe(1400);
  });

  it('should convert anytls node', () => {
    const node = makeNode({
      protocol: 'anytls',
      password: 'apw',
      sni: 'anytls.example.com',
      clientMetadata: 'cmd',
      idleSessionCheckInterval: 30,
    });
    const out = nodeToSingboxOutbound(node);
    expect(out).not.toBeNull();
    expect(out!.type).toBe('anytls');
    expect(out!.password).toBe('apw');
    expect(out!.sni).toBe('anytls.example.com');
    expect(out!.client_metadata).toBe('cmd');
    expect(out!.idle_session_check_interval).toBe(30);
  });
});

describe('generateSingboxConfig', () => {
  it('should generate valid JSON with outbounds', () => {
    const json = generateSingboxConfig([makeNode()]);
    expect(validateSingbox(json)).toBe(true);
    const parsed = JSON.parse(json);
    expect(Array.isArray(parsed.outbounds)).toBe(true);
  });

  it('should include standard outbounds', () => {
    const json = generateSingboxConfig([makeNode()]);
    const parsed = JSON.parse(json);
    const tags = parsed.outbounds.map((o: Record<string, unknown>) => o.tag);
    expect(tags).toContain('direct');
    expect(tags).not.toContain('block');
    expect(tags).toContain('proxy');
    expect(tags).toContain('auto');
  });

  it('should include node outbound', () => {
    const json = generateSingboxConfig([makeNode({ name: 'JP-01' })]);
    const parsed = JSON.parse(json);
    const tags = parsed.outbounds.map((o: Record<string, unknown>) => o.tag);
    expect(tags).toContain('JP-01');
  });

  it('should include route final proxy', () => {
    const json = generateSingboxConfig([makeNode()]);
    const parsed = JSON.parse(json);
    expect(parsed.route.final).toBe('proxy');
  });

  it('should handle empty node list', () => {
    const json = generateSingboxConfig([]);
    expect(validateSingbox(json)).toBe(true);
    const parsed = JSON.parse(json);
    const tags = parsed.outbounds.map((o: Record<string, unknown>) => o.tag);
    expect(tags).toContain('direct');
  });

  it('should be pretty-printed JSON', () => {
    const json = generateSingboxConfig([makeNode()]);
    expect(json).toContain('\n');
    expect(json).toContain('  "log"');
  });

  it('should skip ssr protocol nodes', () => {
    const json = generateSingboxConfig([makeNode({ protocol: 'ssr' }), makeNode({ name: 'A' })]);
    const parsed = JSON.parse(json);
    const tags = parsed.outbounds.map((o: Record<string, unknown>) => o.tag);
    expect(tags).not.toContain('ssr');
    expect(tags).toContain('A');
  });
});
