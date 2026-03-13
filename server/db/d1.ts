import { getAppConfig } from '../config.js';
import type { DbClient, DatabaseEngine, ExecuteResult } from './engine.js';
import { SqlEngine, runCommonBootstrap } from './sql-engine.js';
import { getCurrentRuntimeTableNames } from './table-names.js';

type CloudflareBindings = Record<string, unknown>;
const CLOUDFLARE_WORKERS_MODULE = 'cloudflare:workers';

interface D1QueryMeta {
  changes?: number;
  last_row_id?: number;
}

interface D1QueryResult<T = Record<string, unknown>> {
  success: boolean;
  results?: T[];
  meta?: D1QueryMeta;
}

interface D1PreparedStatement {
  bind(...values: unknown[]): D1PreparedStatement;
  all<T = Record<string, unknown>>(): Promise<D1QueryResult<T>>;
  run<T = Record<string, unknown>>(): Promise<D1QueryResult<T>>;
}

interface D1Database {
  prepare(query: string): D1PreparedStatement;
  exec(query: string): Promise<unknown>;
}

function isD1Database(value: unknown): value is D1Database {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<D1Database>;
  return typeof candidate.prepare === 'function' && typeof candidate.exec === 'function';
}

function isValidBindingName(value: string): boolean {
  return /^[A-Za-z_][A-Za-z0-9_]*$/.test(value);
}

async function resolveCloudflareBindings(): Promise<CloudflareBindings> {
  try {
    const mod = await import(CLOUDFLARE_WORKERS_MODULE) as { env?: CloudflareBindings };
    if (!mod.env || typeof mod.env !== 'object') {
      throw new Error('Cloudflare bindings are unavailable');
    }
    return mod.env;
  } catch {
    throw new Error(
      'AIMETER_DATABASE_ENGINE=d1 requires Cloudflare Workers runtime with D1 binding support. ' +
      'Use sqlite/mysql/postgres outside Cloudflare.'
    );
  }
}

class D1Client implements DbClient {
  private inTransaction = false;

  constructor(private readonly db: D1Database) {}

  private prepare(sql: string, params: unknown[]): D1PreparedStatement {
    return this.db.prepare(sql).bind(...params);
  }

  async query<T>(sql: string, params: unknown[] = []): Promise<T[]> {
    const result = await this.prepare(sql, params).all<T>();
    return Array.isArray(result.results) ? result.results : [];
  }

  async queryOne<T>(sql: string, params: unknown[] = []): Promise<T | undefined> {
    const rows = await this.query<T>(sql, params);
    return rows[0];
  }

  async execute(sql: string, params: unknown[] = []): Promise<ExecuteResult> {
    const result = await this.prepare(sql, params).run();
    const changes = Number(result.meta?.changes ?? 0);
    const insertIdRaw = result.meta?.last_row_id;
    const insertId = typeof insertIdRaw === 'number' && Number.isFinite(insertIdRaw)
      ? insertIdRaw
      : undefined;
    return {
      insertId,
      affectedRows: Number.isFinite(changes) ? changes : 0,
    };
  }

  async transaction<T>(fn: (tx: DbClient) => Promise<T>): Promise<T> {
    if (this.inTransaction) {
      return fn(this);
    }

    this.inTransaction = true;
    await this.db.exec('BEGIN IMMEDIATE');
    try {
      const result = await fn(this);
      await this.db.exec('COMMIT');
      return result;
    } catch (error) {
      try {
        await this.db.exec('ROLLBACK');
      } catch {
        // Prefer surfacing the original business error.
      }
      throw error;
    } finally {
      this.inTransaction = false;
    }
  }
}

async function initSchema(
  client: DbClient,
  initialSecrets?: Partial<Record<'cron_secret' | 'endpoint_secret', string>>,
): Promise<void> {
  const tables = getCurrentRuntimeTableNames();
  await client.execute(`
    CREATE TABLE IF NOT EXISTS ${tables.providers} (
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
    CREATE TABLE IF NOT EXISTS ${tables.usageRecords} (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      provider_id INTEGER NOT NULL,
      progress TEXT,
      identity_data TEXT,
      created_at INTEGER DEFAULT (unixepoch()),
      FOREIGN KEY (provider_id) REFERENCES ${tables.providers}(id) ON DELETE CASCADE
    )
  `);

  await client.execute(`
    CREATE TABLE IF NOT EXISTS ${tables.settings} (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at INTEGER DEFAULT (unixepoch())
    )
  `);

  await client.execute(`
    CREATE TABLE IF NOT EXISTS ${tables.auditLogs} (
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

  await client.execute(`CREATE INDEX IF NOT EXISTS ${tables.usageProviderCreatedIndex} ON ${tables.usageRecords}(provider_id, created_at)`);
  await client.execute(`CREATE INDEX IF NOT EXISTS ${tables.auditLogsTimestampIndex} ON ${tables.auditLogs}(timestamp)`);
  await client.execute(`CREATE INDEX IF NOT EXISTS ${tables.auditLogsPathIndex} ON ${tables.auditLogs}(path)`);

  await runCommonBootstrap(client, tables, initialSecrets, '"key"');
}

export async function createD1Engine(): Promise<DatabaseEngine> {
  const appConfig = getAppConfig();
  const bindingName = (appConfig.database.connection || '').trim();

  if (!bindingName) {
    throw new Error('AIMETER_DATABASE_CONNECTION is required when AIMETER_DATABASE_ENGINE=d1.');
  }
  if (!isValidBindingName(bindingName)) {
    throw new Error(
      `Invalid D1 binding name "${bindingName}". ` +
      'When AIMETER_DATABASE_ENGINE=d1, AIMETER_DATABASE_CONNECTION must be a binding name like DB.'
    );
  }

  const bindings = await resolveCloudflareBindings();
  const binding = bindings[bindingName];
  if (!isD1Database(binding)) {
    throw new Error(
      `D1 binding "${bindingName}" not found. ` +
      'Add a D1 binding with this exact name in your Cloudflare Worker configuration.'
    );
  }

  const client = new D1Client(binding);
  const tables = getCurrentRuntimeTableNames();

  await initSchema(client, {
    cron_secret: appConfig.auth.cronSecret,
    endpoint_secret: appConfig.auth.endpointSecret,
  });

  const encryptionKey = appConfig.database.encryptionKey
    || (await client.queryOne<{ value: string }>(`SELECT value FROM ${tables.settings} WHERE "key" = ?`, ['encryption_key']))?.value;

  return new SqlEngine(client, 'd1', tables, encryptionKey);
}
