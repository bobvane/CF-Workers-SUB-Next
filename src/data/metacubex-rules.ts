/**
 * MetaCubeX 分流规则大类定义（预定义分组 + 默认规则）
 * 数据源：MetaCubeX/meta-rules-dat geosite.dat（src/data/metacubex-catalog.json 为 1546 全量清单）
 *
 * 结构：9 个常规大类，每个大类预置常用规则（默认勾选）
 * 用户可在设置页自定义：添加/删除分类、新建大类、改名
 */
import catalogRaw from './metacubex-catalog.json';

export interface MetaCubeXRule {
  /** 规则 id（geosite category 名。原生规则为小写分类名，可含 @cn/!cn 属性；provider 规则为大写 catalog id） */
  id: string;
  /** 显示名 */
  label: string;
  /** 规则的 tag 类型：geosite / geoip / ruleset */
  tag: 'geosite' | 'geoip' | 'ruleset';
  /** 目标策略：PROXY / DIRECT / REJECT */
  target: 'PROXY' | 'DIRECT' | 'REJECT';
  /** 用户自定义规则（在输出配置中享有最高优先级，紧跟 PRIVATE 之后第一个命中） */
  custom?: boolean;
  /** 原生 GEOSITE/GEOIP 输出（不走 rule-provider）；缺省=false → 走 RULE-SET provider */
  native?: boolean;
  /** 灰色固定（承重墙）：UI 展示但不可取消，输出端始终输出 */
  fixed?: boolean;
}

export interface RuleGroup {
  /** 分组 key */
  key: string;
  /** 分组名 */
  name: string;
  /** 图标 */
  icon: string;
  /** 组内规则 */
  items: MetaCubeXRule[];
}

/** 全量分类目录（供扫描/搜索使用，不参与默认勾选） */
export interface CatalogEntry {
  id: string;
  label: string;
  type: 'aggregate' | 'site' | 'tld';
}

/** 用户自定义加入的规则（存 KV，合并进 RULE_GROUPS 展示与生成） */
export interface CustomRule {
  /** geosite 分类 id（大写） */
  id: string;
  /** 显示名（用户可改） */
  label: string;
  /** 归入的大分组 key（必须是 RULE_GROUPS 中的 key） */
  groupKey: string;
  /** 分流目标 */
  target: 'PROXY' | 'DIRECT' | 'REJECT';
  /** 添加时间戳 */
  createdAt?: number;
}

export const METACUBEX_CATALOG: { meta: Record<string, string | number>; catalog: CatalogEntry[] } = catalogRaw as unknown as {
  meta: Record<string, string | number>;
  catalog: CatalogEntry[];
};

/**
 * 预定义规则分组
 * 规则优先级（自上而下匹配，见 rule-providers.buildRules，V3.2 冻结版 — v2.11.0 规则排序重构）：
 *   1. 用户规则（默认 DIRECT，面板可切换；无预设规则，等用户添加）
 *   2. 内网防代理：GEOIP,lan,DIRECT,no-resolve + GEOSITE,private,DIRECT（lan 在前）
 *   3. 广告拦截（CATEGORY-ADS-ALL → REJECT）
 *   4. 国内直连（china-direct 组 7 条 GEOSITE → DIRECT；GEOIP,CN 已剥离）
 *   5. 业务分类（细分在前，宽泛在后；FCM/AI/社交/媒体/游戏/微软/苹果/加密货币 → 厂商组最后）
 *   6. GEOIP,CN → DIRECT（从国内直连组剥离，排 crypto 之后）
 *   7. MATCH → 漏网之鱼
 *
 * 分组顺序即策略组生成顺序（generateProxyGroups 按此数组输出）。
 * 注意：`china-direct` 内规则统一 GEOSITE,xxx,DIRECT，
 *       不生成「全球直连」策略组（国内直连用 DIRECT 本身）。
 *       应用净化（CATEGORY-ADS）已合并进广告拦截（ADS⊂ADS-ALL，93% 重叠）。
 */
