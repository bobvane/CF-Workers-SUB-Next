import { describe, it, expect } from 'vitest';
import {
  hashPassword,
  verifyPassword,
  createPasswordHash,
  createAuthService,
  parseCookie,
  createSessionCookie,
  createClearCookie,
  SESSION_COOKIE_NAME,
} from '@/services/auth.service';
import { KvSessionRepository, MemoryKvAdapter } from '@/storage/kv';

describe('password hashing', () => {
  it('should hash password with salt', async () => {
    const { hash, salt } = await createPasswordHash('secret123');
    expect(hash).toBeTruthy();
    expect(salt).toBeTruthy();
    expect(hash).not.toBe('secret123');
    expect(hash.length).toBe(64); // 256 bits = 64 hex chars
  });

  it('should verify correct password', async () => {
    const { hash, salt } = await createPasswordHash('secret123');
    expect(await verifyPassword('secret123', salt, hash)).toBe(true);
  });

  it('should reject wrong password', async () => {
    const { hash, salt } = await createPasswordHash('secret123');
    expect(await verifyPassword('wrong', salt, hash)).toBe(false);
  });

  it('should produce different hashes for same password with different salt', async () => {
    const a = await createPasswordHash('same');
    const b = await createPasswordHash('same');
    expect(a.hash).not.toBe(b.hash);
  });

  it('should be deterministic for same salt', async () => {
    const salt = 'fixed-salt';
    const h1 = await hashPassword('pw', salt);
    const h2 = await hashPassword('pw', salt);
    expect(h1).toBe(h2);
  });
});

describe('auth service', () => {
  it('should login with correct password', async () => {
    const sessions = new KvSessionRepository(new MemoryKvAdapter());
    const adminHash = await createPasswordHash('admin123');
    const service = createAuthService(sessions, async () => adminHash);
    const token = await service.login('admin123');
    expect(token).toBeTruthy();
  });

  it('should reject wrong password', async () => {
    const sessions = new KvSessionRepository(new MemoryKvAdapter());
    const adminHash = await createPasswordHash('admin123');
    const service = createAuthService(sessions, async () => adminHash);
    expect(await service.login('wrong')).toBeNull();
  });

  it('should validate session token', async () => {
    const sessions = new KvSessionRepository(new MemoryKvAdapter());
    const adminHash = await createPasswordHash('admin123');
    const service = createAuthService(sessions, async () => adminHash);
    const token = await service.login('admin123');
    expect(await service.validateSession(token!)).toBe(true);
    expect(await service.validateSession('invalid')).toBe(false);
  });

  it('should logout and invalidate session', async () => {
    const sessions = new KvSessionRepository(new MemoryKvAdapter());
    const adminHash = await createPasswordHash('admin123');
    const service = createAuthService(sessions, async () => adminHash);
    const token = await service.login('admin123');
    await service.logout(token!);
    expect(await service.validateSession(token!)).toBe(false);
  });

  it('should handle missing admin hash', async () => {
    const sessions = new KvSessionRepository(new MemoryKvAdapter());
    const service = createAuthService(sessions, async () => null);
    expect(await service.login('anything')).toBeNull();
  });
});

describe('cookie handling', () => {
  it('should parse session cookie', () => {
    const header = `${SESSION_COOKIE_NAME}=abc123; Other=xyz`;
    expect(parseCookie(header, SESSION_COOKIE_NAME)).toBe('abc123');
  });

  it('should return null for missing cookie', () => {
    expect(parseCookie(null, SESSION_COOKIE_NAME)).toBeNull();
    expect(parseCookie('Other=xyz', SESSION_COOKIE_NAME)).toBeNull();
  });

  it('should create session cookie with security flags', () => {
    const cookie = createSessionCookie('token123');
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('Secure');
    expect(cookie).toContain('SameSite=Strict');
    expect(cookie).toContain('token123');
  });

  it('should create clear cookie', () => {
    const cookie = createClearCookie();
    expect(cookie).toContain('Max-Age=0');
    expect(cookie).toContain('HttpOnly');
  });
});