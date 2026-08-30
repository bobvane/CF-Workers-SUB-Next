/**
 * Sing-box 配置生成器
 * TASK 5.2 - Sing-box Generator
 * 09_CONFIG_GENERATOR_SPEC.md §8：输出 JSON，outbounds 映射
 */

import { Node } from '@/models/node';
import { MetaCubeXRule } from '@/data/metacubex-rules';
import { makeUniqueNames } from './mihomo';
import { providerName, ruleActionTarget } from './rule-providers';
import { RuleGroup } from '@/data/metacubex-rules';
import { metacubexSrsUrl } from '@/data/rule-format-mapping';

export interface SingboxTemplate {
  logLevel?: string;
}

export const DEFAULT_SINGBOX_TEMPLATE: SingboxTemplate = {
  logLevel: 'info',
};

/**
 * 将 Node 转换为 Sing-box outbound 配置对象
 */
export function nodeToSingboxOutbound(node: Node): Record<string, unknown> {
  const outbound: Record<string, unknown> = {
    type: node.protocol,
    tag: node.name,
    server: node.server,
    server_port: node.port,
  };

  switch (node.protocol) {
    case 'vmess':
      outbound.uuid = node.uuid;
      outbound.security = 'auto';
      if (node.transport?.type === 'ws') {
        outbound.transport = {
          type: 'ws',
          path: node.transport.path,
          headers: node.transport.host ? { Host: node.transport.host } : undefined,
        };
      }
      if (node.transport?.type === 'grpc') {
        outbound.transport = {
          type: 'grpc',
          service_name: node.transport.path?.replace(/^\//, '') || '',
        };
      }
      if (node.tls) {
        outbound.tls = { enabled: true, server_name: node.sni ?? node.server };
      }
      break;

    case 'vless':
      outbound.uuid = node.uuid;
      if (node.flow) outbound.flow = node.flow;
      if (node.transport?.type === 'ws') {
        outbound.transport = {
          type: 'ws',
          path: node.transport.path,
          headers: node.transport.host ? { Host: node.transport.host } : undefined,
        };
      }
      if (node.transport?.type === 'grpc') {
        outbound.transport = {
          type: 'grpc',
          service_name: node.transport.path?.replace(/^\//, '') || '',
        };
      }
      if (node.tls) {
        outbound.tls = {
          enabled: true,
          server_name: node.sni ?? node.server,
          utls: node.metadata?.fingerprint ? { enabled: true, fingerprint: node.metadata.fingerprint } : undefined,
          reality: node.pbk
            ? { enabled: true, public_key: node.pbk, short_id: node.sid ?? '' }
            : undefined,
        };
      }
      break;

    case 'trojan':
      outbound.password = node.password;
      if (node.tls) {
        outbound.tls = {
          enabled: true,
          server_name: node.sni ?? node.server,
          insecure: node.allowInsecure ?? false,
        };
      }
      break;

    case 'ss':
      outbound.method = node.metadata.tags[0] ?? node.username ?? 'aes-256-gcm';
      outbound.password = node.password;
      if (node.plugin) {
        const pluginParts = node.plugin.split(';');
        outbound.plugin = pluginParts[0];
        const opts: Record<string, string> = {};
        for (const part of pluginParts.slice(1)) {
          if (part.includes('=')) {
            const [k, v] = part.split('=');
            opts[k] = v;
          } else {
            opts.mode = part;
          }
        }
        if (Object.keys(opts).length > 0) outbound.plugin_opts = formatPluginOpts(opts);
      }
      break;
  }

  return outbound;
}

function formatPluginOpts(opts: Record<string, string>): string {
  return Object.entries(opts)
    .map(([k, v]) => `${k}=${v}`)
    .join(';');
}

/**
 * 生成 Sing-box JSON 配置
 */
export function generateSingboxConfig(
  nodes: Node[],
  template: SingboxTemplate = DEFAULT_SINGBOX_TEMPLATE,
  selectedRules: MetaCubeXRule[] = [],
  ruleGroups: RuleGroup[] = []
): string {
  const uniqueNodes = makeUniqueNames(nodes).filter((n) => n.protocol !== 'ssr');
  const nodeTags = uniqueNodes.map((n) => n.name);
  const outbounds: Record<string, unknown>[] = [
    { type: 'direct', tag: 'direct' },
    ...uniqueNodes.map(nodeToSingboxOutbound),
    {
      type: 'selector',
      tag: 'proxy',
      outbounds: ['auto', ...nodeTags],
      default: nodeTags.length > 0 ? 'auto' : 'direct',
    },
    {
      type: 'urltest',
      tag: 'auto',
      outbounds: nodeTags.length > 0 ? nodeTags : ['direct'],
      // v2.11.8: 测速地址统一改为 https://cp.cloudflare.com/generate_204（用户 2026-08-30 拍板，国内可达）
      url: 'https://cp.cloudflare.com/generate_204',
      interval: '10m',
      tolerance: 50,
    },
  ];

  // 构建 rule_set 引用列表 + route rules
  const ruleSetRefs: Record<string, unknown>[] = [];
  const routeRules: Record<string, unknown>[] = [];

  // DNS 劫持（1.11+ 写法：rule action 替代已废弃的 dns outbound）
  routeRules.push({ action: 'sniff' });
  routeRules.push({ protocol: 'dns', action: 'hijack-dns' });

  // 用户勾选的规则
  if (selectedRules.length > 0) {
    for (const rule of selectedRules) {
      const name = providerName(rule.id);
      // .srs 是二进制格式，必须用 format: 'binary'
      ruleSetRefs.push({
        tag: name,
        type: 'remote',
        format: 'binary',
        url: metacubexSrsUrl(rule.id),
        download_detour: 'direct',
      });
      const target = ruleActionTarget(rule, ruleGroups);
      if (target === 'REJECT') {
        // 广告拦截：1.11+ 用 rule action 替代已废弃的 block outbound
        routeRules.push({ rule_set: [name], action: 'reject' });
      } else {
        const outbound = mapTargetToOutbound(target);
        routeRules.push({ rule_set: [name], outbound });
      }
    }
  }

  // 兜底规则
  routeRules.push({ ip_is_private: true, outbound: 'direct' });
  routeRules.push({ clash_mode: 'Direct', outbound: 'direct' });
  routeRules.push({ clash_mode: 'Global', outbound: 'proxy' });

  const config: Record<string, unknown> = {
    log: { level: template.logLevel ?? 'info' },
    dns: {
      servers: [
        { tag: 'dns-proxy', address: 'https://1.1.1.1/dns-query', detour: 'proxy' },
        { tag: 'dns-direct', address: 'https://223.5.5.5/dns-query', detour: 'direct' },
        { tag: 'dns-local', address: 'local' },
      ],
      rules: [
        { rule_set: ruleSetRefs.map((r) => r.tag), server: 'dns-direct' },
      ].filter((r) => (r.rule_set as string[]).length > 0),
      final: 'dns-proxy',
      independent_cache: true,
    },
    inbounds: [
      { type: 'tun', tag: 'tun-in', address: ['172.19.0.1/30'], auto_route: true, strict_route: true },
      { type: 'mixed', tag: 'mixed-in', listen: '127.0.0.1', listen_port: 7890 },
    ],
    outbounds,
    route: {
      final: 'proxy',
      auto_detect_interface: true,
      rules: routeRules,
    },
    experimental: { cache_file: { enabled: true } },
  };

  if (ruleSetRefs.length > 0) {
    (config.route as Record<string, unknown>).rule_set = ruleSetRefs;
  }

  return JSON.stringify(config, null, 2);
}

/**
 * 将 Mihomo 策略组名映射到 Sing-box outbound tag
 */
function mapTargetToOutbound(target: string): string {
  switch (target) {
    case 'DIRECT':
    case '国内直连':
      return 'direct';
    default:
      // PROXY、国外媒体、AI服务、加密货币等 → proxy 组
      return 'proxy';
  }
}

/**
 * 验证生成的 JSON 格式正确
 */
export function validateSingbox(json: string): boolean {
  try {
    const parsed = JSON.parse(json);
    return !!parsed && Array.isArray((parsed as Record<string, unknown>).outbounds);
  } catch {
    return false;
  }
}