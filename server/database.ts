import type { Database as BetterSqlite3Database } from 'better-sqlite3';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { getAppConfig } from './config.js';
import type { Credential, ProviderConfig, UsageProvider, UsageSnapshot } from '../src/types/index.js';
import type { AuditLogRow, DatabaseEngine, UsageRecordRow } from './db/engine.js';
import { getCurrentRuntimeTableNames } from './db/table-names.js';

let engineInstance: DatabaseEngine | null = null;
let sqliteRaw: BetterSqlite3Database | null = null;
let initPromise: Promise<void> | null = null;
let initializedState: boolean | null = null;

const CLOUDFLARE_WORKERS_MODULE = 'cloudflare:workers';

interface D1QueryResult<T = Record<string, unknown>> {
  results?: T[];
}

interface D1PreparedStatement {
  bind(...values: unknown[]): D1PreparedStatement;
  all<T = Record<string, unknown>>(): Promise<D1QueryResult<T>>;
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

async function isSqliteSchemaInitialized(connection: string): Promise<boolean> {
  const tables = getCurrentRuntimeTableNames();
  const dbPath = path.resolve(process.cwd(), connection || './data/aimeter.db');
  if (!existsSync(dbPath)) {
    return false;
  }

  const { default: Database } = await import('better-sqlite3');
  const db = new Database(dbPath, { readonly: true, fileMustExist: true });
  try {
    const rows = db
      .prepare(
        `SELECT name FROM sqlite_master WHERE type='table' AND name IN ('${tables.providers}','${tables.usageRecords}','${tables.settings}','${tables.auditLogs}')`
      )
      .all() as Array<{ name: string }>;
    const names = new Set(rows.map((row) => row.name));
    return [tables.providers, tables.usageRecords, tables.settings, tables.auditLogs].every((table) => names.has(table));
  } finally {
    db.close();
  }
}

async function isPostgresSchemaInitialized(connection: string): Promise<boolean> {
  const tables = getCurrentRuntimeTableNames();
  const { default: pgModule } = await import('pg') as {
    default: {
      Pool: new (config: { connectionString: string; connectionTimeoutMillis?: number }) => {
        query: (sql: string) => Promise<{ rows: Array<Record<string, string | null>> }>;
        end: () => Promise<void>;
      };
    };
  };
  const pool = new pgModule.Pool({ connectionString: connection, connectionTimeoutMillis: 8_000 });
  try {
    const result = await pool.query(
      `SELECT to_regclass('public.${tables.providers}') AS providers, ` +
      `to_regclass('public.${tables.usageRecords}') AS usage_records, ` +
      `to_regclass('public.${tables.settings}') AS settings, ` +
      `to_regclass('public.${tables.auditLogs}') AS audit_logs`
    );
    const row = result.rows[0] || {};
    return Boolean(row.providers) && Boolean(row.usage_records) && Boolean(row.settings) && Boolean(row.audit_logs);
  } finally {
    await pool.end();
  }
}

async function isMysqlSchemaInitialized(connection: string): Promise<boolean> {
  const tables = getCurrentRuntimeTableNames();
  const { default: mysqlModule } = await import('mysql2/promise');
  const { resolveMysqlPoolConfig } = await import('./db/mysql.js');
  const resolved = await resolveMysqlPoolConfig(connection);
  const pool = mysqlModule.createPool(resolved.poolConfig as any);
  try {
    const [rows] = await pool.query(
      `SELECT TABLE_NAME
       FROM INFORMATION_SCHEMA.TABLES
       WHERE TABLE_SCHEMA = DATABASE()
         AND TABLE_NAME IN ('${tables.providers}', '${tables.usageRecords}', '${tables.settings}', '${tables.auditLogs}')`
    ) as [Array<{ TABLE_NAME: string }>, unknown];
    const names = new Set(rows.map((row) => row.TABLE_NAME));
    return [tables.providers, tables.usageRecords, tables.settings, tables.auditLogs].every((table) => names.has(table));
  } finally {
    await pool.end();
  }
}

async function resolveCloudflareBindings(): Promise<Record<string, unknown>> {
  try {
    const mod = await import(CLOUDFLARE_WORKERS_MODULE) as { env?: Record<string, unknown> };
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

async function isD1SchemaInitialized(bindingName: string): Promise<boolean> {
  const tables = getCurrentRuntimeTableNames();
  const normalized = (bindingName || '').trim();
  if (!normalized) {
    throw new Error('AIMETER_DATABASE_CONNECTION is required when AIMETER_DATABASE_ENGINE=d1.');
  }
  if (!isValidBindingName(normalized)) {
    throw new Error(
      `Invalid D1 binding name "${normalized}". ` +
      'When AIMETER_DATABASE_ENGINE=d1, AIMETER_DATABASE_CONNECTION must be a binding name like DB.'
    );
  }

  const bindings = await resolveCloudflareBindings();
  const binding = bindings[normalized];
  if (!isD1Database(binding)) {
    throw new Error(
      `D1 binding "${normalized}" not found. ` +
      'Add a D1 binding with this exact name in your Cloudflare Worker configuration.'
    );
  }

  const result = await binding
    .prepare(
      `SELECT name FROM sqlite_master WHERE type='table' AND name IN ('${tables.providers}','${tables.usageRecords}','${tables.settings}','${tables.auditLogs}')`
    )
    .all<{ name: string }>();
  const rows = Array.isArray(result.results) ? result.results : [];
  const names = new Set(rows.map((row) => row.name));
  return [tables.providers, tables.usageRecords, tables.settings, tables.auditLogs].every((table) => names.has(table));
}

async function detectDatabaseInitialized(): Promise<boolean> {
  const appConfig = getAppConfig();

  if (appConfig.database.engine === 'sqlite') {
    return isSqliteSchemaInitialized(appConfig.database.connection || './data/aimeter.db');
  }
  if (appConfig.database.engine === 'postgres') {
    return isPostgresSchemaInitialized(appConfig.database.connection);
  }
  if (appConfig.database.engine === 'mysql') {
    return isMysqlSchemaInitialized(appConfig.database.connection);
  }
  if (appConfig.database.engine === 'd1') {
    return isD1SchemaInitialized(appConfig.database.connection);
  }
  return false;
}

async function initializeEngine(): Promise<void> {
  if (engineInstance) return;

  const appConfig = getAppConfig();
  if (appConfig.database.engine === 'sqlite') {
    const { createSqliteEngine } = await import('./db/sqlite.js');
    const runtime = await createSqliteEngine();
    engineInstance = runtime.engine;
    sqliteRaw = runtime.raw;
  } else if (appConfig.database.engine === 'postgres') {
    const { createPostgresEngine } = await import('./db/postgres.js');
    engineInstance = await createPostgresEngine();
    sqliteRaw = null;
  } else if (appConfig.database.engine === 'mysql') {
    const { createMysqlEngine } = await import('./db/mysql.js');
    engineInstance = await createMysqlEngine();
    sqliteRaw = null;
  } else if (appConfig.database.engine === 'd1') {
    const { createD1Engine } = await import('./db/d1.js');
    engineInstance = await createD1Engine();
    sqliteRaw = null;
  } else {
    throw new Error(`Unsupported database engine: ${appConfig.database.engine}`);
  }

  await engineInstance.init();
  initializedState = true;
}

async function getEngine(): Promise<DatabaseEngine> {
  if (!engineInstance) {
    if (!initPromise) {
      initPromise = initializeEngine();
    }
    try {
      await initPromise;
    } finally {
      initPromise = null;
    }
  }

  if (!engineInstance) {
    throw new Error('Database engine initialization failed');
  }

  return engineInstance;
}

export async function initDatabase(): Promise<BetterSqlite3Database | null> {
  await getEngine();
  initializedState = true;
  return sqliteRaw;
}

export async function isDatabaseInitialized(): Promise<boolean> {
  if (engineInstance) {
    return true;
  }
  if (initializedState !== null) {
    return initializedState;
  }

  try {
    initializedState = await detectDatabaseInitialized();
    return initializedState;
  } catch (error) {
    console.warn(
      '[DB] Failed to detect schema state; treating as uninitialized until bootstrap submit.',
      error instanceof Error ? error.message : error
    );
    return false;
  }
}

export function getDatabase(): BetterSqlite3Database {
  if (!sqliteRaw) {
    throw new Error('getDatabase() is only available for sqlite engine');
  }
  return sqliteRaw;
}

export async function saveProvider(provider: UsageProvider, config: ProviderConfig): Promise<string> {
  return (await getEngine()).saveProvider(provider, config);
}

export async function getAllProviders() {
  return (await getEngine()).getAllProviders();
}

export async function getProvider(uid: string) {
  return (await getEngine()).getProvider(uid);
}

export async function getFirstProviderByType(provider: UsageProvider) {
  return (await getEngine()).getFirstProviderByType(provider);
}

export async function getProviderByName(provider: UsageProvider, name: string) {
  return (await getEngine()).getProviderByName(provider, name);
}

export async function deleteProvider(uid: string): Promise<void> {
  return (await getEngine()).deleteProvider(uid);
}

export async function updateProvider(uid: string, updates: Partial<ProviderConfig> & { credentials?: Credential }): Promise<void> {
  return (await getEngine()).updateProvider(uid, updates);
}

export async function updateProviderDisplayOrders(items: Array<{ uid: string; displayOrder: number }>): Promise<void> {
  return (await getEngine()).updateProviderDisplayOrders(items);
}

export async function recordUsage(uid: string, snapshot: UsageSnapshot): Promise<void> {
  return (await getEngine()).recordUsage(uid, snapshot);
}

export async function recordUsageAt(uid: string, snapshot: UsageSnapshot, createdAt: Date): Promise<void> {
  return (await getEngine()).recordUsageAt(uid, snapshot, createdAt);
}

export async function recordUsageBatchAt(
  uid: string,
  entries: Array<{ snapshot: UsageSnapshot; createdAt: Date }>
): Promise<void> {
  return (await getEngine()).recordUsageBatchAt(uid, entries);
}

export async function clearUsageHistory(uid: string): Promise<void> {
  return (await getEngine()).clearUsageHistory(uid);
}

export async function getUsageHistory(uid: string, days: number = 30): Promise<UsageRecordRow[]> {
  return (await getEngine()).getUsageHistory(uid, days);
}

export async function getAllUsageHistory(days: number = 30): Promise<Map<string, UsageRecordRow[]>> {
  return (await getEngine()).getAllUsageHistory(days);
}

export async function getLatestUsage(uid: string): Promise<UsageRecordRow | null> {
  return (await getEngine()).getLatestUsage(uid);
}

export async function getSetting(key: string): Promise<string | null> {
  return (await getEngine()).getSetting(key);
}

export async function setSetting(key: string, value: string): Promise<void> {
  return (await getEngine()).setSetting(key, value);
}

export async function recordAuditLog(entry: {
  ip?: string | null;
  method: string;
  path: string;
  statusCode: number;
  durationMs: number;
  userAgent?: string | null;
  authenticated: boolean;
  eventType?: string;
  details?: Record<string, unknown>;
}): Promise<void> {
  return (await getEngine()).recordAuditLog(entry);
}

export async function getAuditLogs(limit: number = 200): Promise<AuditLogRow[]> {
  return (await getEngine()).getAuditLogs(limit);
}

export async function hasPasswordSet(): Promise<boolean> {
  return (await getEngine()).hasPasswordSet();
}

export async function setPassword(password: string): Promise<void> {
  return (await getEngine()).setPassword(password);
}

export async function verifyPassword(password: string): Promise<boolean> {
  return (await getEngine()).verifyPassword(password);
}

export async function patchProviderAttrs(uid: string, patch: Record<string, unknown>): Promise<void> {
  return (await getEngine()).patchProviderAttrs(uid, patch);
}

export async function patchFetchState(uid: string, patch: Record<string, unknown>): Promise<void> {
  return (await getEngine()).patchFetchState(uid, patch);
}

/**
 * Reset the cached engine instance for the current request.
 * Must be called at the start of each request for postgres/mysql so that
 * a fresh TCP connection (bound to the current CF Workers request context)
 * is created instead of reusing a socket from a previous request.
 */
export function clearEngineCache(): void {
  const appConfig = getAppConfig();
  const engine = appConfig.database.engine;
  if (engine === 'postgres' || engine === 'mysql') {
    engineInstance = null;
    initPromise = null;
  }
}
