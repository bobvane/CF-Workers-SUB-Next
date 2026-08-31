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
  secret?: string;
  ipv6?: boolean;
}

export const DEFAULT_MIHOMO_TEMPLATE: MihomoTemplate = {
  mixedPort: 7890,
  allowLan: true, // 旁路由/网关场景：局域网设备需指定 7890 混合端口走代理。仅监听内网 NIC，配合 bind-address 可进一步限制。
  mode: 'rule',
  logLevel: 'warning', // 长期运行 info 日志量过大，warning 足够诊断
  externalController: '0.0.0.0:9090', // 外部控制 API：面板（Zashboard/OpenClash）连接用
  secret: '', // API 访问密钥，空 = 无验证
  ipv6: false, // 默认关闭 IPv6，避免 IPv4 走代理 / IPv6 走直连的诡异分流
};

/**
 * 默认 DNS 配置（fake-ip 模式）
 * nameserver-policy 按域名分流：国内域名(cn,private)走国内 DoH，
 * 国外域名(geolocation-!cn)直接走国外 DoH——一次查询到位，
 * 避免 fallback+geoip 模式的"先查国内→判断→再查国外"双轮 RTT 延迟
 * （MetaCubeX 官方推荐做法，需 Meta 内核 v1.14+）。
 */
export const DEFAULT_DNS_CONFIG: Record<string, unknown> = {
  enable: true,
  ipv6: false,
  'enhanced-mode': 'fake-ip',
  'fake-ip-range': '198.18.0.1/16',
  nameserver: ['https://223.5.5.5/dns-query', 'https://doh.pub/dns-query'],
  // default-nameserver：解析 DoH 服务器自身域名用的普通 DNS（鸡生蛋问题）
  'default-nameserver': ['223.5.5.5', '119.29.29.29'],
  // proxy-server-nameserver：专门解析节点服务器域名，防污染导致节点连不上（纯 IP 引导）
  'proxy-server-nameserver': ['223.5.5.5', '119.29.29.29'],
  // 域名分流 DNS：国内域名走国内 DoH，国外域名走国外 DoH 且查询经代理隧道发出
  // （#节点选择：DoH 请求本身走代理，避免直连 1.1.1.1/8.8.8.8 被干扰超时——
  //   否则所有默认 DIRECT 的分组解析国外域名时都会 dns resolve failed）
  'nameserver-policy': {
    'geosite:cn,private': ['https://223.5.5.5/dns-query', 'https://doh.pub/dns-query'],
    'geosite:geolocation-!cn': [
      'https://1.1.1.1/dns-query#节点选择',
      'https://8.8.8.8/dns-query#节点选择',
    ],
  },
};

/**
 * 默认 Sniffer 配置（fake-ip 最佳搭档）
 * 嗅探 TLS/HTTP/QUIC 握手中的真实域名，解决 fake-ip 下无法精准分流的问题。
 * force-dns-mapping: 将嗅探到的域名映射回 fake-ip，确保后续连接走正确规则。
 */
