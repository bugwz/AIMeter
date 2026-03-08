import { getAppConfig } from '../config.js';
import type { DbClient, DatabaseEngine, ExecuteResult } from './engine.js';
import { SqlEngine, runCommonBootstrap } from './sql-engine.js';

class MysqlClient implements DbClient {
  constructor(private readonly pool: any) {}

  async query<T>(sql: string, params: unknown[] = []): Promise<T[]> {
    const [rows] = await this.pool.query(sql, params);
    return rows as T[];
  }

  async queryOne<T>(sql: string, params: unknown[] = []): Promise<T | undefined> {
    const rows = await this.query<T>(sql, params);
    return rows[0];
  }

  async execute(sql: string, params: unknown[] = []): Promise<ExecuteResult> {
    const [result] = await this.pool.execute(sql, params);
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
        const [result] = await connection.execute(sql, params);
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

async function initSchema(client: DbClient): Promise<void> {
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
       AND TABLE_NAME = 'usage_records'`
  );
  if (Number(legacyUsage?.count || 0) > 0 && Number(targetUsage?.count || 0) === 0) {
    await client.execute('RENAME TABLE `usage` TO usage_records');
  }

  await client.execute(`
    CREATE TABLE IF NOT EXISTS providers (
      id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
      provider VARCHAR(255) NOT NULL,
      name VARCHAR(255) NULL,
      \`key\` LONGTEXT NOT NULL,
      refresh_interval INT NOT NULL DEFAULT 5,
      display_order INT NOT NULL DEFAULT 0,
      attrs JSON NOT NULL,
      created_at BIGINT NOT NULL DEFAULT (UNIX_TIMESTAMP()),
      updated_at BIGINT NOT NULL DEFAULT (UNIX_TIMESTAMP()),
      UNIQUE KEY uq_provider_name (provider, name)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  await client.execute(`
    CREATE TABLE IF NOT EXISTS usage_records (
      id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
      provider_id BIGINT NOT NULL,
      progress LONGTEXT NULL,
      identity_data LONGTEXT NULL,
      created_at BIGINT NOT NULL DEFAULT (UNIX_TIMESTAMP()),
      INDEX idx_usage_provider_created (provider_id, created_at),
      CONSTRAINT fk_usage_provider FOREIGN KEY (provider_id) REFERENCES providers(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  await client.execute(`
    CREATE TABLE IF NOT EXISTS settings (
      \`key\` VARCHAR(255) NOT NULL PRIMARY KEY,
      value LONGTEXT NOT NULL,
      updated_at BIGINT NOT NULL DEFAULT (UNIX_TIMESTAMP())
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  await client.execute(`
    CREATE TABLE IF NOT EXISTS audit_logs (
      id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
      timestamp BIGINT NOT NULL DEFAULT (UNIX_TIMESTAMP()),
      ip VARCHAR(255) NULL,
      method VARCHAR(16) NOT NULL,
      path VARCHAR(1024) NOT NULL,
      status_code INT NOT NULL,
      duration_ms INT NOT NULL,
      user_agent TEXT NULL,
      authenticated TINYINT(1) NOT NULL DEFAULT 0,
      event_type VARCHAR(255) NOT NULL DEFAULT 'api_access',
      details LONGTEXT NULL,
      INDEX idx_audit_logs_timestamp (timestamp),
      INDEX idx_audit_logs_path (path(191))
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  // Add uid column to providers if not present
  const uidCol = await client.queryOne<{ count: string }>(
    "SELECT COUNT(*) AS count FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'providers' AND column_name = 'uid'"
  );
  if (Number(uidCol?.count || 0) === 0) {
    await client.execute('ALTER TABLE providers ADD COLUMN uid VARCHAR(32) NULL');
    await client.execute('CREATE UNIQUE INDEX idx_providers_uid ON providers(uid)');
  }

  await runCommonBootstrap(client, 'usage_records');
}

export async function createMysqlEngine(): Promise<DatabaseEngine> {
  const appConfig = getAppConfig();
  const { default: mysqlModule } = await import('mysql2/promise');
  const pool = mysqlModule.createPool(appConfig.database.connection);
  const client = new MysqlClient(pool);

  await initSchema(client);
  return new SqlEngine(client, 'mysql', appConfig.database.encryptionKey);
}
