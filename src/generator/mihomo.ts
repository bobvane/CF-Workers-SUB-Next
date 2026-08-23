/**
 * Mihomo 配置生成器
 * TASK 5.1 - Mihomo Generator
 * 09_CONFIG_GENERATOR_SPEC.md §7：输出 YAML，兼容 Mihomo/Clash Meta/OpenClash
 */

import { Node } from '@/models/node';
import { generateYaml, parseYaml } from './yaml-serializer';
import { MetaCubeXRule, RuleGroup } from '@/data/metacubex-rules';
import { buildRuleProviders, buildRules } from './rule-providers';
import {
  COUNTRIES,
  CHINESE_ALIAS_TO_CODE,
  GEO_ORDER,
  countryDisplayName,
} from '@/data/country-codes';

/** 判断是否为 IPv4 地址 */
function isIPAddress(host: string): boolean {
  return /^\d{1,3}(\.\d{1,3}){3}$/.test(host);
}

/**
 * 节点名去重：同名节点追加数字后缀
 */
export function makeUniqueNames(nodes: Node[]): Node[] {
  const seen = new Map<string, number>();
  return nodes.map((n) => {
    const count = seen.get(n.name) ?? 0;
    seen.set(n.name, count + 1);
    if (count === 0) return n;
    return { ...n, name: `${n.name}-${count}` };
  });
}

export interface MihomoTemplate {
  mixedPort?: number;
  allowLan?: boolean;
  mode?: string;
  logLevel?: string;
  externalController?: string;
  ipv6?: boolean;
}

export const DEFAULT_MIHOMO_TEMPLATE: MihomoTemplate = {
  mixedPort: 7890,
  allowLan: true, // 旁路由/网关场景：局域网设备需指定 7890 混合端口走代理。仅监听内网 NIC，配合 bind-address 可进一步限制。
  mode: 'rule',
  logLevel: 'warning', // 长期运行 info 日志量过大，warning 足够诊断
  ipv6: false, // 默认关闭 IPv6，避免 IPv4 走代理 / IPv6 走直连的诡异分流
};

/**
 * 默认 DNS 配置（fake-ip 模式）
 * 固定输出——防止 DNS 污染/泄漏（AI 审查两票共识的最大缺陷）。
 * nameserver 用国内 DoH 解析国内域名；fallback 用国外 DoH 解析被污染域名；
 * fallback-filter 按 GEOIP CN 判定：解析结果非 CN IP 时采用 fallback 结果。
 */
export const DEFAULT_DNS_CONFIG: Record<string, unknown> = {
  enable: true,
  ipv6: false,
  'enhanced-mode': 'fake-ip',
  'fake-ip-range': '198.18.0.1/16',
  'fake-ip-filter': [
    '*.lan',
    '*.local',
    '*.localdomain',
    '+.stun.*.*',
    '+.stun.*.*.*',
    '+.stun.*.*.*.*',
    '+.stun.*.*.*.*.*',
    'time.windows.com',
    'time.*.apple.com',
    'ntp.*.com',
  ],
  nameserver: ['https://223.5.5.5/dns-query', 'https://doh.pub/dns-query'],
  fallback: ['https://1.1.1.1/dns-query', 'https://8.8.8.8/dns-query'],
  'fallback-filter': {
    geoip: true,
    'geoip-code': 'CN',
    ipcidr: ['240.0.0.0/4'],
  },
};

/** 常用国家地理组（url-test 自动测速）；不在集合内的国家建 select 组，不长期测速 */
export const GEO_URL_TEST_SET: Set<string> = new Set([
  '🇭🇰 香港',
  '🇹🇼 台湾',
  '🇯🇵 日本',
  '🇸🇬 新加坡',
  '🇺🇸 美国',
  '🇰🇷 韩国',
]);

/**
 * 将 Node 转换为 Mihomo proxy 配置对象
 */
