/**
 * KV 存储层 - Repository Pattern
 * 架构要求：Controller/API 禁止直接访问 KV，必须通过本层
 * 05_TECHNICAL_SPECIFICATION.md §6 / 06_DATA_MODEL.md
 */

import {
  Subscription,
  createSubscription,
} from '@/models/subscription';
import { Node } from '@/models/node';
import { Rule, createRule } from '@/models/rule';
import { Session, KV_KEYS } from '@/models/config';

export interface KVStorage {
  // 通用 KV 操作
  get(key: string): Promise<string | null>;
  put(key: string, value: string, options?: { expirationTtl?: number }): Promise<void>;
  delete(key: string): Promise<void>;
  list(prefix: string): Promise<{ key: string }[]>;
}

/**
 * Cloudflare KV 命名空间适配器
 */
export class KvAdapter implements KVStorage {
  constructor(private readonly ns: KVNamespace) {}

  async get(key: string): Promise<string | null> {
    try {
      return await this.ns.get(key);
    } catch (err) {
      throw new Error(`KV get failed for key ${key}: ${(err as Error).message}`);
    }
  }

  async put(
    key: string,
    value: string,
    options?: { expirationTtl?: number }
  ): Promise<void> {
    try {
      await this.ns.put(key, value, options);
    } catch (err) {
      throw new Error(`KV put failed for key ${key}: ${(err as Error).message}`);
    }
  }

  async delete(key: string): Promise<void> {
    try {
      await this.ns.delete(key);
    } catch (err) {
      throw new Error(`KV delete failed for key ${key}: ${(err as Error).message}`);
    }
  }

  async list(prefix: string): Promise<{ key: string }[]> {
    try {
      const list = await this.ns.list({ prefix });
      return list.keys.map((k) => ({ key: k.name }));
    } catch (err) {
      throw new Error(`KV list failed for prefix ${prefix}: ${(err as Error).message}`);
    }
  }
}

/**
 * 内存 KV 适配器（测试用）
 */
export class MemoryKvAdapter implements KVStorage {
  private store = new Map<string, string>();

  async get(key: string): Promise<string | null> {
    return this.store.get(key) ?? null;
  }

  async put(key: string, value: string, options?: { expirationTtl?: number }): Promise<void> {
    this.store.set(key, value);
    // expirationTtl 在内存模式下忽略（测试简单性）
    void options;
  }

  async delete(key: string): Promise<void> {
    this.store.delete(key);
  }

  async list(prefix: string): Promise<{ key: string }[]> {
    return [...this.store.keys()]
      .filter((k) => k.startsWith(prefix))
      .map((key) => ({ key }));
  }

  /** 测试辅助：清空所有数据 */
  clear(): void {
    this.store.clear();
  }
}

// ============ 订阅仓储 ============

export interface SubscriptionRepository {
  list(): Promise<Subscription[]>;
  getById(id: string): Promise<Subscription | null>;
  create(input: { name: string; url: string }): Promise<Subscription>;
  update(id: string, patch: Partial<Subscription>): Promise<Subscription | null>;
  delete(id: string): Promise<boolean>;
}

export class KvSubscriptionRepository implements SubscriptionRepository {
  constructor(private readonly kv: KVStorage) {}

  async list(): Promise<Subscription[]> {
    const entries = await this.kv.list('subscription:');
    const subs: Subscription[] = [];
    for (const entry of entries) {
      const raw = await this.kv.get(entry.key);
      if (raw) {
        try {
          subs.push(JSON.parse(raw) as Subscription);
        } catch {
          // 跳过损坏数据
        }
      }
    }
    return subs.sort((a, b) => a.createdAt - b.createdAt);
  }

  async getById(id: string): Promise<Subscription | null> {
    const raw = await this.kv.get(KV_KEYS.subscription(id));
    if (!raw) return null;
    try {
      return JSON.parse(raw) as Subscription;
    } catch {
      return null;
    }
  }

  async create(input: { name: string; url: string }): Promise<Subscription> {
    const sub = createSubscription({
      name: input.name,
      url: input.url,
      id: crypto.randomUUID(),
    });
    await this.kv.put(KV_KEYS.subscription(sub.id), JSON.stringify(sub));
    return sub;
  }

  async update(id: string, patch: Partial<Subscription>): Promise<Subscription | null> {
    const existing = await this.getById(id);
    if (!existing) return null;
    const updated: Subscription = {
      ...existing,
      ...patch,
      id: existing.id,
      version: existing.version + 1,
      updatedAt: Date.now(),
    };
    await this.kv.put(KV_KEYS.subscription(id), JSON.stringify(updated));
    return updated;
  }

  async delete(id: string): Promise<boolean> {
    const existing = await this.getById(id);
    if (!existing) return false;
    await this.kv.delete(KV_KEYS.subscription(id));
    // 同时删除节点缓存（数据一致性规则：不留孤儿数据）
    await this.kv.delete(KV_KEYS.nodes(id));
    return true;
  }
}

