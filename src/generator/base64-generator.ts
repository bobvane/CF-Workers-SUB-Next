/**
 * Base64 订阅生成器
 * 覆盖客户端：V2RAY / V2RAYNG / NEKORAY / Shadowrocket / Loon
 * 输出：所有节点链接 Base64 编码（标准 V2Ray 订阅格式）
 */

import { Node } from '@/models/node';
import { nodeToUrl } from './node-to-url';
import { encodeSubscriptionLines } from './base64';

/**
 * 生成 Base64 订阅内容
 * 每行一个节点链接，整体 Base64 编码
 */
export function generateBase64Config(nodes: Node[]): string {
  const lines = nodes
    .map((n) => nodeToUrl(n))
    .filter((line) => line.length > 0);
  return encodeSubscriptionLines(lines);
}

/**
 * 校验 Base64 生成结果
 */
export function validateBase64(content: string): boolean {
  try {
    if (!content) return false;
    // Base64 应只含标准字符
    return /^[A-Za-z0-9+/=]+$/.test(content.trim());
  } catch {
    return false;
  }
}