import { describe, it, expect } from 'vitest';
import { parseAnytls } from '@/parser/anytls.parser';

describe('AnyTLS parser', () => {
  it('should parse basic anytls link', () => {
    const result = parseAnytls(
      'anytls://pass123@example.com:443?sni=example.com&alpn=h2#MyAny'
    );
    expect(result.success).toBe(true);
    expect(result.node?.protocol).toBe('anytls');
    expect(result.node?.server).toBe('example.com');
    expect(result.node?.port).toBe(443);
    expect(result.node?.password).toBe('pass123');
    expect(result.node?.sni).toBe('example.com');
    expect(result.node?.name).toBe('MyAny');
  });

  it('should parse insecure flag', () => {
    const result = parseAnytls(
      'anytls://pass@example.com:443?insecure=1#Insecure'
    );
    expect(result.success).toBe(true);
    expect(result.node?.allowInsecure).toBe(true);
  });

  it('should parse alpn array', () => {
    const result = parseAnytls(
      'anytls://pass@example.com:443?alpn=h2,http/1.1#Alpn'
    );
    expect(result.success).toBe(true);
    expect(result.node?.alpn).toEqual(['h2', 'http/1.1']);
  });

  it('should fail on missing password', () => {
    const result = parseAnytls('anytls://@example.com:443');
    expect(result.success).toBe(false);
  });
});
