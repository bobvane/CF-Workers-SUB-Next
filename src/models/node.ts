/**
 * 节点模型 - 系统内部统一节点对象
 * 06_DATA_MODEL.md §5
 */

export type NodeProtocol =
  | 'vmess'
  | 'vless'
  | 'trojan'
  | 'ss'
  | 'hysteria2'
  | 'tuic';

export type TransportType = 'tcp' | 'ws' | 'grpc' | 'h2' | 'xhttp';

export interface Transport {
  type: TransportType;
  path?: string;
  host?: string;
  /** xhttp 模式：auto | stream-one | stream-up | packet-up（官方 Mihomo 专有，仅 VLESS 支持） */
  mode?: string;
}

export interface NodeMetadata {
  country?: string;
  region?: string;
  source: string;
  originalName: string;
  tags: string[];
  /** TLS 指纹（Reality 用，如 chrome/firefox/safari） */
  fingerprint?: string;
  /** 保留链接中的其他参数（如 spx） */
  extra?: Record<string, string>;
}

export interface Node {
  id: string;
  name: string;
  protocol: NodeProtocol;
  server: string;
  port: number;
  username?: string;
  password?: string;
  uuid?: string;
  tls?: boolean;
  transport?: Transport;
  /** Reality 参数（VLESS） */
  flow?: string;
  pbk?: string;
  sid?: string;
  sni?: string;
  /** Shadowsocks 插件 */
  plugin?: string;
  /** 是否允许不安全证书 */
  allowInsecure?: boolean;
  metadata: NodeMetadata;
  version: number;
}

/**
 * 创建节点的工厂函数
 */
export function createNode(partial: Partial<Node> & { name: string }): Node {
  return {
    id: partial.id ?? '',
    name: partial.name,
    protocol: partial.protocol ?? 'vmess',
    server: partial.server ?? '',
    port: partial.port ?? 443,
    username: partial.username,
    password: partial.password,
    uuid: partial.uuid,
    tls: partial.tls,
    transport: partial.transport,
    flow: partial.flow,
    pbk: partial.pbk,
    sid: partial.sid,
    sni: partial.sni,
    plugin: partial.plugin,
    allowInsecure: partial.allowInsecure,
    metadata: {
      source: partial.metadata?.source ?? 'unknown',
      originalName: partial.metadata?.originalName ?? partial.name,
      tags: partial.metadata?.tags ?? [],
      country: partial.metadata?.country,
      region: partial.metadata?.region,
    },
    version: 1,
  };
}

/**
 * 节点指纹：server:port:protocol
 * 用于节点禁用状态持久化（重抓订阅后状态不丢失）
 */
export function nodeFingerprint(node: Pick<Node, 'server' | 'port' | 'protocol'>): string {
  return `${node.server}:${node.port}:${node.protocol}`.toLowerCase();
}