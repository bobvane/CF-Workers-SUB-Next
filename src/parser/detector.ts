/**
 * 协议检测器
 * TASK 4.2 - Protocol Detector
 * 08_PARSER_SPEC.md §7
 */

export type DetectedProtocol = 'vmess' | 'vless' | 'trojan' | 'ss' | 'hysteria2' | 'tuic' | 'wireguard' | 'anytls' | 'unknown';

/**
 * 检测单行节点链接的协议
 */
export function detectProtocol(line: string): DetectedProtocol {
  const trimmed = line.trim();
  if (trimmed.startsWith('vmess://')) return 'vmess';
  if (trimmed.startsWith('vless://')) return 'vless';
  if (trimmed.startsWith('trojan://')) return 'trojan';
  if (trimmed.startsWith('ss://')) return 'ss';
  if (trimmed.startsWith('hysteria2://') || trimmed.startsWith('hy2://')) return 'hysteria2';
  if (trimmed.startsWith('tuic://')) return 'tuic';
  if (trimmed.startsWith('wireguard://') || trimmed.startsWith('wg://')) return 'wireguard';
  if (trimmed.startsWith('anytls://')) return 'anytls';
  return 'unknown';
}

/**
 * 从订阅内容中分段检测所有协议
 * 返回按协议分组统计
 */
export function detectProtocolsFromContent(content: string): Map<DetectedProtocol, number> {
  const counts = new Map<DetectedProtocol, number>();
  const lines = content.split(/\r?\n/);
  for (const line of lines) {
    if (!line.trim()) continue;
    const proto = detectProtocol(line);
    counts.set(proto, (counts.get(proto) ?? 0) + 1);
  }
  return counts;
}

/**
 * 从订阅内容中提取所有节点链接行
 * 过滤空行和注释
 */
export function splitLines(content: string): string[] {
  return content
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && !l.startsWith('#'));
}