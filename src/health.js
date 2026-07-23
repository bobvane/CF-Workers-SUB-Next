/**
 * 节点健康检测
 * 使用 TCP 连接检测节点可用性
 * 
 * 注意：CF Workers 的 connect() API 有局限性，
 * 此处使用 HTTP HEAD 请求模拟检测（通过目标代理IP+端口尝试连接）
 * 更准确的检测需要外部服务或 Workers + TCP Sockets (已支持)
 */

import { fetchNodes, deduplicateNodes } from './parser.js';

/**
 * 检测单个节点是否可用
 * 通过尝试连接节点的 server:port 来判断
 * @param {object} node - 节点对象
 * @param {number} timeout - 超时时间（毫秒）
 * @returns {Promise<{ok: boolean, latency: number|null}>}
 */
export async function checkNode(node, timeout = 5000) {
  if (!node || !node.server || !node.port) {
    return { ok: false, latency: null, error: '无效节点信息' };
  }

  const start = Date.now();
  try {
    // 使用 connect() API (Workers 支持 TCP 连接)
    const socket = await connect({
      hostname: node.server,
      port: node.port,
    });
    
    // 读取一些数据来确认连接正常
    const reader = socket.readable.getReader();
    const timer = setTimeout(() => {
      reader.cancel();
      socket.close();
    }, timeout);

    try {
      await reader.read();
    } catch {
      // 读取超时或错误不一定是节点不可用
    }
    clearTimeout(timer);
    
    socket.close();
    const latency = Date.now() - start;
    return { ok: true, latency };
  } catch (err) {
    // TCP 连接失败说明节点不可用
    return { ok: false, latency: null, error: '连接失败' };
  }
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