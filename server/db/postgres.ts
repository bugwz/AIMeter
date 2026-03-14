import { getAppConfig } from '../config.js';
import type { DbClient, DatabaseEngine, ExecuteResult } from './engine.js';
import { SqlEngine, runCommonBootstrap } from './sql-engine.js';
import { getCurrentRuntimeTableNames } from './table-names.js';

function convertQuestionMarksToPg(sql: string): string {
  let idx = 0;
  return sql.replace(/\?/g, () => {
    idx += 1;
    return `$${idx}`;
  });
}

class PostgresClient implements DbClient {
  constructor(private readonly pool: any) {}

  async query<T>(sql: string, params: unknown[] = []): Promise<T[]> {
    const result = await this.pool.query(convertQuestionMarksToPg(sql), params);
    return result.rows as T[];
  }

  async queryOne<T>(sql: string, params: unknown[] = []): Promise<T | undefined> {
    const rows = await this.query<T>(sql, params);
    return rows[0];
  }

  async execute(sql: string, params: unknown[] = []): Promise<ExecuteResult> {
    const result = await this.pool.query(convertQuestionMarksToPg(sql), params);
    const first = result.rows[0] as { id?: number } | undefined;
    return {
      insertId: first?.id,
      affectedRows: result.rowCount || 0,
    };
  }

  async transaction<T>(fn: (tx: DbClient) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    const txClient: DbClient = {
      query: async <R>(sql: string, params: unknown[] = []) => {
        const result = await client.query(convertQuestionMarksToPg(sql), params);
        return result.rows as R[];
      },
      queryOne: async <R>(sql: string, params: unknown[] = []) => {
        const result = await client.query(convertQuestionMarksToPg(sql), params);
        return result.rows[0] as R | undefined;
      },
      execute: async (sql: string, params: unknown[] = []) => {
        const result = await client.query(convertQuestionMarksToPg(sql), params);
        const first = result.rows[0] as { id?: number } | undefined;
        return {
          insertId: first?.id,
          affectedRows: result.rowCount || 0,
        };
      },
      transaction: async <R>(nestedFn: (nestedTx: DbClient) => Promise<R>) => nestedFn(txClient),
    };

    try {
      await client.query('BEGIN');
      const result = await fn(txClient);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
}

async function initSchema(
  client: DbClient,
  initialSecrets?: Partial<Record<'cron_secret' | 'endpoint_secret', string>>,
): Promise<void> {
  const tables = getCurrentRuntimeTableNames();
  const legacyUsage = await client.queryOne<{ to_regclass: string | null }>(
    "SELECT to_regclass('public.usage')"
  );
  const targetUsage = await client.queryOne<{ to_regclass: string | null }>(
    `SELECT to_regclass('public.${tables.usageRecords}')`
  );
  if (legacyUsage?.to_regclass && !targetUsage?.to_regclass) {
    await client.execute(`ALTER TABLE usage RENAME TO ${tables.usageRecords}`);
  }

  await client.execute(`
    CREATE TABLE IF NOT EXISTS ${tables.providers} (
      id BIGSERIAL PRIMARY KEY,
      uid TEXT NOT NULL UNIQUE,
      provider TEXT NOT NULL,
      name TEXT,
      key TEXT NOT NULL,
      attrs JSONB NOT NULL DEFAULT '{}'::jsonb,
      fetch_state JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at BIGINT NOT NULL DEFAULT (EXTRACT(EPOCH FROM NOW())::BIGINT),
      updated_at BIGINT NOT NULL DEFAULT (EXTRACT(EPOCH FROM NOW())::BIGINT),
      UNIQUE(provider, name)
    )
  `);

  await client.execute(`
    CREATE TABLE IF NOT EXISTS ${tables.usageRecords} (
      id BIGSERIAL PRIMARY KEY,
      provider_id BIGINT NOT NULL REFERENCES ${tables.providers}(id) ON DELETE CASCADE,
      progress TEXT,
      identity_data TEXT,
      created_at BIGINT NOT NULL DEFAULT (EXTRACT(EPOCH FROM NOW())::BIGINT)
    )
  `);

  await client.execute(`
    CREATE TABLE IF NOT EXISTS ${tables.settings} (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at BIGINT NOT NULL DEFAULT (EXTRACT(EPOCH FROM NOW())::BIGINT)
    )
  `);

  await client.execute(`
    CREATE TABLE IF NOT EXISTS ${tables.auditLogs} (
      id BIGSERIAL PRIMARY KEY,
      timestamp BIGINT NOT NULL DEFAULT (EXTRACT(EPOCH FROM NOW())::BIGINT),
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

// Cached across requests within the same CF Workers isolate.
// Schema DDL and encryption key are only fetched on first init.
let postgresInitDone = false;
let postgresEncryptionKey: string | undefined;

export async function createPostgresEngine(): Promise<DatabaseEngine> {
  const appConfig = getAppConfig();
  const pgModule = (await import('pg')) as { Pool: new (config: { connectionString: string; connectionTimeoutMillis?: number; max?: number }) => unknown };
  // Always create a fresh Pool so the TCP socket belongs to the current
  // request's I/O context (CF Workers forbids cross-request socket reuse).
  const pool = new pgModule.Pool({
    connectionString: appConfig.database.connection,
    connectionTimeoutMillis: 8_000,
    max: 1,
  });
  const client = new PostgresClient(pool);
  const tables = getCurrentRuntimeTableNames();

  if (!postgresInitDone) {
    await initSchema(client, {
      cron_secret: appConfig.auth.cronSecret,
      endpoint_secret: appConfig.auth.endpointSecret,
    });

    postgresEncryptionKey = appConfig.database.encryptionKey
      || (await client.queryOne<{ value: string }>(`SELECT value FROM ${tables.settings} WHERE "key" = ?`, ['encryption_key']))?.value;

    postgresInitDone = true;
  }

  return new SqlEngine(client, 'postgres', tables, postgresEncryptionKey);
}
