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

/** 构造分步式 mock fetcher：按 URL 返回不同层级树。geositeFiles 兼容带/不带 geo/geosite/ 前缀 */
function mockTreeFetcher(geositeFiles: string[], truncated = false): (url: string) => Promise<string> {
  const geoEntry = { path: 'geo', sha: 'sha_geo' };
  const geositeEntry = { path: 'geosite', sha: 'sha_geosite' };
  return async (url: string) => {
    if (url.includes('?recursive=1')) {
      // geosite 子树：path 是相对 geosite 名字（去掉 geo/geosite/ 前缀）
      const names = geositeFiles.map((p) => p.replace('geo/geosite/', ''));
      return JSON.stringify({ tree: names.map((p) => ({ path: p })), truncated });
    }
    if (url.includes('sha_geo')) {
      // geo 目录树：返回 geosite 条目
      return JSON.stringify({ tree: [geositeEntry], truncated: false });
    }
    // 根目录树：返回 geo 条目
    return JSON.stringify({ tree: [geoEntry], truncated: false });
  };
}

describe('catalog-sync 扫描服务', () => {
  let kv: MemoryKvAdapter;
  let repos: Repositories;

  beforeEach(() => {
    kv = new MemoryKvAdapter();
    repos = createRepositories(kv);
  });

  it('首次同步：拉取上游清单入库（无旧库）', async () => {
    const service = createCatalogSyncService(repos, mockTreeFetcher([
      'geo/geosite/netflix.mrs',
      'geo/geosite/openai.mrs',
      'geo/geosite/github.mrs',
      'README.md',
    ]));
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
    const service = createCatalogSyncService(repos, mockTreeFetcher(['geo/geosite/netflix.mrs']));
    await service.sync();
    const result2 = await service.sync();
    expect(result2.added).toEqual([]);
    expect(result2.removed).toEqual([]);
    expect(result2.kept).toBe(1);
  });

  it('上游删除分类 → 移入黑名单 + 清理 selection', async () => {
    // 第一次：Netflix 存在，且用户勾选了 NETFLIX 和 OPENAI
    const service = createCatalogSyncService(repos, mockTreeFetcher(['geo/geosite/netflix.mrs', 'geo/geosite/openai.mrs']));
    await service.sync();
    await repos.settings.set('selected_rules', JSON.stringify(['NETFLIX', 'OPENAI']));

    // 第二次：OPENAI 从上游消失
    const secondService = createCatalogSyncService(repos, mockTreeFetcher(['geo/geosite/netflix.mrs']));
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
    const okService = createCatalogSyncService(repos, mockTreeFetcher(['geo/geosite/netflix.mrs']));
    await okService.sync();

    // 模拟截断：geosite 递归树返回 truncated=true
    const failingService = createCatalogSyncService(repos, mockTreeFetcher([], true));
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
    const okService = createCatalogSyncService(repos, mockTreeFetcher(['geo/geosite/a.mrs']));
    await okService.sync();

    const badService = createCatalogSyncService(repos, async () => {
      throw new Error('network down');
    });
    const result = await badService.sync();
    expect(result.status).toBe('stale');
    expect(result.error).toBe('network down');
  });

  it('并发保护：进行中再调 sync 返回 already-running', async () => {
    // 用可控 resolvable 门闩：第一次 fetch 挂起，其余委托给真实 mock
    const realFetcher = mockTreeFetcher(['geo/geosite/netflix.mrs']);
    let callCount = 0;
    let releaseFirst: (v: string) => void = () => {};
    const gatePromise = new Promise<string>((resolve) => { releaseFirst = resolve; });
    const service = createCatalogSyncService(repos, async (url: string) => {
      callCount += 1;
      if (callCount === 1) return gatePromise; // 第一次卡住，制造并发窗口
      return realFetcher(url);
    });
    const p1 = service.sync(); // 挂起（第一次 fetch 被 gate 挡住）
    // 第一次已经置 syncing=true → 第二次立即返回 already-running
    const p2 = service.sync();
    const result2 = await p2;
    expect(result2.error).toBe('already-running');
    // 释放第一次 fetch，p1 继续走完
    releaseFirst(JSON.stringify({ tree: [{ path: 'geo', sha: 'sha_geo' }], truncated: false }));
    await p1;
  });

  it('缓存读取：KV 空时用 seed（兼容 RULE_GROUPS 预置规则可解析）', async () => {
    // 用真实 catalog.json 的 seed：getCatalog 应能覆盖预置规则（如 NETFLIX）
    const service = createCatalogSyncService(repos, mockTreeFetcher(['geo/geosite/netflix.mrs']));
    // KV 为空 → getCatalog 走 seed
    const catalog = await service.getCatalog();
    expect(catalog.fromKv).toBe(false);
    expect(catalog.entries.length).toBeGreaterThan(0);
    // seed 数据来自内置 catalog.json，NETFLIX 一定在（常用流媒体）
    expect(catalog.entries.some((e) => e.id === 'NETFLIX')).toBe(true);
  });
});