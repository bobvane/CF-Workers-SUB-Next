/**
 * Mihomo 配置生成器
 * TASK 5.1 - Mihomo Generator
 * 09_CONFIG_GENERATOR_SPEC.md §7：输出 YAML，兼容 Mihomo/Clash Meta/OpenClash
 */

import { Node } from '@/models/node';
import { generateYaml, parseYaml } from './yaml-serializer';

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
      if (node.pbk) base.realityOpts = { publicKey: node.pbk, shortId: node.sid };
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
 * 生成代理组配置
 */
export function generateProxyGroups(nodeNames: string[]): Record<string, unknown>[] {
  return [
    {
      name: 'PROXY',
      type: 'select',
      proxies: ['AUTO', ...nodeNames],
    },
    // V1 不执行真实测速，但提供 url-test 作为可用自动选择组
    {
      name: 'AUTO',
      type: 'url-test',
      url: 'http://www.gstatic.com/generate_204',
      interval: 300,
      tolerance: 50,
      proxies: nodeNames.length > 0 ? nodeNames : ['DIRECT'],
    },
  ];
}

/**
 * 生成 Mihomo YAML 配置
 */
export function generateMihomoConfig(
  nodes: Node[],
  template: MihomoTemplate = DEFAULT_MIHOMO_TEMPLATE
): string {
  const proxies = nodes.map(nodeToMihomoProxy);
  const nodeNames = nodes.map((n) => n.name);
  const groups = generateProxyGroups(nodeNames);

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