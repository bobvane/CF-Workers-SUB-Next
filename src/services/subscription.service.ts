/**
 * 订阅服务 - Subscription Service
 * TASK 3.x：订阅的创建、删除、更新、查询
 * 更新流程：Fetch → Decode → Parse → Normalize → Store（EPIC 3/4 接入）
 */

import { Subscription } from '@/models/subscription';
import { Node } from '@/models/node';
import { Repositories } from '@/storage/kv';
import {
  parseSubscriptionContent,
  deduplicateNodes,
  applyRules,
} from '@/parser';

export interface SubscriptionService {
  list(): Promise<Subscription[]>;
  getById(id: string): Promise<Subscription | null>;
  create(name: string, url: string): Promise<Subscription>;
  delete(id: string): Promise<boolean>;
  update(id: string, fetcher: (url: string) => Promise<string>): Promise<{
    subscription: Subscription;
    nodes: Node[];
    nodeCount: number;
  }>;
}

export function createSubscriptionService(
  repos: Repositories,
  fetchRawContent: (url: string) => Promise<string>,
  getRules: () => Promise<{ type: 'include' | 'exclude' | 'replace'; pattern: string; enabled?: boolean }[]>
): SubscriptionService {
  return {
    async list() {
      return repos.subscriptions.list();
    },

    async getById(id: string) {
      return repos.subscriptions.getById(id);
    },

    async create(name: string, url: string) {
      return repos.subscriptions.create({ name, url });
    },

    async delete(id: string) {
      return repos.subscriptions.delete(id);
    },

    async update(id: string, fetcher: (url: string) => Promise<string>) {
      const existing = await repos.subscriptions.getById(id);
      if (!existing) {
        throw new Error('Subscription not found');
      }

      try {
        // 1. 抓取原始内容（含 SSRF 防护）
        const raw = await fetcher(existing.url);
        // 2. 解析 + 标准化
        const parsed = parseSubscriptionContent(raw, id);
        // 3. 去重
        let nodes = deduplicateNodes(parsed.nodes);
        // 4. 应用规则（关键字过滤）
        const rules = await getRules();
        nodes = applyRules(nodes, rules);

        const updated = await repos.subscriptions.update(id, {
          status: 'active',
          lastFetchAt: Date.now(),
          nodeCount: nodes.length,
          errorMessage: undefined,
        });

        // 5. 缓存节点
        await repos.nodes.setBySubscription(id, nodes);

        return {
          subscription: updated!,
          nodes,
          nodeCount: nodes.length,
        };
      } catch (err) {
        await repos.subscriptions.update(id, {
          status: 'error',
          errorMessage: (err as Error).message,
        });
        throw err;
      }
    },
  };
}