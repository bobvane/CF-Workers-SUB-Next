/**
 * 工具函数
 * CF Workers 运行时，无 Node.js 依赖
 */

// ── 密码哈希 ──

/**
 * 使用 PBKDF2 + SHA-256 对密码加盐哈希
 * @param {string} password
 * @param {string} salt
 * @returns {Promise<string>} hex 编码的哈希值
 */
export async function hashPassword(password, salt) {
  const encoder = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw', encoder.encode(password), 'PBKDF2', false, ['deriveBits']
  );
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: encoder.encode(salt), iterations: 100000, hash: 'SHA-256' },
    keyMaterial, 256
  );
  return bytesToHex(new Uint8Array(bits));
}

/**
 * 生成随机盐值
 * @returns {string} UUID 格式
 */
export function generateSalt() {
  return crypto.randomUUID();
}

/**
 * 验证密码
 */
export async function verifyPassword(password, hash, salt) {
  const computed = await hashPassword(password, salt);
  return computed === hash;
}

// ── Token 生成 ──

/**
 * 生成随机 Session Token
 * @returns {string}
 */
export function generateToken() {
  return crypto.randomUUID();
}

// ── Cookie 解析 ──

/**
 * 从 Cookie 头中解析指定 key 的值
 * @param {string} cookieHeader
 * @param {string} name
 * @returns {string|null}
 */
export function getCookie(cookieHeader, name) {
  if (!cookieHeader) return null;
  const match = cookieHeader.match(new RegExp(`(?:^|;\\s*)${name}=([^;]*)`));
  return match ? match[1] : null;
}

// ── 响应工具 ──

/**
 * JSON 成功响应
 */
export function jsonOk(data, status = 200) {
  return new Response(JSON.stringify({ ok: true, data }), {
    status,
    headers: { 'Content-Type': 'application/json' }
  });
}

/**
 * JSON 错误响应
 */
export function jsonError(message, status = 400) {
  return new Response(JSON.stringify({ ok: false, error: message }), {
    status,
    headers: { 'Content-Type': 'application/json' }
  });
}

/**
 * 设置 Cookie 的响应头
 */
export function setCookieHeader(name, value, maxAgeHours = 168) {
  return `${name}=${value}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${maxAgeHours * 3600}`;
}

/**
 * 清除 Cookie 的响应头
 */
export function clearCookieHeader(name) {
  return `${name}=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0`;
}

// ── 内部工具 ──

function bytesToHex(bytes) {
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
}