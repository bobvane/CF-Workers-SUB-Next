/**
 * 规则目录同步服务 - 动态扫描 MetaCubeX 仓库
 * 20_RULE_CATALOG_DYNAMIC.md §5
 *
 * 职责：
 *  - 拉取 MetaCubeX/meta-rules-dat meta 分支 geo/geosite 下的 .mrs 文件清单
 *  - 与 KV 旧库 diff：新增 → 入库；消失 → 移入黑名单；依旧 → 保留
 *  - 写回 KV：catalog / removed / meta
 *
 * 数据源选择（2026-08-16 验证）：
 *  - GitHub Trees API 分步获取（根 → geo → geo/geosite），避免全仓库递归被 truncated 截断，
 *    最终 geosite 子目录树返回全部 *.mrs 文件名，无需对每条规则单独 HEAD 校验
 *    （Trees API 本身即"文件存在"的权威证据）。
 *  - 失败兜底：保留旧库，meta.status='stale'。
 */
import { Repositories } from '@/storage/kv';
import {
  RuleCatalog,
  RuleCatalogEntry,
  RuleCatalogMeta,
  RuleCatalogType,
  createCatalogMeta,
} from '@/models/rule-catalog';
import { META_DAT_BASE } from '@/generator/rule-providers';
import catalogRaw from '@/data/metacubex-catalog.json';

/** 上游仓库信息 */
const META_DAT_GITHUB_API = 'https://api.github.com/repos/MetaCubeX/meta-rules-dat/git/trees';
const META_DAT_BRANCH = 'meta';

/** 规则目录类型推断（与 CatalogEntry 兼容） */
function inferType(id: string): RuleCatalogType {
  if (id.startsWith('CATEGORY-') || id.includes('-')) {
    // 聚合类通常长这样；但大量站点名也带 -（如 netflix-cn）。
    // 采用与 catalog.json 一致的启发式：CATEGORY- 前缀为聚合类，其余按站点处理。
  }
  if (id.startsWith('CATEGORY-')) return 'aggregate';
  // .tld 分类一般极少；按 id 长度粗略归类（tld 通常短，但难以精确）。
  // 保守：全部归为 site，tld/aggregate 以 id 前缀为准。
  if (id.startsWith('CN-')) return 'site';
  return 'site';
}

export interface CatalogSyncResult {
  fetchedAt: number;
  total: number;
  added: string[];
  removed: string[];
  kept: number;
  status: RuleCatalogMeta['status'];
  error?: string;
}

export interface CatalogSyncService {
  /** 执行一次同步（供 cron / 手动刷新调用） */
  sync(): Promise<CatalogSyncResult>;
  /** 读取当前目录（KV 优先，空则 seed 静态 JSON） */
  getCatalog(): Promise<{ entries: RuleCatalogEntry[]; meta: RuleCatalogMeta; fromKv: boolean }>;
}

