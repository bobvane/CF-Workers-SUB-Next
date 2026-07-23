/**
 * KV 存储封装
 * 提供对 CF Workers KV 的读写操作
 */

/**
 * 获取 KV 中的值
 * @param {KVNamespace} kv - KV 绑定
 * @param {string} key
 * @returns {Promise<any|null>}
 */
export async function kvGet(kv, key) {
  const value = await kv.get(key, 'text');
  if (!value) return null;
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

/**
 * 写入 KV
 * @param {KVNamespace} kv
 * @param {string} key
 * @param {any} value
 * @param {number} [expirationTtl] - 可选过期时间（秒）
 */
export async function kvPut(kv, key, value, expirationTtl = null) {
  const text = typeof value === 'string' ? value : JSON.stringify(value);
  const options = {};
  if (expirationTtl) options.expirationTtl = expirationTtl;
  await kv.put(key, text, options);
}

/**
 * 删除 KV 中的 key
 */
export async function kvDelete(kv, key) {
  await kv.delete(key);
}

/**
 * 获取所有 key 列表（用于管理）
 * @param {KVNamespace} kv
 * @param {string} [prefix] - 可选前缀过滤
 */
export async function kvList(kv, prefix = '') {
  const result = await kv.list({ prefix });
  return result.keys;
}