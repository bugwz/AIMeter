import Database from 'better-sqlite3';
import path from 'path';
import { getAppConfig } from '../config.js';
import type { DbClient, DatabaseEngine, ExecuteResult } from './engine.js';
import { SqlEngine, runCommonBootstrap } from './sql-engine.js';

export interface SqliteRuntime {
  engine: DatabaseEngine;
  raw: Database.Database;
}

class SqliteClient implements DbClient {
  constructor(private readonly db: Database.Database) {}

  async query<T>(sql: string, params: unknown[] = []): Promise<T[]> {
    return this.db.prepare(sql).all(...params) as T[];
  }

  async queryOne<T>(sql: string, params: unknown[] = []): Promise<T | undefined> {
    return this.db.prepare(sql).get(...params) as T | undefined;
  }

  async execute(sql: string, params: unknown[] = []): Promise<ExecuteResult> {
    const result = this.db.prepare(sql).run(...params) as Database.RunResult;
    return {
      insertId: typeof result.lastInsertRowid === 'bigint' ? Number(result.lastInsertRowid) : (result.lastInsertRowid as number),
      affectedRows: result.changes,
    };
  }

  async transaction<T>(fn: (tx: DbClient) => Promise<T>): Promise<T> {
    this.db.exec('BEGIN');
    try {
      const result = await fn(this);
      this.db.exec('COMMIT');
      return result;
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
  }
}

function resolveSqliteConnectionPath(): string {
  const appConfig = getAppConfig();
  const baseConnection = appConfig.database.connection || './data/aimeter.db';
  return path.resolve(process.cwd(), baseConnection);
}

async function initSchema(
  client: DbClient,
  initialSecrets?: Partial<Record<'cron_secret' | 'endpoint_secret', string>>,
): Promise<void> {
  const legacyUsage = await client.queryOne<{ name: string }>(
    "SELECT name FROM sqlite_master WHERE type='table' AND name='usage'"
  );
  const targetUsage = await client.queryOne<{ name: string }>(
    "SELECT name FROM sqlite_master WHERE type='table' AND name='usage_records'"
  );
  if (legacyUsage && !targetUsage) {
    await client.execute('ALTER TABLE usage RENAME TO usage_records');
  }

  await client.execute(`
    CREATE TABLE IF NOT EXISTS providers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      uid TEXT NOT NULL,
      provider TEXT NOT NULL,
      name TEXT,
      key TEXT NOT NULL,
      attrs TEXT NOT NULL DEFAULT '{}',
      fetch_state TEXT NOT NULL DEFAULT '{}',
      created_at INTEGER DEFAULT (unixepoch()),
      updated_at INTEGER DEFAULT (unixepoch()),
      UNIQUE(provider, name),
      UNIQUE(uid)
    )
  `);

  await client.execute(`
    CREATE TABLE IF NOT EXISTS usage_records (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      provider_id INTEGER NOT NULL,
      progress TEXT,
      identity_data TEXT,
      created_at INTEGER DEFAULT (unixepoch()),
      FOREIGN KEY (provider_id) REFERENCES providers(id) ON DELETE CASCADE
    )
  `);

  await client.execute(`
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at INTEGER DEFAULT (unixepoch())
    )
  `);

  await client.execute(`
    CREATE TABLE IF NOT EXISTS audit_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      timestamp INTEGER DEFAULT (unixepoch()),
      ip TEXT,
      method TEXT NOT NULL,
      path TEXT NOT NULL,
      status_code INTEGER NOT NULL,
      duration_ms INTEGER NOT NULL,
      user_agent TEXT,
      authenticated INTEGER NOT NULL DEFAULT 0,
      event_type TEXT NOT NULL DEFAULT 'api_access',
      details TEXT
    )
  `);

  await client.execute('CREATE INDEX IF NOT EXISTS idx_usage_provider_created ON usage_records(provider_id, created_at)');
  await client.execute('CREATE INDEX IF NOT EXISTS idx_audit_logs_timestamp ON audit_logs(timestamp)');
  await client.execute('CREATE INDEX IF NOT EXISTS idx_audit_logs_path ON audit_logs(path)');

  const usageTableSqlRow = await client.queryOne<{ sql: string | null }>(
    "SELECT sql FROM sqlite_master WHERE type='table' AND name='usage_records'"
  );
  const usageTableSql = usageTableSqlRow?.sql || '';
  if (usageTableSql.includes('providers_old')) {
    await client.execute('PRAGMA foreign_keys = OFF');
    await client.execute('BEGIN');
    try {
      await client.execute('ALTER TABLE usage_records RENAME TO usage_records_old');
      await client.execute(`
        CREATE TABLE usage_records (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          provider_id INTEGER NOT NULL,
          progress TEXT,
          identity_data TEXT,
          created_at INTEGER DEFAULT (unixepoch()),
          FOREIGN KEY (provider_id) REFERENCES providers(id) ON DELETE CASCADE
        )
      `);
      await client.execute(`
        INSERT INTO usage_records (id, provider_id, progress, identity_data, created_at)
        SELECT id, provider_id, progress, identity_data, created_at
        FROM usage_records_old
      `);
      await client.execute('DROP TABLE usage_records_old');
      await client.execute('CREATE INDEX IF NOT EXISTS idx_usage_provider_created ON usage_records(provider_id, created_at)');
      await client.execute('COMMIT');
    } catch (error) {
      await client.execute('ROLLBACK');
      throw error;
    } finally {
      await client.execute('PRAGMA foreign_keys = ON');
    }
  }

  await runCommonBootstrap(client, 'usage_records', initialSecrets);
}

export async function createSqliteEngine(): Promise<SqliteRuntime> {
  const appConfig = getAppConfig();
  const raw = new Database(resolveSqliteConnectionPath());
  raw.pragma('journal_mode = WAL');

  const client = new SqliteClient(raw);
  await initSchema(client, {
    cron_secret: appConfig.auth.cronSecret,
    endpoint_secret: appConfig.auth.endpointSecret,
  });

  const encryptionKey = appConfig.database.encryptionKey
    || (await client.queryOne<{ value: string }>('SELECT value FROM settings WHERE key = ?', ['encryption_key']))?.value;

  return {
    engine: new SqlEngine(client, 'sqlite', encryptionKey),
    raw,
  };
}