export const RULE_GROUPS: RuleGroup[] = [
  // 用户规则组 — 首位，优先级最高
  {
    key: 'user', name: '用户规则', icon: '👑',
    items: [
      // 用户规则组初始为空，规则由用户从右侧规则库自行添加
    ],
  },
  {
    key: 'ads', name: '广告拦截', icon: '🔥',
    items: [
      // 广告拦截 — 原生 GEOSITE 输出，不走 rule-provider
      { id: 'category-ads-all', label: '广告拦截通用合集', tag: 'geosite', target: 'REJECT', native: true, fixed: true },
      { id: 'tracker', label: '追踪器(Tracker)', tag: 'geosite', target: 'REJECT', native: true, fixed: true },
    ],
  },
  {
    key: 'china-direct', name: '国内直连', icon: '🇨🇳',
    items: [
      // 承重墙 — 固定灰色，不可取消；末尾去重，只留 MATCH
      { id: 'cn', label: '中国直连域名', tag: 'geosite', target: 'DIRECT', native: true, fixed: true },
      { id: 'apple-cn', label: '苹果服务(中国区)', tag: 'geosite', target: 'DIRECT', native: true },
      { id: 'microsoft@cn', label: '微软服务(中国区)', tag: 'geosite', target: 'DIRECT', native: true },
      { id: 'steam@cn', label: 'Steam 中国区', tag: 'geosite', target: 'DIRECT', native: true },
      { id: 'category-games@cn', label: '游戏中国区', tag: 'geosite', target: 'DIRECT', native: true },
      { id: 'onedrive', label: '微软 OneDrive', tag: 'geosite', target: 'DIRECT', native: true },
      { id: 'icloud@cn', label: 'iCloud 中国区', tag: 'geosite', target: 'DIRECT', native: true },
    ],
  },
  {
    key: 'google-fcm', name: '谷歌FCM', icon: '📲',
    items: [
      { id: 'googlefcm', label: '谷歌推送(Google FCM)', tag: 'geosite', target: 'PROXY', native: true },
    ],
  },
  {
    key: 'ai', name: 'AI 平台', icon: '🤖',
    items: [
      // 原生 GEOSITE 输出，全部灰色固定
      { id: 'category-ai-!cn', label: 'AI 平台(非中国)', tag: 'geosite', target: 'PROXY', native: true, fixed: true },
      { id: 'category-ai-chat-!cn', label: 'AI 对话(非中国)', tag: 'geosite', target: 'PROXY', native: true, fixed: true },
      { id: 'openai', label: 'OpenAI / ChatGPT', tag: 'geosite', target: 'PROXY', native: true, fixed: true },
      { id: 'anthropic', label: 'Claude (Anthropic)', tag: 'geosite', target: 'PROXY', native: true, fixed: true },
      { id: 'google-gemini', label: 'Gemini', tag: 'geosite', target: 'PROXY', native: true, fixed: true },
      { id: 'github-copilot', label: 'GitHub Copilot', tag: 'geosite', target: 'PROXY', native: true, fixed: true },
      { id: 'perplexity', label: 'Perplexity', tag: 'geosite', target: 'PROXY', native: true, fixed: true },
      { id: 'poe', label: 'POE', tag: 'geosite', target: 'PROXY', native: true, fixed: true },
      { id: 'bytedance-ai-!cn', label: '字节跳动 AI(非中国)', tag: 'geosite', target: 'PROXY', native: true, fixed: true },
      { id: 'jetbrains-ai', label: 'JetBrains AI', tag: 'geosite', target: 'PROXY', native: true, fixed: true },
    ],
  },
  {
    key: 'social', name: '社交', icon: '📱',
    items: [
      // 原生 GEOSITE 输出，普通可勾选
      { id: 'category-communication', label: '社交通讯聚合', tag: 'geosite', target: 'PROXY', native: true },
      { id: 'category-social-media-!cn', label: '海外社交(非中国)', tag: 'geosite', target: 'PROXY', native: true, fixed: true },
      { id: 'telegram', label: 'Telegram', tag: 'geosite', target: 'PROXY', native: true },
      { id: 'discord', label: 'Discord', tag: 'geosite', target: 'PROXY', native: true },
      { id: 'twitter', label: 'X / Twitter', tag: 'geosite', target: 'PROXY', native: true },
      { id: 'x', label: 'X (原Twitter)', tag: 'geosite', target: 'PROXY', native: true },
      { id: 'meta', label: 'Meta 系列(Facebook/Instagram)', tag: 'geosite', target: 'PROXY', native: true },
      { id: 'facebook', label: 'Facebook', tag: 'geosite', target: 'PROXY', native: true },
      { id: 'instagram', label: 'Instagram', tag: 'geosite', target: 'PROXY', native: true },
      { id: 'tiktok', label: 'TikTok', tag: 'geosite', target: 'PROXY', native: true },
      { id: 'reddit', label: 'Reddit', tag: 'geosite', target: 'PROXY', native: true },
      { id: 'line', label: 'Line', tag: 'geosite', target: 'PROXY', native: true },
      { id: 'whatsapp', label: 'WhatsApp', tag: 'geosite', target: 'PROXY', native: true },
      { id: 'signal', label: 'Signal', tag: 'geosite', target: 'PROXY', native: true },
      { id: 'linkedin', label: 'LinkedIn', tag: 'geosite', target: 'PROXY', native: true },
      { id: 'pinterest', label: 'Pinterest', tag: 'geosite', target: 'PROXY', native: true },
    ],
  },
  {
    key: 'media', name: '国外媒体', icon: '🌍',
    items: [
      // 原生 GEOSITE 输出；category-media 灰色固定，其余可选；apple-music 已归入苹果服务组（DIRECT）
      { id: 'category-media', label: '媒体聚合', tag: 'geosite', target: 'PROXY', native: true, fixed: true },
      { id: 'youtube', label: 'YouTube', tag: 'geosite', target: 'PROXY', native: true },
      { id: 'netflix', label: 'Netflix', tag: 'geosite', target: 'PROXY', native: true },
      { id: 'biliintl', label: 'B站国际版', tag: 'geosite', target: 'PROXY', native: true },
      { id: 'bahamut', label: '巴哈姆特', tag: 'geosite', target: 'PROXY', native: true },
      { id: 'pixiv', label: 'Pixiv', tag: 'geosite', target: 'PROXY', native: true },
      { id: 'abema', label: 'Abema', tag: 'geosite', target: 'PROXY', native: true },
      { id: 'spotify', label: 'Spotify', tag: 'geosite', target: 'PROXY', native: true },
      { id: 'disney', label: 'Disney+', tag: 'geosite', target: 'PROXY', native: true },
      { id: 'ehentai', label: 'E-Hentai', tag: 'geosite', target: 'PROXY', native: true },
    ],
  },
  {
    key: 'game', name: '游戏平台', icon: '🎮',
    items: [
      // 原生 GEOSITE 输出；category-games-!cn 灰色固定，其余可选
      { id: 'category-games-!cn', label: '游戏聚合(非中国)', tag: 'geosite', target: 'PROXY', native: true, fixed: true },
      { id: 'steam', label: 'Steam', tag: 'geosite', target: 'PROXY', native: true },
      { id: 'epicgames', label: 'Epic Games', tag: 'geosite', target: 'PROXY', native: true },
      { id: 'ea', label: 'EA', tag: 'geosite', target: 'PROXY', native: true },
      { id: 'origin', label: 'Origin/EA', tag: 'geosite', target: 'PROXY', native: true },
      { id: 'ubisoft', label: '育碧', tag: 'geosite', target: 'PROXY', native: true },
      { id: 'gog', label: 'GOG', tag: 'geosite', target: 'PROXY', native: true },
      { id: 'blizzard', label: '暴雪战网', tag: 'geosite', target: 'PROXY', native: true },
      { id: 'riot', label: 'Riot', tag: 'geosite', target: 'PROXY', native: true },
      { id: 'xbox', label: 'Xbox', tag: 'geosite', target: 'PROXY', native: true },
      { id: 'playstation', label: 'PlayStation', tag: 'geosite', target: 'PROXY', native: true },
      { id: 'nintendo', label: '任天堂', tag: 'geosite', target: 'PROXY', native: true },
    ],
  },
  {
    key: 'microsoft', name: '微软服务', icon: '🪟',
    items: [
      // 原生 GEOSITE 输出；microsoft 灰色固定，其余可选；skype 被 microsoft 聚合兜底；onedrive 已在国内直连走 DIRECT，不在本组重复
      { id: 'microsoft', label: '微软服务', tag: 'geosite', target: 'PROXY', native: true, fixed: true },
      { id: 'microsoft-dev', label: '微软开发者', tag: 'geosite', target: 'PROXY', native: true },
      { id: 'microsoft-pki', label: '微软 PKI', tag: 'geosite', target: 'PROXY', native: true },
      { id: 'azure', label: 'Azure 云服务', tag: 'geosite', target: 'PROXY', native: true },
      { id: 'bing', label: '微软必应(含国际版)', tag: 'geosite', target: 'PROXY', native: true },
      { id: 'msn', label: 'MSN', tag: 'geosite', target: 'PROXY', native: true },
    ],
  },
  {
    key: 'apple', name: '苹果服务', icon: '🍎',
    items: [
      // 原生 GEOSITE 输出；apple 灰色固定，其余可选；appstore 被 apple/itunes 聚合兜底，不在本组重复
      { id: 'apple', label: '苹果服务', tag: 'geosite', target: 'DIRECT', native: true, fixed: true },
      { id: 'apple-music', label: 'Apple Music', tag: 'geosite', target: 'DIRECT', native: true },
      { id: 'apple-dev', label: 'Apple 开发者', tag: 'geosite', target: 'DIRECT', native: true },
      { id: 'apple-update', label: 'Apple 系统更新', tag: 'geosite', target: 'DIRECT', native: true },
      { id: 'apple-pki', label: 'Apple PKI', tag: 'geosite', target: 'DIRECT', native: true },
      { id: 'apple-podcasts', label: 'Apple 播客', tag: 'geosite', target: 'DIRECT', native: true },
      { id: 'apple-tvplus', label: 'Apple TV+', tag: 'geosite', target: 'DIRECT', native: true },
      { id: 'apple-intelligence', label: 'Apple Intelligence', tag: 'geosite', target: 'DIRECT', native: true },
      { id: 'icloud', label: 'iCloud', tag: 'geosite', target: 'DIRECT', native: true },
      { id: 'itunes', label: 'iTunes', tag: 'geosite', target: 'DIRECT', native: true },
    ],
  },
  {
    key: 'crypto', name: '加密货币', icon: '💰',
    items: [
      // 原生 GEOSITE 输出；category-cryptocurrency 灰色固定，其余可选
      { id: 'category-cryptocurrency', label: '加密货币通用合集', tag: 'geosite', target: 'PROXY', native: true, fixed: true },
      { id: 'binance', label: '币安 Binance', tag: 'geosite', target: 'PROXY', native: true },
      { id: 'okx', label: 'OKX', tag: 'geosite', target: 'PROXY', native: true },
      { id: 'bybit', label: 'Bybit', tag: 'geosite', target: 'PROXY', native: true },
      { id: 'gateio', label: 'Gate.io', tag: 'geosite', target: 'PROXY', native: true },
      { id: 'kraken', label: 'Kraken', tag: 'geosite', target: 'PROXY', native: true },
      { id: 'kucoin', label: 'KuCoin', tag: 'geosite', target: 'PROXY', native: true },
      { id: 'huobi', label: '火币 Huobi', tag: 'geosite', target: 'PROXY', native: true },
      { id: 'onekey', label: 'OneKey', tag: 'geosite', target: 'PROXY', native: true },
      { id: 'trustwallet', label: 'Trust Wallet', tag: 'geosite', target: 'PROXY', native: true },
      { id: 'deribit', label: 'Deribit', tag: 'geosite', target: 'PROXY', native: true },
      { id: 'safepal', label: 'SafePal', tag: 'geosite', target: 'PROXY', native: true },
    ],
  },

];

