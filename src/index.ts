/**
 * CF-Workers-SUB-Next V2 —— Cloudflare Workers 入口
 *
 * 只做运行时适配（KV 绑定 / scheduled 事件），装配与业务逻辑全部在 src/app.ts，
 * 与 Node 入口（src/server/main.ts）共用同一份代码。
 */

import type { Env as AppEnv } from '@/app';
import { getApp, handleHtml, runScheduled } from '@/app';
import { KvAdapter } from '@/storage/kv';

/** Workers 环境：应用配置 + KV 绑定 */
export interface Env extends AppEnv {
  DATABASE: KVNamespace;
}

export default {
  async fetch(request: Request, env: Env, executionCtx: ExecutionContext): Promise<Response> {
    // 前端页面在装配应用之前直接返回（不需要 KV）
    const html = await handleHtml(request);
    if (html) return html;

    const app = await getApp(new KvAdapter(env.DATABASE), env);
    // Hono v4：第三参 executionCtx 传入，c.executionCtx 才可用（IP 地理预填充后台 waitUntil）
    return app.fetch(request, env, executionCtx);
  },

  /** 定时任务：cron 表达式与触发时刻交由 app.ts 统一分支 */
  async scheduled(controller: ScheduledController, env: Env): Promise<void> {
    await runScheduled(controller.cron, controller.scheduledTime, new KvAdapter(env.DATABASE), env);
  },
};
