import { describe, it, expect, beforeEach } from 'vitest';
import {
  MemoryKvAdapter,
  KvSubscriptionRepository,
  KvNodeRepository,
  KvRuleRepository,
  KvSessionRepository,
  KvSettingsRepository,
  KvRuleCatalogRepository,
} from '@/storage/kv';
import { createNode } from '@/models/node';
import { RuleCatalogEntry, createCatalogMeta } from '@/models/rule-catalog';

describe('MemoryKvAdapter', () => {
  let kv: MemoryKvAdapter;

  beforeEach(() => {
    kv = new MemoryKvAdapter();
  });

  it('should put and get a value', async () => {
    await kv.put('test:key', 'value');
    expect(await kv.get('test:key')).toBe('value');
  });

  it('should return null for missing key', async () => {
    expect(await kv.get('missing:key')).toBeNull();
  });

  it('should delete a key', async () => {
    await kv.put('test:key', 'value');
    await kv.delete('test:key');
    expect(await kv.get('test:key')).toBeNull();
  });

  it('should list keys by prefix', async () => {
    await kv.put('subscription:a', '{}');
    await kv.put('subscription:b', '{}');
    await kv.put('other:c', '{}');
    const entries = await kv.list('subscription:');
    expect(entries.length).toBe(2);
  });

  it('should clear all data', async () => {
    await kv.put('a', '1');
    await kv.put('b', '2');
    kv.clear();
    expect(await kv.list('')).toEqual([]);
  });
});

describe('KvSubscriptionRepository', () => {
  let repo: KvSubscriptionRepository;

  beforeEach(() => {
    repo = new KvSubscriptionRepository(new MemoryKvAdapter());
  });

  it('should create a subscription', async () => {
    const sub = await repo.create({ name: 'My Airport', url: 'https://example.com/sub' });
    expect(sub.id).toBeTruthy();
    expect(sub.name).toBe('My Airport');
    expect(sub.url).toBe('https://example.com/sub');
    expect(sub.status).toBe('active');
    expect(sub.version).toBe(1);
  });

  it('should list subscriptions', async () => {
    await repo.create({ name: 'A', url: 'https://a.com/sub' });
    await repo.create({ name: 'B', url: 'https://b.com/sub' });
    const list = await repo.list();
    expect(list.length).toBe(2);
  });

  it('should get subscription by id', async () => {
    const created = await repo.create({ name: 'A', url: 'https://a.com/sub' });
    const found = await repo.getById(created.id);
    expect(found?.name).toBe('A');
  });

  it('should return null for missing subscription', async () => {
    expect(await repo.getById('missing')).toBeNull();
  });

  it('should update a subscription', async () => {
    const created = await repo.create({ name: 'A', url: 'https://a.com/sub' });
    const updated = await repo.update(created.id, { name: 'B' });
    expect(updated?.name).toBe('B');
    expect(updated?.version).toBe(2);
  });

  it('should delete a subscription and return true', async () => {
    const created = await repo.create({ name: 'A', url: 'https://a.com/sub' });
    expect(await repo.delete(created.id)).toBe(true);
    expect(await repo.getById(created.id)).toBeNull();
  });

  it('should return false when deleting missing subscription', async () => {
    expect(await repo.delete('missing')).toBe(false);
  });
});

describe('KvNodeRepository', () => {
  it('should set and get nodes by subscription', async () => {
    const repo = new KvNodeRepository(new MemoryKvAdapter());
    const node = createNode({
      name: 'JP Node',
      protocol: 'vless',
      server: 'example.com',
      port: 443,
      metadata: { source: 'sub001', originalName: 'JP Node', tags: [] },
    });
    await repo.setBySubscription('sub001', [node]);
    const nodes = await repo.getBySubscription('sub001');
    expect(nodes.length).toBe(1);
    expect(nodes[0].server).toBe('example.com');
  });

  it('should get all nodes across subscriptions', async () => {
    const repo = new KvNodeRepository(new MemoryKvAdapter());
    await repo.setBySubscription('sub001', [
      createNode({ name: 'A', server: 'a.com', port: 443, protocol: 'vless' }),
    ]);
    await repo.setBySubscription('sub002', [
      createNode({ name: 'B', server: 'b.com', port: 443, protocol: 'vmess' }),
    ]);
    const all = await repo.getAll();
    expect(all.length).toBe(2);
  });

  it('should delete nodes by subscription', async () => {
    const repo = new KvNodeRepository(new MemoryKvAdapter());
    await repo.setBySubscription('sub001', [
      createNode({ name: 'A', server: 'a.com', port: 443, protocol: 'vless' }),
    ]);
    await repo.deleteBySubscription('sub001');
    expect(await repo.getBySubscription('sub001')).toEqual([]);
  });
});

