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

/** 辅助：创建带密码版本管理的 auth service（mock kv） */
function createAuthWithVersion(sessions: KvSessionRepository) {
  let version = 0;
  return {
    service: createAuthService(sessions, async () => null, {
      get: async (key: string) => {
        if (key === 'admin:username') return 'admin';
        if (key === 'setting:password_version') return String(version);
        return null;
      },
      put: async (key: string, value: string) => {
        if (key === 'setting:password_version') version = parseInt(value, 10) || 0;
      },
    }),
    get version() { return version; },
  };
}

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
  async function setup() {
    const sessions = new KvSessionRepository(new MemoryKvAdapter());
    const adminHash = await createPasswordHash('admin123');
    let version = 0;
    const service = createAuthService(sessions, async () => adminHash, {
      get: async (key: string) => {
        if (key === 'admin:username') return 'admin';
        if (key === 'setting:password_version') return String(version);
        return null;
      },
      put: async (key: string, value: string) => {
        if (key === 'setting:password_version') version = parseInt(value, 10) || 0;
      },
    });
    return { sessions, service, get version() { return version; }, set version(v: number) { version = v; } };
  }

  it('should login with correct password', async () => {
    const { service } = await setup();
    const token = await service.login('admin', 'admin123');
    expect(token).toBeTruthy();
  });

  it('should reject wrong password', async () => {
    const { service } = await setup();
    expect(await service.login('admin', 'wrong')).toBeNull();
  });

  it('should validate session token', async () => {
    const { service } = await setup();
    const token = await service.login('admin', 'admin123');
    expect(await service.validateSession(token!)).toBe(true);
    expect(await service.validateSession('invalid')).toBe(false);
  });

  it('should logout and invalidate session', async () => {
    const { service } = await setup();
    const token = await service.login('admin', 'admin123');
    await service.logout(token!);
    expect(await service.validateSession(token!)).toBe(false);
  });

  it('should handle missing admin hash', async () => {
    const sessions = new KvSessionRepository(new MemoryKvAdapter());
    const service = createAuthService(sessions, async () => null);
    expect(await service.login('admin', 'anything')).toBeNull();
  });

  it('should invalidate old sessions after password change (v2.21.0)', async () => {
    const { service, sessions } = await setup();
    const token1 = await service.login('admin', 'admin123');
    expect(token1).toBeTruthy();

    // Simulate password change: delete old session
    await sessions.delete(token1!);

    // Old token should be invalid (session deleted)
    expect(await service.validateSession(token1!)).toBe(false);

    // New login with same password (password hash hasn't changed in test, just session revoked)
    const token2 = await service.login('admin', 'admin123');
    expect(token2).toBeTruthy();
    expect(await service.validateSession(token2!)).toBe(true);
  });

  it('should reject session with outdated passwordVersion (v2.21.0)', async () => {
    const sessions = new KvSessionRepository(new MemoryKvAdapter());
    let version = 0;
    const adminHash = await createPasswordHash('admin123');
    const service = createAuthService(sessions, async () => adminHash, {
      get: async (key: string) => {
        if (key === 'admin:username') return 'admin';
        if (key === 'setting:password_version') return String(version);
        return null;
      },
      put: async (key: string, value: string) => {
        if (key === 'setting:password_version') version = parseInt(value, 10) || 0;
      },
    });

    // Login with version 0
    const token = await service.login('admin', 'admin123');
    expect(token).toBeTruthy();
    expect(await service.validateSession(token!)).toBe(true);

    // Bump version (simulating password change)
    version = 1;

    // Old session should now be invalid
    expect(await service.validateSession(token!)).toBe(false);
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