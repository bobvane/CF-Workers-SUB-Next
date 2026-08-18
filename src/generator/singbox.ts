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
  const uniqueNodes = makeUniqueNames(nodes);
  const outbounds: Record<string, unknown>[] = [
    {
      type: 'dns',
      tag: 'dns-out',
    },
    {
      type: 'direct',
      tag: 'direct',
    },
    {
      type: 'block',
      tag: 'block',
    },
    ...uniqueNodes.map(nodeToSingboxOutbound),
    {
      type: 'selector',
      tag: 'proxy',
      outbounds: ['auto', ...uniqueNodes.map((n) => n.name)],
      default: uniqueNodes.length > 0 ? uniqueNodes[0].name : 'direct',
    },
    {
      type: 'urltest',
      tag: 'auto',
      outbounds: uniqueNodes.map((n) => n.name),
    },
  ];

  // 构建 rule_set 引用列表 + route rules
  const ruleSetRefs: Record<string, unknown>[] = [];
  const routeRules: Record<string, unknown>[] = [];

  // DNS 规则优先
  routeRules.push({ protocol: 'dns', outbound: 'dns-out' });

  // 用户勾选的规则
  if (selectedRules.length > 0) {
    for (const rule of selectedRules) {
      const name = providerName(rule.id);
      ruleSetRefs.push({
        tag: name,
        type: 'remote',
        format: 'source',
        url: metacubexSrsUrl(rule.id),
      });
      const target = ruleActionTarget(rule, ruleGroups);
      // 按 Mihomo 规则映射找到对应的 outbound 策略
      const outbound = mapTargetToOutbound(target);
      routeRules.push({ rule_set: [name], outbound });
    }
  }

  // 兜底规则
  routeRules.push({ ip_cidr: ['0.0.0.0/0'], outbound: 'proxy' });
  routeRules.push({ ip_cidr: ['::/0'], outbound: 'proxy' });

  const config: Record<string, unknown> = {
    log: { level: template.logLevel ?? 'info' },
    outbounds,
    route: {
      final: 'proxy',
      rules: routeRules,
    },
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
    case 'REJECT':
    case '广告拦截':
      return 'block';
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