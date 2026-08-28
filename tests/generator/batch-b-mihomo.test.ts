import { describe, it, expect } from 'vitest';
import { nodeToMihomoProxy } from '@/generator/mihomo';
import { Node } from '@/models/node';

describe('nodeToMihomoProxy - Batch B protocols', () => {
  function makeNode(overrides: Partial<Node> = {}): Node {
    return {
      id: 'n1',
      name: 'Test-Node',
      protocol: 'hysteria2',
      server: 'example.com',
      port: 443,
      metadata: { source: 'test', originalName: 'Test-Node', tags: [] },
      version: 1,
      ...overrides,
    } as Node;
  }

  it('should convert hysteria2 node', () => {
    const proxy = nodeToMihomoProxy(
      makeNode({
        protocol: 'hysteria2',
        password: 'pass',
        ports: '443-8443',
        up: '30',
        down: '200',
        obfs: 'salamander',
        obfsPassword: 'obfssec',
        sni: 'example.com',
      })
    );
    expect(proxy.type).toBe('hysteria2');
    expect(proxy.password).toBe('pass');
    expect(proxy.ports).toBe('443-8443');
    expect(proxy.up).toBe('30');
    expect(proxy.down).toBe('200');
    expect(proxy.obfs).toBe('salamander');
    expect(proxy['obfs-password']).toBe('obfssec');
    expect(proxy.sni).toBe('example.com');
  });

  it('should convert tuic V5 node', () => {
    const proxy = nodeToMihomoProxy(
      makeNode({
        protocol: 'tuic',
        uuid: '00000000-0000-0000-0000-000000000001',
        password: 'pass',
        sni: 'example.com',
        udpRelayMode: 'native',
        congestionController: 'bbr',
        alpn: ['h3'],
      })
    );
    expect(proxy.type).toBe('tuic');
    expect(proxy.uuid).toBe('00000000-0000-0000-0000-000000000001');
    expect(proxy.password).toBe('pass');
    expect(proxy['udp-relay-mode']).toBe('native');
    expect(proxy['congestion-controller']).toBe('bbr');
    expect(proxy.alpn).toEqual(['h3']);
    expect(proxy.token).toBeUndefined();
  });

  it('should convert tuic V4 node', () => {
    const proxy = nodeToMihomoProxy(
      makeNode({
        protocol: 'tuic',
        token: 'mytoken',
        sni: 'example.com',
      })
    );
    expect(proxy.type).toBe('tuic');
    expect(proxy.token).toBe('mytoken');
    expect(proxy.uuid).toBeUndefined();
  });

  it('should convert wireguard node', () => {
    const proxy = nodeToMihomoProxy(
      makeNode({
        protocol: 'wireguard',
        wgPrivateKey: 'privkey=',
        wgPublicKey: 'pubkey=',
        wgIp: '172.16.0.2',
        wgAllowedIps: '0.0.0.0/0',
        wgMtu: 1408,
      })
    );
    expect(proxy.type).toBe('wireguard');
    expect(proxy['private-key']).toBe('privkey=');
    expect(proxy.ip).toBe('172.16.0.2');
    expect(proxy['allowed-ips']).toEqual(['0.0.0.0/0']);
    expect(proxy.udp).toBe(true);
    expect(proxy.mtu).toBe(1408);
  });

  it('should convert anytls node', () => {
    const proxy = nodeToMihomoProxy(
      makeNode({
        protocol: 'anytls',
        password: 'pass',
        sni: 'example.com',
        idleSessionCheckInterval: 30,
        minIdleSession: 0,
      })
    );
    expect(proxy.type).toBe('anytls');
    expect(proxy.password).toBe('pass');
    expect(proxy.sni).toBe('example.com');
    expect(proxy['idle-session-check-interval']).toBe(30);
    expect(proxy['min-idle-session']).toBe(0);
  });
});
