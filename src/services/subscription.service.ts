/**
 * 订阅服务 - Subscription Service
 * TASK 3.x：订阅的创建、删除、更新、查询
 * 更新流程：Fetch → Decode → Parse → Normalize → Store（EPIC 3/4 接入）
 * 支持：订阅 URL 和直接节点链接（vless:// 等）
 */

import { Subscription } from '@/models/subscription';
import { Node } from '@/models/node';
import { CleanRule, applyCleanRules } from '@/models/clean-rule';
import { Repositories } from '@/storage/kv';
import {
  parseSubscriptionContent,
  applyRules,
} from '@/parser';

const NODE_LINK_PREFIXES = ['vmess://', 'vless://', 'trojan://', 'ss://', 'ssr://', 'hysteria2://', 'tuic://'];

/**
 * 判断是否为直接节点链接（非 HTTP 订阅 URL）
 */
export function isNodeLink(url: string): boolean {
  return NODE_LINK_PREFIXES.some(prefix => url.trim().toLowerCase().startsWith(prefix));
}

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
  getRules: () => Promise<{ type: 'include' | 'exclude' | 'replace'; pattern: string; enabled?: boolean }[]>,
  getCleanRules: () => Promise<CleanRule[]> = async () => []
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
        // 1. 获取内容：如果是节点链接（vless:// 等），直接当作内容解析
        //    否则通过 HTTP 抓取订阅
        const raw = isNodeLink(existing.url)
          ? existing.url  // 直接节点链接，本身即内容
          : await fetcher(existing.url);

        // 2. 解析 + 标准化
        const parsed = parseSubscriptionContent(raw, id);
        // 3. 不去重：记录原始节点（去重在节点列表页面统一做）
        let nodes = parsed.nodes;
        // 4. 应用规则（关键字过滤）
        const rules = await getRules();
        nodes = applyRules(nodes, rules);

        const updated = await repos.subscriptions.update(id, {
          status: 'active',
          lastFetchAt: Date.now(),
          nodeCount: nodes.length,
          errorMessage: undefined,
        });

        // 5. 缓存节点（写入前应用持久化清洗规则集，保证每天自动更新后名字保持干净）
        const cleanRules = await getCleanRules();
        if (cleanRules.length > 0) {
          nodes = nodes.map((n) => ({ ...n, name: applyCleanRules(n.name, cleanRules) }));
        }
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