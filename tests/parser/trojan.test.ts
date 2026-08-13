import { describe, it, expect } from 'vitest';
import { parseTrojan } from '@/parser/trojan.parser';

describe('Trojan parser', () => {
  it('should parse basic trojan link', () => {
    const result = parseTrojan('trojan://password123@example.com:443#TrojanNode');
    expect(result.success).toBe(true);
    expect(result.node?.password).toBe('password123');
    expect(result.node?.server).toBe('example.com');
    expect(result.node?.port).toBe(443);
    expect(result.node?.name).toBe('TrojanNode');
    expect(result.node?.protocol).toBe('trojan');
  });

  it('should parse without name', () => {
    const result = parseTrojan('trojan://pass@example.com:443');
    expect(result.success).toBe(true);
    expect(result.node?.name).toContain('example.com');
  });

  it('should parse sni param', () => {
    const result = parseTrojan('trojan://pass@example.com:443?sni=real.example.com');
    expect(result.node?.sni).toBe('real.example.com');
  });

  it('should parse allowInsecure', () => {
    const result = parseTrojan('trojan://pass@example.com:443?allowInsecure=1');
    expect(result.node?.allowInsecure).toBe(true);
  });

  it('should default tls to true (trojan always tls unless security=none)', () => {
    const result = parseTrojan('trojan://pass@example.com:443');
    expect(result.node?.tls).toBe(true);
  });

  it('should handle security=none', () => {
    const result = parseTrojan('trojan://pass@example.com:443?security=none');
    expect(result.node?.tls).toBe(false);
  });

  it('should fail on missing password', () => {
    const result = parseTrojan('trojan://@example.com:443');
    expect(result.success).toBe(false);
    expect(result.error?.code).toBe('MISSING_PASSWORD');
  });

  it('should fail on missing @ separator', () => {
    const result = parseTrojan('trojan://example.com:443');
    expect(result.success).toBe(false);
  });

  it('should fail on missing port', () => {
    const result = parseTrojan('trojan://pass@example.com');
    expect(result.success).toBe(false);
  });

  it('should handle password with special chars', () => {
    const result = parseTrojan('trojan://p%40ss:word@example.com:443');
    expect(result.success).toBe(true);
  });
});