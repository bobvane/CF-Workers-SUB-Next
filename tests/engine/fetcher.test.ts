import { describe, it, expect } from 'vitest';
import { validateUrl, isBlockedIp, fetchSubscription } from '@/engine/fetcher';

describe('SSRF URL validation', () => {
  it('should accept valid https URL', () => {
    const result = validateUrl('https://example.com/sub');
    expect(result.ok).toBe(true);
  });

  it('should accept valid http URL', () => {
    const result = validateUrl('http://example.com/sub');
    expect(result.ok).toBe(true);
  });

  it('should reject non-http protocols', () => {
    expect(validateUrl('file:///etc/passwd').ok).toBe(false);
    expect(validateUrl('ftp://example.com').ok).toBe(false);
    expect(validateUrl('gopher://example.com').ok).toBe(false);
  });

  it('should reject localhost', () => {
    expect(validateUrl('http://localhost/sub').ok).toBe(false);
    expect(validateUrl('https://localhost:8080/sub').ok).toBe(false);
  });

  it('should reject invalid URL format', () => {
    expect(validateUrl('not-a-url').ok).toBe(false);
    expect(validateUrl('').ok).toBe(false);
  });

  it('should reject loopback IPs', () => {
    expect(validateUrl('http://127.0.0.1/sub').ok).toBe(false);
    expect(validateUrl('http://127.0.0.2:8080/sub').ok).toBe(false);
  });

  it('should reject private IPv4 ranges', () => {
    expect(validateUrl('http://10.0.0.1/sub').ok).toBe(false);
    expect(validateUrl('http://192.168.1.1/sub').ok).toBe(false);
    expect(validateUrl('http://172.16.0.1/sub').ok).toBe(false);
    expect(validateUrl('http://172.31.255.255/sub').ok).toBe(false);
  });

  it('should allow public IPs', () => {
    expect(validateUrl('http://93.184.216.34/sub').ok).toBe(true);
    expect(validateUrl('http://23.149.36.32/sub').ok).toBe(true);
  });

  it('should reject IPv6 local addresses', () => {
    expect(validateUrl('http://[::1]/sub').ok).toBe(false);
    expect(validateUrl('http://[fe80::1]/sub').ok).toBe(false);
  });

  it('should reject link-local addresses', () => {
    expect(validateUrl('http://169.254.169.254/sub').ok).toBe(false);
  });
});

describe('isBlockedIp', () => {
  it('should block loopback', () => {
    expect(isBlockedIp('127.0.0.1')).toBe(true);
    expect(isBlockedIp('::1')).toBe(true);
  });

  it('should block private ranges', () => {
    expect(isBlockedIp('10.1.2.3')).toBe(true);
    expect(isBlockedIp('192.168.0.1')).toBe(true);
    expect(isBlockedIp('172.16.5.5')).toBe(true);
    expect(isBlockedIp('172.32.0.1')).toBe(false); // 172.32 不在私有段
  });

  it('should allow public IPs', () => {
    expect(isBlockedIp('8.8.8.8')).toBe(false);
    expect(isBlockedIp('1.1.1.1')).toBe(false);
  });
});

describe('fetchSubscription', () => {
  it('should throw on SSRF URL', async () => {
    await expect(fetchSubscription('http://127.0.0.1:3000/sub')).rejects.toThrow(
      'SSRF check failed'
    );
  });

  it('should throw on localhost', async () => {
    await expect(fetchSubscription('http://localhost/sub')).rejects.toThrow('SSRF check failed');
  });
});