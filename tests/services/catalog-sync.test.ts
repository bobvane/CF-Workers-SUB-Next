/**
 * 测试 - 规则目录同步服务（catalog-sync）
 */
import { describe, it, expect, beforeEach } from 'vitest';
import {
  MemoryKvAdapter,
  createRepositories,
  Repositories,
} from '@/storage/kv';
import { createCatalogSyncService } from '@/services/catalog-sync.service';
import { META_DAT_BASE } from '@/generator/rule-providers';

/** 构造一个模拟 GitHub Trees API 的 tree 响应 */
function treeResponse(paths: string[]): string {
  return JSON.stringify({ tree: paths.map((p) => ({ path: p })), truncated: false });
}

describe('catalog-sync 扫描服务', () => {
  let kv: MemoryKvAdapter;
  let repos: Repositories;

  beforeEach(() => {
    kv = new MemoryKvAdapter();
    repos = createRepositories(kv);
  });

  it('首次同步：拉取上游清单入库（无旧库）', async () => {
    const service = createCatalogSyncService(repos, async () =>
      treeResponse([
        'geo/geosite/netflix.mrs',
        'geo/geosite/openai.mrs',
        'geo/geosite/github.mrs',
        'README.md',
      ])
    );
    const result = await service.sync();
    expect(result.status).toBe('ok');
    expect(result.added).toEqual(['NETFLIX', 'OPENAI', 'GITHUB']);
    expect(result.total).toBe(3);

    const catalog = await service.getCatalog();
    expect(catalog.fromKv).toBe(true);
    expect(catalog.entries.map((e) => e.id).sort()).toEqual(['GITHUB', 'NETFLIX', 'OPENAI']);
    // mrs URL 规范：小写 id
    expect(catalog.entries.find((e) => e.id === 'NETFLIX')?.mrsUrl).toBe(`${META_DAT_BASE}netflix.mrs`);
  });

  it('二次同步：无变化 → kept，无 added/removed', async () => {
    const service = createCatalogSyncService(repos, async () =>
      treeResponse(['geo/geosite/netflix.mrs'])
    );
    await service.sync();
    const result2 = await service.sync();
    expect(result2.added).toEqual([]);
    expect(result2.removed).toEqual([]);
    expect(result2.kept).toBe(1);
  });

  it('上游删除分类 → 移入黑名单 + 清理 selection', async () => {
    // 第一次：Netflix 存在，且用户勾选了 NETFLIX 和 OPENAI
    const firstTree = treeResponse(['geo/geosite/netflix.mrs', 'geo/geosite/openai.mrs']);
    const service = createCatalogSyncService(repos, async () => firstTree);
    await service.sync();
    await repos.settings.set('selected_rules', JSON.stringify(['NETFLIX', 'OPENAI']));

    // 第二次：OPENAI 从上游消失
    const secondService = createCatalogSyncService(repos, async () =>
      treeResponse(['geo/geosite/netflix.mrs'])
    );
    const result = await secondService.sync();
    expect(result.removed).toEqual(['OPENAI']);

    // selection 中 OPENAI 被清理
    const selected = JSON.parse((await repos.settings.get('selected_rules')) ?? '[]') as string[];
    expect(selected).toEqual(['NETFLIX']);

    // 黑名单记录
    const removed = await repos.ruleCatalog.getRemoved();
    expect(removed.map((r) => r.id)).toContain('OPENAI');
    expect(removed.find((r) => r.id === 'OPENAI')?.reason).toBe('upstream-gone');
  });

  it('上游返回截断 → 失败兜底 old 库保留 + status=stale', async () => {
    const okService = createCatalogSyncService(repos, async () =>
      treeResponse(['geo/geosite/netflix.mrs'])
    );
    await okService.sync();

    const failingService = createCatalogSyncService(repos, async () =>
      JSON.stringify({ tree: [], truncated: true })
    );
    const result = await failingService.sync();
    expect(result.status).toBe('stale');
    expect(result.error).toBeTruthy();

    // 旧库仍在
    const catalog = await repos.ruleCatalog.getCatalog();
    expect(catalog?.entries.map((e) => e.id)).toEqual(['NETFLIX']);
    const meta = await repos.ruleCatalog.getMeta();
    expect(meta.status).toBe('stale');
  });

  it('上游 API 抛错 → 兜底失败', async () => {
    const okService = createCatalogSyncService(repos, async () =>
      treeResponse(['geo/geosite/a.mrs'])
    );
    await okService.sync();

    const badService = createCatalogSyncService(repos, async () => {
      throw new Error('network down');
    });
    const result = await badService.sync();
    expect(result.status).toBe('stale');
    expect(result.error).toBe('network down');
  });

  it('并发保护：进行中再调 sync 返回 already-running', async () => {
    let resolveFetch: (v: string) => void = () => {};
    const service = createCatalogSyncService(repos, () =>
      new Promise<string>((resolve) => {
        resolveFetch = resolve;
      })
    );
    const p1 = service.sync(); // 挂起
    // 第一次已经置 syncing=true
    const p2 = service.sync(); // 应立即返回 already-running
    const result2 = await p2;
    expect(result2.error).toBe('already-running');
    resolveFetch(treeResponse(['geo/geosite/netflix.mrs']));
    await p1;
  });

  it('缓存读取：KV 空时用 seed（兼容 RULE_GROUPS 预置规则可解析）', async () => {
    // 用真实 catalog.json 的 seed：getCatalog 应能覆盖预置规则（如 NETFLIX）
    const service = createCatalogSyncService(repos, async () =>
      treeResponse(['geo/geosite/netflix.mrs'])
    );
    // KV 为空 → getCatalog 走 seed
    const catalog = await service.getCatalog();
    expect(catalog.fromKv).toBe(false);
    expect(catalog.entries.length).toBeGreaterThan(0);
    // seed 数据来自内置 catalog.json，NETFLIX 一定在（常用流媒体）
    expect(catalog.entries.some((e) => e.id === 'NETFLIX')).toBe(true);
  });
});