export function createCatalogSyncService(
  repos: Repositories,
  fetcher: (url: string) => Promise<string>,
  now: () => number = Date.now
): CatalogSyncService {
  /** 进程内互斥，防并发刷新 */
  let syncing = false;

  async function fetchTree(): Promise<string[]> {
    // 1. 获取根目录树，找 geo 目录的 SHA
    const rootRaw = await fetcher(`${META_DAT_GITHUB_API}/${META_DAT_BRANCH}`);
    const rootData = JSON.parse(rootRaw) as { tree?: { path: string; sha: string }[] };
    if (!rootData.tree) throw new Error('GitHub Trees API: 根目录返回格式异常');
    const geoEntry = rootData.tree.find((e) => e.path === 'geo');
    if (!geoEntry) throw new Error('GitHub Trees API: 未找到 geo 目录');

    // 2. 获取 geo 目录树，找 geosite 的 SHA
    const geoRaw = await fetcher(`${META_DAT_GITHUB_API}/${geoEntry.sha}`);
    const geoData = JSON.parse(geoRaw) as { tree?: { path: string; sha: string }[] };
    if (!geoData.tree) throw new Error('GitHub Trees API: geo 目录返回格式异常');
    const geositeEntry = geoData.tree.find((e) => e.path === 'geosite');
    if (!geositeEntry) throw new Error('GitHub Trees API: 未找到 geo/geosite 目录');

    // 3. 获取 geosite 目录树（递归，只包含 geosite 下的文件，不会截断）
    const geositeRaw = await fetcher(`${META_DAT_GITHUB_API}/${geositeEntry.sha}?recursive=1`);
    const geositeData = JSON.parse(geositeRaw) as { tree?: { path: string }[]; truncated?: boolean };
    if (!geositeData.tree) throw new Error('GitHub Trees API: geosite 目录返回格式异常');
    if (geositeData.truncated) throw new Error('GitHub Trees API: geosite 目录被截断（truncated）');

    const mrsFiles = geositeData.tree
      .map((t) => t.path)
      .filter((p) => p.endsWith('.mrs'));
    return mrsFiles.map((p) => p.slice(0, -'.mrs'.length).toUpperCase());
  }

  /** 静态 seed：内置 catalog.json（首次部署 / KV 为空时兜底） */
  function seedEntries(): RuleCatalogEntry[] {
    try {
      const data = catalogRaw as unknown as {
        catalog: { id: string; label?: string; type?: string }[];
      };
      return data.catalog.map((e) => ({
        id: e.id.toUpperCase(),
        type: (e.type === 'aggregate' ? 'aggregate' : e.type === 'tld' ? 'tld' : 'site') as RuleCatalogType,
        mrsUrl: `${META_DAT_BASE}${e.id.toLowerCase()}.mrs`,
        verifiedAt: now(),
      }));
    } catch {
      return [];
    }
  }

  return {
    async sync(): Promise<CatalogSyncResult> {
      if (syncing) {
        return { fetchedAt: now(), total: 0, added: [], removed: [], kept: 0, status: 'ok', error: 'already-running' };
      }
      syncing = true;
      const fetchedAt = now();
      try {
        // 1. 拉取上游清单
        const upstreamIds = await fetchTree();

        // 2. 读旧库
        const old = await repos.ruleCatalog.getCatalog();
        const oldById = new Map((old?.entries ?? []).map((e) => [e.id, e]));

        // 3. diff
        const upstreamSet = new Set(upstreamIds);
        const added: string[] = [];
        const removed: string[] = [];
        const kept: string[] = [];
        for (const id of upstreamIds) {
          if (!oldById.has(id)) added.push(id);
          else kept.push(id);
        }
        for (const id of oldById.keys()) {
          if (!upstreamSet.has(id)) removed.push(id);
        }

        // 4. 构建新目录
        const entries: RuleCatalogEntry[] = upstreamIds.map((id) => {
          const prev = oldById.get(id);
          return {
            id,
            type: prev?.type ?? inferType(id),
            mrsUrl: `${META_DAT_BASE}${id.toLowerCase()}.mrs`,
            verifiedAt: prev?.verifiedAt ?? fetchedAt,
          };
        });

        // 5. 失效分类不再持久化黑名单历史（v2.9.5：以官方规则库为准，失效即删，不留累积历史）
        //    removed 仍作为本次返回值保留，供前端在更新提示处显示"本次移除 N 条"

        // 6. 清理用户 selection 中的失效 id
        const selected = await repos.settings.get('selected_rules');
        if (selected && removed.length > 0) {
          try {
            const ids = JSON.parse(selected) as string[];
            // 只保留仍然存在于上游的（过滤掉已失效的）
            const next = ids.filter((id) => upstreamSet.has(id.toUpperCase()));
            if (next.length !== ids.length) {
              await repos.settings.set('selected_rules', JSON.stringify(next));
            }
          } catch {
            // 忽略损坏的 selection
          }
        }

        // 7. 写回（黑名单写空数组：不再累积失效历史）
        const version = String(fetchedAt);
        const catalog: RuleCatalog = {
          version,
          source: 'MetaCubeX/meta-rules-dat meta/geo/geosite',
          fetchedAt,
          entries,
        };
        const meta: RuleCatalogMeta = createCatalogMeta({
          version,
          fetchedAt,
          total: entries.length,
          removedCount: 0,
          status: 'ok',
        });
        await repos.ruleCatalog.setCatalog(catalog, [], meta);

        return { fetchedAt, total: entries.length, added, removed, kept: kept.length, status: 'ok' };
      } catch (err) {
        // 8. 失败兜底：保留旧库，标记 stale
        const oldMeta = await repos.ruleCatalog.getMeta();
        const meta: RuleCatalogMeta = {
          ...oldMeta,
          status: 'stale',
          lastError: (err as Error).message,
        };
        await repos.ruleCatalog.setMeta(meta);
        return {
          fetchedAt,
          total: oldMeta.total ?? 0,
          added: [],
          removed: [],
          kept: 0,
          status: 'stale',
          error: (err as Error).message,
        };
      } finally {
        syncing = false;
      }
    },

    async getCatalog() {
      const kv = await repos.ruleCatalog.getCatalog();
      if (kv && kv.entries.length > 0) {
        const meta = await repos.ruleCatalog.getMeta();
        return { entries: kv.entries, meta, fromKv: true };
      }
      return { entries: seedEntries(), meta: createCatalogMeta({ status: 'never' }), fromKv: false };
    },
  };
}

export type { RuleCatalogEntry, RuleCatalogMeta };