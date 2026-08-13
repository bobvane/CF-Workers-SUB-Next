/**
 * API 中间件
 * 07_API_SPECIFICATION.md §11-13：认证中间件 + 统一错误格式
 * 05_TECHNICAL_SPECIFICATION.md §13：AppError + { success, error } 响应
 */

import { Context, Next } from 'hono';
import { AuthService } from '@/services/auth.service';
import { parseCookie, SESSION_COOKIE_NAME } from '@/services/auth.service';

export class AppError extends Error {
  code: string;
  status: number;

  constructor(code: string, message: string, status = 400) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

export const ERRORS = {
  AUTH_REQUIRED: (msg = 'Authentication required') => new AppError('AUTH_REQUIRED', msg, 401),
  INVALID_PARAMETER: (msg = 'Invalid parameter') => new AppError('INVALID_PARAMETER', msg, 400),
  SUBSCRIPTION_NOT_FOUND: (msg = 'Subscription not found') =>
    new AppError('SUBSCRIPTION_NOT_FOUND', msg, 404),
  FETCH_FAILED: (msg = 'Fetch failed') => new AppError('FETCH_FAILED', msg, 502),
  PARSE_FAILED: (msg = 'Parse failed') => new AppError('PARSE_FAILED', msg, 422),
  GENERATION_FAILED: (msg = 'Generation failed') => new AppError('GENERATION_FAILED', msg, 500),
  STORAGE_ERROR: (msg = 'Storage error') => new AppError('STORAGE_ERROR', msg, 500),
  RATE_LIMITED: (msg = 'Rate limited') => new AppError('RATE_LIMITED', msg, 429),
  NOT_FOUND: (msg = 'Resource not found') => new AppError('NOT_FOUND', msg, 404),
} as const;

/**
 * 从请求中提取 session token（Cookie 优先，其次查询参数）
 */
function getToken(c: Context): string | null {
  const cookieHeader = c.req.header('cookie') ?? null;
  const cookieToken = parseCookie(cookieHeader, SESSION_COOKIE_NAME);
  if (cookieToken) return cookieToken;
  const queryToken = c.req.query('token') ?? null;
  return queryToken;
}

/**
 * 认证中间件 - 保护路由
 */
export function requireAuth(auth: AuthService) {
  return async (c: Context, next: Next) => {
    const token = getToken(c);
    if (!token) {
      return c.json(
        { success: false, error: { code: 'AUTH_REQUIRED', message: 'Authentication required' } },
        401
      );
    }
    const valid = await auth.validateSession(token);
    if (!valid) {
      return c.json(
        { success: false, error: { code: 'AUTH_REQUIRED', message: 'Invalid or expired session' } },
        401
      );
    }
    c.set('sessionToken', token);
    await next();
  };
}

/**
 * 统一错误处理中间件
 */
export async function errorHandler(err: Error, c: Context) {
  if (err instanceof AppError) {
    return c.json(
      { success: false, error: { code: err.code, message: err.message } },
      err.status as 400
    );
  }
  console.error('[UnhandledError]', err.message);
  return c.json(
    { success: false, error: { code: 'INTERNAL_ERROR', message: 'Internal server error' } },
    500
  );
}

/**
 * 从请求 JSON 读取并验证必填字段
 */
export async function readBody<T>(c: Context): Promise<T> {
  try {
    return (await c.req.json()) as T;
  } catch {
    throw ERRORS.INVALID_PARAMETER('Invalid JSON body');
  }
}

export { getToken };