/**
 * 集成测试 - 项目元信息 API（公开）
 * 验证 /api/meta 与 /api/meta/check-upgrade 端点
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { MemoryKvAdapter, createRepositories } from '@/storage/kv';
import { createApp } from '@/api/routes';
import { createAuthService, createPasswordHash } from '@/services/auth.service';
import { createSubscriptionService } from '@/services/subscription.service';
import { createConfigService } from '@/services/config.service';

interface ResData {
  success: boolean;
  data?: Record<string, unknown>;
  error?: { code: string; message: string };
}

describe('Meta API', () => {
  let app: ReturnType<typeof createApp>;

  beforeEach(async () => {
    const kv = new MemoryKvAdapter();
    const repos = createRepositories(kv);
    const { hash, salt } = await createPasswordHash('test-pass');
    await kv.put('admin:hash', JSON.stringify({ hash, salt }));
    const auth = createAuthService(repos.sessions, async () => {
      const raw = await kv.get('admin:hash');
      return raw ? (JSON.parse(raw) as { hash: string; salt: string }) : null;
    });
    app = createApp({
      repos,
      auth,
      subscriptions: createSubscriptionService(repos, async () => '', async () => []),
      config: createConfigService(repos),
      adminPassword: 'test-pass',
      fetchRaw: async () => '',
      parseContent: async () => [],
    });
  });

  it('GET /api/meta 返回项目信息（公开，无需认证）', async () => {
    const res = await app.request('/api/meta');
    expect(res.status).toBe(200);
    const json = (await res.json()) as ResData;
    expect(json.success).toBe(true);
    const meta = json.data!.meta as { name: string; version: string; repo: string; author: string };
    expect(typeof meta.name).toBe('string');
    expect(meta.version).toMatch(/^\d+\.\d+\.\d+$/);
    expect(meta.repo).toContain('github.com');
    expect(typeof meta.author).toBe('string');
  });

  it('GET /api/meta/check-upgrade 返回结构正确（公开）', async () => {
    const res = await app.request('/api/meta/check-upgrade');
    expect(res.status).toBe(200);
    const json = (await res.json()) as ResData;
    expect(json.success).toBe(true);
    const up = json.data as { current: string; latest: string; hasUpdate: boolean; checked: boolean };
    expect(typeof up.current).toBe('string');
    expect(typeof up.latest).toBe('string');
    expect(typeof up.hasUpdate).toBe('boolean');
    // checked 可能为 true（GitHub 可达）或 false（网络失败/无 release），都合法
    expect(typeof up.checked).toBe('boolean');
  });
});