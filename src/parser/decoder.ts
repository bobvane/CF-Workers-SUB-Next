/**
 * 内容解码器
 * TASK 4.1 - Decoder：Base64 + URL Decode
 * 08_PARSER_SPEC.md §13
 */

/**
 * 安全 Base64 解码（兼容 URL-safe）
 * 返回 null 表示解码失败
 */
export function safeBase64Decode(input: string): string | null {
  try {
    // 清理空白
    const cleaned = input.replace(/\s+/g, '');
    if (cleaned.length === 0) return null;

    // URL-safe base64 → 标准 base64
    let normalized = cleaned.replace(/-/g, '+').replace(/_/g, '/');
    // 补齐 padding
    while (normalized.length % 4 !== 0) {
      normalized += '=';
    }

    // 先尝试 UTF-8 解码（二进制转字符串）
    const binary = atob(normalized);
    return decodeUtf8(binary);
  } catch {
    return null;
  }
}

/**
 * 将二进制字符串解码为 UTF-8 文本
 * atob 返回 latin1 字符串，需要转回 UTF-8
 */
function decodeUtf8(binary: string): string {
  try {
    const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
    return new TextDecoder().decode(bytes);
  } catch {
    return binary;
  }
}

/**
 * 判断一段文本是否可能是 Base64（启发式）
 * 用于区分订阅内容是纯文本还是 Base64 编码
 */
export function looksLikeBase64(input: string): boolean {
  const trimmed = input.trim();
  if (trimmed.length < 4) return false;
  // 去除空白后应主要是 base64 字符集
  const cleaned = trimmed.replace(/\s+/g, '');
  const validChars = cleaned.length - cleaned.replace(/[A-Za-z0-9+/=_-]/g, '').length;
  return validChars / cleaned.length > 0.95;
}

/**
 * 尝试解码订阅内容
 * 如果内容是 Base64 则解码，否则原样返回
 */
export function decodeSubscriptionContent(content: string): string {
  const trimmed = content.trim();
  if (!trimmed) return '';

  if (looksLikeBase64(trimmed)) {
    const decoded = safeBase64Decode(trimmed);
    if (decoded && decoded.includes('://')) {
      return decoded;
    }
  }
  return trimmed;
}

/**
 * URL 解码（用于节点链接参数）
 */
export function safeUrlDecode(input: string): string {
  try {
    return decodeURIComponent(input);
  } catch {
    return input;
  }
}