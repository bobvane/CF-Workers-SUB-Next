import { describe, it, expect } from 'vitest';
import { parseTuic } from '@/parser/tuic.parser';

describe('TUIC parser', () => {
  const uuid = '00000000-0000-0000-0000-000000000001';

  it('should parse TUIC V5 link (uuid:password)', () => {
    const result = parseTuic(
      `tuic://${uuid}:mypass@example.com:10443?sni=example.com&alpn=h3#MyTuic`
    );
    expect(result.success).toBe(true);
    expect(result.node?.protocol).toBe('tuic');
    expect(result.node?.server).toBe('example.com');
    expect(result.node?.port).toBe(10443);
    expect(result.node?.uuid).toBe(uuid);
    expect(result.node?.password).toBe('mypass');
    expect(result.node?.sni).toBe('example.com');
    expect(result.node?.name).toBe('MyTuic');
  });

  it('should parse TUIC V4 link (token)', () => {
    const result = parseTuic(
      `tuic://mytoken@example.com:10443?sni=example.com#TuicV4`
    );
    expect(result.success).toBe(true);
    expect(result.node?.protocol).toBe('tuic');
    expect(result.node?.token).toBe('mytoken');
    expect(result.node?.uuid).toBeUndefined();
    expect(result.node?.password).toBeUndefined();
  });

  it('should parse udp-relay-mode', () => {
    const result = parseTuic(
      `tuic://${uuid}:pass@example.com:443?udp-relay-mode=native#Udp`
    );
    expect(result.success).toBe(true);
    expect(result.node?.udpRelayMode).toBe('native');
  });

  it('should parse congestion-controller', () => {
    const result = parseTuic(
      `tuic://${uuid}:pass@example.com:443?congestion-controller=bbr#CC`
    );
    expect(result.success).toBe(true);
    expect(result.node?.congestionController).toBe('bbr');
  });

  it('should parse disable-sni and reduce-rtt', () => {
    const result = parseTuic(
      `tuic://${uuid}:pass@example.com:443?disable-sni=1&reduce-rtt=1#Flags`
    );
    expect(result.success).toBe(true);
    expect(result.node?.disableSni).toBe(true);
    expect(result.node?.reduceRtt).toBe(true);
  });

  it('should fail on missing @', () => {
    const result = parseTuic('tuic://uuid:pass:example.com:443');
    expect(result.success).toBe(false);
  });
});