export function nodeToMihomoProxy(node: Node): Record<string, unknown> {
  const base: Record<string, unknown> = {
    name: node.name,
    type: node.protocol,
    server: node.server,
    port: node.port,
  };

  switch (node.protocol) {
    case 'vmess':
      base.uuid = node.uuid;
      base.alterId = 0;
      if (node.tls) base.tls = true;
      if (node.transport?.type === 'ws') {
        base.network = 'ws';
        base['ws-opts'] = {
          path: node.transport.path,
          headers: node.transport.host ? { Host: node.transport.host } : undefined,
        };
      }
      if (node.transport?.type === 'grpc') {
        base.network = 'grpc';
        base['grpc-opts'] = {
          grpcServiceName: node.transport.path?.replace(/^\/+/, '') || '',
        };
      }
      break;

    case 'vless':
      base.uuid = node.uuid;
      if (node.tls) base.tls = true;
      if (node.flow) base.flow = node.flow;
      // SNI 优先用显式 sni 参数；若缺省但开启了 TLS 且是 ws 传输（Host 头一般是真实 SNI 域名），
      // 用 transport.host 兜底——否则 TLS 握手会用 server 的 IP 当 SNI，Cloudflare/CDN 会拒握。
      if (node.sni) base.servername = node.sni;
      else if (node.tls && node.transport?.type === 'ws' && node.transport.host) base.servername = node.transport.host;
      if (node.allowInsecure) base['skip-cert-verify'] = true;
      if (node.transport?.type === 'ws') {
        base.network = 'ws';
        base['ws-opts'] = {
          path: node.transport.path,
          headers: node.transport.host ? { Host: node.transport.host } : undefined,
        };
      }
      if (node.transport?.type === 'grpc') {
        base.network = 'grpc';
        base['grpc-opts'] = {
          grpcServiceName: node.transport.path?.replace(/^\/+/, '') || '',
        };
      }
      // Reality：字段名用连字符 reality-opts，加 client-fingerprint 做 TLS 指纹伪装
      if (node.pbk) {
        const realityOpts: Record<string, string> = {
          'public-key': node.pbk,
          'short-id': node.sid ?? '',
        };
        // spx 是 Reality 的扩展协议参数
        if (node.metadata?.extra?.spx) {
          realityOpts.spx = node.metadata.extra.spx;
        }
        base['reality-opts'] = realityOpts;
        base['client-fingerprint'] = node.metadata?.fingerprint ?? 'chrome';
      }
      break;

    case 'trojan':
      base.password = node.password;
      // trojan 协议强制 TLS，Mihomo trojan 类型没有 tls 字段，不需显式设置
      if (node.sni) base.sni = node.sni;
      else if (node.tls && node.transport?.type === 'ws' && node.transport.host) base.sni = node.transport.host;
      // 仅当 server 是 IP 时跳过证书校验（IP 直连 CF 证书必然不匹配）
      // 域名节点保持严格校验，先做最小化 A/B 测试（不动 TLS 握手行为）
      if (node.allowInsecure || isIPAddress(node.server)) base['skip-cert-verify'] = true;
      if (node.transport?.type === 'ws') {
        base.network = 'ws';
        base['ws-opts'] = {
          path: node.transport.path,
          headers: node.transport.host ? { Host: node.transport.host } : undefined,
        };
      }
      break;

    case 'ss':
      base.cipher = node.metadata.tags[0] ?? node.username ?? 'aes-256-gcm';
      base.password = node.password;
      if (node.plugin) {
        // plugin=xxx 格式: v2ray-plugin;tls;host=xxx
        const pluginParts = node.plugin.split(';');
        base.plugin = pluginParts[0];
        const opts: Record<string, string> = {};
        for (const part of pluginParts.slice(1)) {
          if (part.includes('=')) {
            const [k, v] = part.split('=');
            opts[k] = v;
          } else {
            opts.mode = part;
          }
        }
        if (Object.keys(opts).length > 0) base['plugin-opts'] = opts;
      }
      break;
  }

  return base;
}

/**
 * 地区代码 → "emoji 中文名"映射（地理分组显示名）
 * 基于 CF 数据中心覆盖的 135 国/地区（country-codes.ts），补充 UK 别名。
 */
export const GEO_NAMES: Record<string, string> = (() => {
  const m: Record<string, string> = {};
  for (const code of Object.keys(COUNTRIES)) {
    const display = countryDisplayName(code);
    if (display) m[code] = display;
  }
  m['UK'] = m['GB']!; // 英国别名
  return m;
})();

