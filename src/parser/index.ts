/**
 * Parser 引擎编排
 * TASK 4.7 - Normalizer 管线
 * 08_PARSER_SPEC.md §3-5：Content Decoder → Protocol Detector → Parser → Normalized Node
 */

import { Node } from '@/models/node';
import { detectProtocol, splitLines } from './detector';
import { decodeSubscriptionContent } from './decoder';
import { parseVmess } from './vmess.parser';
import { parseVless } from './vless.parser';
import { parseTrojan } from './trojan.parser';
import { parseShadowsocks } from './shadowsocks.parser';
import { ParserResult } from './types';

export interface ParseSummary {
  total: number;
  success: number;
  failed: number;
  nodes: Node[];
  errors: { line: number; code: string; message: string }[];
}

/**
 * 解析订阅内容的完整管线
 * 输入：原始订阅内容 + 来源标识
 * 输出：统一 Node[] + 统计
 */
export function parseSubscriptionContent(content: string, source: string): ParseSummary {
  // 1. 解码（Base64 自动识别）
  const decoded = decodeSubscriptionContent(content);
  // 2. 分行
  const lines = splitLines(decoded);

  const nodes: Node[] = [];
  const errors: { line: number; code: string; message: string }[] = [];
  let success = 0;

  lines.forEach((line, idx) => {
    const protocol = detectProtocol(line);
    let result: ParserResult;

    switch (protocol) {
      case 'vmess':
        result = parseVmess(line);
        break;
      case 'vless':
        result = parseVless(line);
        break;
      case 'trojan':
        result = parseTrojan(line);
        break;
      case 'ss':
        result = parseShadowsocks(line);
        break;
      default:
        result = { success: false, error: { code: 'UNKNOWN_PROTOCOL', message: 'Unsupported protocol' } };
    }

    if (result.success && result.node) {
      // 标记来源
      result.node.metadata.source = source;
      nodes.push(result.node);
      success++;
    } else {
      errors.push({
        line: idx + 1,
        code: result.error?.code ?? 'UNKNOWN',
        message: result.error?.message ?? 'Parse error',
      });
    }
  });

  return {
    total: lines.length,
    success,
    failed: lines.length - success,
    nodes,
    errors,
  };
}

/**
 * 节点去重：按 server:port:protocol 判断
 */
export function deduplicateNodes(nodes: Node[]): Node[] {
  const seen = new Set<string>();
  const result: Node[] = [];
  for (const node of nodes) {
    const key = `${node.server}:${node.port}:${node.protocol}`.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      result.push(node);
    }
  }
  return result;
}

/**
 * 应用过滤规则（Rule Engine）
 * 08_PARSER_SPEC.md §12 / 06_DATA_MODEL.md §8
 * include → 只保留匹配；exclude → 移除匹配
 */
export function applyRules(
  nodes: Node[],
  rules: { type: 'include' | 'exclude' | 'replace'; pattern: string; enabled?: boolean }[]
): Node[] {
  let result = [...nodes];
  const includes = rules.filter((r) => r.type === 'include' && r.enabled !== false);
  const excludes = rules.filter((r) => r.type === 'exclude' && r.enabled !== false);

  if (includes.length > 0) {
    result = result.filter((n) =>
      includes.some((r) => nodeMatches(n, r.pattern))
    );
  }

  if (excludes.length > 0) {
    result = result.filter((n) => !excludes.some((r) => nodeMatches(n, r.pattern)));
  }

  return result;
}

function nodeMatches(node: Node, pattern: string): boolean {
  const originalName = node.metadata?.originalName ?? '';
  const haystack = `${node.name} ${node.server} ${originalName}`.toLowerCase();
  return haystack.includes(pattern.toLowerCase());
}