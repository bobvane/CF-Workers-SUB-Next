import { describe, it, expect } from 'vitest';
import { parseShadowsocks } from '@/parser/shadowsocks.parser';

describe('Shadowsocks parser', () => {
  it('should parse SIP002 userinfo format', () => {
    const result = parseShadowsocks('ss://aes-256-gcm:password@example.com:8388#SSNode');
    expect(result.success).toBe(true);
    expect(result.node?.server).toBe('example.com');
    expect(result.node?.port).toBe(8388);
    expect(result.node?.password).toBe('password');
    expect(result.node?.name).toBe('SSNode');
    expect(result.node?.protocol).toBe('ss');
  });

  it('should parse base64 format', () => {
    // base64(method:password@host:port) = aes-256-gcm:pass@example.com:8388
    const encoded = btoa('aes-256-gcm:pass@example.com:8388');
    const result = parseShadowsocks(`ss://${encoded}`);
    expect(result.success).toBe(true);
    expect(result.node?.server).toBe('example.com');
    expect(result.node?.port).toBe(8388);
    expect(result.node?.password).toBe('pass');
  });

  it('should store method in metadata tags', () => {
    const result = parseShadowsocks('ss://aes-256-gcm:password@example.com:8388');
    expect(result.node?.metadata.tags).toContain('aes-256-gcm');
  });

  it('should parse plugin param', () => {
    const result = parseShadowsocks(
      'ss://aes-256-gcm:password@example.com:8388?plugin=v2ray-plugin'
    );
    expect(result.node?.plugin).toBe('v2ray-plugin');
  });

  it('should decode percent-encoded password', () => {
    const result = parseShadowsocks('ss://aes-256-gcm:pass%40word@example.com:8388');
    expect(result.node?.password).toBe('pass@word');
  });

  it('should fail on empty payload', () => {
    const result = parseShadowsocks('ss://');
    expect(result.success).toBe(false);
  });

  it('should fail on missing server', () => {
    const result = parseShadowsocks('ss://aes-256-gcm:pass@:8388');
    expect(result.success).toBe(false);
  });

  it('should fail on invalid base64', () => {
    const result = parseShadowsocks('ss://!!invalid!!');
    expect(result.success).toBe(false);
  });

  it('should fail on missing method', () => {
    const result = parseShadowsocks('ss://:pass@example.com:8388');
    expect(result.success).toBe(false);
  });

  it('should fail on missing password', () => {
    const result = parseShadowsocks('ss://aes-256-gcm:@example.com:8388');
    expect(result.success).toBe(false);
  });

  it('should handle name via fragment', () => {
    const result = parseShadowsocks(
      'ss://aes-256-gcm:pass@example.com:8388#Hong%20Kong%20Node'
    );
    expect(result.success).toBe(true);
    expect(result.node?.name).toBe('Hong Kong Node');
  });
});