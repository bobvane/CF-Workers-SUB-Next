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
  path: string;
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
    path: `./ruleset/${providerName(rule.id)}.mrs`,
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

/** 计算规则的出口目标（按 V3.1 三层架构路由） */
export function ruleActionTarget(rule: MetaCubeXRule, groups: RuleGroup[] = []): string {
  // 定位所属分组：native 规则用大小写不敏感匹配（原生 id 为小写 geosite 分类名）
  const g = groups.find(gr => gr.items.some(i => i.id.toLowerCase() === rule.id.toLowerCase()));

  // REJECT 统一 → 广告拦截（应用净化已移除，ADS⊂ADS-ALL 93% 重叠）
  if (rule.target === 'REJECT') {
    return '广告拦截';
  }

  // 国内直连规则 → 直接 DIRECT（不建策略组）
  if (g && g.key === 'china-direct') {
    return 'DIRECT';
  }

  // DIRECT 目标：有归属按归属组，无归属直接 DIRECT
  if (rule.target === 'DIRECT') {
    if (!g) return 'DIRECT';
    return g.name;
  }

  // PROXY：找到所属规则大类
  if (!g) return '漏网之鱼'; // 无归属分组，兜底

  // 固化策略组
  if (g.key === 'ads') return '广告拦截';
  if (g.key === 'media') return '国外媒体';

  // 业务条件组 → 使用分组名
  return g.name;
}

/**
 * 单条规则的原生/Provider 输出行：
 *   - native=true → GEOSITE/<GEOIP>,<分类名>,<出口>（原生规则集，客户端内置 geodata 匹配）
 *   - native=false（或无）→ RULE-SET,geosite-<id>,<出口>（HTTP 规则集下载，用于例外组如 google-fcm）
 */
export function ruleSetLine(rule: MetaCubeXRule, groups: RuleGroup[] = []): string {
  if (rule.native) {
    const action = ruleActionTarget(rule, groups);
    // 原生规则 id 统一用小写（geosite 分类名规范）
    const normalizedId = rule.id.toLowerCase();
    if (rule.tag === 'geoip') return `GEOIP,${normalizedId},${action}`;
    return `GEOSITE,${normalizedId},${action}`;
  }
  return `RULE-SET,${providerName(rule.id)},${ruleActionTarget(rule, groups)}`;
}

/**
 * 构建 rule-providers 对象（供 YAML 序列化）
 * 只包含用户勾选的 geosite 规则
 */
export function buildRuleProviders(selected: MetaCubeXRule[] = []): Record<string, unknown> {
  const providers: Record<string, unknown> = {};
  for (const rule of selected) {
    // native 规则走原生 GEOSITE/GEOIP 输出，不生成 provider
    if (rule.native) continue;
    const p = buildRuleProvider(rule);
    providers[p.name] = {
      type: p.type,
      behavior: p.behavior,
      format: p.format,
      url: p.url,
      path: p.path,
      interval: p.interval,
    };
  }
  return providers;
}

/**
 * 生成完整 rules 数组（有序，V3.1 冻结版）
 * 优先级（自上而下匹配）：
 *   ① PRIVATE / LAN (GEOIP,private,DIRECT)           ← 必须最前，防内网误代理
 *   ② 用户自定义规则（按用户定义顺序，高于 CN/GEOIP）
 *   ③ 广告拦截 (CATEGORY-ADS-ALL) → REJECT
 *   ④ 业务分类（细分在前、宽泛在后）：
 *       谷歌FCM/微软服务/苹果服务/游戏平台/AI/社交/加密货币/用户规则
 *   ⑤ 国内直连规则 (RULE-SET,xxx,DIRECT) —— china-direct 组内规则（含原国内媒体）
 *   ⑥ GEOSITE,cn,DIRECT
 *   ⑦ GEOIP,CN,DIRECT
 *   ⑧ MATCH,漏网之鱼
 *
 * 依据：Mihomo 规则自上而下匹配，先命中的生效。
 *   - PRIVATE 必须最前（防用户把 192.168.x.x 误代理出去）
 *   - 细分规则（GEMINI/FCM/Apple-Music）必须在宽泛规则（GOOGLE/APPLE）之前
 *   - 国内规则统一 RULE-SET,xxx,DIRECT，不建策略组
 *   - 应用净化已移除（CATEGORY-ADS⊂CATEGORY-ADS-ALL，93% 重叠，并入广告拦截）
 */
