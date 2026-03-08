import Database from 'better-sqlite3';
import { getAppConfig } from './config.js';
import type { Credential, ProviderConfig, UsageProvider, UsageSnapshot } from '../src/types/index.js';
import type { AuditLogRow, DatabaseEngine, UsageRecordRow } from './db/engine.js';

let engineInstance: DatabaseEngine | null = null;
let sqliteRaw: Database.Database | null = null;
let initPromise: Promise<void> | null = null;

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
  } else {
    throw new Error(`Unsupported database engine: ${appConfig.database.engine}`);
  }

  await engineInstance.init();
}

async function getEngine(): Promise<DatabaseEngine> {
  if (!engineInstance) {
    if (!initPromise) {
      initPromise = initializeEngine();
    }
    await initPromise;
    initPromise = null;
  }

  if (!engineInstance) {
    throw new Error('Database engine initialization failed');
  }

  return engineInstance;
}

export async function initDatabase(): Promise<Database.Database | null> {
  await getEngine();
  return sqliteRaw;
}

export function getDatabase(): Database.Database {
  if (!sqliteRaw) {
    throw new Error('getDatabase() is only available for sqlite engine');
  }
  return sqliteRaw;
}

export async function saveProvider(provider: UsageProvider, config: ProviderConfig): Promise<number> {
  return (await getEngine()).saveProvider(provider, config);
}

export async function getAllProviders() {
  return (await getEngine()).getAllProviders();
}

export async function getProvider(id: number) {
  return (await getEngine()).getProvider(id);
}

export async function getFirstProviderByType(provider: UsageProvider) {
  return (await getEngine()).getFirstProviderByType(provider);
}

export async function getProviderByName(provider: UsageProvider, name: string) {
  return (await getEngine()).getProviderByName(provider, name);
}

export async function deleteProvider(id: number): Promise<void> {
  return (await getEngine()).deleteProvider(id);
}

export async function updateProvider(id: number, updates: Partial<ProviderConfig> & { credentials?: Credential }): Promise<void> {
  return (await getEngine()).updateProvider(id, updates);
}

export async function updateProviderDisplayOrders(items: Array<{ id: number; displayOrder: number }>): Promise<void> {
  return (await getEngine()).updateProviderDisplayOrders(items);
}

export async function recordUsage(provider: number, snapshot: UsageSnapshot): Promise<void> {
  return (await getEngine()).recordUsage(provider, snapshot);
}

export async function recordUsageAt(provider: number, snapshot: UsageSnapshot, createdAt: Date): Promise<void> {
  return (await getEngine()).recordUsageAt(provider, snapshot, createdAt);
}

export async function recordUsageBatchAt(
  provider: number,
  entries: Array<{ snapshot: UsageSnapshot; createdAt: Date }>
): Promise<void> {
  return (await getEngine()).recordUsageBatchAt(provider, entries);
}

export async function clearUsageHistory(provider: number): Promise<void> {
  return (await getEngine()).clearUsageHistory(provider);
}

export async function getUsageHistory(provider: number, days: number = 30): Promise<UsageRecordRow[]> {
  return (await getEngine()).getUsageHistory(provider, days);
}

export async function getAllUsageHistory(days: number = 30): Promise<Map<string, UsageRecordRow[]>> {
  return (await getEngine()).getAllUsageHistory(days);
}

export async function getLatestUsage(provider: number): Promise<UsageRecordRow | null> {
  return (await getEngine()).getLatestUsage(provider);
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
