import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

describe('bobsub 页面超时修复', () => {
  const { Window } = require('happy-dom');

  function makeWindow() {
    return new Window({
      url: 'http://localhost/#dashboard',
      settings: { disableJavaScriptEvaluation: false },
    });
  }

  function extractScript(html: string): string {
    const m = html.match(/<script>([\s\S]*)<\/script>/);
    if (!m) throw new Error('no inline script');
    return m[1];
  }

  it(
    'auth/session 挂起 8s 后应显示登录页（修复生效）',
    async () => {
      const window = makeWindow();
      window.fetch = async (url: unknown, opts?: Record<string, unknown>) => {
        const u = String(url);
        if (u.includes('/api/meta')) {
          return new window.Response(
            JSON.stringify({ data: { app_name: 'BobVane订阅聚合' } }),
            { status: 200 },
          );
        }
        if (u.includes('/api/auth/session')) {
          // 挂起：永不 resolve，但响应 abort signal
          return new Promise((_resolve, reject) => {
            const signal = opts?.signal as AbortSignal | undefined;
            signal?.addEventListener('abort', () => {
              const err = new Error('Aborted');
              err.name = 'AbortError';
              reject(err);
            });
          });
        }
        if (u.includes('/api/auth/username')) {
          return new window.Response(
            JSON.stringify({ data: { username: 'admin' } }),
            { status: 200 },
          );
        }
        return new window.Response(JSON.stringify({ success: true, data: {} }), { status: 200 });
      };

      const html = readFileSync('public/index.html', 'utf8');
      window.document.write(html);
      await new Promise((r) => setTimeout(r, 50));
      window.eval(extractScript(html));
      window.document.dispatchEvent(new window.Event('DOMContentLoaded', { bubbles: true }));

      // 等待 8s 超时触发
      await new Promise((r) => setTimeout(r, 8500));

      const loginPage = window.document.getElementById('loginPage');
      const app = window.document.getElementById('app');
      expect(window.document.title).toBe('BobVane订阅聚合');
      expect(loginPage?.getAttribute('style')).toContain('flex');
      expect(app?.getAttribute('style')).toContain('none');
    },
    15000,
  );

  it('auth/session 正常返回时登录页立即显示（无回归）', async () => {
    const window = makeWindow();
    window.fetch = async (url: unknown, _opts?: Record<string, unknown>) => {
      const u = String(url);
      if (u.includes('/api/meta')) {
        return new window.Response(
          JSON.stringify({ data: { app_name: 'BobVane订阅聚合' } }),
          { status: 200 },
        );
      }
      if (u.includes('/api/auth/session')) {
        return new window.Response(
          JSON.stringify({ success: true, data: { authenticated: false } }),
          { status: 200 },
        );
      }
      if (u.includes('/api/auth/username')) {
        return new window.Response(
          JSON.stringify({ data: { username: 'admin' } }),
          { status: 200 },
        );
      }
      return new window.Response(JSON.stringify({ success: true, data: {} }), { status: 200 });
    };

    const html = readFileSync('public/index.html', 'utf8');
    window.document.write(html);
    await new Promise((r) => setTimeout(r, 50));
    window.eval(extractScript(html));
    window.document.dispatchEvent(new window.Event('DOMContentLoaded', { bubbles: true }));

    await new Promise((r) => setTimeout(r, 100));
    const loginPage = window.document.getElementById('loginPage');
    expect(loginPage?.getAttribute('style')).toContain('flex');
  });
});