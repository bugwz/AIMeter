import { getAppConfig } from '../config.js';
import type { DbClient, DatabaseEngine, ExecuteResult } from './engine.js';
import { SqlEngine, runCommonBootstrap } from './sql-engine.js';
import { getCurrentRuntimeTableNames } from './table-names.js';

const CLOUDFLARE_WORKERS_MODULE = 'cloudflare:workers';
const DEFAULT_HYPERDRIVE_BINDING = 'HYPERDRIVE';

type CloudflareBindings = Record<string, unknown>;

interface HyperdriveBindingLike {
  connectionString?: unknown;
  host?: unknown;
  hostname?: unknown;
  port?: unknown;
  user?: unknown;
  username?: unknown;
  password?: unknown;
  database?: unknown;
  db?: unknown;
}

interface MysqlPoolConfigLike {
  uri?: string;
  host?: string;
  port?: number;
  user?: string;
  password?: string;
  database?: string;
  disableEval: boolean;
}

interface ResolvedMysqlPool {
  poolConfig: string | MysqlPoolConfigLike;
  usesHyperdrive: boolean;
}

class MysqlClient implements DbClient {
  constructor(
    private readonly pool: any,
    private readonly forceTextProtocolForExecute: boolean = false,
  ) {}

  async query<T>(sql: string, params: unknown[] = []): Promise<T[]> {
    const [rows] = await this.pool.query(sql, params);
    return rows as T[];
  }

  async queryOne<T>(sql: string, params: unknown[] = []): Promise<T | undefined> {
    const rows = await this.query<T>(sql, params);
    return rows[0];
  }

  async execute(sql: string, params: unknown[] = []): Promise<ExecuteResult> {
    const [result] = this.forceTextProtocolForExecute
      ? await this.pool.query(sql, params)
      : await this.pool.execute(sql, params);
    const packet = result as any;
    return {
      insertId: packet.insertId || undefined,
      affectedRows: packet.affectedRows || 0,
    };
  }