/** 将 RULE_GROUPS 转为前端所需的小写风格（保持 geosite id 大写） */
export function getRuleIdSet(): Set<string> {
  return new Set(RULE_GROUPS.flatMap(g => g.items.map(i => i.id)));
}

/** 从 catalog 查找分类 */
export function findCatalogEntry(id: string): CatalogEntry | undefined {
  return METACUBEX_CATALOG.catalog.find(e => e.id === id || e.id === id.toUpperCase());
}

/** 检查分类是否存在于真实 geosite 数据 */
export function isValidCategory(id: string): boolean {
  return METACUBEX_CATALOG.catalog.some(e => e.id === id.toUpperCase());
}

/**
 * 将自定义规则合并进 RULE_GROUPS（按 groupKey 插入对应分组）
 * 返回新的分组数组（不修改原常量）
 */
export function mergeCustomRules(custom: CustomRule[]): RuleGroup[] {
  if (custom.length === 0) return RULE_GROUPS;
  const groups = RULE_GROUPS.map(g => ({ key: g.key, name: g.name, icon: g.icon, items: [...g.items] }));
  for (const c of custom) {
    const group = groups.find(g => g.key === c.groupKey);
    const item: MetaCubeXRule = { id: c.id, label: c.label, tag: 'geosite', target: c.target, custom: true };
    if (group) {
      // 去重：同一分组内已存在同 id 则替换
      const idx = group.items.findIndex(i => i.id === c.id);
      if (idx >= 0) group.items[idx] = item;
      else group.items.push(item);
    } else {
      // 分组不存在则放到"用户规则"，不存在就建一个
      const other = groups.find(g => g.key === 'user');
      if (other && !other.items.some(i => i.id === c.id)) other.items.push(item);
    }
  }
  return groups;
}

/**
 * 在合并了自定义规则的分组中查找规则（含自定义）
 */
export function findRuleInGroups(groups: RuleGroup[], id: string): MetaCubeXRule | undefined {
  for (const g of groups) {
    const f = g.items.find(i => i.id === id);
    if (f) return f;
  }
  return undefined;
}