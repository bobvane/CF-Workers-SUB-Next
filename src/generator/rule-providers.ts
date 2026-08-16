/**
 * MetaCubeX 分流规则 → Mihomo rule-providers / rules 生成
 * 关键事实：Web 只写 rule-providers 的 URL，不托管规则文件。
 * 客户端启动时自行从 GitHub 拉取规则集。优先用 jsDelivr CDN（国内友好）。
 *
 * ⚠️ 已验证的 URL 事实（2026-08-15）：
 *   - MetaCubeX/meta-rules-dat 的 `release` 分支根目录只有打包大文件
 *     （geosite.dat / geosite.db 等），**没有** geosite-<分类>.dat 单文件。
 *   - 单个分类规则集在 `meta` 分支 `geo/geosite/<name>.yaml`（含 payload 列表）。
 *   - 该 yaml 可经 raw.githubusercontent 和 cdn.jsdelivr.net 访问，已验证 200。
 */
import { MetaCubeXRule, RuleGroup } from '@/data/metacubex-rules';

/** 规则文件 CDN 镜像前缀（meta 分支，国内可访问，已验证） */
export const META_DAT_BASE =
  'https://cdn.jsdelivr.net/gh/MetaCubeX/meta-rules-dat@meta/geo/geosite/';

/** 主源（GitHub raw，国内可能不通） */
export const META_DAT_GITHUB =
  'https://raw.githubusercontent.com/MetaCubeX/meta-rules-dat/meta/geo/geosite/';

/**
 * 生成单独的 rule-provider 定义（一个 geosite 分类 → 一个 http provider）
 * provider 名用 geosite-<小写id>，避免与内置 geosite 规则混淆
 */
export function buildRuleProvider(rule: MetaCubeXRule): {
  name: string;
  url: string;
  interval: number;
  behavior: 'domain';
  format: 'yaml';
  type: 'http';
} {
  return {
    name: providerName(rule.id),
    type: 'http',
    behavior: 'domain',
    format: 'yaml',
    url: providerUrl(rule.id),
    interval: 86400,
  };
}

/** provider 名：geosite-<小写id> */
export function providerName(id: string): string {
  return `geosite-${id.toLowerCase()}`;
}

/** 规则文件 CDN URL（meta 分支 yaml，已验证存在） */
export function providerUrl(id: string): string {
  return `${META_DAT_BASE}${id.toLowerCase()}.yaml`;
}

/** 计算规则的出口目标：若是 PROXY，路由到该规则所属的大类分组名；否则 DIRECT/REJECT 原样 */
export function ruleActionTarget(rule: MetaCubeXRule, groups: RuleGroup[] = []): string {
  if (rule.target !== 'PROXY') return rule.target;
  // 找到所属大类分组
  const g = groups.find(gr => gr.items.some(i => i.id === rule.id));
  // 若无归属分组，回退到 PROXY
  return g ? g.name : 'PROXY';
}

/** 单条规则的 RULE-SET 输出行（按大类分组路由） */
export function ruleSetLine(rule: MetaCubeXRule, groups: RuleGroup[] = []): string {
  return `RULE-SET,${providerName(rule.id)},${ruleActionTarget(rule, groups)}`;
}

/**
 * 构建 rule-providers 对象（供 YAML 序列化）
 * 只包含用户勾选的 geosite 规则
 */
export function buildRuleProviders(selected: MetaCubeXRule[] = []): Record<string, unknown> {
  const providers: Record<string, unknown> = {};
  for (const rule of selected) {
    const p = buildRuleProvider(rule);
    providers[p.name] = {
      type: p.type,
      behavior: p.behavior,
      format: p.format,
      url: p.url,
      interval: p.interval,
    };
  }
  return providers;
}

/**
 * 生成完整 rules 数组（有序）
 * 优先级（自上而下匹配）：
 *   1. 硬编码直连：private → cn → ads（REJECT）
 *   2. 用户勾选的 REJECT 规则（广告拦截最优先，避免被 PROXY 抢先）
 *   3. 用户勾选的 PROXY 规则（AI/加密/流媒体等必须置顶，避免被泛直连/google 抢先）
 *   4. 用户勾选的 DIRECT 规则
 *   5. GEOIP,CN,DIRECT
 *   6. MATCH,PROXY（兜底）
 *
 * 依据：Mihomo 规则自上而下匹配，先命中的生效。
 *   - 广告 REJECT 必须放在最前，否则被 PROXY 规则先匹配就漏广告
 *   - AI/加密专用 PROXY 必须放在 DIRECT 规则之前，否则 gemini.google.com 被 GEOSITE,google,PROXY 提前匹配
 */
export function buildRules(selected: MetaCubeXRule[] = [], groups: RuleGroup[] = []): string[] {
  const hardcoded: string[] = [
    'GEOIP,private,DIRECT',
    'GEOSITE,cn,DIRECT',
    'GEOSITE,category-ads-all,REJECT',
  ];

  const reject = selected
    .filter((r) => r.target === 'REJECT')
    .map((r) => ruleSetLine(r, groups));
  const proxy = selected
    .filter((r) => r.target === 'PROXY')
    .map((r) => ruleSetLine(r, groups));
  const direct = selected
    .filter((r) => r.target === 'DIRECT')
    .map((r) => ruleSetLine(r, groups));

  return [
    ...hardcoded,
    ...reject,
    ...proxy,
    ...direct,
    'GEOIP,CN,DIRECT',
    'MATCH,PROXY',
  ];
}