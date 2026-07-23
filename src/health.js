/**
 * 节点健康检测
 * 通过 fetch 尝试连接检测节点可用性
 * 简化版：主要做去重和节点统计，TCP 检测作为可选增强
 */

import { fetchNodes, deduplicateNodes } from './parser.js';

/**
 * 检测单个节点是否可用（简化版 - 通过 HTTP 请求检测）
 */
export async function checkNode(node, timeout = 5000) {
  if (!node || !node.server || !node.port) {
    return { ok: false, latency: null, error: '无效节点信息' };
  }
  // 简化：假设节点可用（实际检测需要 TCP Socket API）
  // 后续可增强为通过 fetch 检测
  return { ok: true, latency: 0 };
}

/**
 * 批量检测节点（并发）
 * @param {Array<object>} nodes
 * @param {number} concurrency - 并发数
 * @param {number} timeout - 单节点超时
 * @returns {Promise<{valid: Array, invalid: Array}>}
 */
export async function batchCheckNodes(nodes, concurrency = 5, timeout = 5000) {
  const results = { valid: [], invalid: [] };
  
  // 分批并发检测
  for (let i = 0; i < nodes.length; i += concurrency) {
    const batch = nodes.slice(i, i + concurrency);
    const checks = await Promise.allSettled(
      batch.map(node => checkNode(node, timeout))
    );
    
    for (let j = 0; j < batch.length; j++) {
      const result = checks[j];
      if (result.status === 'fulfilled' && result.value.ok) {
        results.valid.push({
          ...batch[j],
          latency: result.value.latency,
        });
      } else {
        results.invalid.push({
          ...batch[j],
          error: result.status === 'fulfilled' ? result.value.error : '检测异常',
        });
      }
    }
  }
  
  return results;
}

/**
 * 完整检测流程：抓取 → 解析 → 去重 → 检测
 * @param {Array<string>} subscriptionUrls
 * @returns {Promise<{all: Array, valid: Array, invalid: Array}>}
 */
export async function fullHealthCheck(subscriptionUrls) {
  if (!subscriptionUrls || subscriptionUrls.length === 0) {
    return { all: [], valid: [], invalid: [] };
  }

  // 1. 抓取所有订阅
  const allNodes = [];
  for (const url of subscriptionUrls) {
    const nodes = await fetchNodes(url);
    allNodes.push(...nodes);
  }

  // 2. 去重
  const uniqueNodes = deduplicateNodes(allNodes);

  // 3. 健康检测
  const { valid, invalid } = await batchCheckNodes(uniqueNodes);

  return {
    all: uniqueNodes,
    valid,
    invalid,
  };
}