/**
 * 认证服务
 * TASK 2.3 - Authentication
 * 11_SECURITY.md §7-8：PBKDF2 密码哈希 + HttpOnly Session Cookie
 */

import { SessionRepository } from '@/storage/kv';

// ============ 密码哈希 ============

/**
 * 计算 PBKDF2-SHA256 哈希（Web Crypto API，兼容 Cloudflare Workers）
 */
export async function hashPassword(password: string, salt: string): Promise<string> {
  const encoder = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    encoder.encode(password),
    'PBKDF2',
    false,
    ['deriveBits']
  );
  const bits = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt: encoder.encode(salt),
      iterations: 100_000,
      hash: 'SHA-256',
    },
    keyMaterial,
    256
  );
  return bytesToHex(new Uint8Array(bits));
}

/**
 * 生成随机盐
 */
export function generateSalt(): string {
  return crypto.randomUUID();
}

/**
 * 生成密码哈希记录（含盐）
 */
export async function createPasswordHash(password: string): Promise<{
  hash: string;
  salt: string;
}> {
  const salt = generateSalt();
  const hash = await hashPassword(password, salt);
  return { hash, salt };
}

/**
 * 验证密码
 */
export async function verifyPassword(
  password: string,
  salt: string,
  expectedHash: string
): Promise<boolean> {
  const actualHash = await hashPassword(password, salt);
  return actualHash === expectedHash;
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

// ============ Session 管理 ============

export const SESSION_TTL_SECONDS = 7 * 24 * 3600; // 7 天
export const SESSION_COOKIE_NAME = 'sub_session';

export interface AuthService {
  /**
   * 登录：验证用户名+密码，创建 session，返回 session token
   */
  login(username: string, password: string): Promise<string | null>;
  /**
   * 校验 session 是否有效
   */
  validateSession(token: string): Promise<boolean>;
  /**
   * 登出：删除 session
   */
  logout(token: string): Promise<void>;
  /**
   * 获取当前用户名
   */
  getUsername(): Promise<string>;
  /**
   * 修改用户名（校验当前密码后生效）
   */
  setUsername(currentPassword: string, newUsername: string): Promise<boolean>;
  /**
   * 修改密码：校验旧密码，成功后写入新哈希并吊销全部 session
   */
  changePassword(currentPassword: string, newPassword: string): Promise<boolean>;
}

/** 用户名 KV key */
export const ADMIN_USERNAME_KEY = 'admin:username';
export const DEFAULT_USERNAME = 'admin';

/**
 * 创建认证服务
 */
export function createAuthService(
  sessions: SessionRepository,
  getAdminHash: () => Promise<{ hash: string; salt: string } | null>,
  kv?: { get(key: string): Promise<string | null>; put(key: string, value: string): Promise<void> }
): AuthService {
  const getUsernameInner = async (): Promise<string> => {
    if (!kv) return DEFAULT_USERNAME;
    const raw = await kv.get(ADMIN_USERNAME_KEY);
    return raw ? raw.trim() || DEFAULT_USERNAME : DEFAULT_USERNAME;
  };
  const setAdminHash = async (hash: string, salt: string): Promise<void> => {
    // 复用 admin:hash 存储结构（由 index.ts 初始化写入），这里直接覆盖
    await kv?.put('admin:hash', JSON.stringify({ hash, salt }));
  };
  return {
    async login(username: string, password: string): Promise<string | null> {
      // 用户名校验：不匹配直接拒绝（未设置用户名的旧部署默认 'admin'）
      const expectedUser = await getUsernameInner();
      if ((username || '').trim().toLowerCase() !== expectedUser.toLowerCase()) return null;
      const admin = await getAdminHash();
      if (!admin) return null;
      const valid = await verifyPassword(password, admin.salt, admin.hash);
      if (!valid) return null;
      const session = await sessions.create(SESSION_TTL_SECONDS);
      return session.id;
    },

    async validateSession(token: string): Promise<boolean> {
      if (!token) return false;
      const session = await sessions.getById(token);
      return session !== null;
    },

    async logout(token: string): Promise<void> {
      if (token) {
        await sessions.delete(token);
      }
    },

    async getUsername(): Promise<string> {
      return getUsernameInner();
    },

    async setUsername(currentPassword: string, newUsername: string): Promise<boolean> {
      if (!kv) return false;
      const name = (newUsername || '').trim();
      if (!/^[a-zA-Z0-9_-]{2,32}$/.test(name)) return false; // 用户名规则：2-32 位字母数字下划线连字符
      const admin = await getAdminHash();
      if (!admin) return false;
      const valid = await verifyPassword(currentPassword, admin.salt, admin.hash);
      if (!valid) return false;
      await kv.put(ADMIN_USERNAME_KEY, name);
      return true;
    },

    async changePassword(currentPassword: string, newPassword: string): Promise<boolean> {
      if (!kv) return false;
      if (typeof newPassword !== 'string' || newPassword.length < 6) return false;
      const admin = await getAdminHash();
      if (!admin) return false;
      const valid = await verifyPassword(currentPassword, admin.salt, admin.hash);
      if (!valid) return false;
      const { hash, salt } = await createPasswordHash(newPassword);
      await setAdminHash(hash, salt);
      return true;
    },
  };
}

// ============ Cookie 处理 ============

/**
 * 从 Cookie 头解析 session token
 */
export function parseCookie(cookieHeader: string | null, name: string): string | null {
  if (!cookieHeader) return null;
  for (const part of cookieHeader.split(';')) {
    const [key, ...rest] = part.trim().split('=');
    if (key === name) {
      return rest.join('=');
    }
  }
  return null;
}

/**
 * 生成 session cookie 字符串
 * 11_SECURITY.md §7.3: HttpOnly; Secure; SameSite=Strict
 */
export function createSessionCookie(token: string): string {
  return `${SESSION_COOKIE_NAME}=${token}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${SESSION_TTL_SECONDS}`;
}

/**
 * 生成删除 cookie 字符串
 */
export function createClearCookie(): string {
  return `${SESSION_COOKIE_NAME}=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0`;
}