export const DEFAULT_SNIFFER_CONFIG: Record<string, unknown> = {
  enable: true,
  'force-dns-mapping': true,
  'parse-pure-ip': true,
  'override-destination': true,
  sniff: {
    TLS: { ports: [443, 8443] },
    HTTP: { ports: [80, '8080-8880'], 'override-destination': true },
    QUIC: { ports: [443, 8443] },
  },
  'skip-domain': [
    '+.push.apple.com',
  ],
};

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
      base.udp = true;
      base.encryption = 'none';
      if (node.tls) base.tls = true;
      if (node.flow) base.flow = node.flow;
      // SNI 优先用显式 sni 参数；若缺省但开启了 TLS 且是 ws 传输（Host 头一般是真实 SNI 域名），
      // 用 transport.host 兜底——否则 TLS 握手会用 server 的 IP 当 SNI，Cloudflare/CDN 会拒握。
      if (node.sni) base.servername = node.sni;
      else if (node.tls && node.transport?.type === 'ws' && node.transport.host) base.servername = node.transport.host;
      // ALPN:链接带 alpn 参数时原样输出(XHTTP 缺省默认 [h2] 已随 XHTTP 支持移除,2026-08-30)
      if (node.alpn?.length) base.alpn = node.alpn;
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
      // XHTTP 传输已降级为普通 VLESS(用户 2026-08-30 决定暂停 XHTTP 支持):不输出 network/xhttp-opts
      // Reality:字段名用连字符 reality-opts,加 client-fingerprint 做 TLS 指纹伪装
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

      // 非 Reality 的 TLS VLESS:client-fingerprint 默认 chrome(订阅原文带 fp 时覆盖)
      if (!node.pbk && node.tls) {
        base['client-fingerprint'] = node.metadata?.fingerprint ?? 'chrome';
      }

      // ECH(加密 Client Hello)已随 XHTTP 支持暂停移除(2026-08-30 用户决定)

      // XHTTP 额外字段(x-padding-* 等)已随 XHTTP 支持暂停移除(2026-08-30 用户决定)
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

    case 'ssr':
      base.cipher = node.username ?? node.metadata.tags[0] ?? 'aes-256-cfb';
      base.password = node.password;
      if (node.ssrProtocol) base.protocol = node.ssrProtocol;
      if (node.ssrProtocolParam) base['protocol-param'] = node.ssrProtocolParam;
      if (node.obfs) base.obfs = node.obfs;
      if (node.ssrObfsParam) base['obfs-param'] = node.ssrObfsParam;
      if (node.ssrGroup) base.group = node.ssrGroup;
      break;

    case 'hysteria2':
      base.password = node.password;
      base.tls = true;
      if (node.sni) base.sni = node.sni;
      if (node.allowInsecure) base['skip-cert-verify'] = true;
      if (node.ports) base.ports = node.ports;
      if (node.up) base.up = node.up;
      if (node.down) base.down = node.down;
      if (node.obfs) {
        base.obfs = node.obfs;
        if (node.obfsPassword) base['obfs-password'] = node.obfsPassword;
      }
      if (node.alpn) base.alpn = node.alpn;
      if (node.fingerprint) base.fingerprint = node.fingerprint;
      break;

    case 'tuic':
      if (node.token) {
        // TUIC V4
        base.token = node.token;
      } else {
        // TUIC V5
        base.uuid = node.uuid;
        base.password = node.password;
      }
      base.tls = true;
      if (node.sni) base.sni = node.sni;
      if (node.allowInsecure) base['skip-cert-verify'] = true;
      if (node.udpRelayMode) base['udp-relay-mode'] = node.udpRelayMode;
      if (node.congestionController) base['congestion-controller'] = node.congestionController;
      if (node.disableSni) base['disable-sni'] = node.disableSni;
      if (node.reduceRtt) base['reduce-rtt'] = node.reduceRtt;
      if (node.fastOpen) base['fast-open'] = node.fastOpen;
      if (node.alpn) base.alpn = node.alpn;
      break;

    case 'wireguard':
      base['private-key'] = node.wgPrivateKey ?? '';
      base.udp = true;
      if (node.wgIp) base.ip = node.wgIp;
      if (node.wgIpv6) base.ipv6 = node.wgIpv6;
      if (node.wgPublicKey) base['public-key'] = node.wgPublicKey;
      if (node.wgAllowedIps) base['allowed-ips'] = [node.wgAllowedIps];
      if (node.wgPreSharedKey) base['pre-shared-key'] = node.wgPreSharedKey;
      if (node.wgReserved) base.reserved = node.wgReserved;
      if (node.wgMtu) base.mtu = node.wgMtu;
      break;

    case 'anytls':
      base.password = node.password;
      base.tls = true;
      if (node.sni) base.sni = node.sni;
      if (node.allowInsecure) base['skip-cert-verify'] = true;
      if (node.alpn) base.alpn = node.alpn;
      if (node.fingerprint) base.fingerprint = node.fingerprint;
      if (node.idleSessionCheckInterval !== undefined) base['idle-session-check-interval'] = node.idleSessionCheckInterval;
      if (node.idleSessionTimeout !== undefined) base['idle-session-timeout'] = node.idleSessionTimeout;
      if (node.minIdleSession !== undefined) base['min-idle-session'] = node.minIdleSession;
      if (node.clientMetadata) base['client-metadata'] = node.clientMetadata;
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
 *   4. 国外媒体（流媒体 PROXY，默认 DIRECT）——固化组
 *   5. 广告拦截（默认 REJECT）——固化组
 *   6. 业务分类组（谷歌FCM/微软服务/苹果服务/游戏平台/AI/社交/加密货币/用户规则，
 *      仅勾选该大类规则才生成；v2.11.0 默认全部 DIRECT，面板可切换）
 *   7. 漏网之鱼（MATCH 兜底，默认 节点选择）
 *   8. GLOBAL（显式定义，完整列出所有组，决定面板显示顺序，默认 节点选择）
 *   9. 地理组（🇭🇰 香港 / 🇯🇵 日本 / ...，除指定 6 国外，全部 select；美国/马来西亚/日本/新加坡/台湾/韩国 6 组 url-test 自动测速）
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
    icon: 'https://raw.githubusercontent.com/Orz-3/mini/master/Color/Static.png',
    'default-selected': '自动选择',
    proxies: ['自动选择', ...geoGroupNames, '手动切换', 'DIRECT'],
  });

  // 3. 手动切换（select：具体节点扁平列表，逐节点选）
  groups.push({
    name: '手动切换',
    type: 'select',
    icon: 'https://raw.githubusercontent.com/Orz-3/mini/master/Color/Final.png',
    'default-selected': allGeoNodes[0] || 'DIRECT',
    proxies: allGeoNodes.length > 0 ? allGeoNodes : ['DIRECT'],
  });

  // 4. 自动选择（url-test：具体节点，自动测速最优）
  groups.push({
    name: '自动选择',
    type: 'url-test',
    icon: 'https://raw.githubusercontent.com/Orz-3/mini/master/Color/Auto.png',
    url: 'https://cp.cloudflare.com/generate_204',
    timeout: 3000,
    interval: 1800,
    tolerance: 50,
    proxies: allGeoNodes.length > 0 ? allGeoNodes : ['DIRECT'],
  });

  // 5. 国外媒体（流媒体 PROXY，默认 DIRECT）——固化策略组
  groups.push({
    name: '国外媒体',
    type: 'select',
    icon: 'https://raw.githubusercontent.com/Orz-3/mini/master/Color/Streaming.png',
    'default-selected': 'DIRECT',
    proxies: ['自动选择', '节点选择', ...geoGroupNames, '手动切换', 'DIRECT'],
  });

  // 6. 广告拦截（默认 REJECT）——固化策略组，只保留 REJECT 和 DIRECT（用户 2026-08-30 拍板）
  groups.push({
    name: '广告拦截',
    type: 'select',
    icon: 'https://raw.githubusercontent.com/Orz-3/mini/master/Color/Adblock.png',
    'default-selected': 'REJECT',
    proxies: ['REJECT', 'DIRECT'],
  });

  // 8. 业务分类策略组（仅当勾选该大类规则时才生成，条件组）
  //    ads(广告拦截) / media(国外媒体) 已由上方固化策略组承接；
  // Orz-3/mini Color 图标映射：仓库实际文件名（英文），无对应图标时用 Global.png 兜底
  const groupIconMap: Record<string, string> = {
    'google-fcm': 'Google.png',
    'microsoft': 'Microsoft.png',
    'apple': 'Apple.png',
    'game': 'GAME.png',
    'ai': 'OpenAI.png',
    'social': 'Telegram.png',
    'crypto': 'Global.png',
    'user': 'Manual.png',
  };
  const groupDefaults: Record<string, { name: string; default: string }> = {
    'google-fcm': { name: '谷歌FCM', default: 'DIRECT' },
    'microsoft': { name: '微软服务', default: 'DIRECT' },
    'apple': { name: '苹果服务', default: 'DIRECT' },
    'game': { name: '游戏平台', default: 'DIRECT' },
    'ai': { name: 'AI 平台', default: 'DIRECT' },
    'social': { name: '社交', default: 'DIRECT' },
    'crypto': { name: '加密货币', default: 'DIRECT' },
    'user': { name: '用户规则', default: 'DIRECT' },
  };
  const independentGroupKeys = Object.keys(groupDefaults);
  const ruleClassGroupNames: string[] = [];
  
  for (const key of independentGroupKeys) {
    const g = ruleGroups.find(gr => gr.key === key);
    if (!g || !hasSelected(key)) continue;
    ruleClassGroupNames.push(g.name);

    let proxies: string[] = ['节点选择', '手动切换', '自动选择', ...geoGroupNames, 'DIRECT'];

    if (key === 'ai') {
      const banned = ['香港', '澳门', '台湾'];
      const allowed = geoGroupNames.filter(n => !banned.some(b => n.includes(b)));
      proxies = ['节点选择', '手动切换', ...allowed, 'DIRECT'];
    }

    if (key === 'crypto') {
      proxies = ['节点选择', '手动切换', ...geoGroupNames, 'DIRECT'];
    }

    groups.push({ 
      name: g.name, 
      type: 'select', 
      'default-selected': groupDefaults[key].default,
      icon: `https://raw.githubusercontent.com/Orz-3/mini/master/Color/${groupIconMap[key] || 'Global.png'}`,
      proxies 
    });
  }

  // 9. 漏网之鱼（MATCH 兜底，默认自动选择）——用户 2026-08-30 拍板：默认自动选择
  groups.push({
    name: '漏网之鱼',
    type: 'select',
    icon: 'https://raw.githubusercontent.com/Orz-3/mini/master/Color/Global.png',
    'default-selected': '自动选择',
    proxies: ['节点选择', '手动切换', '自动选择', ...geoGroupNames, 'DIRECT'],
  });

  // 10. GLOBAL（只含核心切换组，默认 DIRECT — 用户 2026-08-30 拍板）
  groups.push({
    name: 'GLOBAL',
    type: 'select',
    icon: 'https://raw.githubusercontent.com/Orz-3/mini/master/Color/Final.png',
    'default-selected': 'DIRECT',
    url: 'https://cp.cloudflare.com/generate_204',
    // 用户 2026-08-30 拍板：GLOBAL 只保留 节点选择/手动切换/自动选择/DIRECT 四组
    proxies: ['节点选择', '手动切换', '自动选择', 'DIRECT'],
  });

  // 11. 地理组：指定六国/地区自动测速(url-test)，其余 select
  // 美国/马来西亚/日本/新加坡/台湾/韩国 六组 url-test（用户 2026-08-30 指定），其余 select
  const URL_TEST_REGIONS = ['美国', '马来西亚', '日本', '新加坡', '台湾', '韩国'];
  for (const geo of geoGroups) {
    const isUrlTest = URL_TEST_REGIONS.some(r => geo.name.includes(r));
    // 单节点自动降级为 select（用户 2026-08-30 拍板：url-test 组仅 1 个节点时测速无意义）
    const useUrlTest = isUrlTest && geo.nodes.length > 1;
    const group: Record<string, unknown> = {
      name: geo.name,
      type: useUrlTest ? 'url-test' : 'select',
      proxies: geo.nodes,
    };
    if (useUrlTest) {
      group.url = 'https://cp.cloudflare.com/generate_204';
      group.interval = 300;
      group.tolerance = 50;
      group.lazy = true;
      group.timeout = 5000;
    }
    groups.push(group);
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
    'external-controller': template.externalController ?? '0.0.0.0:9090',
    secret: template.secret ?? '',
    'unified-delay': true,
    'tcp-concurrent': true,
    'geodata-mode': true,
    'geodata-loader': 'standard',
    'geosite-matcher': 'succinct',
    'geo-auto-update': true,
    'geo-update-interval': 24,
    profile: { 'store-selected': true },
    proxies,
    'proxy-groups': groups,
    dns: DEFAULT_DNS_CONFIG,
    sniffer: DEFAULT_SNIFFER_CONFIG,
    rules: ['MATCH,漏网之鱼'],
  };

  // 分流规则：用户勾选了规则才生成 rule-providers + 有序 rules
  const nonNativeRules = selectedRules.filter(r => !r.native);
  if (selectedRules.length > 0) {
    // 只有非 native 规则才生成 rule-providers（原生规则走 GEOSITE 直出）
    if (nonNativeRules.length > 0) {
      config['rule-providers'] = buildRuleProviders(nonNativeRules);
    }
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