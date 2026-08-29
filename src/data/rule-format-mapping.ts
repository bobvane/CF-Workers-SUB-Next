/**
 * 规则格式映射表
 * 将内部规则 ID 映射到各客户端格式所需的规则源 URL
 *
 * 数据源：
 * - Surge/Shadowrocket/Loon/QuantumultX：blackmatrix7/ios_rule_script
 *   https://github.com/blackmatrix7/ios_rule_script
 * - Sing-box：MetaCubeX/meta-rules-dat (sing 分支)
 *   https://github.com/MetaCubeX/meta-rules-dat
 * - Mihomo：MetaCubeX/meta-rules-dat (meta 分支，已由 rule-providers.ts 处理)
 */
import { MetaCubeXRule } from './metacubex-rules';

/** blackmatrix7 CDN 基础 URL */
export const BLACKMATRIX7_BASE = 'https://cdn.jsdelivr.net/gh/blackmatrix7/ios_rule_script@master/rule';

/** MetaCubeX sing-box 规则 CDN 基础 URL（sing 分支 .srs 格式） */
export const METACUBEX_SING_BASE = 'https://cdn.jsdelivr.net/gh/MetaCubeX/meta-rules-dat@sing/geo/geosite';

/**
 * 内部规则 ID → blackmatrix7 规则名映射
 * 键：内部 ID（大写，如 GOOGLE、CATEGORY-ADS-ALL）
 * 值：blackmatrix7 目录名（如 Google、Advertising）
 * 未在此表中的规则 → 无对应 blackmatrix7 规则，安静跳过
 */
export const BLACKMATRIX7_MAP: Record<string, string> = {
  // 广告拦截
  'CATEGORY-ADS-ALL': 'Advertising',
  'CATEGORY-ADS': 'Advertising', // 应用净化与广告拦截共用官方广告规则源

  // 国内直连（PRIVATE、CN 由硬编码 GEOIP 兜底处理，不走 RULE-SET）
  'BAIDU': 'Baidu',
  'ALIBABA': 'Alibaba',
  'TENCENT': 'Tencent',
  'JD': 'JD',
  'XIAOMI': 'Xiaomi',
  'HUAWEI': 'Huawei',
  'UNIONPAY': 'UnionPay',
  'MEITUAN': 'Meituan',
  'KUAISHOU': 'KuaiShou',
  'XIAOHONGSHU': 'XiaoHongShu',
  'SUNING': 'Suning',
  'XUNLEI': 'Xunlei',
  'CATEGORY-ENTERTAINMENT-CN': 'ChinaMedia', // 国内流媒体聚合
  'BILIBILI': 'Bilibili',
  'IQIYI': 'IQiYi',
  'YOUKU': 'Youku',

  // 国外媒体
  'NETFLIX': 'Netflix',
  'YOUTUBE': 'YouTube',
  'DISNEY': 'Disney',
  'HBO': 'HBO',
  'PRIMEVIDEO': 'PrimeVideo',
  'TIKTOK': 'TikTok',
  'SPOTIFY': 'Spotify',
  'TWITCH': 'Twitch',
  'CATEGORY-MEDIA': 'GlobalMedia', // 国外媒体聚合

  // 加密货币
  'CATEGORY-CRYPTOCURRENCY': 'Crypto',
  'BINANCE': 'Binance',
  'HUOBI': 'Huobi',
  'BYBIT': 'Bybit',
  'GATEIO': 'GateIO',
  'COINONE': 'CoinOne',
  'LOCALBITCOINS': 'LocalBitcoins',
  '8BTC': '8BTC',

  // AI 服务
  'OPENAI': 'OpenAI',
  'ANTHROPIC': 'Anthropic',
  'GOOGLE-GEMINI': 'Gemini',
  'PERPLEXITY': 'Perplexity',
  'GITHUB-COPILOT': 'GitHubCopilot',
  'CATEGORY-AI-CHAT-!CN': 'AI', // AI 聚合

  // 社交
  'TELEGRAM': 'Telegram',
  'DISCORD': 'Discord',
  'TWITTER': 'Twitter',
  'FACEBOOK': 'Facebook',
  'INSTAGRAM': 'Instagram',
  'REDDIT': 'Reddit',
  'WHATSAPP': 'WhatsApp',
  'SIGNAL': 'Signal',

  // 游戏平台
  'STEAM': 'Steam',
  'EPICGAMES': 'Epic',
  'BLIZZARD': 'Blizzard',
  'NINTENDO': 'Nintendo',
  'ROCKSTAR': 'Rockstar',
  'ORIGIN': 'EA',
  'UBISOFT': 'Ubisoft',
  'PLAYSTATION': 'PlayStation',
  'XBOX': 'Xbox',
  'CATEGORY-GAMES-!CN': 'Game', // 游戏聚合

  // 云服务
  'CLOUDFLARE': 'Cloudflare',
  'MICROSOFT': 'Microsoft',
  'GOOGLE': 'Google',
  'AMAZON': 'Amazon',
  'DIGITALOCEAN': 'DigitalOcean',
  'ORACLE': 'Oracle',
  'VERCEL': 'Vercel',
  'HEROKU': 'Heroku',
  'DOCKER': 'Docker',

  // 开发工具
  'GITHUB': 'GitHub',
  'GITLAB': 'GitLab',
  'NPMJS': 'NPM',
  'STACKEXCHANGE': 'StackExchange',
  'NOTION': 'Notion',
  'FIGMA': 'Figma',
  'CANVA': 'Canva',
  'MEDIUM': 'Medium',
  'JSDELIVR': 'jsDelivr',
  'CATEGORY-DEV': 'Developer', // 开发聚合

  // 用户规则
  'ADOBE': 'Adobe',
  'APPLE': 'Apple',
  'ZOOM': 'Zoom',
  'SLACK': 'Slack',
  'SPEEDTEST': 'Speedtest',
  'FASTLY': 'Fastly',
  'CLOUDINARY': 'Cloudinary',
};

