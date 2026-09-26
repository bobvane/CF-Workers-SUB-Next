/**
 * SQLite 存储适配器（Node 运行时 / NAS 部署）
 *
 * 实现与 KvAdapter 完全相同的 KVStorage 接口 → 仓储、服务、路由、前端一行都不用改。
 * 用 Node 内置 `node:sqlite`（v22.13 / v23.4 起无需 --experimental-sqlite），零第三方依赖。
 *
 * ponytail: node:sqlite 是同步 API，会短暂阻塞事件循环。单用户 NAS 场景数据量小、
 * 查询都是毫秒级，可接受；将来并发上来了再换异步驱动（接口不变，只换这个文件）。
 */

import { DatabaseSync } from 'node:sqlite';
import { KVStorage } from '@/storage/kv';

/** 批量读上限，与 CF KV 一致（语义等价，便于两条运行时对比） */
const BATCH_LIMIT = 100;

type Row = { key: string; value: string; expires_at: number | null };

export class SqliteAdapter implements KVStorage {
  private readonly db: DatabaseSync;
  private readonly getStmt;
  private readonly putStmt;
  private readonly deleteStmt;
  private readonly listStmt;

  constructor(path: string) {
    this.db = new DatabaseSync(path);
    // WAL：读写不互斥，进程被 kill 也不损坏数据
    this.db.exec('PRAGMA journal_mode = WAL');
    this.db.exec('PRAGMA synchronous = NORMAL');
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS kv (
        key        TEXT PRIMARY KEY,
        value      TEXT NOT NULL,
        expires_at INTEGER
      )
    `);
    // 启动清理过期键（CF KV 由平台负责过期，自托管得自己管）
    this.db.prepare('DELETE FROM kv WHERE expires_at IS NOT NULL AND expires_at <= ?').run(Date.now());

    this.getStmt = this.db.prepare('SELECT key, value, expires_at FROM kv WHERE key = ?');
    this.putStmt = this.db.prepare(
      `INSERT INTO kv (key, value, expires_at) VALUES (?, ?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, expires_at = excluded.expires_at`
    );
    this.deleteStmt = this.db.prepare('DELETE FROM kv WHERE key = ?');
    // 不能用 LIKE prefix||'%'：键名里带下划线（ip_geo:、setting:password_version…），
    // LIKE 的 _ 是单字符通配符会误匹配，必须用 substr 精确比较。
    this.listStmt = this.db.prepare(
      `SELECT key FROM kv
        WHERE substr(key, 1, length(?)) = ? AND (expires_at IS NULL OR expires_at > ?)
        ORDER BY key`
    );
  }

  /** 过期即视为不存在，顺手删掉（与 CF KV 的过期语义一致） */
  private alive(row: Row | undefined): boolean {
    if (!row) return false;
    if (row.expires_at !== null && row.expires_at <= Date.now()) {
      this.deleteStmt.run(row.key);
      return false;
    }
    return true;
  }

  async get(key: string): Promise<string | null> {
    const row = this.getStmt.get(key) as Row | undefined;
    return this.alive(row) ? (row as Row).value : null;
  }

  async getMany(keys: string[]): Promise<Map<string, string | null>> {
    const out = new Map<string, string | null>();
    if (keys.length === 0) return out;
    for (let i = 0; i < keys.length; i += BATCH_LIMIT) {
      const chunk = keys.slice(i, i + BATCH_LIMIT);
      const rows = this.db
        .prepare(`SELECT key, value, expires_at FROM kv WHERE key IN (${chunk.map(() => '?').join(',')})`)
        .all(...chunk) as Row[];
      const found = new Map(rows.map((r) => [r.key, r]));
      for (const key of chunk) {
        const row = found.get(key);
        out.set(key, this.alive(row) ? (row as Row).value : null);
      }
    }
    return out;
  }

  async put(key: string, value: string, options?: { expirationTtl?: number }): Promise<void> {
    const expiresAt = options?.expirationTtl ? Date.now() + options.expirationTtl * 1000 : null;
    this.putStmt.run(key, value, expiresAt);
  }

  async delete(key: string): Promise<void> {
    this.deleteStmt.run(key);
  }

  async list(prefix: string): Promise<{ key: string }[]> {
    return this.listStmt.all(prefix, prefix, Date.now()) as { key: string }[];
  }

  /** 关闭数据库（进程退出前调用，确保 WAL 落盘） */
  close(): void {
    this.db.close();
  }
}
