/**
 * 集成测试 - 规则目录 API
 * 验证 /api/rules/catalog、/api/rules/catalog/meta、/api/rules/catalog/refresh
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { MemoryKvAdapter, createRepositories } from '@/storage/kv';
import { createApp } from '@/api/routes';
import { createAuthService, createPasswordHash } from '@/services/auth.service';
import { createSubscriptionService } from '@/services/subscription.service';
import { createConfigService } from '@/services/config.service';
import { createCatalogSyncService } from '@/services/catalog-sync.service';
import { META_DAT_BASE } from '@/generator/rule-providers';

const TEST_CONTENT = ['ss://aes-256-gcm:pass1@jp1.example.com:8388#JP-1'].join('\n');

interface ResData {
  success: boolean;
  data?: Record<string, unknown>;
  error?: { code: string; message: string };
}

function treeResponse(paths: string[]): string {
  return JSON.stringify({ tree: paths.map((p) => ({ path: p })), truncated: false });
}

describe('Catalog API', () => {
  let app: ReturnType<typeof createApp>;
  let kv: MemoryKvAdapter;
  let cookie: string;
  let fetchState: { fn: () => Promise<string> };

  beforeEach(async () => {
    kv = new MemoryKvAdapter();
    const repos = createRepositories(kv);
    const { hash, salt } = await createPasswordHash('test-pass');
    await kv.put('admin:hash', JSON.stringify({ hash, salt }));
    const auth = createAuthService(repos.sessions, async () => {
      const raw = await kv.get('admin:hash');
      return raw ? (JSON.parse(raw) as { hash: string; salt: string }) : null;
    });
    // 模拟上游清单（可变容器，便于后续切换失败场景）
    fetchState = { fn: () => Promise.resolve(treeResponse(['geo/geosite/netflix.mrs', 'geo/geosite/openai.mrs'])) };
    const catalogSync = createCatalogSyncService(repos, () => fetchState.fn());
    app = createApp({
      repos,
      auth,
      subscriptions: createSubscriptionService(repos, async () => TEST_CONTENT, async () => []),
      config: createConfigService(repos),
      adminPassword: 'test-pass',
      fetchRaw: async () => TEST_CONTENT,
      parseContent: async () => [],
      catalogSync,
    });
    // 登录获取 cookie
    const loginRes = await app.request('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: 'test-pass' }),
    });
    const loginJson = (await loginRes.json()) as ResData;
    const token = (loginJson.data as { token: string }).token;
    cookie = `sub_session=${token}`;
  });

  it('catalog 需登录（默认受全局 /api/rules/* 保护）', async () => {
    const res = await app.request('/api/rules/catalog');
    expect(res.status).toBe(401);
  });

  it('catalog 登录后可搜索', async () => {
    const res = await app.request('/api/rules/catalog?q=netflix', {
      headers: { Cookie: cookie },
    });
    const json = (await res.json()) as ResData;
    expect(json.success).toBe(true);
    const data = json.data as { catalog: { id: string }[] };
    expect(data.catalog.length).toBeGreaterThan(0);
    expect(data.catalog.every((e) => e.id.includes('NETFLIX'))).toBe(true);
  });

  it('catalog/meta 需登录', async () => {
    const res = await app.request('/api/rules/catalog/meta');
    expect(res.status).toBe(401);
  });

  it('catalog/refresh 需登录', async () => {
    const res = await app.request('/api/rules/catalog/refresh', { method: 'POST' });
    expect(res.status).toBe(401);
  });

  it('catalog/refresh 触发扫描入库（登录后）', async () => {
    const res = await app.request('/api/rules/catalog/refresh', {
      method: 'POST',
      headers: { Cookie: cookie },
    });
    expect(res.status).toBe(200);
    const json = (await res.json()) as ResData;
    expect(json.success).toBe(true);
    const data = json.data as { added: string[]; total: number };
    expect(data.added).toEqual(['NETFLIX', 'OPENAI']);
    expect(data.total).toBe(2);

    // 入库后 catalog 走 KV（登录后）
    const cat = await app.request('/api/rules/catalog', {
      headers: { Cookie: cookie },
    });
    const catJson = (await cat.json()) as ResData;
    const catData = catJson.data as { meta: { fromKv: boolean } };
    expect(catData.meta.fromKv).toBe(true);
  });

  it('refresh 上游失败 → 502 + stale 保留旧库', async () => {
    // 先成功入库一次
    await app.request('/api/rules/catalog/refresh', {
      method: 'POST',
      headers: { Cookie: cookie },
    });
    // 换失败上游
    fetchState.fn = () => Promise.reject(new Error('network down'));
    const res = await app.request('/api/rules/catalog/refresh', {
      method: 'POST',
      headers: { Cookie: cookie },
    });
    expect(res.status).toBe(502);
    const json = (await res.json()) as ResData;
    expect(json.success).toBe(false);
    expect(json.error?.code).toBe('UPSTREAM_UNAVAILABLE');

    // 旧库仍在
    const metaRes = await app.request('/api/rules/catalog/meta', {
      headers: { Cookie: cookie },
    });
    const metaJson = (await metaRes.json()) as ResData;
    const metaData = metaJson.data as { meta: { status: string; total: number } };
    expect(metaData.meta.status).toBe('stale');
    expect(metaData.meta.total).toBe(2);
  });

  it('mrsUrl 使用规范小写地址', async () => {
    await app.request('/api/rules/catalog/refresh', {
      method: 'POST',
      headers: { Cookie: cookie },
    });
    const res = await app.request('/api/rules/catalog?q=netflix', {
      headers: { Cookie: cookie },
    });
    const json = (await res.json()) as ResData;
    const data = json.data as { catalog: { id: string; mrsUrl: string }[] };
    expect(data.catalog[0].mrsUrl).toBe(`${META_DAT_BASE}netflix.mrs`);
  });
});