import { describe, it, expect } from 'vitest';
import { parseShadowsocksR } from '@/parser/shadowsocksr.parser';

/** URL-safe Base64（SSR 链接体标准） */
function urlSafeB64(s: string): string {
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** 构造标准 ssr:// 链接 */
function buildSsrUrl(opts: {
  server?: string;
  port?: number;
  protocol?: string;
  method?: string;
  obfs?: string;
  password?: string;
  remarks?: string;
  group?: string;
  obfsparam?: string;
  protoparam?: string;
} = {}): string {
  const {
    server = '1.2.3.4',
    port = 8388,
    protocol = 'auth_aes128_md5',
    method = 'aes-128-ctr',
    obfs = 'http_simple',
    password = 'pass',
    remarks,
    group,
    obfsparam,
    protoparam,
  } = opts;

  const core = `${server}:${port}:${protocol}:${method}:${obfs}:${urlSafeB64(password)}`;
  const params: string[] = [];
  if (obfsparam) params.push(`obfsparam=${urlSafeB64(obfsparam)}`);
  if (protoparam) params.push(`protoparam=${urlSafeB64(protoparam)}`);
  if (remarks) params.push(`remarks=${urlSafeB64(remarks)}`);
  if (group) params.push(`group=${urlSafeB64(group)}`);
  const body = params.length ? `${core}?${params.join('&')}` : core;
  return `ssr://${urlSafeB64(body)}`;
}

describe('ShadowsocksR parser', () => {
  it('should parse basic SSR link', () => {
    const result = parseShadowsocksR(buildSsrUrl());
    expect(result.success).toBe(true);
    expect(result.node?.server).toBe('1.2.3.4');
    expect(result.node?.port).toBe(8388);
    expect(result.node?.protocol).toBe('ssr');
    expect(result.node?.password).toBe('pass');
    expect(result.node?.username).toBe('aes-128-ctr');
    expect(result.node?.obfs).toBe('http_simple');
    expect(result.node?.ssrProtocol).toBe('auth_aes128_md5');
  });

  it('should parse remarks into name', () => {
    const result = parseShadowsocksR(buildSsrUrl({ remarks: 'SSR Node' }));
    expect(result.node?.name).toBe('SSR Node');
    expect(result.node?.metadata.originalName).toBe('SSR Node');
  });

  it('should parse group / obfsparam / protoparam', () => {
    const result = parseShadowsocksR(
      buildSsrUrl({ group: 'MyGroup', obfsparam: 'tls1.2_ticket_auth_compatible', protoparam: '64' })
    );
    expect(result.node?.ssrGroup).toBe('MyGroup');
    expect(result.node?.ssrObfsParam).toBe('tls1.2_ticket_auth_compatible');
    expect(result.node?.ssrProtocolParam).toBe('64');
  });

  it('should store method in metadata tags', () => {
    const result = parseShadowsocksR(buildSsrUrl());
    expect(result.node?.metadata.tags).toContain('aes-128-ctr');
  });

  it('should preserve originalUrl', () => {
    const url = buildSsrUrl({ remarks: 'Keep' });
    const result = parseShadowsocksR(url);
    expect(result.node?.metadata.originalUrl).toBe(url);
  });

  it('should handle IPv6 host', () => {
    const result = parseShadowsocksR(buildSsrUrl({ server: '[2001:db8::1]' }));
    expect(result.success).toBe(true);
    expect(result.node?.server).toBe('[2001:db8::1]');
  });

  it('should handle plaintext password', () => {
    // password 非 base64 时回退原文
    const core = '1.2.3.4:8388:origin:rc4-md5:plain:plainpass';
    const result = parseShadowsocksR(`ssr://${urlSafeB64(core)}`);
    expect(result.success).toBe(true);
    expect(result.node?.password).toBe('plainpass');
    expect(result.node?.ssrProtocol).toBe('origin');
    expect(result.node?.obfs).toBe('plain');
  });

  it('should default name to server:port', () => {
    const result = parseShadowsocksR(buildSsrUrl());
    expect(result.node?.name).toBe('1.2.3.4:8388');
  });

  it('should fail on empty payload', () => {
    const result = parseShadowsocksR('ssr://');
    expect(result.success).toBe(false);
  });

  it('should fail on invalid base64', () => {
    const result = parseShadowsocksR('ssr://!!not-base64!!');
    expect(result.success).toBe(false);
  });

  it('should fail on missing fields', () => {
    const result = parseShadowsocksR(`ssr://${urlSafeB64('1.2.3.4:8388:origin')}`);
    expect(result.success).toBe(false);
  });
});
