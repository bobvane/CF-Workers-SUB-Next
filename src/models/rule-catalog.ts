/**
 * 规则目录模型 - 动态扫描 MetaCubeX 库的快照
 * 20_RULE_CATALOG_DYNAMIC.md §3
 */

/** 分类类型（与 CatalogEntry 兼容） */
export type RuleCatalogType = 'aggregate' | 'site' | 'tld';

/** 规则目录单条分类 */
export interface RuleCatalogEntry {
  /** 分类 id（大写，如 NETFLIX） */
  id: string;
  /** 分类类型 */
  type: RuleCatalogType;
  /** mrs 下载地址 */
  mrsUrl: string;
  /** mrs 校验时间（ms） */
  verifiedAt: number;
}

/** 规则目录快照（KV rule-catalog） */
export interface RuleCatalog {
  /** 快照版本（时间戳） */
  version: string;
  /** 数据源 */
  source: string;
  /** 扫描/入库时间 */
  fetchedAt: number;
  /** 有效分类 */
  entries: RuleCatalogEntry[];
}

/** 已失效分类（KV rule-catalog-removed） */
export interface RuleCatalogRemovedEntry {
  id: string;
  /** 移除时间 */
  removedAt: number;
  reason: 'upstream-gone' | 'mrs-unreachable';
}

/** 目录元信息（KV rule-catalog-meta） */
export interface RuleCatalogMeta {
  version: string;
  fetchedAt: number;
  total: number;
  removedCount: number;
  status: 'ok' | 'stale' | 'never';
  lastError?: string;
}

export function createCatalogMeta(
  partial: Partial<RuleCatalogMeta> = {}
): RuleCatalogMeta {
  return {
    version: partial.version ?? '',
    fetchedAt: partial.fetchedAt ?? Date.now(),
    total: partial.total ?? 0,
    removedCount: partial.removedCount ?? 0,
    status: partial.status ?? 'never',
    lastError: partial.lastError,
  };
}