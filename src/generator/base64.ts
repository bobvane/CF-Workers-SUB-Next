/**
 * Base64 编解码工具（Worker 环境 atob/btoa 的封装）
 * 用于节点链接序列化和订阅内容解码
 */

/**
 * UTF-8 字符串 → Base64
 */
export function safeBase64Encode(input: string): string {
  try {
    const bytes = new TextEncoder().encode(input);
    let binary = '';
    for (const b of bytes) {
      binary += String.fromCharCode(b);
    }
    return btoa(binary);
  } catch {
    // 兜底：直接 btoa（只支持 latin1）
    return btoa(input);
  }
}

/**
 * Base64 → UTF-8 字符串
 * 返回 null 表示解码失败
 */
export function safeBase64Decode(input: string): string | null {
  try {
    const cleaned = input.replace(/\s+/g, '');
    if (cleaned.length === 0) return null;

    let normalized = cleaned.replace(/-/g, '+').replace(/_/g, '/');
    while (normalized.length % 4 !== 0) {
      normalized += '=';
    }

    const binary = atob(normalized);
    const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
    return new TextDecoder().decode(bytes);
  } catch {
    return null;
  }
}

/**
 * 将多行节点链接列表编码为 Base64 订阅内容
 */
export function encodeSubscriptionLines(lines: string[]): string {
  return safeBase64Encode(lines.join('\n'));
}