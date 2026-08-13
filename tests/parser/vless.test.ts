import { describe, it, expect } from 'vitest';
import { parseVless } from '@/parser/vless.parser';

describe('VLESS parser', () => {
  const uuid = '550e8400-e29b-41d4-a716-446655440000';
  const basic = `vless://${uuid}@example.com:443#MyNode`;

  it('should parse basic vless link', () => {
    const result = parseVless(basic);
    expect(result.success).toBe(true);
    expect(result.node?.uuid).toBe(uuid);
    expect(result.node?.server).toBe('example.com');
    expect(result.node?.port).toBe(443);
    expect(result.node?.name).toBe('MyNode');
  });

  it('should parse without fragment', () => {
    const result = parseVless(`vless://${uuid}@example.com:443`);
    expect(result.success).toBe(true);
    expect(result.node?.name).toContain('example.com');
  });

  it('should parse tls security', () => {
    const result = parseVless(`vless://${uuid}@example.com:443?security=tls`);
    expect(result.node?.tls).toBe(true);
  });

  it('should parse reality params', () => {
    const result = parseVless(
      `vless://${uuid}@example.com:443?security=reality&flow=xtls-rprx-vision&pbk=testpbk&sid=abc&sni=example.com`
    );
    expect(result.node?.tls).toBe(true);
    expect(result.node?.flow).toBe('xtls-rprx-vision');
    expect(result.node?.pbk).toBe('testpbk');
    expect(result.node?.sid).toBe('abc');
    expect(result.node?.sni).toBe('example.com');
  });

  it('should parse ws transport with path and host', () => {
    const result = parseVless(
      `vless://${uuid}@example.com:443?type=ws&path=%2Fws&host=cdn.example.com&security=tls`
    );
    expect(result.node?.transport?.type).toBe('ws');
    expect(result.node?.transport?.path).toBe('/ws');
    expect(result.node?.transport?.host).toBe('cdn.example.com');
  });

  it('should parse grpc transport', () => {
    const result = parseVless(`vless://${uuid}@example.com:443?type=grpc&security=tls`);
    expect(result.node?.transport?.type).toBe('grpc');
  });

  it('should default to tcp transport', () => {
    const result = parseVless(`vless://${uuid}@example.com:443`);
    expect(result.node?.transport?.type).toBe('tcp');
  });

  it('should parse IPv6 host', () => {
    const result = parseVless(`vless://${uuid}@[::1]:443`);
    expect(result.node?.server).toBe('::1');
    expect(result.node?.port).toBe(443);
  });

  it('should fail on missing uuid', () => {
    const result = parseVless('vless://@example.com:443');
    expect(result.success).toBe(false);
    expect(result.error?.code).toBe('MISSING_UUID');
  });

  it('should fail on missing @ separator', () => {
    const result = parseVless('vless://example.com:443');
    expect(result.success).toBe(false);
  });

  it('should fail on missing server', () => {
    const result = parseVless(`vless://${uuid}@:443`);
    expect(result.success).toBe(false);
  });

  it('should handle name with URL encoding', () => {
    const result = parseVless(`vless://${uuid}@example.com:443#Tokyo%20JP%20%F0%9F%87%AF%F0%9F%87%B5`);
    expect(result.success).toBe(true);
    expect(result.node?.name).toContain('Tokyo');
  });
});