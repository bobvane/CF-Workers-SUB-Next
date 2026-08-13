import { describe, it, expect } from 'vitest';
import { parseVless } from '@/parser/vless.parser';
import { parseSubscriptionContent } from '@/parser/index';

const NODE1 = 'vless://bc1f510f-8ac5-4071-88e5-b3db7c0a5ecd@bot.wenbo.de5.net:443?security=tls&type=ws&ech=cloudflare-ech.com%2Bhttps%3A%2F%2Fdns.alidns.com%2Fdns-query&host=bot.wenbo.de5.net&fp=chrome&sni=bot.wenbo.de5.net&path=%2F&encryption=none#edgetunnel';

const NODE2 = 'vless://a10d67fa-d913-491a-a403-0fcf037c9a2e@mys.bobvane.top:443?encryption=none&flow=xtls-rprx-vision&fp=chrome&pbk=yXzITSg7U41f0AnvYCPSoGgjROUTC7rA7oCvVNYgdm4&security=reality&sid=1760f0826c4887e9&sni=gx-target-rconfig-frontend-api.gx-stg.nvidia.com&spx=%2F042a9a8822e04e6&type=tcp#%E9%A9%AC%E6%9D%A5%E8%A5%BF%E4%BA%9Abob-bob%40gmail.com';

describe('Node 1: VLESS+WS+TLS (edgetunnel)', () => {
  it('should parse as single link', () => {
    const result = parseVless(NODE1);
    expect(result.success).toBe(true);
    expect(result.node?.protocol).toBe('vless');
    expect(result.node?.server).toBe('bot.wenbo.de5.net');
    expect(result.node?.port).toBe(443);
    expect(result.node?.uuid).toBe('bc1f510f-8ac5-4071-88e5-b3db7c0a5ecd');
    expect(result.node?.tls).toBe(true);
    expect(result.node?.transport?.type).toBe('ws');
    expect(result.node?.transport?.path).toBe('/');
    expect(result.node?.transport?.host).toBe('bot.wenbo.de5.net');
    expect(result.node?.sni).toBe('bot.wenbo.de5.net');
    expect(result.node?.name).toBe('edgetunnel');
  });

  it('should parse from subscription content', () => {
    const result = parseSubscriptionContent(NODE1, 'test');
    expect(result.success).toBe(1);
    expect(result.nodes[0].server).toBe('bot.wenbo.de5.net');
  });
});

describe('Node 2: VLESS+REALITY (3X-UI)', () => {
  it('should parse as single link', () => {
    const result = parseVless(NODE2);
    expect(result.success).toBe(true);
    expect(result.node?.protocol).toBe('vless');
    expect(result.node?.server).toBe('mys.bobvane.top');
    expect(result.node?.port).toBe(443);
    expect(result.node?.uuid).toBe('a10d67fa-d913-491a-a403-0fcf037c9a2e');
    expect(result.node?.tls).toBe(true);
    expect(result.node?.flow).toBe('xtls-rprx-vision');
    expect(result.node?.pbk).toBe('yXzITSg7U41f0AnvYCPSoGgjROUTC7rA7oCvVNYgdm4');
    expect(result.node?.sid).toBe('1760f0826c4887e9');
    expect(result.node?.sni).toBe('gx-target-rconfig-frontend-api.gx-stg.nvidia.com');
    expect(result.node?.name).toBe('马来西亚bob-bob@gmail.com');
    expect(result.node?.transport?.type).toBe('tcp');
  });

  it('should parse from subscription content', () => {
    const result = parseSubscriptionContent(NODE2, 'test');
    expect(result.success).toBe(1);
    expect(result.nodes[0].server).toBe('mys.bobvane.top');
    expect(result.nodes[0].pbk).toBe('yXzITSg7U41f0AnvYCPSoGgjROUTC7rA7oCvVNYgdm4');
  });
});