/**
 * 认证模块
 * 密码登录 + Session 管理
 */

import { hashPassword, generateSalt, verifyPassword, generateToken, getCookie } from './utils.js';
import { kvGet, kvPut, kvDelete } from './kv.js';

// KV Key 常量
const KV_ADMIN_HASH = 'admin:hash';
const KV_SESSION_PREFIX = 'sessions:';

/**
 * 初始化管理员密码（首次部署时调用）
 * 默认密码：admin
 */
export async function initAdmin(kv) {
  const existing = await kvGet(kv, KV_ADMIN_HASH);
  if (existing) return; // 已初始化

  const salt = generateSalt();
  const hash = await hashPassword('admin', salt);
  await kvPut(kv, KV_ADMIN_HASH, { hash, salt });
}

/**
 * 登录验证
 * @param {KVNamespace} kv
 * @param {string} password
 * @returns {Promise<{ok:boolean, token?:string, error?:string}>}
 */
export async function login(kv, password) {
  const admin = await kvGet(kv, KV_ADMIN_HASH);
  if (!admin) {
    return { ok: false, error: '系统未初始化' };
  }

  const valid = await verifyPassword(password, admin.hash, admin.salt);
  if (!valid) {
    return { ok: false, error: '密码错误' };
  }

  // 生成 Session Token
  const token = generateToken();
  const expiresAt = Math.floor(Date.now() / 1000) + 168 * 3600; // 7 天
  await kvPut(kv, KV_SESSION_PREFIX + token, {
    username: 'admin',
    role: 'admin',
    expires: expiresAt
  }, 168 * 3600); // KV 自动过期

  return { ok: true, token };
}

/**
 * 登出：删除 Session
 */
export async function logout(kv, token) {
  if (token) {
    await kvDelete(kv, KV_SESSION_PREFIX + token);
  }
}

/**
 * 验证 Session 有效性
 * @returns {Promise<{valid:boolean, user?:object}>}
 */
export async function validateSession(kv, cookieHeader) {
  const token = getCookie(cookieHeader, 'session');
  if (!token) return { valid: false };

  const session = await kvGet(kv, KV_SESSION_PREFIX + token);
  if (!session) return { valid: false };

  // 检查是否过期
  if (session.expires && session.expires < Math.floor(Date.now() / 1000)) {
    await kvDelete(kv, KV_SESSION_PREFIX + token);
    return { valid: false };
  }

  return { valid: true, user: { username: session.username, role: session.role } };
}

/**
 * 修改密码
 */
export async function changePassword(kv, oldPassword, newPassword) {
  const admin = await kvGet(kv, KV_ADMIN_HASH);
  if (!admin) return { ok: false, error: '系统未初始化' };

  const valid = await verifyPassword(oldPassword, admin.hash, admin.salt);
  if (!valid) return { ok: false, error: '原密码错误' };

  const salt = generateSalt();
  const hash = await hashPassword(newPassword, salt);
  await kvPut(kv, KV_ADMIN_HASH, { hash, salt });
  return { ok: true };
}