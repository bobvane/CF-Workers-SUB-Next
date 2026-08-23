/**
 * MetaCubeX 分流规则大类定义（预定义分组 + 默认规则）
 * 数据源：MetaCubeX/meta-rules-dat geosite.dat（src/data/metacubex-catalog.json 为 1546 全量清单）
 *
 * 结构：9 个常规大类，每个大类预置常用规则（默认勾选）
 * 用户可在设置页自定义：添加/删除分类、新建大类、改名
 */
import catalogRaw from './metacubex-catalog.json';

export interface MetaCubeXRule {
  /** 规则 id（geosite category 名，大写） */
  id: string;
  /** 显示名 */
  label: string;
  /** 规则的 tag 类型：geosite / geoip / ruleset */
  tag: 'geosite' | 'geoip' | 'ruleset';
  /** 目标策略：PROXY / DIRECT / REJECT */
  target: 'PROXY' | 'DIRECT' | 'REJECT';
  /** 用户自定义规则（在输出配置中享有最高优先级，紧跟 PRIVATE 之后第一个命中） */
  custom?: boolean;
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
 * 规则优先级（自上而下匹配，见 rule-providers.buildRules，V3.1 冻结版）：
 *   1. PRIVATE / LAN（GEOIP,private → DIRECT，必须最前，防内网误代理）
 *   2. 用户自定义规则（可覆盖业务分类和 CN，但不能覆盖 LAN）
 *   3. 广告拦截（CATEGORY-ADS-ALL → REJECT）
 *   4. 业务分类（细分在前，宽泛在后；AI/开发/社交/加密/云/FCM/微软/苹果/游戏/国内媒体/国外媒体）
 *   5. 国内直连规则（RULE-SET,xxx → DIRECT，不建策略组）
 *   6. GEOSITE,cn → DIRECT
 *   7. GEOIP,CN → DIRECT
 *   8. MATCH → 漏网之鱼
 *
 * 分组顺序即策略组生成顺序（generateProxyGroups 按此数组输出）。
 * 注意：`china-direct` / `china-media` 内规则统一 RULE-SET,xxx,DIRECT，
 *       不生成「全球直连」「国内媒体」策略组（国内直连用 DIRECT 本身）。
 *       应用净化（CATEGORY-ADS）已合并进广告拦截（ADS⊂ADS-ALL，93% 重叠）。
 */
export const RULE_GROUPS: RuleGroup[] = [
  {
    key: 'ads', name: '广告拦截', icon: '🔥',
    items: [
      { id: 'CATEGORY-ADS-ALL', label: '广告拦截通用合集', tag: 'geosite', target: 'REJECT' },
    ],
  },
  {
    key: 'china-direct', name: '国内直连', icon: '🇨🇳',
    items: [
      // 私有/基础直连（LAN 必须最先放行，防内网误代理）
      { id: 'PRIVATE', label: '私有地址', tag: 'geosite', target: 'DIRECT' },
      { id: 'CN', label: '中国直连域名', tag: 'geosite', target: 'DIRECT' },
      // 国内常用网站（原"中国内地常用"并入）
      { id: 'BAIDU', label: '百度', tag: 'geosite', target: 'DIRECT' },
      { id: 'ALIBABA', label: '阿里巴巴(含淘宝/支付宝)', tag: 'geosite', target: 'DIRECT' },
      { id: 'TENCENT', label: '腾讯(含微信/QQ)', tag: 'geosite', target: 'DIRECT' },
      { id: 'JD', label: '京东', tag: 'geosite', target: 'DIRECT' },
      { id: 'XIAOMI', label: '小米', tag: 'geosite', target: 'DIRECT' },
      { id: 'HUAWEI', label: '华为', tag: 'geosite', target: 'DIRECT' },
      { id: 'UNIONPAY', label: '银联', tag: 'geosite', target: 'DIRECT' },
      { id: 'MEITUAN', label: '美团', tag: 'geosite', target: 'DIRECT' },
      { id: 'KUAISHOU', label: '快手', tag: 'geosite', target: 'DIRECT' },
      { id: 'XIAOHONGSHU', label: '小红书', tag: 'geosite', target: 'DIRECT' },
      { id: 'SUNING', label: '苏宁', tag: 'geosite', target: 'DIRECT' },
      { id: 'XUNLEI', label: '迅雷', tag: 'geosite', target: 'DIRECT' },
    ],
  },
  {
    key: 'china-media', name: '国内媒体', icon: '🎬',
    items: [
      // 国内流媒体（从原"国内直连"拆出，前端分开展示，后端都 DIRECT）
      { id: 'CATEGORY-ENTERTAINMENT-CN', label: '中国娱乐聚合', tag: 'geosite', target: 'DIRECT' },
      { id: 'BILIBILI', label: '哔哩哔哩', tag: 'geosite', target: 'DIRECT' },
      { id: 'IQIYI', label: '爱奇艺', tag: 'geosite', target: 'DIRECT' },
      { id: 'YOUKU', label: '优酷', tag: 'geosite', target: 'DIRECT' },
    ],
  },
  {
    key: 'netease', name: '网易音乐', icon: '🎵',
    items: [
      // 网易音乐默认 DIRECT（国内服务）。APPLE-MUSIC 不在此组（仅在苹果服务，避免重复）。
      { id: 'NETEASE', label: '网易音乐', tag: 'geosite', target: 'DIRECT' },
    ],
  },
  {
    key: 'google-fcm', name: '谷歌FCM', icon: '📲',
    items: [
      // 细分规则（FCM）放在宽泛规则（GOOGLE）之前，防被先命中
      { id: 'GOOGLEFCM', label: '谷歌推送(GoogFCM)', tag: 'geosite', target: 'PROXY' },
    ],
  },
  {
    key: 'bing', name: '微软Bing', icon: '🔍',
    items: [
      { id: 'BING', label: '微软必应(含国际版)', tag: 'geosite', target: 'PROXY' },
    ],
  },
  {
    key: 'onedrive', name: '微软云盘', icon: '☁️',
    items: [
      { id: 'ONEDRIVE', label: '微软 OneDrive', tag: 'geosite', target: 'PROXY' },
    ],
  },
  {
    key: 'microsoft', name: '微软服务', icon: '🪟',
    items: [
      // 微软服务整体（cn.* 子域会被国内直连先命中走 DIRECT，更稳）
      { id: 'MICROSOFT', label: '微软服务', tag: 'geosite', target: 'PROXY' },
    ],
  },
  {
    key: 'apple', name: '苹果服务', icon: '🍎',
    items: [
      // 苹果服务默认 DIRECT（中国区直连更稳）。APPLE-MUSIC 只放本组，不在网易音乐。
      { id: 'APPLE', label: '苹果服务', tag: 'geosite', target: 'DIRECT' },
      { id: 'APPLE-MUSIC', label: 'Apple Music', tag: 'geosite', target: 'DIRECT' },
      { id: 'APPLE-UPDATE', label: 'Apple 系统更新', tag: 'geosite', target: 'DIRECT' },
      { id: 'APPLE-PODCASTS', label: 'Apple 播客', tag: 'geosite', target: 'DIRECT' },
      { id: 'APPLE-TVPLUS', label: 'Apple TV+', tag: 'geosite', target: 'DIRECT' },
    ],
  },
  {
    key: 'media', name: '国外媒体', icon: '🌍',
    items: [
      { id: 'NETFLIX', label: 'Netflix', tag: 'geosite', target: 'PROXY' },
      { id: 'YOUTUBE', label: 'YouTube', tag: 'geosite', target: 'PROXY' },
      { id: 'DISNEY', label: 'Disney+', tag: 'geosite', target: 'PROXY' },
      { id: 'HBO', label: 'HBO Max', tag: 'geosite', target: 'PROXY' },
      { id: 'PRIMEVIDEO', label: 'Amazon Prime', tag: 'geosite', target: 'PROXY' },
      { id: 'TIKTOK', label: 'TikTok', tag: 'geosite', target: 'PROXY' },
      { id: 'SPOTIFY', label: 'Spotify', tag: 'geosite', target: 'PROXY' },
      { id: 'TWITCH', label: 'Twitch', tag: 'geosite', target: 'PROXY' },
      { id: 'CATEGORY-MEDIA', label: '媒体聚合', tag: 'geosite', target: 'PROXY' },
    ],
  },
  {
    key: 'game', name: '游戏平台', icon: '🎮',
    items: [
      { id: 'STEAM', label: 'Steam', tag: 'geosite', target: 'PROXY' },
      { id: 'EPICGAMES', label: 'Epic Games', tag: 'geosite', target: 'PROXY' },
      { id: 'UBISOFT', label: '育碧', tag: 'geosite', target: 'PROXY' },
      { id: 'BLIZZARD', label: '暴雪战网', tag: 'geosite', target: 'PROXY' },
      { id: 'NINTENDO', label: '任天堂', tag: 'geosite', target: 'PROXY' },
      { id: 'ROCKSTAR', label: 'R星', tag: 'geosite', target: 'PROXY' },
      { id: 'ORIGIN', label: 'Origin/EA', tag: 'geosite', target: 'PROXY' },
      { id: 'PLAYSTATION', label: 'PlayStation', tag: 'geosite', target: 'PROXY' },
      { id: 'XBOX', label: 'Xbox', tag: 'geosite', target: 'PROXY' },
      { id: 'CATEGORY-GAMES-CN', label: '游戏中国区', tag: 'geosite', target: 'DIRECT' },
      { id: 'CATEGORY-GAMES-!CN', label: '游戏聚合(非中国)', tag: 'geosite', target: 'PROXY' },
    ],
  },
  {
    key: 'ai', name: 'AI 平台', icon: '🤖',
    items: [
      { id: 'OPENAI', label: 'OpenAI / ChatGPT', tag: 'geosite', target: 'PROXY' },
      { id: 'ANTHROPIC', label: 'Claude (Anthropic)', tag: 'geosite', target: 'PROXY' },
      { id: 'GOOGLE-GEMINI', label: 'Gemini', tag: 'geosite', target: 'PROXY' },
      { id: 'PERPLEXITY', label: 'Perplexity', tag: 'geosite', target: 'PROXY' },
      { id: 'GITHUB-COPILOT', label: 'GitHub Copilot', tag: 'geosite', target: 'PROXY' },
      { id: 'CATEGORY-AI-CHAT-!CN', label: 'AI 对话(非中国)', tag: 'geosite', target: 'PROXY' },
    ],
  },
  {
    key: 'dev', name: '开发工具', icon: '💻',
    items: [
      // GitHub 并入开发工具（不独立成组）
      { id: 'GITHUB', label: 'GitHub', tag: 'geosite', target: 'PROXY' },
      { id: 'GITLAB', label: 'GitLab', tag: 'geosite', target: 'PROXY' },
      { id: 'NPMJS', label: 'npm', tag: 'geosite', target: 'PROXY' },
      { id: 'STACKEXCHANGE', label: 'StackExchange', tag: 'geosite', target: 'PROXY' },
      { id: 'NOTION', label: 'Notion', tag: 'geosite', target: 'PROXY' },
      { id: 'FIGMA', label: 'Figma', tag: 'geosite', target: 'PROXY' },
      { id: 'CANVA', label: 'Canva', tag: 'geosite', target: 'PROXY' },
      { id: 'MEDIUM', label: 'Medium', tag: 'geosite', target: 'PROXY' },
      { id: 'JSDELIVR', label: 'jsDelivr', tag: 'geosite', target: 'DIRECT' },
      { id: 'CATEGORY-DEV', label: '开发聚合', tag: 'geosite', target: 'PROXY' },
    ],
  },
  {
    key: 'social', name: '社交', icon: '📱',
    items: [
      { id: 'TELEGRAM', label: 'Telegram', tag: 'geosite', target: 'PROXY' },
      { id: 'DISCORD', label: 'Discord', tag: 'geosite', target: 'PROXY' },
      { id: 'TWITTER', label: 'X / Twitter', tag: 'geosite', target: 'PROXY' },
      { id: 'FACEBOOK', label: 'Facebook', tag: 'geosite', target: 'PROXY' },
      { id: 'INSTAGRAM', label: 'Instagram', tag: 'geosite', target: 'PROXY' },
      { id: 'REDDIT', label: 'Reddit', tag: 'geosite', target: 'PROXY' },
      { id: 'WHATSAPP', label: 'WhatsApp', tag: 'geosite', target: 'PROXY' },
      { id: 'SIGNAL', label: 'Signal', tag: 'geosite', target: 'PROXY' },
    ],
  },
  {
    key: 'cloud', name: '云服务', icon: '☁️',
    items: [
      // 移除 MICROSOFT（已拆到"微软服务"组）。GOOGLE 保留（细分 GEMINI/FCM 已在前置组）
      { id: 'CLOUDFLARE', label: 'Cloudflare', tag: 'geosite', target: 'DIRECT' },
      { id: 'GOOGLE', label: 'Google', tag: 'geosite', target: 'PROXY' },
      { id: 'AMAZON', label: 'Amazon/AWS', tag: 'geosite', target: 'PROXY' },
      { id: 'DIGITALOCEAN', label: 'DigitalOcean', tag: 'geosite', target: 'PROXY' },
      { id: 'ORACLE', label: 'Oracle', tag: 'geosite', target: 'PROXY' },
      { id: 'VERCEL', label: 'Vercel', tag: 'geosite', target: 'PROXY' },
      { id: 'HEROKU', label: 'Heroku', tag: 'geosite', target: 'PROXY' },
      { id: 'DOCKER', label: 'Docker', tag: 'geosite', target: 'PROXY' },
    ],
  },
  {
    key: 'crypto', name: '加密货币', icon: '💰',
    items: [
      { id: 'CATEGORY-CRYPTOCURRENCY', label: '加密货币通用合集', tag: 'geosite', target: 'PROXY' },
      { id: 'BINANCE', label: '币安 Binance', tag: 'geosite', target: 'PROXY' },
      { id: 'HUOBI', label: '火币 Huobi', tag: 'geosite', target: 'PROXY' },
      { id: 'BYBIT', label: 'Bybit', tag: 'geosite', target: 'PROXY' },
      { id: 'GATEIO', label: 'Gate.io', tag: 'geosite', target: 'PROXY' },
      { id: 'COINONE', label: 'CoinOne', tag: 'geosite', target: 'PROXY' },
      { id: 'LOCALBITCOINS', label: 'LocalBitcoins', tag: 'geosite', target: 'PROXY' },
      { id: '8BTC', label: '巴比特', tag: 'geosite', target: 'PROXY' },
    ],
  },
  {
    key: 'user', name: '用户规则', icon: '👑',
    items: [
      // 移除 APPLE（已拆到"苹果服务"组）
      { id: 'ADOBE', label: 'Adobe', tag: 'geosite', target: 'PROXY' },
      { id: 'ZOOM', label: 'Zoom', tag: 'geosite', target: 'DIRECT' },
      { id: 'SLACK', label: 'Slack', tag: 'geosite', target: 'PROXY' },
      { id: 'SPEEDTEST', label: 'Speedtest', tag: 'geosite', target: 'DIRECT' },
      { id: 'FASTLY', label: 'Fastly', tag: 'geosite', target: 'DIRECT' },
      { id: 'CLOUDINARY', label: 'Cloudinary', tag: 'geosite', target: 'DIRECT' },
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