/** 常用 IATA 三字码 → 二字码（补充识别机场类节点名，如 HKG -> HK）。常见即可。 */
const IATA_TO_CC: Record<string, string> = {
  HKG: 'HK', // 香港
  NRT: 'JP', TYO: 'JP', OSA: 'JP', KIX: 'JP', // 日本
  LAX: 'US', SFO: 'US', SEA: 'US', NYC: 'US', JFK: 'US', ORD: 'US', // 美国
  SIN: 'SG', // 新加坡
  TPE: 'TW', // 台湾
  ICN: 'KR', SEL: 'KR', // 韩国
  LHR: 'GB', LON: 'GB', MAN: 'GB', // 英国
  FRA: 'DE', // 德国
  AMS: 'NL', // 荷兰
  HEL: 'FI', // 芬兰
  KUL: 'MY', // 马来西亚
  BKK: 'TH', SGN: 'VN', HAN: 'VN', // 泰国/越南
  CDG: 'FR', PAR: 'FR', // 法国
  MAD: 'ES', // 西班牙
  FCO: 'IT', MXP: 'IT', // 意大利
  ZRH: 'CH', // 瑞士
  DXB: 'AE', // 阿联酋
  IST: 'TR', // 土耳其
  SYD: 'AU', MEL: 'AU', // 澳大利亚
};

/**
 * emoji 旗标 → "emoji 中文名"（最可靠信号，节点名常带）
 * 动态生成自 COUNTRIES：emoji → 显示名
 */
const FLAG_TO_GEO: Record<string, string> = (() => {
  const m: Record<string, string> = {};
  for (const info of Object.values(COUNTRIES)) {
    m[info.emoji] = `${info.emoji} ${info.name}`;
  }
  return m;
})();

/** 国家旗标 emoji 正则（两个地区指示符号） */
const FLAG_RE = /[\u{1F1E6}-\u{1F1FF}][\u{1F1E6}-\u{1F1FF}]/u;

/**
 * 识别节点地区：三层递进。
 * 1. emoji 旗标（节点名内任意位置）
 * 2. 名字关键词：三字码(IATA) → 二字码 → 中文名
 * 3. 外部 resolver 做 IP 定位兜底（只对前两层认不出的节点）
 *
 * IP 兜底是逐个 await，Workers 上未分组节点极少，正常无性能压力（用户已确认强制等待）。
 */
async function detectGeo(
  nodeName: string,
  ipGeoResolver?: (server: string) => Promise<string | null>,
  server?: string
): Promise<{ code: string; geoName: string } | null> {
  // 第1层：emoji 旗标
  const flagMatch = nodeName.match(FLAG_RE);
  if (flagMatch) {
    const geo = FLAG_TO_GEO[flagMatch[0]];
    if (geo) return { code: 'FLAG', geoName: geo };
  }

  // 第2层：三字码（IATA）→ 二字码 → 中文名
  for (const iata of Object.keys(IATA_TO_CC)) {
    // 三字码需边界分隔（前后非字母），避免 HKG 里误配 HK、SIN 里误配 SI
    const re = new RegExp(`(^|[^A-Za-z])${iata}($|[^A-Za-z])`, 'i');
    if (re.test(nodeName)) {
      const cc = IATA_TO_CC[iata]!;
      return { code: cc, geoName: GEO_NAMES[cc]! };
    }
  }
  // 二字码（边界必须非字母，且不能是三字码的一部分，如 HKG 里的 HK）。
  // 覆盖 CF 数据中心全部 135 国/地区代码。
  for (const code of Object.keys(COUNTRIES)) {
    const re = new RegExp(`(^|[^A-Za-z])${code}($|[^A-Za-z]|\\d)`, 'i');
    if (re.test(nodeName)) {
      return { code, geoName: GEO_NAMES[code]! };
    }
  }
  // 中文名（如"香港 01"）
  for (const cn of Object.keys(CHINESE_ALIAS_TO_CODE)) {
    if (nodeName.includes(cn)) {
      const code = CHINESE_ALIAS_TO_CODE[cn]!;
      return { code: cn, geoName: GEO_NAMES[code]! };
    }
  }

  // 第3层：IP 定位兜底
  if (ipGeoResolver && server) {
    const geo = await ipGeoResolver(server);
    if (geo) return { code: 'IP', geoName: geo };
  }

  return null;
}

