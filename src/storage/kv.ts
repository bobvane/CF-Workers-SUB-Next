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
import {
  RuleCatalog,
  RuleCatalogRemovedEntry,
  RuleCatalogMeta,
  createCatalogMeta,
} from '@/models/rule-catalog';

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
      const keys: { key: string }[] = [];
      let cursor: string | undefined;
      do {
        const page = await this.ns.list({ prefix, cursor });
        for (const k of page.keys) keys.push({ key: k.name });
        cursor = page.list_complete ? undefined : page.cursor;
      } while (cursor);
      return keys;
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
  /** 对所有节点的 name 应用变换，返回受影响数量 */
  renameAll(transform: (name: string) => string): Promise<number>;
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

  async renameAll(transform: (name: string) => string): Promise<number> {
    const entries = await this.kv.list('nodes:');
    let changed = 0;
    for (const entry of entries) {
      const raw = await this.kv.get(entry.key);
      if (!raw) continue;
      try {
        const nodes = JSON.parse(raw) as Node[];
        let dirty = false;
        for (const n of nodes) {
          const next = transform(n.name);
          if (next !== n.name) {
            n.name = next;
            dirty = true;
            changed++;
          }
        }
        if (dirty) await this.kv.put(entry.key, JSON.stringify(nodes));
      } catch {
        // 跳过损坏数据
      }
    }
    return changed;
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
  create(ttlSeconds: number, passwordVersion: number): Promise<Session>;
  getById(id: string): Promise<Session | null>;
  delete(id: string): Promise<void>;
  /** 列出所有活跃 session（由 changePassword 批量吊销旧版本） */
  listAll(): Promise<Session[]>;
}

export class KvSessionRepository implements SessionRepository {
  constructor(private readonly kv: KVStorage) {}

  async create(ttlSeconds: number, passwordVersion: number): Promise<Session> {
    const now = Date.now();
    const session: Session = {
      id: crypto.randomUUID(),
      createdAt: now,
      expiresAt: now + ttlSeconds * 1000,
      passwordVersion,
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

  async listAll(): Promise<Session[]> {
    const entries = await this.kv.list('session:');
    const sessions: Session[] = [];
    for (const entry of entries) {
      const raw = await this.kv.get(entry.key);
      if (!raw) continue;
      try {
        const s = JSON.parse(raw) as Session;
        if (s.expiresAt >= Date.now()) sessions.push(s);
        else await this.delete(s.id);
      } catch { /* skip corrupt */ }
    }
    return sessions;
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

// ============ 规则目录仓储 ============

export interface RuleCatalogRepository {
  /** 读取规则目录快照；无则 null */
  getCatalog(): Promise<RuleCatalog | null>;
  /** 读取已失效黑名单 */
  getRemoved(): Promise<RuleCatalogRemovedEntry[]>;
  /** 读取目录元信息；无则返回 never 状态 */
  getMeta(): Promise<RuleCatalogMeta>;
  /** 写入完整快照（目录 + 黑名单 + 元信息） */
  setCatalog(data: RuleCatalog, removed: RuleCatalogRemovedEntry[], meta: RuleCatalogMeta): Promise<void>;
  /** 仅更新元信息（失败兜底等场景） */
  setMeta(meta: RuleCatalogMeta): Promise<void>;
  /** 追加移除记录 */
  appendRemoved(entries: RuleCatalogRemovedEntry[]): Promise<void>;
}

export class KvRuleCatalogRepository implements RuleCatalogRepository {
  constructor(private readonly kv: KVStorage) {}

  async getCatalog(): Promise<RuleCatalog | null> {
    const raw = await this.kv.get(KV_KEYS.ruleCatalog);
    if (!raw) return null;
    try {
      return JSON.parse(raw) as RuleCatalog;
    } catch {
      return null;
    }
  }

  async getRemoved(): Promise<RuleCatalogRemovedEntry[]> {
    const raw = await this.kv.get(KV_KEYS.ruleCatalogRemoved);
    if (!raw) return [];
    try {
      return JSON.parse(raw) as RuleCatalogRemovedEntry[];
    } catch {
      return [];
    }
  }

  async getMeta(): Promise<RuleCatalogMeta> {
    const raw = await this.kv.get(KV_KEYS.ruleCatalogMeta);
    if (!raw) return createCatalogMeta();
    try {
      return JSON.parse(raw) as RuleCatalogMeta;
    } catch {
      return createCatalogMeta();
    }
  }

  async setCatalog(
    data: RuleCatalog,
    removed: RuleCatalogRemovedEntry[],
    meta: RuleCatalogMeta
  ): Promise<void> {
    await this.kv.put(KV_KEYS.ruleCatalog, JSON.stringify(data));
    await this.kv.put(KV_KEYS.ruleCatalogRemoved, JSON.stringify(removed));
    await this.kv.put(KV_KEYS.ruleCatalogMeta, JSON.stringify(meta));
  }

  async setMeta(meta: RuleCatalogMeta): Promise<void> {
    await this.kv.put(KV_KEYS.ruleCatalogMeta, JSON.stringify(meta));
  }

  async appendRemoved(entries: RuleCatalogRemovedEntry[]): Promise<void> {
    if (entries.length === 0) return;
    const existing = await this.getRemoved();
    const merged = [...existing];
    for (const e of entries) {
      if (!merged.some((m) => m.id === e.id)) merged.push(e);
    }
    await this.kv.put(KV_KEYS.ruleCatalogRemoved, JSON.stringify(merged));
  }
}

// ============ 仓库聚合（依赖注入） ============

export interface Repositories {
  subscriptions: SubscriptionRepository;
  nodes: NodeRepository;
  rules: RuleRepository;
  sessions: SessionRepository;
  settings: SettingsRepository;
  ruleCatalog: RuleCatalogRepository;
}

export function createRepositories(kv: KVStorage): Repositories {
  return {
    subscriptions: new KvSubscriptionRepository(kv),
    nodes: new KvNodeRepository(kv),
    rules: new KvRuleRepository(kv),
    sessions: new KvSessionRepository(kv),
    settings: new KvSettingsRepository(kv),
    ruleCatalog: new KvRuleCatalogRepository(kv),
  };
}