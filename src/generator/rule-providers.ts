/**
 * MetaCubeX 分流规则 → Mihomo rule-providers / rules 生成
 * 关键事实：Web 只写 rule-providers 的 URL，不托管规则文件。
 * 客户端启动时自行从 GitHub 拉取规则集。优先用 jsDelivr CDN（国内友好）。
 *
 * ⚠️ 已验证的 URL 事实（2026-08-15）：
 *   - MetaCubeX/meta-rules-dat 的 `release` 分支根目录只有打包大文件
 *     （geosite.dat / geosite.db 等），**没有** geosite-<分类>.dat 单文件。
 *   - 单个分类规则集在 `meta` 分支 `geo/geosite/<name>.mrs`。
 *   - 该 mrs 可经 raw.githubusercontent / cdn.jsdelivr.net / fastly.jsdelivr.net 访问，已验证 200（2026-08-16）。
 *
 * ⚠️ MRS 格式说明（2026-08-16）：
 *   - MRS 是 Mihomo 原生二进制格式（Clash Meta/OpenClash 也支持），解析更快、内存占用更低。
 *   - 本项目的 Mihomo 输出面向 Mihomo/Clash Meta/OpenClash/Stash，统一用 mrs。
 *   - Sing-box/Surge 等其它客户端输出是独立管线，各自用自己的规则格式，不受这里影响。
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
  format: 'mrs';
  type: 'http';
} {
  return {
    name: providerName(rule.id),
    type: 'http',
    behavior: 'domain',
    format: 'mrs',
    url: providerUrl(rule.id),
    interval: 86400,
  };
}

/** provider 名：geosite-<小写id> */
export function providerName(id: string): string {
  return `geosite-${id.toLowerCase()}`;
}

/** 规则文件 CDN URL（meta 分支 mrs，已验证存在） */
export function providerUrl(id: string): string {
  return `${META_DAT_BASE}${id.toLowerCase()}.mrs`;
}

/** 计算规则的出口目标（按新分组层级路由） */
export function ruleActionTarget(rule: MetaCubeXRule, groups: RuleGroup[] = []): string {
  // REJECT → 广告拦截
  if (rule.target === 'REJECT') return '广告拦截';
  // 定位所属分组
  const g = groups.find(gr => gr.items.some(i => i.id === rule.id));
  // 国内直连组：无论 DIRECT/PROXY 都进"国内直连"（私有/CN域名/CN IP/国内网站/国内流媒体）
  if (g?.key === 'china-direct') return '国内直连';
  // DIRECT 目标跟随所属分组（避免 Cloudflare/jsDelivr/Fastly 等 CDN 被误收进国内直连）
  if (rule.target === 'DIRECT') {
    // 无归属的 DIRECT 规则 → 国内直连（安全默认）
    if (!g) return '国内直连';
    // 有归属 → 走所属分组（如 cloud 组的 Cloudflare DIRECT → 云服务组）
    if (g.key === 'media') return '国外媒体';
    return g.name;
  }
  // PROXY：找到所属规则大类
  if (!g) return '漏网之鱼'; // 无归属分组，兜底到漏网之鱼
  // 国外媒体（media 组）PROXY → 国外媒体
  if (g.key === 'media') return '国外媒体';
  // 用户规则（user 组）PROXY → 用户规则组
  if (g.key === 'user') return g.name;
  // 其他大类 → 使用大类名作为分组名
  return g.name;
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
  const selectedSet = new Set(selected.map(r => r.id));
  const lines: string[] = [];

  // 按 RULE_GROUPS 既定顺序（即分组优先级）逐个输出勾选的规则。
  // 分组顺序已定义：广告拦截 → 国内直连 → 国外媒体 → ... 规则分类组。
  for (const g of groups) {
    for (const item of g.items) {
      if (selectedSet.has(item.id)) {
        lines.push(ruleSetLine(item, groups));
      }
    }
  }

  // 兜底：未被任何分组匹配到的勾选规则（防御性）
  // matchedIds 记录 rule id（大写），避免重复
  const matchedIds = new Set(lines.map(l => {
    // RULE-SET,geosite-xxx,策略 -> 提取 xxx 作为 rule id (大写)
    const parts = l.split(',');
    if (parts[0] === 'RULE-SET' && parts[1].startsWith('geosite-')) {
      return parts[1].slice(8).toUpperCase(); // 去掉 'geosite-' 前缀并转大写
    }
    return parts[1] || parts[0];
  }));
  const orphanSelected = selected.filter(r => !matchedIds.has(r.id));
  for (const r of orphanSelected) {
    lines.push(ruleSetLine(r, groups));
  }

  // 硬编码兜底（放在用户规则之后，作为最终防线）
  return [
    ...lines,
    'GEOIP,private,DIRECT',
    'GEOSITE,cn,DIRECT',
    'GEOIP,CN,DIRECT',
    'MATCH,漏网之鱼',
  ];
}