/**
 * 获取 blackmatrix7 Surge 规则 URL
 */
export function blackmatrix7Url(ruleName: string): string {
  return `${BLACKMATRIX7_BASE}/Surge/${ruleName}/${ruleName}.list`;
}

/**
 * 获取 blackmatrix7 QuantumultX 规则 URL
 */
export function blackmatrix7QXUrl(ruleName: string): string {
  return `${BLACKMATRIX7_BASE}/QuantumultX/${ruleName}/${ruleName}.list`;
}

/**
 * 获取 blackmatrix7 Loon 规则 URL
 */
export function blackmatrix7LoonUrl(ruleName: string): string {
  return `${BLACKMATRIX7_BASE}/Loon/${ruleName}/${ruleName}.list`;
}

/**
 * 获取 MetaCubeX sing-box 规则 URL（.srs 格式）
 */
export function metacubexSrsUrl(geositeName: string): string {
  return `${METACUBEX_SING_BASE}/${geositeName.toLowerCase()}.srs`;
}

/**
 * 获取 MetaCubeX sing-box 规则 URL（.json 格式，兜底）
 */
export function metacubexJsonUrl(geositeName: string): string {
  return `${METACUBEX_SING_BASE}/${geositeName.toLowerCase()}.json`;
}

/**
 * 判断一条规则在 blackmatrix7 中是否有对应
 * PRIVATE、CN 等基础规则由硬编码 GEOIP 兜底处理，不走 RULE-SET
 */
export function hasBlackmatrix7Mapping(ruleId: string): boolean {
  // 大小写不敏感匹配（原生规则 id 为小写 geosite 名，映射表键为大写）
  return ruleId.toUpperCase() in BLACKMATRIX7_MAP;
}

/**
 * 获取规则在 blackmatrix7 中的规则名（用于 Surge/Shadowrocket/Loon/QuantumultX）
 * 返回 null 表示无对应
 */
export function getBlackmatrix7Name(ruleId: string): string | null {
  if (!hasBlackmatrix7Mapping(ruleId)) return null;
  return BLACKMATRIX7_MAP[ruleId.toUpperCase()] ?? null;
}

/**
 * 将选中的规则过滤为某格式可用的规则列表
 * @param rules 用户勾选的规则
 * @param format 目标格式
 * @returns 可用的规则 + 被跳过的规则数
 */
export function filterRulesByFormat(
  rules: MetaCubeXRule[],
  format: 'singbox' | 'surge' | 'shadowrocket' | 'loon' | 'quantumultx'
): { usable: MetaCubeXRule[]; skipped: number } {
  const usable: MetaCubeXRule[] = [];
  let skipped = 0;

  for (const rule of rules) {
    if (format === 'singbox') {
      // Sing-box 直接用 geosite id，所有规则都可用
      usable.push(rule);
    } else {
      // Surge 系：需要 blackmatrix7 映射
      if (hasBlackmatrix7Mapping(rule.id)) {
        usable.push(rule);
      } else {
        skipped++;
      }
    }
  }

  return { usable, skipped };
}