  async transaction<T>(fn: (tx: DbClient) => Promise<T>): Promise<T> {
    const connection = await this.pool.getConnection();
    const txClient: DbClient = {
      query: async <R>(sql: string, params: unknown[] = []) => {
        const [rows] = await connection.query(sql, params);
        return rows as R[];
      },
      queryOne: async <R>(sql: string, params: unknown[] = []) => {
        const [rows] = await connection.query(sql, params);
        return (rows as R[])[0];
      },
      execute: async (sql: string, params: unknown[] = []) => {
        const [result] = this.forceTextProtocolForExecute
          ? await connection.query(sql, params)
          : await connection.execute(sql, params);
        const packet = result as any;
        return {
          insertId: packet.insertId || undefined,
          affectedRows: packet.affectedRows || 0,
        };
      },
      transaction: async <R>(nestedFn: (nestedTx: DbClient) => Promise<R>) => nestedFn(txClient),
    };

    try {
      await connection.beginTransaction();
      const result = await fn(txClient);
      await connection.commit();
      return result;
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }
}

async function initSchema(
  client: DbClient,
  initialSecrets?: Partial<Record<'cron_secret' | 'endpoint_secret', string>>,
): Promise<void> {
  const tables = getCurrentRuntimeTableNames();
  const legacyUsage = await client.queryOne<{ count: number }>(
    `SELECT COUNT(*) as count
     FROM INFORMATION_SCHEMA.TABLES
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = 'usage'`
  );
  const targetUsage = await client.queryOne<{ count: number }>(
    `SELECT COUNT(*) as count
     FROM INFORMATION_SCHEMA.TABLES
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = '${tables.usageRecords}'`
  );
  if (Number(legacyUsage?.count || 0) > 0 && Number(targetUsage?.count || 0) === 0) {
    await client.execute(`RENAME TABLE \`usage\` TO ${tables.usageRecords}`);
  }

  await client.execute(`
    CREATE TABLE IF NOT EXISTS ${tables.providers} (
      id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
      uid VARCHAR(32) NOT NULL,
      provider VARCHAR(255) NOT NULL,
      name VARCHAR(255) NULL,
      \`key\` LONGTEXT NOT NULL,
      attrs JSON NOT NULL,
      fetch_state JSON NOT NULL,
      created_at BIGINT NOT NULL,
      updated_at BIGINT NOT NULL,
      UNIQUE KEY uq_provider_name (provider, name),
      UNIQUE KEY uq_provider_uid (uid)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  await client.execute(`
    CREATE TABLE IF NOT EXISTS ${tables.usageRecords} (
      id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
      provider_id BIGINT NOT NULL,
      progress LONGTEXT NULL,
      identity_data LONGTEXT NULL,
      created_at BIGINT NOT NULL,
      INDEX ${tables.usageProviderCreatedIndex} (provider_id, created_at),
      CONSTRAINT ${tables.usageRecords}_fk_usage_provider FOREIGN KEY (provider_id) REFERENCES ${tables.providers}(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  await client.execute(`
    CREATE TABLE IF NOT EXISTS ${tables.settings} (
      \`key\` VARCHAR(255) NOT NULL PRIMARY KEY,
      value LONGTEXT NOT NULL,
      updated_at BIGINT NOT NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  await client.execute(`
    CREATE TABLE IF NOT EXISTS ${tables.auditLogs} (
      id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
      timestamp BIGINT NOT NULL,
      ip VARCHAR(255) NULL,
      method VARCHAR(16) NOT NULL,
      path VARCHAR(1024) NOT NULL,
      status_code INT NOT NULL,
      duration_ms INT NOT NULL,
      user_agent TEXT NULL,
      authenticated TINYINT(1) NOT NULL DEFAULT 0,
      event_type VARCHAR(255) NOT NULL DEFAULT 'api_access',
      details LONGTEXT NULL,
      INDEX ${tables.auditLogsTimestampIndex} (timestamp),
      INDEX ${tables.auditLogsPathIndex} (path(191))
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  await runCommonBootstrap(client, tables, initialSecrets, '`key`');
}

function asNonEmptyString(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}

function toInteger(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.floor(value);
  }
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return Math.floor(parsed);
    }
  }
  return undefined;
}

async function resolveCloudflareBindings(): Promise<CloudflareBindings | null> {
  try {
    const mod = await import(CLOUDFLARE_WORKERS_MODULE) as { env?: CloudflareBindings };
    return mod.env && typeof mod.env === 'object' ? mod.env : null;
  } catch {
    return null;
  }
}

function buildPoolConfigFromHyperdrive(
  binding: HyperdriveBindingLike,
  fallbackConnection: string,
): MysqlPoolConfigLike {
  const connectionString = asNonEmptyString(binding.connectionString) || fallbackConnection;
  const host = asNonEmptyString(binding.host) || asNonEmptyString(binding.hostname);
  const user = asNonEmptyString(binding.user) || asNonEmptyString(binding.username);
  const password = asNonEmptyString(binding.password);
  const database = asNonEmptyString(binding.database) || asNonEmptyString(binding.db);
  const port = toInteger(binding.port);

  if (host && user && database) {
    return {
      host,
      user,
      password,
      database,
      port,
      disableEval: true,
    };
  }

  return {
    uri: connectionString,
    disableEval: true,
  };
}

export async function resolveMysqlPoolConfig(connection: string): Promise<ResolvedMysqlPool> {
  const bindings = await resolveCloudflareBindings();
  if (!bindings) {
    return {
      poolConfig: connection,
      usesHyperdrive: false,
    };
  }

  const appConfig = getAppConfig();
  const bindingName = (appConfig.database.cfHyperdriveBinding || DEFAULT_HYPERDRIVE_BINDING).trim();
  const binding = bindings[bindingName] as HyperdriveBindingLike | undefined;

  if (!binding || typeof binding !== 'object') {
    // Workers runtime: force disableEval to avoid dynamic code generation.
    return {
      poolConfig: {
        uri: connection,
        disableEval: true,
      },
      usesHyperdrive: false,
    };
  }

  return {
    poolConfig: buildPoolConfigFromHyperdrive(binding, connection),
    usesHyperdrive: true,
  };
}

export async function createMysqlEngine(): Promise<DatabaseEngine> {
  const appConfig = getAppConfig();
  const { default: mysqlModule } = await import('mysql2/promise');
  const resolved = await resolveMysqlPoolConfig(appConfig.database.connection);
  const pool = mysqlModule.createPool(resolved.poolConfig as any);
  const client = new MysqlClient(pool, resolved.usesHyperdrive);
  const tables = getCurrentRuntimeTableNames();

  await initSchema(client, {
    cron_secret: appConfig.auth.cronSecret,
    endpoint_secret: appConfig.auth.endpointSecret,
  });

  const encryptionKey = appConfig.database.encryptionKey
    || (await client.queryOne<{ value: string }>(`SELECT value FROM ${tables.settings} WHERE \`key\` = ?`, ['encryption_key']))?.value;

  return new SqlEngine(client, 'mysql', tables, encryptionKey);
}
