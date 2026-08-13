/**
 * 订阅模型 - 表示一个订阅来源
 * 06_DATA_MODEL.md §4
 */

export type SubscriptionStatus = 'active' | 'error' | 'disabled';

export interface Subscription {
  id: string;
  name: string;
  url: string;
  enabled: boolean;
  createdAt: number;
  updatedAt: number;
  lastFetchAt?: number;
  nodeCount?: number;
  status: SubscriptionStatus;
  errorMessage?: string;
  version: number;
}

/**
 * 创建订阅的工厂函数
 */
export function createSubscription(
  partial: Partial<Subscription> & { name: string; url: string }
): Subscription {
  const now = Date.now();
  return {
    id: partial.id ?? '',
    name: partial.name,
    url: partial.url,
    enabled: partial.enabled ?? true,
    createdAt: partial.createdAt ?? now,
    updatedAt: now,
    status: partial.status ?? 'active',
    nodeCount: partial.nodeCount,
    lastFetchAt: partial.lastFetchAt,
    errorMessage: partial.errorMessage,
    version: 1,
  };
}