/**
 * 按地区对节点分组（异步，含 IP 兜底）
 * @param nodes 节点完整对象（拿 server 做 IP 兜底）
 * @param ipGeoResolver 可选 IP 定位函数
 */
async function groupNodesByGeo(
  nodes: Node[],
  ipGeoResolver?: (server: string) => Promise<string | null>
): Promise<{ name: string; nodes: string[] }[]> {
  const groups = new Map<string, string[]>();
  const ungrouped: string[] = [];

  for (const node of nodes) {
    const geo = await detectGeo(node.name, ipGeoResolver, node.server);
    if (geo) {
      const list = groups.get(geo.geoName) || [];
      list.push(node.name);
      groups.set(geo.geoName, list);
    } else {
      ungrouped.push(node.name);
    }
  }

  const result: { name: string; nodes: string[] }[] = [];
  for (const key of GEO_ORDER) {
    if (groups.has(key)) {
      result.push({ name: key, nodes: groups.get(key)! });
      groups.delete(key);
    }
  }
  // 剩余的按字母序
  for (const [name, nodes] of [...groups.entries()].sort()) {
    result.push({ name, nodes });
  }

  // 无法归类的放到"其他"组
  if (ungrouped.length > 0) {
    result.push({ name: '其他', nodes: ungrouped });
  }

  return result;
}

export interface GeoResolver {
  (server: string): Promise<string | null>;
}

/**
 * 生成代理组配置（参考 ACL4SSR/参考配置 sub.bobvane.top 排序与结构）
 *
 * 分组排序（zashboard 面板显示顺序 = GLOBAL 组的 proxies 引用顺序）：
 *   1. 节点选择（select：自动选择 + 地理组 + 手动切换 + DIRECT）
 *   2. 手动切换（select：具体节点扁平列表，逐节点选）
 *   3. 自动选择（url-test：具体节点，自动测速）
 *   4. 国外媒体（流媒体 PROXY，默认 自动选择）——固化组
 *   5. 广告拦截（默认 REJECT）——固化组
 *   6. 业务分类组（谷歌FCM/微软Bing/微软云盘/微软服务/苹果服务/游戏平台/网易音乐/AI/开发/社交/云/加密货币/用户规则，
 *      仅勾选该大类规则才生成；默认值遵循最小代理原则：苹果/网易→DIRECT，其余→节点选择）
 *   7. 漏网之鱼（MATCH 兜底，默认 节点选择）
 *   8. GLOBAL（显式定义，完整列出所有组，决定面板显示顺序，默认 节点选择）
 *   9. 地理组（🇭🇰 香港 / 🇯🇵 日本 / ...，url-test 类型，自动测速选该地区最优节点）
 *
 * 不生成「全球直连」「国内媒体」策略组：国内直连规则在 rule-providers 中直接写 RULE-SET,xxx,DIRECT。
 * 应用净化已移除（CATEGORY-ADS⊂CATEGORY-ADS-ALL，93% 重叠，并入广告拦截）。
 *
 * 关键：GLOBAL 组必须显式、完整地按期望顺序引用所有策略组，
 *       因 zashboard/metacubexd 面板的节点组排序 = GLOBAL 组 proxies 引用顺序。
 */
