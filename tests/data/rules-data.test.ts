/**
 * 测试 - 分流规则数据完整性
 * 验证：RULE_GROUPS 中所有规则 id 都存在于真实 geosite 目录（METACUBEX_CATALOG）
 * 防止凭记忆写入不存在的分类导致生成配置指向无效规则
 */
import { describe, it, expect } from 'vitest';
import {
  RULE_GROUPS,
  METACUBEX_CATALOG,
  isValidCategory,
  getRuleIdSet,
} from '@/data/metacubex-rules';

describe('MetaCubeX 规则数据完整性', () => {
  const catalogIds = new Set(METACUBEX_CATALOG.catalog.map((e) => e.id.toUpperCase()));

  it('catalog 包含完整分类且可被解析', () => {
    expect(METACUBEX_CATALOG.catalog.length).toBeGreaterThan(1000);
    expect(METACUBEX_CATALOG.meta.total).toBe(METACUBEX_CATALOG.catalog.length);
    // 关键分类应存在
    for (const key of ['NETFLIX', 'OPENAI', 'ANTHROPIC', 'STEAM', 'TELEGRAM', 'CATEGORY-CRYPTOCURRENCY']) {
      expect(catalogIds.has(key), `缺少分类 ${key}`).toBe(true);
    }
  });

  it('预定义分组结构完整（key/name/icon/items）', () => {
    for (const g of RULE_GROUPS) {
      expect(g.key).toBeTruthy();
      expect(g.name).toBeTruthy();
      expect(g.icon).toBeTruthy();
      expect(g.items.length).toBeGreaterThan(0);
      for (const it of g.items) {
        expect(it.id).toBeTruthy();
        expect(['geosite', 'geoip', 'ruleset']).toContain(it.tag);
        expect(['PROXY', 'DIRECT', 'REJECT']).toContain(it.target);
      }
    }
  });

  it('RULE_GROUPS 中所有 id 都存在于真实 catalog', () => {
    const missing: string[] = [];
    for (const g of RULE_GROUPS) {
      for (const it of g.items) {
        if (!catalogIds.has(it.id.toUpperCase())) {
          missing.push(`${g.key}/${it.id}`);
        }
      }
    }
    expect(missing).toEqual([]);
  });

  it('isValidCategory 校验正确', () => {
    expect(isValidCategory('netflix')).toBe(true);
    expect(isValidCategory('NETFLIX')).toBe(true);
    expect(isValidCategory('totally-not-real-cat-xyz')).toBe(false);
  });

  it('getRuleIdSet 返回去重集合', () => {
    const set = getRuleIdSet();
    expect(set.size).toBeGreaterThan(10);
    expect(set.has('NETFLIX')).toBe(true);
  });
});