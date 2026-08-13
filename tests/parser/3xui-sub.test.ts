/**
 * 模拟完整 3X-UI 订阅流程：Base64 编码的节点列表 → 解码 → 解析
 * 复现用户实际场景
 */

import { describe, it, expect } from 'vitest';
import { decodeSubscriptionContent } from '@/parser/decoder';
import { parseSubscriptionContent } from '@/parser/index';

// 模拟 3X-UI 面板返回的 Base64 订阅内容
const REALITY_LINK = 'vless://a10d67fa-d913-491a-a403-0fcf037c9a2e@mys.bobvane.top:443?encryption=none&flow=xtls-rprx-vision&fp=chrome&pbk=yXzITSg7U41f0AnvYCPSoGgjROUTC7rA7oCvVNYgdm4&security=reality&sid=1760f0826c4887e9&sni=gx-target-rconfig-frontend-api.gx-stg.nvidia.com&spx=%2F042a9a8822e04e6&type=tcp#%E9%A9%AC%E6%9D%A5%E8%A5%BF%E4%BA%9Abob-bob%40gmail.com';

const WS_LINK = 'vless://bc1f510f-8ac5-4071-88e5-b3db7c0a5ecd@bot.wenbo.de5.net:443?security=tls&type=ws&ech=cloudflare-ech.com%2Bhttps%3A%2F%2Fdns.alidns.com%2Fdns-query&host=bot.wenbo.de5.net&fp=chrome&sni=bot.wenbo.de5.net&path=%2F&encryption=none#edgetunnel';

// 3X-UI 默认格式：Base64 编码，每行一个节点
const SUBSCRIPTION_BASE64 = btoa([REALITY_LINK, WS_LINK].join('\n'));

// 3X-UI 也可输出纯文本格式（无 Base64 编码）
const SUBSCRIPTION_PLAIN = [REALITY_LINK, WS_LINK].join('\n');

describe('3X-UI subscription full pipeline', () => {
  it('should decode Base64 subscription content', () => {
    const decoded = decodeSubscriptionContent(SUBSCRIPTION_BASE64);
    expect(decoded).toContain('vless://');
    expect(decoded).toContain('mys.bobvane.top');
    expect(decoded).toContain('bot.wenbo.de5.net');
  });

  it('should parse Base64 subscription and extract all nodes', () => {
    const result = parseSubscriptionContent(SUBSCRIPTION_BASE64, '3xui-sub');
    expect(result.success).toBe(2);
    expect(result.failed).toBe(0);
    expect(result.nodes.length).toBe(2);
  });

  it('should parse plain text subscription (no Base64)', () => {
    const result = parseSubscriptionContent(SUBSCRIPTION_PLAIN, '3xui-sub');
    expect(result.success).toBe(2);
    expect(result.nodes.length).toBe(2);
  });

  it('should extract VLESS+REALITY node correctly', () => {
    const result = parseSubscriptionContent(SUBSCRIPTION_BASE64, '3xui');
    const reality = result.nodes.find(n => n.flow === 'xtls-rprx-vision');
    expect(reality).toBeDefined();
    expect(reality?.pbk).toBe('yXzITSg7U41f0AnvYCPSoGgjROUTC7rA7oCvVNYgdm4');
    expect(reality?.sni).toContain('nvidia.com');
  });

  it('should extract VLESS+WS node correctly', () => {
    const result = parseSubscriptionContent(SUBSCRIPTION_BASE64, '3xui');
    const ws = result.nodes.find(n => n.transport?.type === 'ws');
    expect(ws).toBeDefined();
    expect(ws?.server).toBe('bot.wenbo.de5.net');
    expect(ws?.transport?.path).toBe('/');
  });

  it('should handle mixed subscription (airport + 3X-UI nodes)', () => {
    const mixed = [
      'ss://aes-256-gcm:pass@jp.example.com:8388#JP-Airport',
      REALITY_LINK,
      WS_LINK,
    ].join('\n');
    const result = parseSubscriptionContent(mixed, 'mixed');
    expect(result.success).toBe(3);
    expect(result.nodes.filter(n => n.protocol === 'ss').length).toBe(1);
    expect(result.nodes.filter(n => n.protocol === 'vless').length).toBe(2);
  });
});