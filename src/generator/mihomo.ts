/**
 * Mihomo 配置生成器
 * TASK 5.1 - Mihomo Generator
 * 09_CONFIG_GENERATOR_SPEC.md §7：输出 YAML，兼容 Mihomo/Clash Meta/OpenClash
 */

import { Node } from '@/models/node';
import { generateYaml, parseYaml } from './yaml-serializer';
import { MetaCubeXRule } from '@/data/metacubex-rules';
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
 * @param selectedRules 用户勾选的 MetaCubeX 分流规则（用于生成 rule-providers + rules）
 */
export function generateMihomoConfig(
  nodes: Node[],
  template: MihomoTemplate = DEFAULT_MIHOMO_TEMPLATE,
  selectedRules: MetaCubeXRule[] = []
): string {
  const uniqueNodes = makeUniqueNames(nodes);
  const proxies = uniqueNodes.map(nodeToMihomoProxy);
  const nodeNames = uniqueNodes.map((n) => n.name);
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

  // 分流规则：用户勾选了规则才生成 rule-providers + 有序 rules
  if (selectedRules.length > 0) {
    config['rule-providers'] = buildRuleProviders(selectedRules);
    config.rules = buildRules(selectedRules);
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