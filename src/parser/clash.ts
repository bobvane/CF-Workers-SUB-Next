/**
 * Clash/Mihomo YAML 订阅解析器
 * 处理 Clash 格式的订阅内容（proxies: 列表）
 * 支持：vless / vmess / trojan / ss 四种协议
 */

import { Node, createNode, Transport } from '@/models/node';
import { parse as yamlParse } from 'yaml';

interface ClashProxy {
  name: string;
  type: string;
  server: string;
  port: number;
  uuid?: string;
  password?: string;
  cipher?: string;
  tls?: boolean;
  flow?: string;
  sni?: string;
  'skip-cert-verify'?: boolean;
  network?: string;
  'ws-opts'?: {
    path?: string;
    headers?: Record<string, string>;
  };
  'grpc-opts'?: {
    'grpc-service-name'?: string;
  };
  realityOpts?: {
    'public-key'?: string;
    'short-id'?: string;
  };
  // sing-box 兼容字段
  server_port?: number;
  method?: string;
  plugin?: string;
  'plugin-opts'?: Record<string, string>;
}

/**
 * 检测内容是否为 Clash YAML 格式
 */
export function isClashYaml(content: string): boolean {
  const trimmed = content.trim();
  // 检查是否以 proxies: 开头或包含 YAML 格式的代理定义
  return trimmed.startsWith('proxies:') || trimmed.startsWith('port:') || 
         /^proxies:\s*\n/m.test(trimmed) || /^\s+- name:/.test(trimmed);
}

/**
 * 解析 Clash YAML 格式的订阅内容
 */
export function parseClashYaml(content: string): { nodes: Node[]; errors: { line: number; code: string; message: string }[] } {
  const errors: { line: number; code: string; message: string }[] = [];
  const nodes: Node[] = [];

  try {
    const parsed = yamlParse(content) as { proxies?: ClashProxy[] };
    if (!parsed || !Array.isArray(parsed.proxies)) {
      errors.push({ line: 0, code: 'INVALID_FORMAT', message: 'No proxies array in YAML' });
      return { nodes, errors };
    }

    const supportedTypes = ['vless', 'vmess', 'trojan', 'ss'];
    let lineNum = 1;

    for (const proxy of parsed.proxies) {
      lineNum++;
      if (!proxy.name || !proxy.server) {
        errors.push({ line: lineNum, code: 'INVALID_PROXY', message: 'Missing name or server' });
        continue;
      }

      if (!supportedTypes.includes(proxy.type)) {
        errors.push({ line: lineNum, code: 'UNSUPPORTED_TYPE', message: `Unsupported type: ${proxy.type}` });
        continue;
      }

      const node = clashProxyToNode(proxy);
      if (node) {
        nodes.push(node);
      } else {
        errors.push({ line: lineNum, code: 'CONVERSION_FAILED', message: `Failed to convert ${proxy.type} proxy` });
      }
    }
  } catch (err) {
    errors.push({ line: 0, code: 'YAML_PARSE_ERROR', message: (err as Error).message });
  }

  return { nodes, errors };
}

/**
 * 将 Clash proxy 对象转换为统一 Node 模型
 */
function clashProxyToNode(proxy: ClashProxy): Node | null {
  try {
    const { type, server, name, port, uuid, password, cipher, tls, flow, sni } = proxy;
    const serverPort = proxy.server_port || port;

    let transport: Transport | undefined;

    switch (type) {
      case 'vless': {
        if (!uuid) return null;
        transport = parseClashTransport(proxy);
        return createNode({
          name,
          protocol: 'vless',
          server,
          port: serverPort,
          uuid,
          tls: tls ?? false,
          flow,
          sni,
          transport,
          metadata: { source: 'clash', originalName: name, tags: [] },
        });
      }

      case 'vmess': {
        if (!uuid) return null;
        transport = parseClashTransport(proxy);
        return createNode({
          name,
          protocol: 'vmess',
          server,
          port: serverPort,
          uuid,
          tls: tls ?? false,
          transport,
          metadata: { source: 'clash', originalName: name, tags: [] },
        });
      }

      case 'trojan': {
        if (!password) return null;
        return createNode({
          name,
          protocol: 'trojan',
          server,
          port: serverPort,
          password,
          tls: tls ?? true,
          sni: sni || server,
          allowInsecure: proxy['skip-cert-verify'] ?? false,
          metadata: { source: 'clash', originalName: name, tags: [] },
        });
      }

      case 'ss': {
        const method = cipher || proxy.method || 'aes-256-gcm';
        if (!password) return null;
        const node = createNode({
          name,
          protocol: 'ss',
          server,
          port: serverPort,
          password,
          plugin: proxy.plugin,
          metadata: { source: 'clash', originalName: name, tags: [method] },
        });
        return node;
      }

      default:
        return null;
    }
  } catch {
    return null;
  }
}

/**
 * 解析 Clash 传输配置
 */
function parseClashTransport(proxy: ClashProxy): Transport | undefined {
  const network = proxy.network || 'tcp';
  if (network === 'tcp') return undefined;

  if (network === 'ws' && proxy['ws-opts']) {
    return {
      type: 'ws',
      path: proxy['ws-opts'].path,
      host: proxy['ws-opts'].headers?.Host,
    };
  }

  if (network === 'grpc' && proxy['grpc-opts']) {
    return {
      type: 'grpc',
      path: proxy['grpc-opts']['grpc-service-name'] 
        ? '/' + proxy['grpc-opts']['grpc-service-name'] 
        : undefined,
    };
  }

  return { type: 'tcp' };
}