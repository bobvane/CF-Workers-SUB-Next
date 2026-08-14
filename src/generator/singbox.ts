/**
 * Sing-box 配置生成器
 * TASK 5.2 - Sing-box Generator
 * 09_CONFIG_GENERATOR_SPEC.md §8：输出 JSON，outbounds 映射
 */

import { Node } from '@/models/node';
import { makeUniqueNames } from './mihomo';

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
  template: SingboxTemplate = DEFAULT_SINGBOX_TEMPLATE
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

  const config: Record<string, unknown> = {
    log: { level: template.logLevel ?? 'info' },
    outbounds,
    route: {
      final: 'proxy',
      rules: [
        {
          protocol: 'dns',
          outbound: 'dns-out',
        },
      ],
    },
  };

  return JSON.stringify(config, null, 2);
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