describe('KvRuleRepository', () => {
  it('should create and list rules', async () => {
    const repo = new KvRuleRepository(new MemoryKvAdapter());
    await repo.create({ name: 'Japan Only', type: 'include', pattern: '日本' });
    const rules = await repo.list();
    expect(rules.length).toBe(1);
    expect(rules[0].pattern).toBe('日本');
  });

  it('should delete a rule', async () => {
    const repo = new KvRuleRepository(new MemoryKvAdapter());
    const rule = await repo.create({ name: 'A', type: 'include', pattern: 'x' });
    expect(await repo.delete(rule.id)).toBe(true);
    expect(await repo.list()).toEqual([]);
  });
});

describe('KvSessionRepository', () => {
  it('should create a session with TTL', async () => {
    const repo = new KvSessionRepository(new MemoryKvAdapter());
    const session = await repo.create(3600, 0);
    expect(session.id).toBeTruthy();
    expect(session.expiresAt).toBeGreaterThan(session.createdAt);
    expect(session.passwordVersion).toBe(0);
  });

  it('should get a valid session', async () => {
    const repo = new KvSessionRepository(new MemoryKvAdapter());
    const session = await repo.create(3600, 0);
    const found = await repo.getById(session.id);
    expect(found?.id).toBe(session.id);
    expect(found?.passwordVersion).toBe(0);
  });

  it('should return null for expired session', async () => {
    const repo = new KvSessionRepository(new MemoryKvAdapter());
    const session = await repo.create(-10, 0); // 已过期
    const found = await repo.getById(session.id);
    expect(found).toBeNull();
  });

  it('should delete a session', async () => {
    const repo = new KvSessionRepository(new MemoryKvAdapter());
    const session = await repo.create(3600, 0);
    await repo.delete(session.id);
    expect(await repo.getById(session.id)).toBeNull();
  });

  it('should list all active sessions', async () => {
    const repo = new KvSessionRepository(new MemoryKvAdapter());
    await repo.create(3600, 0);
    await repo.create(3600, 1);
    await repo.create(-10, 2); // expired
    const all = await repo.listAll();
    expect(all.length).toBe(2);
    expect(all.some(s => s.passwordVersion === 0)).toBe(true);
    expect(all.some(s => s.passwordVersion === 1)).toBe(true);
  });
});

describe('KvSettingsRepository', () => {
  it('should set and get settings', async () => {
    const repo = new KvSettingsRepository(new MemoryKvAdapter());
    await repo.set('app_name', 'SUB Next');
    expect(await repo.get('app_name')).toBe('SUB Next');
  });

  it('should return null for missing setting', async () => {
    const repo = new KvSettingsRepository(new MemoryKvAdapter());
    expect(await repo.get('missing')).toBeNull();
  });
});

describe('KvRuleCatalogRepository', () => {
  const kv = () => new MemoryKvAdapter();
  const repo = (kv2: MemoryKvAdapter) => new KvRuleCatalogRepository(kv2);

  it('should return null catalog when empty', async () => {
    expect(await repo(kv()).getCatalog()).toBeNull();
  });

  it('should return never meta when empty', async () => {
    const m = await repo(kv()).getMeta();
    expect(m.status).toBe('never');
  });

  it('should not crash on corrupt catalog', async () => {
    const kv2 = kv();
    await kv2.put('rule-catalog', '{bad json');
    expect(await repo(kv2).getCatalog()).toBeNull();
  });

  it('should set and read a catalog snapshot', async () => {
    const kv2 = kv();
    const r = repo(kv2);
    const entry: RuleCatalogEntry = {
      id: 'NETFLIX',
      type: 'site',
      mrsUrl: 'https://example.com/netflix.mrs',
      verifiedAt: 1000,
    };
    await r.setCatalog(
      { version: '1', source: 'test', fetchedAt: 1000, entries: [entry] },
      [],
      createCatalogMeta({ version: '1', fetchedAt: 1000, total: 1, status: 'ok' })
    );
    const c = await r.getCatalog();
    expect(c?.entries[0].id).toBe('NETFLIX');
    const meta = await r.getMeta();
    expect(meta.total).toBe(1);
    expect(meta.status).toBe('ok');
  });

  it('should set meta only', async () => {
    const kv2 = kv();
    const r = repo(kv2);
    await r.setMeta(createCatalogMeta({ version: 'x', status: 'stale', lastError: 'boom' }));
    const meta = await r.getMeta();
    expect(meta.status).toBe('stale');
    expect(meta.lastError).toBe('boom');
  });

  it('should appendRemoved without duplicate', async () => {
    const kv2 = kv();
    const r = repo(kv2);
    await r.appendRemoved([{ id: 'OLD', removedAt: 1, reason: 'upstream-gone' }]);
    await r.appendRemoved([{ id: 'OLD', removedAt: 2, reason: 'upstream-gone' }, { id: 'OLD2', removedAt: 3, reason: 'upstream-gone' }]);
    const removed = await r.getRemoved();
    expect(removed.map((x) => x.id).sort()).toEqual(['OLD', 'OLD2']);
  });
});