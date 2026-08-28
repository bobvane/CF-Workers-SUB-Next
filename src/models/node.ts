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
  | 'tuic'
  | 'wireguard'
  | 'anytls';

export type TransportType = 'tcp' | 'ws' | 'grpc' | 'h2' | 'xhttp';

export interface Transport {
  type: TransportType;
  path?: string;
  host?: string;
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
  /** Hysteria2 专用字段 */
  /** 端口跳跃范围 (e.g. "443-8443") */
  ports?: string;
  /** 限速上传 (e.g. "30 Mbps") */
  up?: string;
  /** 限速下载 (e.g. "200 Mbps") */
  down?: string;
  /** Hysteria2 混淆类型 (salamander/gecko) */
  obfs?: string;
  /** Hysteria2 混淆密码 */
  obfsPassword?: string;
  /** TUIC 专用字段 */
  /** TUIC V4 token */
  token?: string;
  /** TUIC UDP relay 模式 (native/quic) */
  udpRelayMode?: string;
  /** TUIC 拥塞控制算法 (cubic/new_reno/bbr) */
  congestionController?: string;
  /** TUIC disable-sni */
  disableSni?: boolean;
  /** TUIC reduce-rtt */
  reduceRtt?: boolean;
  /** TUIC fast-open */
  fastOpen?: boolean;
  /** WireGuard 专用字段 */
  /** WireGuard 本地 IPv4 */
  wgIp?: string;
  /** WireGuard 本地 IPv6 */
  wgIpv6?: string;
  /** WireGuard 客户端私钥 */
  wgPrivateKey?: string;
  /** WireGuard 服务端公钥 */
  wgPublicKey?: string;
  /** WireGuard allowed-ips */
  wgAllowedIps?: string;
  /** WireGuard pre-shared-key */
  wgPreSharedKey?: string;
  /** WireGuard reserved 字段 */
  wgReserved?: number[];
  /** WireGuard MTU */
  wgMtu?: number;
  /** AnyTLS 专用字段 */
  /** AnyTLS idle-session-check-interval */
  idleSessionCheckInterval?: number;
  /** AnyTLS idle-session-timeout */
  idleSessionTimeout?: number;
  /** AnyTLS min-idle-session */
  minIdleSession?: number;
  /** AnyTLS client-metadata */
  clientMetadata?: string;
  /** TLS alpn */
  alpn?: string[];
  /** TLS fingerprint (client-fingerprint) */
  fingerprint?: string;
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
    ports: partial.ports,
    up: partial.up,
    down: partial.down,
    obfs: partial.obfs,
    obfsPassword: partial.obfsPassword,
    token: partial.token,
    udpRelayMode: partial.udpRelayMode,
    congestionController: partial.congestionController,
    disableSni: partial.disableSni,
    reduceRtt: partial.reduceRtt,
    fastOpen: partial.fastOpen,
    wgIp: partial.wgIp,
    wgIpv6: partial.wgIpv6,
    wgPrivateKey: partial.wgPrivateKey,
    wgPublicKey: partial.wgPublicKey,
    wgAllowedIps: partial.wgAllowedIps,
    wgPreSharedKey: partial.wgPreSharedKey,
    wgReserved: partial.wgReserved,
    wgMtu: partial.wgMtu,
    idleSessionCheckInterval: partial.idleSessionCheckInterval,
    idleSessionTimeout: partial.idleSessionTimeout,
    minIdleSession: partial.minIdleSession,
    clientMetadata: partial.clientMetadata,
    alpn: partial.alpn,
    fingerprint: partial.fingerprint,
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