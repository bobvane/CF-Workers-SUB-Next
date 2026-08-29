/**
 * 测试 - 分流规则数据完整性
 * 验证：RULE_GROUPS 中所有规则 id 都存在于真实 geosite 目录（METACUBEX_CATALOG）
 * 防止凭记忆写入不存在的分类导致生成配置指向无效规则
 */
import { describe, it, expect } from 'vitest';
import {
  RULE_GROUPS,
  METACUBEX_CATALOG,
  findRuleInGroups,
} from '@/data/metacubex-rules';

function getExistingIds(): string[] {
  return METACUBEX_CATALOG.catalog.map((entry: { id: string }) => {
    if (entry.id.includes('@')) {
      return entry.id;
    }
    return entry.id.toLowerCase();
  });
}

function validateRules(testName: string, ruleIds: string[]) {
  const existing = getExistingIds();
  const missing: string[] = [];
  for (const id of ruleIds) {
    // 对于带 @ 属性的规则，catalog 中也是含 @ 的原始名
    const normalized = id.toLowerCase();
    if (!existing.includes(normalized)) {
      missing.push(id);
    }
  }
  if (missing.length > 0) {
    throw new Error(
      `${testName}: ${missing.length} rules not found in catalog: ${missing.join(', ')}`
    );
  }
}

describe('MetaCubeX 规则数据完整性', () => {
  it('catalog 包含 1545 条条目（移除 U17 后）', () => {
    expect(METACUBEX_CATALOG.catalog.length).toBe(1545);
  });

  it('广告拦截组：category-ads-all + tracker 存在 catalog 中', () => {
    validateRules('ads group', ['category-ads-all', 'tracker']);
    expect(METACUBEX_CATALOG.catalog.some((e: { id: string }) => e.id.toLowerCase() === 'category-ads-all')).toBe(true);
    expect(METACUBEX_CATALOG.catalog.some((e: { id: string }) => e.id.toLowerCase() === 'tracker')).toBe(true);
  });

  it('国内直连组：cn 存在 catalog，GEOIP,CN 是 geoip 分类', () => {
    // cn 是 geosite 分类
    expect(METACUBEX_CATALOG.catalog.some((e: { id: string }) => e.id.toUpperCase() === 'CN')).toBe(true);
    // GEOIP,CN 不在 catalog 中，是原生 geoip 规则
    expect(METACUBEX_CATALOG.catalog.some((e: { id: string }) => e.id.toUpperCase() === 'GEOIP,CN')).toBe(false);
  });

  it('AI 平台组：所有原生分类存在于 catalog 中', () => {
    const aiIds = [
      'category-ai-!cn',
      'category-ai-chat-!cn',
      'openai',
      'anthropic',
      'google-gemini',
      'github-copilot',
      'perplexity',
      'poe',
      'bytedance-ai-!cn',
      'jetbrains-ai',
    ];
    validateRules('ai group', aiIds);
  });

  it('社交组：16 条规则全部存在于 catalog 中', () => {
    const socialIds = [
      'category-communication',
      'category-social-media-!cn',
      'telegram',
      'discord',
      'twitter',
      'x',
      'meta',
      'facebook',
      'instagram',
      'tiktok',
      'reddit',
      'line',
      'whatsapp',
      'signal',
      'linkedin',
      'pinterest',
    ];
    validateRules('social group', socialIds);
  });

  it('加密货币组：12 条规则全部存在于 catalog 中', () => {
    const cryptoIds = [
      'category-cryptocurrency',
      'binance',
      'okx',
      'bybit',
      'gateio',
      'kraken',
      'kucoin',
      'huobi',
      'onekey',
      'trustwallet',
      'deribit',
      'safepal',
    ];
    validateRules('crypto group', cryptoIds);
  });

  it('所有分组的 items id 都能在 catalog 中找到对应分类', () => {
    const allIds: string[] = [];
    for (const group of RULE_GROUPS) {
      for (const item of group.items) {
        // 只检查非 native 规则；native 原生规则（如 microsoft@cn）不在 catalog 中，属正常
        if (!item.native) {
          allIds.push(item.id);
        }
      }
    }
    const existing = getExistingIds();
    const missing = allIds.filter(id => !existing.includes(id.toLowerCase()));
    if (missing.length > 0) {
      console.warn('未找到的规则 id:', missing);
    }
    expect(missing).toHaveLength(0);
  });

  it('findRuleInGroups 能正确找到 native 规则', () => {
    const rule = findRuleInGroups(RULE_GROUPS, 'openai');
    expect(rule).toBeDefined();
    expect(rule?.native).toBe(true);
  });

  it('catalog 不包含已移除的 U17', () => {
    const u17Exists = METACUBEX_CATALOG.catalog.some((e: { id: string }) => e.id.toUpperCase() === 'U17');
    expect(u17Exists).toBe(false);
  });
});
