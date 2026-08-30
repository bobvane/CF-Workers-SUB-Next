import { describe, it, expect } from 'vitest';
import { parseVless } from '@/parser/vless.parser';
import { nodeToUrl } from '@/generator/node-to-url';
import { nodeToMihomoProxy } from '@/generator/mihomo';
import { Node } from '@/models/node';

/**
 * 整链保真:订阅 → 节点 → 复制/输出,任何参数都不丢(用户 2026-08-28 需求)
 * 样本为真实 v2rayN XHTTP 节点链接
 */
const REAL_XHTTP_LINK =
  'vless://bc1f510f-8ac5-4071-88e5-b3db7c0a5ecd@172.237.7.122:443?' +
  'encryption=none&security=tls&sni=bot.wenbo.de5.net&fp=chrome&insecure=0&allowInsecure=0' +
  '&ech=cloudflare-ech.com%2Bhttps%3A%2F%2Fdns.alidns.com%2Fdns-query&type=xhttp' +
  '&host=bot.wenbo.de5.net&path=%2F&mode=stream-one' +
  '&extra=%7B%22xPaddingObfsMode%22%3Atrue%2C%22xPaddingMethod%22%3A%22tokenish%22%2C%22xPaddingPlacement%22%3A%22queryInHeader%22%2C%22xPaddingHeader%22%3A%22c1f510%22%2C%22xPaddingKey%22%3A%22_3db7c0%22%7D' +
  '#%E5%9C%B0%E5%8C%BA%E9%9A%8F%E6%9C%BA%20%7C%20%E6%97%A5%E6%9C%AC%20JP%20%7C%20NRT%20%7C%20172.237.7.122%3A443';

function makeNode(overrides: Partial<Node> = {}): Node {
  return {
    id: 'n1',
    name: 'Test',
    protocol: 'vless',
    server: 'example.com',
    port: 443,
    uuid: '550e8400-e29b-41d4-a716-446655440000',
    tls: true,
    metadata: { source: 'test', originalName: 'Test', tags: [] },
    version: 1,
    ...overrides,
  } as Node;
}

describe('整链保真', () => {
  it('解析真实 XHTTP 链接时保留全部参数', () => {
    const result = parseVless(REAL_XHTTP_LINK);
    expect(result.success).toBe(true);
    const node = result.node!;

    // 结构化字段
    expect(node.uuid).toBe('bc1f510f-8ac5-4071-88e5-b3db7c0a5ecd');
    expect(node.server).toBe('172.237.7.122');
    expect(node.port).toBe(443);
    expect(node.sni).toBe('bot.wenbo.de5.net');
    expect(node.tls).toBe(true);
    expect(node.transport?.type).toBe('xhttp');
    expect(node.transport?.mode).toBe('stream-one');
    expect(node.transport?.path).toBe('/');
    expect(node.transport?.host).toBe('bot.wenbo.de5.net');

    // 指纹
    expect(node.metadata?.fingerprint).toBe('chrome');

    // 保真参数全部进 extra,一个都不能丢
    expect(node.metadata?.extra?.['ech']).toBe('cloudflare-ech.com+https://dns.alidns.com/dns-query');
    expect(node.metadata?.extra?.['insecure']).toBe('0');
    expect(node.metadata?.extra?.['allowInsecure']).toBe('0');
    expect(node.metadata?.extra?.['encryption']).toBe('none');
    expect(node.metadata?.extra?.['extra']).toContain('xPaddingObfsMode');

    // originalUrl 原样保留
    expect(node.metadata?.originalUrl).toBe(REAL_XHTTP_LINK);
  });

  it('nodeToUrl 优先返回 originalUrl(复制/输出零丢失)', () => {
    const result = parseVless(REAL_XHTTP_LINK);
    const url = nodeToUrl(result.node!);
    expect(url).toBe(REAL_XHTTP_LINK);
  });

  it('无 originalUrl 时走正常序列化', () => {
    const node = makeNode({});
    expect(nodeToUrl(node)).toContain('vless://');
  });

  it('Mihomo 生成器输出 client-fingerprint + ech-opts + x-padding', () => {
    const result = parseVless(REAL_XHTTP_LINK);
    const proxy = nodeToMihomoProxy(result.node!);

    expect(proxy.network).toBe('xhttp');
    expect(proxy['client-fingerprint']).toBe('chrome');
    // v2.11.3: XHTTP 缺省 alpn 默认 [h2](HTTP/2 握手必需)
    expect(proxy.alpn).toEqual(['h2']);

    const echOpts = proxy['ech-opts'] as Record<string, unknown> | undefined;
    expect(echOpts).toBeDefined();
    expect(echOpts?.enable).toBe(true);
    // v2.11.1: query-server-name = ech 参数 '+' 前的域名(链接读取),config DoH 不输出
    expect(echOpts?.['query-server-name']).toBe('cloudflare-ech.com');
    expect(echOpts?.config).toBeUndefined();

    const xhttpOpts = proxy['xhttp-opts'] as Record<string, unknown> | undefined;
    expect(xhttpOpts).toBeDefined();
    expect((xhttpOpts as Record<string, unknown>).mode).toBe('stream-one');
    expect((xhttpOpts as Record<string, unknown>).path).toBe('/');
    expect((xhttpOpts as Record<string, unknown>).host).toBe('bot.wenbo.de5.net');
    // v2.11.2: x-padding 从 extra=JSON(camelCase) 解析输出
    expect((xhttpOpts as Record<string, unknown>)['x-padding-obfs-mode']).toBe(true);
    expect((xhttpOpts as Record<string, unknown>)['x-padding-method']).toBe('tokenish');
    expect((xhttpOpts as Record<string, unknown>)['x-padding-placement']).toBe('queryInHeader');
    expect((xhttpOpts as Record<string, unknown>)['x-padding-header']).toBe('c1f510');
    expect((xhttpOpts as Record<string, unknown>)['x-padding-key']).toBe('_3db7c0');
  });
});