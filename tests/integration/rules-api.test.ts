/**
 * 集成测试 - 分流规则 API
 * 验证 /api/rules/groups 与 /api/rules/catalog 端点返回真实数据
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { MemoryKvAdapter, createRepositories } from '@/storage/kv';
import { createApp } from '@/api/routes';
import { createAuthService, createPasswordHash } from '@/services/auth.service';
import { createSubscriptionService } from '@/services/subscription.service';
import { createConfigService } from '@/services/config.service';

const TEST_CONTENT = ['ss://aes-256-gcm:pass1@jp1.example.com:8388#JP-1'].join('\n');

interface RuleItem {
  id: string;
  label: string;
  tag: string;
  target: string;
}
interface RuleGroupRes {
  key: string;
  name: string;
  icon: string;
  items: RuleItem[];
}
interface ResData {
  success: boolean;
  data?: Record<string, unknown>;
  error?: { code: string; message: string };
}

async function loginToken(app: ReturnType<typeof createApp>): Promise<string> {
  const res = await app.request('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password: 'test-pass' }),
  });
  const json = (await res.json()) as ResData;
  return (json.data as { token: string }).token;
}

describe('Rules API', () => {
  let app: ReturnType<typeof createApp>;
  let baseHeaders: Record<string, string>;

  beforeEach(async () => {
    const kv = new MemoryKvAdapter();
    const repos = createRepositories(kv);
    // 初始化 admin 密码哈希
    const { hash, salt } = await createPasswordHash('test-pass');
    await kv.put('admin:hash', JSON.stringify({ hash, salt }));
    const auth = createAuthService(repos.sessions, async () => {
      const raw = await kv.get('admin:hash');
      return raw ? (JSON.parse(raw) as { hash: string; salt: string }) : null;
    });
    app = createApp({
      repos,
      auth,
      subscriptions: createSubscriptionService(repos, async () => TEST_CONTENT, async () => []),
      config: createConfigService(repos),
      adminPassword: 'test-pass',
      fetchRaw: async () => TEST_CONTENT,
      parseContent: async () => [],
    });
    const token = await loginToken(app);
    baseHeaders = { Cookie: `sub_session=${token}` };
  });

  it('GET /api/rules/groups 返回预定义规则大类', async () => {
    const res = await app.request('/api/rules/groups', { headers: baseHeaders });
    expect(res.status).toBe(200);
    const json = (await res.json()) as ResData;
    expect(json.success).toBe(true);
    const groups = json.data as unknown as { groups: RuleGroupRes[] };
    const groupList = groups.groups;
    expect(Array.isArray(groupList)).toBe(true);
    expect(groupList.length).toBeGreaterThanOrEqual(9);
    for (const g of groupList) {
      expect(g.key).toBeTruthy();
      expect(g.icon).toBeTruthy();
      expect(g.items.length).toBeGreaterThan(0);
    }
    const names = groupList.map((g) => g.key);
    for (const k of ['safe', 'crypto', 'ai', 'stream', 'social', 'game', 'cloud', 'dev', 'china', 'other']) {
      expect(names).toContain(k);
    }
  });

  it('GET /api/rules/groups 未登录返回 401', async () => {
    const res = await app.request('/api/rules/groups');
    expect(res.status).toBe(401);
  });

  it('GET /api/rules/catalog 返回完整分类目录', async () => {
    const res = await app.request('/api/rules/catalog', { headers: baseHeaders });
    expect(res.status).toBe(200);
    const json = (await res.json()) as ResData;
    expect(json.success).toBe(true);
    const data = json.data as unknown as { meta: { total: number }; catalog: RuleItem[] };
    expect(data.meta.total).toBeGreaterThan(1000);
    expect(data.catalog.length).toBeGreaterThan(1000);
  });

  it('GET /api/rules/catalog?q= 支持搜索', async () => {
    const res = await app.request('/api/rules/catalog?q=netflix', { headers: baseHeaders });
    const json = (await res.json()) as ResData;
    expect(json.success).toBe(true);
    const data = json.data as unknown as { catalog: RuleItem[] };
    expect(data.catalog.length).toBeGreaterThan(0);
    expect(data.catalog[0].id.toUpperCase()).toContain('NETFLIX');
  });

  it('PUT/GET /api/rules/selection 保存并读回勾选的规则', async () => {
    // 保存选择
    const put = await app.request('/api/rules/selection', {
      method: 'PUT',
      headers: { ...baseHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids: ['NETFLIX', 'OPENAI', 'CATEGORY-ADS-ALL'] }),
    });
    expect(put.status).toBe(200);
    // 读回
    const get = await app.request('/api/rules/selection', { headers: baseHeaders });
    const json = (await get.json()) as ResData;
    expect(json.success).toBe(true);
    const ids = (json.data as unknown as { ids: string[] }).ids;
    expect(ids).toEqual(['NETFLIX', 'OPENAI', 'CATEGORY-ADS-ALL']);
  });

  it('PUT /api/rules/selection 无效参数返回 400', async () => {
    const res = await app.request('/api/rules/selection', {
      method: 'PUT',
      headers: { ...baseHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids: 'not-array' }),
    });
    expect(res.status).toBe(400);
  });
});