/**
 * Node 入口（NAS / Docker 部署）
 *
 * fetch → @hono/node-server；scheduled → setInterval（三个固定时刻）。
 * 装配与业务逻辑全部在 src/app.ts。
 */

import { serve } from '@hono/node-server';
import type { ExecutionContext } from 'hono';
import type { Env } from '@/app';
import { getApp, handleHtml, runScheduled } from '@/app';
import { SqliteAdapter } from '@/storage/sqlite';

const PORT = Number(process.env.PORT ?? 20130);
const DB_PATH = process.env.DB_PATH ?? '/data/app.db';

const env: Env = {
  ADMIN_PASSWORD: process.env.ADMIN_PASSWORD,
  SESSION_SECRET: process.env.SESSION_SECRET,
  GITHUB_TOKEN: process.env.GITHUB_TOKEN,
};

const kv = new SqliteAdapter(DB_PATH);
const app = await getApp(kv, env);

/**
 * Hono v4 的 c.executionCtx 在缺第三参时是 throw（不是 undefined），`?.` 防不住。
 * @hono/node-server@2 的 fetch 回调只传 (request, env)，没有第三个参数，
 * 因此自己传一个等价 shim：后台任务照跑，不阻塞响应，行为与 CF 的 waitUntil 一致。
 */
const executionCtx = {
  waitUntil(promise: Promise<unknown>) {
    void Promise.resolve(promise).catch((e) => console.warn('[waitUntil]', (e as Error).message));
  },
  passThroughOnException() {},
};

serve(
  {
    hostname: '0.0.0.0',
    port: PORT,
    fetch: async (request) => {
      const html = await handleHtml(request);
      if (html) return html;
      return app.fetch(request, env, executionCtx as unknown as ExecutionContext);
    },
  },
  // eslint-disable-next-line no-console -- 启动日志是运维唯一可见的确认信号
  (info) => console.log(`[server] 已启动 http://0.0.0.0:${info.port}（db=${DB_PATH}）`)
);

// ============ 定时任务 ============
// 三个固定时刻：每分钟 Geo 重试、每小时订阅更新、每月 1 日 03:00 规则目录同步。
// 只匹配这三个固定表达式，不引入通用 cron 解析器（328KB 换个 12 行不值）。

const CRONS = ['* * * * *', '0 * * * *', '0 3 1 * *'] as const;

/** 三个表达式都是整分触发，逐个判断即可；时间按 UTC 算，与 CF 上的行为一致 */
function matches(cron: string, now: Date): boolean {
  if (cron === '* * * * *') return true; // 每分钟
  if (now.getUTCMinutes() !== 0) return false;
  if (cron === '0 * * * *') return true; // 每小时
  return now.getUTCHours() === 3 && now.getUTCDate() === 1; // 每月 1 号 03:00 UTC
}

let lastTick = '';

// 30 秒一跳：即便计时器有漂移，也保证每分钟至少命中一次；同一分钟用 key 去重，不会重复执行
setInterval(() => {
  const now = new Date();
  const key = `${now.getUTCFullYear()}-${now.getUTCMonth()}-${now.getUTCDate()}T${now.getUTCHours()}:${now.getUTCMinutes()}`;
  if (key === lastTick) return;
  lastTick = key;
  for (const cron of CRONS) {
    if (!matches(cron, now)) continue;
    void runScheduled(cron, now.getTime(), kv, env).catch((e) =>
      console.error(`[cron ${cron}] ${(e as Error).message}`)
    );
  }
}, 30_000);

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    kv.close();
    process.exit(0);
  });
}