export function buildRules(selected: MetaCubeXRule[] = [], groups: RuleGroup[] = []): string[] {
  const selectedSet = new Set(selected.map(r => r.id));
  const lines: string[] = [];

  // === ① PRIVATE/LAN 硬编码最前 ===
  lines.push('GEOIP,private,DIRECT');

  // === ② 用户自定义规则（最高优先级，紧跟 PRIVATE 之后第一个命中）===
  // 自定义规则可覆盖一切内置分类（包括 CN/国内直连/广告拦截）——用户显式声明的意图最优先。
  // 注意：PRIVATE 保持最前（内网流量不应被任何代理规则劫持），其余自定义规则全部置顶。
  for (const r of selected) {
    if (r.custom && selectedSet.has(r.id)) {
      lines.push(ruleSetLine(r, groups));
    }
  }

  // === ③ 广告拦截（REJECT，最高业务优先级）===
  // 遍历 ads 组所有选中项（CATEGORY-ADS-ALL + TRACKER 等），全部输出到广告拦截组
  const adsGroup = groups.find(g => g.key === 'ads');
  if (adsGroup) {
    for (const item of adsGroup.items) {
      if (selectedSet.has(item.id)) {
        lines.push(ruleSetLine(item, groups));
      }
    }
  }

  // === ④ 业务分类：按 RULE_GROUPS 顺序输出（细分在前、宽泛在后）===
  // 跳过 china-direct（由第⑤步单独处理）和 ads（已在第③步处理）
  const skipKeys = new Set(['ads', 'china-direct']);
  for (const g of groups) {
    if (skipKeys.has(g.key)) continue;
    for (const item of g.items) {
      if (item.custom) continue; // 自定义规则已在 ② 置顶输出
      // native 规则 id 可能小写（如 'netflix'），用大小写不敏感匹配
      const match = selected.find(r => r.id.toLowerCase() === item.id.toLowerCase());
      if (match) {
        lines.push(ruleSetLine(match, groups));
      }
    }
  }

  // === ⑤ 国内直连规则（china-direct 组内规则 → 直接 DIRECT）===
  // 注意：china-direct 是承重墙，所有 item 均为 native + fixed，直接输出原生规则
  for (const g of groups) {
    if (g.key !== 'china-direct') continue;
    for (const item of g.items) {
      if (item.custom) continue;
      // native 规则使用 GEOSITE/GEOIP 原生输出；无 native 标记的 fallback 到 RULE-SET
      lines.push(ruleSetLine(item, groups));
    }
  }

  // === ⑥ 兜底去重：防止孤儿规则重复 ===
  const matchedIds = new Set<string>();
  for (const l of lines) {
    const parts = l.split(',');
    if (parts[0] === 'RULE-SET' && parts[1].startsWith('geosite-')) {
      matchedIds.add(parts[1].slice(8));
    } else if (parts[0] === 'GEOSITE' || parts[0] === 'GEOIP') {
      matchedIds.add(parts[1]); // 保留 @cn/!cn 属性
    } else {
      matchedIds.add(parts[0]);
    }
  }
  const validGroupIds = new Set(groups.flatMap(g => g.items.map(i => i.id)));
  const orphanSelected = selected.filter(r => !matchedIds.has(r.id) && validGroupIds.has(r.id));
  for (const r of orphanSelected) {
    lines.push(ruleSetLine(r, groups));
  }

  // === ⑦⑧ 硬编码最终防线 ===
  // 国内直连承重墙已写进组内固定规则（第⑤步），末尾不再硬编码 GEOSITE,cn / GEOIP,CN
  // 注：GEOIP,private,DIRECT（第①步）由固定配置覆盖，不在 buildRules 中硬编码
  return [
    ...lines,
    'MATCH,漏网之鱼',
  ];
}