export async function generateProxyGroups(
  nodes: Node[],
  selectedRules: MetaCubeXRule[] = [],
  ruleGroups: RuleGroup[] = [],
  ipGeoResolver?: GeoResolver
): Promise<Record<string, unknown>[]> {
  // 判断某规则大类是否有规则被勾选
  const hasSelected = (key: string): boolean =>
    selectedRules.some(r => ruleGroups.find(g => g.key === key)?.items.some(i => i.id === r.id));

  // 1. 地理分组（emoji/名字优先 + 三字码补充 + IP 兜底）
  const geoGroups = await groupNodesByGeo(nodes, ipGeoResolver);
  const geoGroupNames = geoGroups.map(g => g.name);
  const allGeoNodes = geoGroups.flatMap(g => g.nodes);
  const groups: Record<string, unknown>[] = [];

  // 2. 节点选择（手动选地区/节点方案，默认自动选择）
  groups.push({
    name: '节点选择',
    type: 'select',
    'default-selected': '自动选择',
    proxies: ['自动选择', ...geoGroupNames, '手动切换', 'DIRECT'],
  });

  // 3. 手动切换（select：具体节点扁平列表，逐节点选）
  groups.push({
    name: '手动切换',
    type: 'select',
    'default-selected': allGeoNodes[0] || 'DIRECT',
    proxies: allGeoNodes.length > 0 ? allGeoNodes : ['DIRECT'],
  });

  // 4. 自动选择（url-test：具体节点，自动测速最优）
  groups.push({
    name: '自动选择',
    type: 'url-test',
    url: 'http://www.gstatic.com/generate_204',
    interval: 300,
    tolerance: 50,
    proxies: allGeoNodes.length > 0 ? allGeoNodes : ['DIRECT'],
  });

  // 5. 国外媒体（流媒体 PROXY，默认自动选择）——固化策略组
  groups.push({
    name: '国外媒体',
    type: 'select',
    'default-selected': '自动选择',
    proxies: ['自动选择', '节点选择', ...geoGroupNames, '手动切换', 'DIRECT'],
  });

  // 6. 广告拦截（默认 REJECT）——固化策略组
  groups.push({
    name: '广告拦截',
    type: 'select',
    'default-selected': 'REJECT',
    proxies: ['REJECT', 'DIRECT', '节点选择', '手动切换', '自动选择', ...geoGroupNames],
  });

  // 7. 业务分类策略组（仅当勾选该大类规则时才生成，条件组）。
  //    ads(广告拦截) / media(国外媒体) 已由上方固化策略组承接；
  //    china-direct / china-media 内规则在 rule-providers 中直接写 RULE-SET,xxx,DIRECT，
  //    不生成「全球直连」「国内媒体」策略组（国内直连用 DIRECT 本身）。
  //    app-clean(应用净化) 已移除：实测 CATEGORY-ADS⊂CATEGORY-ADS-ALL（93% 重叠），并入广告拦截。
  //    各业务组默认值遵循「最小代理原则」：苹果/网易→DIRECT，其余→节点选择。
  const groupDefaults: Record<string, string> = {
    'google-fcm': '节点选择', // 谷歌FCM
    'bing': '节点选择', // 微软Bing
    'onedrive': '节点选择', // 微软云盘
    'microsoft': '节点选择', // 微软服务
    'apple': 'DIRECT', // 苹果服务：中国区直连更稳
    'netease': 'DIRECT', // 网易音乐：国内服务
    'game': '节点选择', // 游戏平台
    'ai': '节点选择', // AI 平台
    'dev': '节点选择', // 开发工具
    'social': '节点选择', // 社交
    'cloud': '节点选择', // 云服务
    'crypto': '节点选择', // 加密货币
    'user': '节点选择', // 用户规则
  };
  const independentGroupKeys = Object.keys(groupDefaults);
  const ruleClassGroupNames: string[] = [];
  for (const key of independentGroupKeys) {
    const g = ruleGroups.find(gr => gr.key === key);
    if (!g || !hasSelected(key)) continue;
    ruleClassGroupNames.push(g.name);

    // 各分类组默认 proxies：节点选择 / 手动切换 / 自动选择 / 地理组 / DIRECT
    let proxies: string[] = ['节点选择', '手动切换', '自动选择', ...geoGroupNames, 'DIRECT'];

    // AI 服务：剔除 AI 平台封禁地区（香港/澳门/台湾等），保留 美国/新加坡/日本/英国/加拿大 等可用区，
    // 否则 OpenAI/Gemini/Claude 会因地区被封返回 403。
    if (key === 'ai') {
      const banned = ['香港', '澳门', '台湾'];
      const allowed = geoGroupNames.filter(n => !banned.some(b => n.includes(b)));
      proxies = ['节点选择', '手动切换', ...allowed, 'DIRECT'];
    }

    // 加密货币：剔除【自动选择】——url-test 会因网络波动频繁切换节点 IP，
    // 币安/OKX/Coinbase 等交易所对 IP 频繁跨国漂移会触发风控锁卡。保留固定地区地理组。
    if (key === 'crypto') {
      proxies = ['节点选择', '手动切换', ...geoGroupNames, 'DIRECT'];
    }

    groups.push({ name: g.name, type: 'select', 'default-selected': groupDefaults[key], proxies });
  }

  // 8. 漏网之鱼（MATCH 兜底，默认节点选择）
  groups.push({
    name: '漏网之鱼',
    type: 'select',
    'default-selected': '节点选择',
    proxies: ['节点选择', '手动切换', '自动选择', ...geoGroupNames, 'DIRECT'],
  });

  // 9. GLOBAL（显式定义，完整按期望顺序引用所有策略组，
  //     因 zashboard/metacubexd 面板排序 = GLOBAL 组 proxies 引用顺序。默认节点选择）
  const globalOrder: string[] = [
    '节点选择',
    '手动切换',
    '自动选择',
    '广告拦截',
    '国外媒体',
    ...ruleClassGroupNames,
    '漏网之鱼',
    ...geoGroupNames,
    'DIRECT',
  ];
  groups.push({
    name: 'GLOBAL',
    type: 'select',
    'default-selected': '节点选择',
    proxies: globalOrder,
  });

  // 10. 地理组：常用国家（GEO_URL_TEST_SET）url-test 自动测速；
  //     其他国家 select 手动选择（不长期定时测速，降低旁路由 CPU 占用）
  for (const geo of geoGroups) {
    const isCommon = GEO_URL_TEST_SET.has(geo.name);
    groups.push({
      name: geo.name,
      type: isCommon ? 'url-test' : 'select',
      ...(isCommon
        ? { url: 'http://www.gstatic.com/generate_204', interval: 300, tolerance: 50 }
        : {}),
      proxies: geo.nodes,
    });
  }

  return groups;
}

