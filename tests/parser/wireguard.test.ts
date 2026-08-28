import { describe, it, expect } from 'vitest';
import { parseWireguard } from '@/parser/wireguard.parser';

describe('WireGuard parser', () => {
  const privKey = 'eCtXsJZ27+4PbhDkHnB923tkUn2Gj59wZw5wFA75MnU=';
  const pubKey = 'Cr8hWlKvtDt7nrvf+f0brNQQzabAqrjfBvas9pmowjo=';
  const pubKeyEnc = encodeURIComponent(pubKey); // 真实链接中 + 应编码为 %2B

  it('should parse wireguard share link', () => {
    const result = parseWireguard(
      `wireguard://${privKey}@162.159.192.1:2480?ip=172.16.0.2&ipv6=fd01:5ca1&public-key=${pubKeyEnc}&allowed-ips=0.0.0.0/0#MyWG`
    );
    expect(result.success).toBe(true);
    expect(result.node?.protocol).toBe('wireguard');
    expect(result.node?.server).toBe('162.159.192.1');
    expect(result.node?.port).toBe(2480);
    expect(result.node?.wgPrivateKey).toBe(privKey);
    expect(result.node?.wgPublicKey).toBe(pubKey);
    expect(result.node?.wgIp).toBe('172.16.0.2');
    expect(result.node?.wgAllowedIps).toBe('0.0.0.0/0');
    expect(result.node?.name).toBe('MyWG');
  });

  it('should parse wg:// short prefix', () => {
    const result = parseWireguard(
      `wg://${privKey}@10.0.0.1:51820?ip=10.0.0.2#Short`
    );
    expect(result.success).toBe(true);
    expect(result.node?.protocol).toBe('wireguard');
    expect(result.node?.wgPrivateKey).toBe(privKey);
    expect(result.node?.server).toBe('10.0.0.1');
    expect(result.node?.port).toBe(51820);
  });

  it('should parse standard wireguard conf', () => {
    const conf = `[Interface]
PrivateKey = ${privKey}
Address = 172.16.0.2/32

[Peer]
PublicKey = ${pubKey}
AllowedIPs = 0.0.0.0/0
Endpoint = 162.159.192.1:2480`;
    const result = parseWireguard(conf);
    expect(result.success).toBe(true);
    expect(result.node?.protocol).toBe('wireguard');
    expect(result.node?.wgPrivateKey).toBe(privKey);
    expect(result.node?.wgPublicKey).toBe(pubKey);
    expect(result.node?.server).toBe('162.159.192.1');
    expect(result.node?.port).toBe(2480);
    expect(result.node?.wgIp).toBe('172.16.0.2');
  });

  it('should parse reserved as array', () => {
    const result = parseWireguard(
      `wireguard://${privKey}@10.0.0.1:51820?reserved=209,98,59#Reserved`
    );
    expect(result.success).toBe(true);
    expect(result.node?.wgReserved).toEqual([209, 98, 59]);
  });

  it('should fail on missing private-key', () => {
    const result = parseWireguard('wireguard://@10.0.0.1:51820');
    expect(result.success).toBe(false);
  });

  it('should fail on missing @', () => {
    const result = parseWireguard('wireguard://privkey10.0.0.1:51820');
    expect(result.success).toBe(false);
  });
});