// ============ 节点仓储 ============

export interface NodeRepository {
  getBySubscription(subscriptionId: string): Promise<Node[]>;
  setBySubscription(subscriptionId: string, nodes: Node[]): Promise<void>;
  deleteBySubscription(subscriptionId: string): Promise<void>;
  getAll(): Promise<Node[]>;
}

export class KvNodeRepository implements NodeRepository {
  constructor(private readonly kv: KVStorage) {}

  async getBySubscription(subscriptionId: string): Promise<Node[]> {
    const raw = await this.kv.get(KV_KEYS.nodes(subscriptionId));
    if (!raw) return [];
    try {
      return JSON.parse(raw) as Node[];
    } catch {
      return [];
    }
  }

  async setBySubscription(subscriptionId: string, nodes: Node[]): Promise<void> {
    await this.kv.put(KV_KEYS.nodes(subscriptionId), JSON.stringify(nodes));
  }

  async deleteBySubscription(subscriptionId: string): Promise<void> {
    await this.kv.delete(KV_KEYS.nodes(subscriptionId));
  }

  async getAll(): Promise<Node[]> {
    const entries = await this.kv.list('nodes:');
    const all: Node[] = [];
    for (const entry of entries) {
      const raw = await this.kv.get(entry.key);
      if (raw) {
        try {
          all.push(...(JSON.parse(raw) as Node[]));
        } catch {
          // 跳过损坏数据
        }
      }
    }
    return all;
  }
}

// ============ 规则仓储 ============

export interface RuleRepository {
  list(): Promise<Rule[]>;
  create(input: { name: string; type: Rule['type']; pattern: string }): Promise<Rule>;
  delete(id: string): Promise<boolean>;
}

export class KvRuleRepository implements RuleRepository {
  constructor(private readonly kv: KVStorage) {}

  async list(): Promise<Rule[]> {
    const entries = await this.kv.list('rule:');
    const rules: Rule[] = [];
    for (const entry of entries) {
      const raw = await this.kv.get(entry.key);
      if (raw) {
        try {
          rules.push(JSON.parse(raw) as Rule);
        } catch {
          // 跳过
        }
      }
    }
    return rules.sort((a, b) => a.createdAt - b.createdAt);
  }

  async create(input: { name: string; type: Rule['type']; pattern: string }): Promise<Rule> {
    const rule = createRule({
      ...input,
      id: crypto.randomUUID(),
    });
    await this.kv.put(KV_KEYS.rule(rule.id), JSON.stringify(rule));
    return rule;
  }

  async delete(id: string): Promise<boolean> {
    const raw = await this.kv.get(KV_KEYS.rule(id));
    if (!raw) return false;
    await this.kv.delete(KV_KEYS.rule(id));
    return true;
  }
}

// ============ 会话仓储 ============

export interface SessionRepository {
  create(ttlSeconds: number): Promise<Session>;
  getById(id: string): Promise<Session | null>;
  delete(id: string): Promise<void>;
}

export class KvSessionRepository implements SessionRepository {
  constructor(private readonly kv: KVStorage) {}

  async create(ttlSeconds: number): Promise<Session> {
    const now = Date.now();
    const session: Session = {
      id: crypto.randomUUID(),
      createdAt: now,
      expiresAt: now + ttlSeconds * 1000,
    };
    await this.kv.put(KV_KEYS.session(session.id), JSON.stringify(session), {
      expirationTtl: ttlSeconds,
    });
    return session;
  }

  async getById(id: string): Promise<Session | null> {
    const raw = await this.kv.get(KV_KEYS.session(id));
    if (!raw) return null;
    try {
      const session = JSON.parse(raw) as Session;
      if (session.expiresAt < Date.now()) {
        await this.delete(id);
        return null;
      }
      return session;
    } catch {
      return null;
    }
  }

  async delete(id: string): Promise<void> {
    await this.kv.delete(KV_KEYS.session(id));
  }
}

// ============ 设置仓储 ============

export interface SettingsRepository {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
}

export class KvSettingsRepository implements SettingsRepository {
  constructor(private readonly kv: KVStorage) {}

  async get(key: string): Promise<string | null> {
    return this.kv.get(KV_KEYS.setting(key));
  }

  async set(key: string, value: string): Promise<void> {
    await this.kv.put(KV_KEYS.setting(key), value);
  }
}

// ============ 仓库聚合（依赖注入） ============

export interface Repositories {
  subscriptions: SubscriptionRepository;
  nodes: NodeRepository;
  rules: RuleRepository;
  sessions: SessionRepository;
  settings: SettingsRepository;
}

export function createRepositories(kv: KVStorage): Repositories {
  return {
    subscriptions: new KvSubscriptionRepository(kv),
    nodes: new KvNodeRepository(kv),
    rules: new KvRuleRepository(kv),
    sessions: new KvSessionRepository(kv),
    settings: new KvSettingsRepository(kv),
  };
}