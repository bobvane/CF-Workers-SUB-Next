/**
 * 订阅服务 - Subscription Service
 * TASK 3.x：订阅的创建、删除、更新、查询
 * 06_DATA_MODEL.md §4：Subscription 是主数据，Node 是派生数据
 */

import { Subscription } from '@/models/subscription';
import { Node } from '@/models/node';
import { Repositories } from '@/storage/kv';

export interface SubscriptionService {
  list(): Promise<Subscription[]>;
  getById(id: string): Promise<Subscription | null>;
  create(name: string, url: string): Promise<Subscription>;
  delete(id: string): Promise<boolean>;
  /**
   * 更新订阅：重新抓取 → 解析 → 缓存节点
   * 返回更新后的订阅与解析出的节点数
   */
  update(id: string, fetcher: (url: string) => Promise<string>): Promise<{
    subscription: Subscription;
    nodes: Node[];
    nodeCount: number;
  }>;
}

export function createSubscriptionService(
  repos: Repositories,
  fetchRawContent: (url: string) => Promise<string>
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

      // 标记 "正在更新"
      await repos.subscriptions.update(id, { status: 'active' });

      try {
        // 1. 抓取原始内容
        const raw = await fetcher(existing.url);
        // 2. 解析节点（由外部 parser 管线注入；此处先占位空实现）
        //    parser 完成后在此接入 DetectionPipeline
        void raw;
        const nodes: Node[] = [];
        const nodeCount = nodes.length;

        const updated = await repos.subscriptions.update(id, {
          status: 'active',
          lastFetchAt: Date.now(),
          nodeCount,
          errorMessage: undefined,
        });

        // 3. 缓存节点
        await repos.nodes.setBySubscription(id, nodes);

        return {
          subscription: updated!,
          nodes,
          nodeCount,
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