/**
 * 生成 Mihomo YAML 配置
 * @param selectedRules 用户勾选的 MetaCubeX 分流规则（用于生成 rule-providers + rules）
 * @param ruleGroups 预定义规则大类（用于生成按规则分类的 proxy-groups）
 * @param ipGeoResolver 可选 IP 定位回调，用于名字无法识别的节点兜底
 */
export async function generateMihomoConfig(
  nodes: Node[],
  template: MihomoTemplate = DEFAULT_MIHOMO_TEMPLATE,
  selectedRules: MetaCubeXRule[] = [],
  ruleGroups: RuleGroup[] = [],
  ipGeoResolver?: GeoResolver
): Promise<string> {
  const uniqueNodes = makeUniqueNames(nodes);
  const proxies = uniqueNodes.map(nodeToMihomoProxy);
  const groups = await generateProxyGroups(uniqueNodes, selectedRules, ruleGroups, ipGeoResolver);

  const config: Record<string, unknown> = {
    'mixed-port': template.mixedPort ?? 7890,
    'allow-lan': template.allowLan ?? false,
    mode: template.mode ?? 'rule',
    'log-level': template.logLevel ?? 'info',
    'ipv6': template.ipv6 ?? false,
    proxies,
    'proxy-groups': groups,
    dns: DEFAULT_DNS_CONFIG,
    rules: ['MATCH,漏网之鱼'],
  };

  if (template.externalController) {
    config['external-controller'] = template.externalController;
  }

  // 分流规则：用户勾选了规则才生成 rule-providers + 有序 rules
  if (selectedRules.length > 0) {
    config['rule-providers'] = buildRuleProviders(selectedRules);
    config.rules = buildRules(selectedRules, ruleGroups);
  }

  return generateYaml(config);
}

/**
 * 验证生成的 YAML 能否被解析
 */
export function validateMihomo(yaml: string): boolean {
  try {
    const parsed = parseYaml(yaml);
    return !!parsed && Array.isArray((parsed as Record<string, unknown>).proxies);
  } catch {
    return false;
  }
}