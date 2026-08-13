import { describe, it, expect } from 'vitest';
import { parseVmess } from '@/parser/vmess.parser';

// 生成 vmess 链接的辅助函数
function makeVmessUrl(obj: Record<string, string>, name?: string): string {
  const json = JSON.stringify(obj);
  const base64 = btoa(unescape(encodeURIComponent(json)));
  return `vmess://${base64}${name ? '#' + encodeURIComponent(name) : ''}`;
}

describe('VMess parser', () => {
  const basic = makeVmessUrl({
    v: '2',
    ps: 'Tokyo Node',
    add: 'jp.example.com',
    port: '443',
    id: '550e8400-e29b-41d4-a716-446655440000',
    aid: '0',
    net: 'ws',
    path: '/ws',
    tls: 'tls',
    host: 'cdn.example.com',
  });

  it('should parse valid vmess link', () => {
    const result = parseVmess(basic);
    expect(result.success).toBe(true);
    expect(result.node?.server).toBe('jp.example.com');
    expect(result.node?.port).toBe(443);
    expect(result.node?.uuid).toBe('550e8400-e29b-41d4-a716-446655440000');
    expect(result.node?.protocol).toBe('vmess');
  });

  it('should parse node name', () => {
    const result = parseVmess(basic);
    expect(result.node?.name).toBe('Tokyo Node');
  });

  it('should parse tls flag', () => {
    const result = parseVmess(basic);
    expect(result.node?.tls).toBe(true);
  });

  it('should parse ws transport', () => {
    const result = parseVmess(basic);
    expect(result.node?.transport?.type).toBe('ws');
    expect(result.node?.transport?.path).toBe('/ws');
    expect(result.node?.transport?.host).toBe('cdn.example.com');
  });

  it('should parse tcp transport default', () => {
    const url = makeVmessUrl({
      v: '2',
      ps: 'TCP',
      add: 'example.com',
      port: '80',
      id: '550e8400-e29b-41d4-a716-446655440000',
      aid: '0',
      net: 'tcp',
    });
    const result = parseVmess(url);
    expect(result.node?.transport?.type).toBe('tcp');
    expect(result.node?.tls).toBe(false);
  });

  it('should fail on missing server', () => {
    const url = makeVmessUrl({
      v: '2',
      ps: 'NoServer',
      add: '',
      port: '443',
      id: '550e8400-e29b-41d4-a716-446655440000',
    });
    const result = parseVmess(url);
    expect(result.success).toBe(false);
    expect(result.error?.code).toBe('MISSING_SERVER');
  });

  it('should fail on missing uuid', () => {
    const url = makeVmessUrl({
      v: '2',
      ps: 'NoUUID',
      add: 'example.com',
      port: '443',
      id: '',
    });
    const result = parseVmess(url);
    expect(result.success).toBe(false);
    expect(result.error?.code).toBe('MISSING_UUID');
  });

  it('should fail on invalid base64', () => {
    const result = parseVmess('vmess://!!!not-base64!!!');
    expect(result.success).toBe(false);
  });

  it('should fail on invalid json after decode', () => {
    const badJson = btoa('this is not json');
    const result = parseVmess(`vmess://${badJson}`);
    expect(result.success).toBe(false);
  });

  it('should handle empty payload', () => {
    const result = parseVmess('vmess://');
    expect(result.success).toBe(false);
  });

  it('should handle missing port', () => {
    const url = makeVmessUrl({
      v: '2',
      ps: 'NoPort',
      add: 'example.com',
      port: '0',
      id: '550e8400-e29b-41d4-a716-446655440000',
    });
    const result = parseVmess(url);
    expect(result.success).toBe(false);
  });

  it('should reject invalid protocol prefix', () => {
    const result = parseVmess('vless://fake');
    // payload 不是 base64 → 失败
    expect(result.success).toBe(false);
  });

  it('should parse port as number', () => {
    const result = parseVmess(basic);
    expect(typeof result.node?.port).toBe('number');
    expect(result.node?.port).toBeGreaterThan(0);
  });

  it('should set metadata originalName', () => {
    const result = parseVmess(basic);
    expect(result.node?.metadata.originalName).toBe('Tokyo Node');
  });
});