/**
 * Mihomo 配置生成器
 * TASK 5.1 - Mihomo Generator
 * 09_CONFIG_GENERATOR_SPEC.md §7：输出 YAML，兼容 Mihomo/Clash Meta/OpenClash
 */

import { Node } from '@/models/node';
import { generateYaml, parseYaml } from './yaml-serializer';
import { MetaCubeXRule, RuleGroup } from '@/data/metacubex-rules';
import { buildRuleProviders, buildRules } from './rule-providers';

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
}

export const DEFAULT_MIHOMO_TEMPLATE: MihomoTemplate = {
  mixedPort: 7890,
  allowLan: false, // 安全默认：不开放局域网
  mode: 'rule',
  logLevel: 'info',
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
          grpcServiceName: node.transport.path?.replace(/^\//, '') || '',
        };
      }
      break;

    case 'vless':
      base.uuid = node.uuid;
      if (node.tls) base.tls = true;
      if (node.flow) base.flow = node.flow;
      if (node.sni) base['servername'] = node.sni;
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
          grpcServiceName: node.transport.path?.replace(/^\//, '') || '',
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
      if (node.tls) base.tls = true;
      if (node.sni) base.sni = node.sni;
      if (node.allowInsecure) base.skipCertVerify = true;
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
 * 生成代理组配置（含规则分类分组 + 地理分组）
 *
 * 结构（参考标准 Mihomo 配置）：
 *   - 每个规则大类（AI 服务/流媒体/安全隐私...）→ 独立 select 组，
 *     组成员是地理节点组 + AUTO + DIRECT
 *   - 每个地理组 → 独立 select 组，组成员是该地区的节点
 *   - AUTO → url-test 全节点
 *   - GLOBAL → 顶层全局 select，包含所有地理组 + AUTO（供未归类的兜底）
 *
 * 规则通过 buildRules() 路由到对应规则大类组名。
 * @param ruleGroups 预定义规则大类（RULE_GROUPS），用于生成规则分类组
 * @param selectedRules 用户勾选的规则，判断哪些大类有勾选（生成对应分组）
 */
export function generateProxyGroups(
  nodeNames: string[],
  selectedRules: MetaCubeXRule[] = [],
  ruleGroups: RuleGroup[] = []
): Record<string, unknown>[] {
  // 1. 地理分组
  const geoGroups = groupNodesByGeo(nodeNames);
  const groups: Record<string, unknown>[] = [];

  // 2. 每个地理组建 select 组（含 AUTO 便于快速切）
  for (const geo of geoGroups) {
    groups.push({
      name: geo.name,
      type: 'select',
      proxies: ['AUTO', ...geo.nodes],
    });
  }

  // 3. AUTO：url-test，全节点自动测速
  const allGeoNodes = geoGroups.flatMap(g => g.nodes);
  groups.push({
    name: 'AUTO',
    type: 'url-test',
    url: 'http://www.gstatic.com/generate_204',
    interval: 300,
    tolerance: 50,
    proxies: allGeoNodes.length > 0 ? allGeoNodes : ['DIRECT'],
  });

  // 4. 规则分类组：每个大类生成独立 select 组，成员为地理组 + AUTO（可切 DIRECT）
  //    从 ruleGroups 中找出包含 PROXY 规则的分类（这些是真正会走代理的）
  const proxyGroupNames = geoGroups.map(g => g.name);
  const proxyGroupRefs = ['AUTO', ...proxyGroupNames, 'DIRECT'];
  for (const g of ruleGroups) {
    const hasProxyRules = selectedRules.some(r => r.target === 'PROXY' && g.items.some(gi => gi.id === r.id));
    if (!hasProxyRules) continue;
    groups.push({
      name: g.name,
      type: 'select',
      proxies: proxyGroupRefs,
    });
  }

  // 5. 全局 PROXY 兜底组（未通过规则走代理、或 MATCH 兜底），
  //    成员为所有地理组 + AUTO
  groups.push({
    name: 'PROXY',
    type: 'select',
    proxies: ['AUTO', ...proxyGroupNames],
  });

  // 6. GLOBAL（Clash 客户端固定保留组，列出所有分组 + DIRECT 便于全局切换）
  groups.push({
    name: 'GLOBAL',
    type: 'select',
    proxies: [...ruleGroups.filter(g => selectedRules.some(r => r.target === 'PROXY' && g.items.some(gi => gi.id === r.id))).map(g => g.name), 'PROXY', 'AUTO', 'DIRECT'],
  });

  return groups;
}

/** 地区代码 → 中文名映射 */
const GEO_NAMES: Record<string, string> = {
  HK: '🇭🇰 香港',
  JP: '🇯🇵 日本',
  US: '🇺🇸 美国',
  SG: '🇸🇬 新加坡',
  TW: '🇹🇼 台湾',
  KR: '🇰🇷 韩国',
  UK: '🇬🇧 英国',
  GB: '🇬🇧 英国',
  DE: '🇩🇪 德国',
  FR: '🇫🇷 法国',
  CA: '🇨🇦 加拿大',
  AU: '🇦🇺 澳大利亚',
  IN: '🇮🇳 印度',
  RU: '🇷🇺 俄罗斯',
  BR: '🇧🇷 巴西',
  NL: '🇳🇱 荷兰',
  SE: '🇸🇪 瑞典',
  NO: '🇳🇴 挪威',
  FI: '🇫🇮 芬兰',
  DK: '🇩🇰 丹麦',
  IT: '🇮🇹 意大利',
  ES: '🇪🇸 西班牙',
  CH: '🇨🇭 瑞士',
  AE: '🇦🇪 阿联酋',
  TR: '🇹🇷 土耳其',
  TH: '🇹🇭 泰国',
  VN: '🇻🇳 越南',
  MY: '🇲🇾 马来西亚',
  PH: '🇵🇭 菲律宾',
  ID: '🇮🇩 印尼',
  NZ: '🇳🇿 新西兰',
  MO: '🇲🇴 澳门',
  // 中文别名
  香港: '🇭🇰 香港',
  日本: '🇯🇵 日本',
  美国: '🇺🇸 美国',
  新加坡: '🇸🇬 新加坡',
  台湾: '🇹🇼 台湾',
  韩国: '🇰🇷 韩国',
  英国: '🇬🇧 英国',
  德国: '🇩🇪 德国',
  法国: '🇫🇷 法国',
  加拿大: '🇨🇦 加拿大',
  澳大利亚: '🇦🇺 澳大利亚',
  印度: '🇮🇳 印度',
  俄罗斯: '🇷🇺 俄罗斯',
  巴西: '🇧🇷 巴西',
  荷兰: '🇳🇱 荷兰',
  瑞典: '🇸🇪 瑞典',
  挪威: '🇳🇴 挪威',
  芬兰: '🇫🇮 芬兰',
  丹麦: '🇩🇰 丹麦',
  意大利: '🇮🇹 意大利',
  西班牙: '🇪🇸 西班牙',
  瑞士: '🇨🇭 瑞士',
  泰国: '🇹🇭 泰国',
  越南: '🇻🇳 越南',
  马来西亚: '🇲🇾 马来西亚',
  菲律宾: '🇵🇭 菲律宾',
  印尼: '🇮🇩 印尼',
};

/** 从节点名中提取地区代码，返回 (地区代码, 中文名) 或 null */
function detectGeo(nodeName: string): { code: string; geoName: string } | null {
  const chinese = nodeName;

  // 先匹配英文代码（如 HK-01, JP-2, [US] 等）
  // 必须是边界分隔（前后是 -_.()[]空格 或字符串起点终点），避免误匹配子串
  for (const code of ['HK','JP','US','SG','TW','KR','UK','GB','DE','FR','CA','AU','IN','RU','BR','NL','SE','NO','FI','DK','IT','ES','CH','AE','TR','TH','VN','MY','PH','ID','NZ','MO']) {
    const re = new RegExp(`(^|[\\s\\-_\\.\\(\\)\\[\\]]{1})${code}($|[\\s\\-_\\.\\(\\)\\[\\]]{1}|\\d)`, 'i');
    if (re.test(nodeName)) {
      return { code, geoName: GEO_NAMES[code]! };
    }
  }

  // 再匹配中文名（如"香港 01", "日本节点"）
  for (const cn of ['香港', '日本', '美国', '新加坡', '台湾', '韩国', '英国', '德国', '法国', '加拿大', '澳大利亚', '印度', '俄罗斯', '巴西', '荷兰', '瑞典', '挪威', '芬兰', '丹麦', '意大利', '西班牙', '瑞士', '泰国', '越南', '马来西亚', '菲律宾', '印尼']) {
    if (chinese.includes(cn)) {
      return { code: cn, geoName: GEO_NAMES[cn] };
    }
  }

  return null;
}

/** 按地区对节点分组 */
function groupNodesByGeo(nodeNames: string[]): { name: string; nodes: string[] }[] {
  const groups = new Map<string, string[]>();
  const ungrouped: string[] = [];

  for (const name of nodeNames) {
    const geo = detectGeo(name);
    if (geo) {
      const list = groups.get(geo.geoName) || [];
      list.push(name);
      groups.set(geo.geoName, list);
    } else {
      ungrouped.push(name);
    }
  }

  const result: { name: string; nodes: string[] }[] = [];
  // 按常见顺序排列
  const order = ['🇭🇰 香港', '🇯🇵 日本', '🇺🇸 美国', '🇸🇬 新加坡', '🇹🇼 台湾', '🇰🇷 韩国', '🇬🇧 英国', '🇩🇪 德国', '🇫🇷 法国', '🇨🇦 加拿大', '🇦🇺 澳大利亚', '🇮🇳 印度', '🇷🇺 俄罗斯', '🇧🇷 巴西', '🇳🇱 荷兰', '🇸🇪 瑞典', '🇳🇴 挪威', '🇫🇮 芬兰', '🇩🇰 丹麦', '🇮🇹 意大利', '🇪🇸 西班牙', '🇨🇭 瑞士', '🇦🇪 阿联酋', '🇹🇷 土耳其', '🇹🇭 泰国', '🇻🇳 越南', '🇲🇾 马来西亚', '🇵🇭 菲律宾', '🇮🇩 印尼', '🇳🇿 新西兰', '🇲🇴 澳门'];
  for (const key of order) {
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

/**
 * 生成 Mihomo YAML 配置
 * @param selectedRules 用户勾选的 MetaCubeX 分流规则（用于生成 rule-providers + rules）
 * @param ruleGroups 预定义规则大类（用于生成按规则分类的 proxy-groups）
 */
export function generateMihomoConfig(
  nodes: Node[],
  template: MihomoTemplate = DEFAULT_MIHOMO_TEMPLATE,
  selectedRules: MetaCubeXRule[] = [],
  ruleGroups: RuleGroup[] = []
): string {
  const uniqueNodes = makeUniqueNames(nodes);
  const proxies = uniqueNodes.map(nodeToMihomoProxy);
  const nodeNames = uniqueNodes.map((n) => n.name);
  const groups = generateProxyGroups(nodeNames, selectedRules, ruleGroups);

  const config: Record<string, unknown> = {
    'mixed-port': template.mixedPort ?? 7890,
    'allow-lan': template.allowLan ?? false,
    mode: template.mode ?? 'rule',
    'log-level': template.logLevel ?? 'info',
    proxies,
    'proxy-groups': groups,
    rules: ['MATCH,PROXY'],
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