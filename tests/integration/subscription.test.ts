/**
 * 集成测试 - 订阅完整管线
 * TASK 8.2 - Integration Test
 * 验证：创建订阅 → 更新(抓取→解析→缓存) → 生成配置 → 查询节点
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  MemoryKvAdapter,
  createRepositories,
} from '@/storage/kv';
import { createSubscriptionService, isNodeLink } from '@/services/subscription.service';
import { createConfigService } from '@/services/config.service';
import { validateMihomo } from '@/generator/mihomo';
import { validateSingbox } from '@/generator/singbox';

const TEST_SUBSCRIPTION = [
  'ss://aes-256-gcm:pass1@jp1.example.com:8388#JP-1',
  'vless://550e8400-e29b-41d4-a716-446655440000@us1.example.com:443#US-1',
  'trojan://pass2@hk1.example.com:443#HK-1',
].join('\n');

describe('subscription pipeline integration', () => {
  let kv: MemoryKvAdapter;
  let repos: ReturnType<typeof createRepositories>;
  let service: ReturnType<typeof createSubscriptionService>;
  let configService: ReturnType<typeof createConfigService>;

  beforeEach(() => {
    kv = new MemoryKvAdapter();
    repos = createRepositories(kv);
    // fetchRaw 直接返回测试内容（绕过网络）
    service = createSubscriptionService(
      repos,
      async () => TEST_SUBSCRIPTION,
      async () => []
    );
    configService = createConfigService(repos);
  });

  it('should create and update subscription end-to-end', async () => {
    // 1. 创建
    const sub = await service.create('Test Airport', 'https://example.com/sub');
    expect(sub.id).toBeTruthy();

    // 2. 更新（抓取+解析+缓存）
    const result = await service.update(sub.id, async () => TEST_SUBSCRIPTION);
    expect(result.nodeCount).toBe(3);
    expect(result.nodes.length).toBe(3);
  });

  it('should store parsed nodes in repository', async () => {
    const sub = await service.create('T', 'https://example.com/sub');
    await service.update(sub.id, async () => TEST_SUBSCRIPTION);
    const nodes = await repos.nodes.getBySubscription(sub.id);
    expect(nodes.length).toBe(3);
    expect(nodes[0].metadata.source).toBe(sub.id);
  });

  it('should generate mihomo config from cached nodes', async () => {
    const sub = await service.create('T', 'https://example.com/sub');
    await service.update(sub.id, async () => TEST_SUBSCRIPTION);
    const yaml = await configService.generate('mihomo');
    expect(yaml).toContain('JP-1');
    expect(yaml).toContain('US-1');
    expect(validateMihomo(yaml)).toBe(true);
  });

  it('should generate singbox config from cached nodes', async () => {
    const sub = await service.create('T', 'https://example.com/sub');
    await service.update(sub.id, async () => TEST_SUBSCRIPTION);
    const json = await configService.generate('singbox');
    expect(json).toContain('JP-1');
    expect(validateSingbox(json)).toBe(true);
  });

  it('should mark subscription as error on fetch failure', async () => {
    const sub = await service.create('T', 'https://example.com/sub');
    await expect(
      service.update(sub.id, async () => {
        throw new Error('network down');
      })
    ).rejects.toThrow('network down');
    const updated = await repos.subscriptions.getById(sub.id);
    expect(updated?.status).toBe('error');
    expect(updated?.errorMessage).toBe('network down');
  });

  it('should apply exclude rules to filter nodes', async () => {
    const sub = await service.create('T', 'https://example.com/sub');
    const filteredService = createSubscriptionService(
      repos,
      async () => TEST_SUBSCRIPTION,
      async () => [{ type: 'exclude', pattern: 'US', enabled: true }]
    );
    const result = await filteredService.update(sub.id, async () => TEST_SUBSCRIPTION);
    // 排除 US-1
    expect(result.nodeCount).toBe(2);
    expect(result.nodes.some((n) => n.name.includes('US'))).toBe(false);
  });

  it('should delete subscription and remove node cache', async () => {
    const sub = await service.create('T', 'https://example.com/sub');
    await service.update(sub.id, async () => TEST_SUBSCRIPTION);
    expect((await repos.nodes.getBySubscription(sub.id)).length).toBe(3);
    await service.delete(sub.id);
    expect((await repos.nodes.getBySubscription(sub.id)).length).toBe(0);
  });

  it('should aggregate nodes across subscriptions', async () => {
    const a = await service.create('A', 'https://a.com/sub');
    const b = await service.create('B', 'https://b.com/sub');
    await service.update(a.id, async () => 'ss://aes-256-gcm:p@n1.com:8388#N1');
    await service.update(b.id, async () => 'ss://aes-256-gcm:p@n2.com:8388#N2');
    const all = await repos.nodes.getAll();
    expect(all.length).toBe(2);
  });
});

describe('isNodeLink', () => {
  it('should detect vless:// as node link', () => {
    expect(isNodeLink('vless://uuid@server:443')).toBe(true);
  });
  it('should detect vmess:// as node link', () => {
    expect(isNodeLink('vmess://base64stuff')).toBe(true);
  });
  it('should detect trojan:// as node link', () => {
    expect(isNodeLink('trojan://pass@server:443')).toBe(true);
  });
  it('should detect ss:// as node link', () => {
    expect(isNodeLink('ss://method:pass@server:8388')).toBe(true);
  });
  it('should return false for http URLs', () => {
    expect(isNodeLink('https://example.com/sub')).toBe(false);
    expect(isNodeLink('http://example.com/sub')).toBe(false);
  });
  it('should return false for random text', () => {
    expect(isNodeLink('random text')).toBe(false);
  });
});

describe('single node subscription (direct link)', () => {
  let kv: MemoryKvAdapter;
  let repos: ReturnType<typeof createRepositories>;
  let service: ReturnType<typeof createSubscriptionService>;

  beforeEach(() => {
    kv = new MemoryKvAdapter();
    repos = createRepositories(kv);
    service = createSubscriptionService(repos, async () => '', async () => []);
  });

  it('should parse direct vless node as subscription', async () => {
    const sub = await service.create(
      'My VPS Node',
      'vless://a10d67fa-d913-491a-a403-0fcf037c9a2e@mys.bobvane.top:443?encryption=none&flow=xtls-rprx-vision&security=reality&pbk=testpbk&sid=abc&sni=example.com&type=tcp#MyVPS'
    );
    // update 时，URL 是 vless:// 开头，当作内容直接解析
    const result = await service.update(sub.id, async () => {
      throw new Error('should not be called');
    });
    expect(result.nodeCount).toBe(1);
    expect(result.nodes[0].protocol).toBe('vless');
    expect(result.nodes[0].server).toBe('mys.bobvane.top');
    expect(result.nodes[0].flow).toBe('xtls-rprx-vision');
  });
});