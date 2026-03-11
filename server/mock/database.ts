import { createRequire } from 'module';
import path from 'path';
import crypto from 'crypto';
import { UsageProvider, ProviderConfig, Credential, AuthType, UsageSnapshot, RateWindow } from '../../src/types/index.js';
import { MOCK_PROVIDER_CONFIGS, MockProviderConfig } from './config.js';
import { roundPercentage } from '../utils/usageTransformer.js';
import { getAppConfig } from '../config.js';
type StoredProviderConfig = Omit<ProviderConfig, 'id'> & { id: number };
type BetterSqliteDatabase = import('better-sqlite3').Database;
type BetterSqliteCtor = new (filename: string) => BetterSqliteDatabase;

const appConfig = getAppConfig();
const require = createRequire(import.meta.url);
let betterSqliteCtor: BetterSqliteCtor | null = null;

function getBetterSqliteCtor(): BetterSqliteCtor {
  if (betterSqliteCtor) return betterSqliteCtor;
  try {
    const mod = require('better-sqlite3') as BetterSqliteCtor | { default: BetterSqliteCtor };
    betterSqliteCtor = (typeof mod === 'function' ? mod : mod.default);
    return betterSqliteCtor;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(
      `better-sqlite3 is required only for env-storage mock mode. ` +
      `Disable AIMETER_MOCK_ENABLED or install better-sqlite3. Inner error: ${message}`,
    );
  }
}

function resolveMockDatabasePath(): string {
  if (!appConfig.database.enabled) {
    return ':memory:';
  }

  const baseConnection = appConfig.database.connection || './data/aimeter.db';
  return path.resolve(process.cwd(), baseConnection);
}

let db: BetterSqliteDatabase;

function toUnixSeconds(value?: Date | number | string): number {
  if (value instanceof Date) return Math.floor(value.getTime() / 1000);
  if (typeof value === 'number') {
    return value > 1_000_000_000_000 ? Math.floor(value / 1000) : Math.floor(value);
  }
  if (typeof value === 'string') {
    const numeric = Number(value);
    if (Number.isFinite(numeric)) {
      return numeric > 1_000_000_000_000 ? Math.floor(numeric / 1000) : Math.floor(numeric);
    }
    const parsed = Date.parse(value);
    if (Number.isFinite(parsed)) return Math.floor(parsed / 1000);
  }
  return Math.floor(Date.now() / 1000);
}

function fromUnixSeconds(value: number | string | null | undefined): Date {
  return new Date(toUnixSeconds(value ?? Date.now()) * 1000);
}

function toUnixSecondsValue(value: Date | number | string | undefined): number | undefined {
  if (value === undefined || value === null) return undefined;
  if (value instanceof Date) return Math.floor(value.getTime() / 1000);
  if (typeof value === 'number') {
    return value > 1_000_000_000_000 ? Math.floor(value / 1000) : Math.floor(value);
  }
  const numeric = Number(value);
  if (Number.isFinite(numeric)) {
    return numeric > 1_000_000_000_000 ? Math.floor(numeric / 1000) : Math.floor(numeric);
  }
  const parsed = Date.parse(value);
  if (Number.isFinite(parsed)) return Math.floor(parsed / 1000);
  return undefined;
}

function migrateMockUsageJsonTimestamps(database: BetterSqliteDatabase): void {
  const rowStmt = database.prepare('SELECT id, progress FROM mock_usage');
  const updateStmt = database.prepare('UPDATE mock_usage SET progress = ? WHERE id = ?');
  const rows = rowStmt.all() as Array<{ id: number; progress: string | null }>;

  const transaction = database.transaction((items: Array<{ id: number; progress: string | null }>) => {
    items.forEach((row) => {
      let changed = false;
      let nextProgress = row.progress;

      if (row.progress) {
        try {
          const progressObj = JSON.parse(row.progress) as { items?: Array<Record<string, unknown>> };
          if (Array.isArray(progressObj.items)) {
            progressObj.items = progressObj.items.map((item) => {
              if (!item || typeof item !== 'object') return item;
              const resetsAt = toUnixSecondsValue(item.resetsAt as Date | number | string | undefined);
              if (resetsAt === undefined) return item;
              if (item.resetsAt !== resetsAt) changed = true;
              return { ...item, resetsAt };
            });
            nextProgress = JSON.stringify(progressObj);
          }
        } catch {
          // Keep legacy malformed data untouched.
        }
      }

      if (changed) {
        updateStmt.run(nextProgress, row.id);
      }
    });
  });

  transaction(rows);
}

export interface MockProviderState {
  provider: UsageProvider;
  currentUsage: number;
  limit: number;
  periodStart: Date;
  periodEnd: Date;
  lastUpdated: Date;
}

export interface MockAuditLogRow {
  id: number;
  timestamp: string;
  ip: string | null;
  method: string;
  path: string;
  statusCode: number;
  durationMs: number;
  userAgent: string | null;
  authenticated: boolean;
  eventType: string;
  details: Record<string, unknown> | null;
}

const MOCK_ENCRYPTION_SECRET = appConfig.database.encryptionKey || 'aimeter-mock-secret';
const ENCRYPTION_KEY = crypto.createHash('sha256').update(MOCK_ENCRYPTION_SECRET).digest();

function parseProviderAttrs(raw: unknown): Record<string, unknown> {
  if (!raw) return {};
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
    } catch {
      return {};
    }
  }
  if (typeof raw === 'object' && !Array.isArray(raw)) return raw as Record<string, unknown>;
  return {};
}

function buildProviderAttrs(config: Partial<ProviderConfig>): Record<string, unknown> {
  const attrs: Record<string, unknown> = {
    ...((config.attrs && typeof config.attrs === 'object' && !Array.isArray(config.attrs)) ? config.attrs : {}),
  };

  const refreshInterval = Number(config.refreshInterval);
  if (Number.isFinite(refreshInterval) && refreshInterval > 0) attrs.refreshInterval = refreshInterval;
  else if (typeof attrs.refreshInterval !== 'number') attrs.refreshInterval = 5;

  const displayOrder = Number(config.displayOrder);
  if (Number.isFinite(displayOrder) && displayOrder > 0) attrs.displayOrder = displayOrder;
  else if (typeof attrs.displayOrder !== 'number') attrs.displayOrder = 0;

  if (config.region) attrs.region = config.region;
  else delete attrs.region;
  if (typeof config.plan === 'string' && config.plan.trim()) attrs.plan = config.plan.trim();
  else delete attrs.plan;
  return attrs;
}

function getEncryptionHelpers(): { encrypt: (text: string) => string; decrypt: (encryptedStr: string) => string } {
  const encrypt = (text: string): string => {
    const iv = crypto.randomBytes(16);
    const key = Buffer.from(ENCRYPTION_KEY);
    const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
    let encrypted = cipher.update(text, 'utf-8', 'base64');
    encrypted += cipher.final('base64');
    return JSON.stringify({ iv: iv.toString('base64'), data: encrypted });
  };

  const decrypt = (encryptedStr: string): string => {
    const { iv, data } = JSON.parse(encryptedStr);
    const decipher = crypto.createDecipheriv('aes-256-cbc', Buffer.from(ENCRYPTION_KEY), Buffer.from(iv, 'base64'));
    let decrypted = decipher.update(data, 'base64', 'utf-8');
    decrypted += decipher.final('utf-8');
    return decrypted;
  };

  return { encrypt, decrypt };
}

export function initMockDatabase(): BetterSqliteDatabase {
  const BetterSqlite = getBetterSqliteCtor();
  db = new BetterSqlite(resolveMockDatabasePath());
  db.pragma('journal_mode = WAL');
  
  db.exec(`
    CREATE TABLE IF NOT EXISTS mock_providers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      provider TEXT NOT NULL,
      name TEXT,
      key TEXT NOT NULL,
      attrs TEXT NOT NULL DEFAULT '{}',
      mock_initial_usage REAL DEFAULT 0,
      mock_limit REAL DEFAULT 100,
      mock_period_start INTEGER,
      mock_period_end INTEGER,
      mock_last_updated INTEGER,
      created_at INTEGER DEFAULT (unixepoch()),
      updated_at INTEGER DEFAULT (unixepoch()),
      UNIQUE(provider, name)
    );

    CREATE TABLE IF NOT EXISTS mock_usage (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      provider_id INTEGER NOT NULL,
      progress TEXT,
      identity_data TEXT,
      created_at INTEGER DEFAULT (unixepoch()),
      FOREIGN KEY (provider_id) REFERENCES mock_providers(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS mock_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at INTEGER DEFAULT (unixepoch())
    );

    CREATE TABLE IF NOT EXISTS mock_audit_logs (
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
    );

    CREATE INDEX IF NOT EXISTS idx_mock_usage_provider_created 
    ON mock_usage(provider_id, created_at);

    CREATE INDEX IF NOT EXISTS idx_mock_audit_logs_timestamp
    ON mock_audit_logs(timestamp);
  `);

  const normalizeTimestampColumn = (table: string, column: string) => {
    db.exec(`
      UPDATE ${table}
      SET ${column} = CASE
        WHEN typeof(${column}) = 'integer' THEN ${column}
        WHEN typeof(${column}) = 'real' THEN CAST(${column} AS INTEGER)
        WHEN typeof(${column}) = 'text' THEN COALESCE(unixepoch(${column}), CAST(${column} AS INTEGER), unixepoch())
        ELSE unixepoch()
      END
      WHERE ${column} IS NOT NULL AND typeof(${column}) != 'integer'
    `);
  };

  normalizeTimestampColumn('mock_providers', 'mock_period_start');
  normalizeTimestampColumn('mock_providers', 'mock_period_end');
  normalizeTimestampColumn('mock_providers', 'mock_last_updated');
  normalizeTimestampColumn('mock_providers', 'created_at');
  normalizeTimestampColumn('mock_providers', 'updated_at');
  normalizeTimestampColumn('mock_usage', 'created_at');
  normalizeTimestampColumn('mock_settings', 'updated_at');
  normalizeTimestampColumn('mock_audit_logs', 'timestamp');
  migrateMockUsageJsonTimestamps(db);

  return db;
}

export function getMockDatabase(): BetterSqliteDatabase {
  if (!db) {
    return initMockDatabase();
  }
  
  return db;
}

export function getDefaultPeriodDates(periodType: 'monthly' | 'weekly' | 'daily', resetDay?: number): { start: Date; end: Date } {
  const now = new Date();
  let start: Date;
  let end: Date;

  switch (periodType) {
    case 'monthly': {
      const day = resetDay || 1;
      start = new Date(now.getFullYear(), now.getMonth(), day);
      if (now.getDate() < day) {
        start.setMonth(start.getMonth() - 1);
      }
      end = new Date(start);
      end.setMonth(end.getMonth() + 1);
      break;
    }
    case 'weekly': {
      const dayOfWeek = now.getDay();
      start = new Date(now);
      start.setDate(start.getDate() - dayOfWeek);
      start.setHours(0, 0, 0, 0);
      end = new Date(start);
      end.setDate(end.getDate() + 7);
      break;
    }
    case 'daily': {
      start = new Date(now);
      start.setHours(0, 0, 0, 0);
      end = new Date(start);
      end.setDate(end.getDate() + 1);
      break;
    }
  }

  return { start, end };
}

export function saveMockProvider(provider: UsageProvider, config: ProviderConfig): number {
  const database = getMockDatabase();
  const mockConfig = MOCK_PROVIDER_CONFIGS[provider];
  
  if (!mockConfig) {
    console.warn(`No mock config for provider: ${provider}`);
    return -1;
  }

  const existingProviders = getAllMockProviders();
  const existing = existingProviders.find(p => p.provider === provider);
  
  if (existing) {
    return existing.id;
  }
  
  let periodStart: Date;
  let periodEnd: Date;
  let currentUsage: number;

  const dates = getDefaultPeriodDates(mockConfig.periodType, mockConfig.resetDay);
  periodStart = dates.start;
  periodEnd = dates.end;
  currentUsage = mockConfig.initialUsage;

  const { encrypt } = getEncryptionHelpers();
  const encryptedKey = encrypt(JSON.stringify(config.credentials));
  const attrs = buildProviderAttrs(config);
  
  const stmt = database.prepare(`
    INSERT INTO mock_providers (
      provider, name, key, attrs,
      mock_initial_usage, mock_limit, mock_period_start, mock_period_end, mock_last_updated, updated_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, unixepoch(), unixepoch())
  `);
  
  const result = stmt.run(
    provider,
    config.name || null,
    encryptedKey,
    JSON.stringify(attrs),
    currentUsage,
    mockConfig.limit,
    toUnixSeconds(periodStart),
    toUnixSeconds(periodEnd)
  );
  
  return result.lastInsertRowid as number;
}

export function getAllMockProviders(): StoredProviderConfig[] {
  const database = getMockDatabase();
  const stmt = database.prepare('SELECT * FROM mock_providers');
  const rows = stmt.all() as any[];
  
  return rows.map(row => {
    const { decrypt: decryptFn } = getEncryptionHelpers();
    const attrs = parseProviderAttrs(row.attrs);
    const refreshInterval = Number(attrs.refreshInterval);
    let credentials: Credential;
    try {
      const decrypted = decryptFn(row.key);
      credentials = JSON.parse(decrypted) as Credential;
    } catch (e) {
      console.error(`Failed to decrypt credentials for ${row.id}:`, e);
      credentials = { type: AuthType.API_KEY, value: '', keyPrefix: '' };
    }
    return {
      id: row.id,
      provider: row.provider as UsageProvider,
      credentials,
      refreshInterval: Number.isFinite(refreshInterval) && refreshInterval > 0 ? Math.floor(refreshInterval) : 5,
      attrs,
      region: typeof attrs.region === 'string' ? attrs.region : undefined,
      name: row.name || undefined,
      plan: typeof attrs.plan === 'string' ? attrs.plan : undefined,
    };
  });
}

export function getMockProvider(id: number): MockProviderState | null {
  const database = getMockDatabase();
  const stmt = database.prepare('SELECT * FROM mock_providers WHERE id = ?');
  const row = stmt.get(id) as any;
  
  if (!row) return null;
  
  return {
    provider: row.provider as UsageProvider,
    currentUsage: row.mock_initial_usage,
    limit: row.mock_limit,
    periodStart: fromUnixSeconds(row.mock_period_start),
    periodEnd: fromUnixSeconds(row.mock_period_end),
    lastUpdated: fromUnixSeconds(row.mock_last_updated || row.updated_at),
  };
}

export function updateMockProviderUsage(providerId: number, newUsage: number): void {
  const database = getMockDatabase();
  const stmt = database.prepare(`
    UPDATE mock_providers 
    SET mock_initial_usage = ?, mock_last_updated = unixepoch()
    WHERE id = ?
  `);
  stmt.run(newUsage, providerId);
}

export function setMockProviderRegion(providerId: number, region: string): void {
  const database = getMockDatabase();
  const row = database.prepare('SELECT attrs FROM mock_providers WHERE id = ?').get(providerId) as { attrs: string | null } | undefined;
  if (!row) return;

  const attrs = parseProviderAttrs(row.attrs);
  if (attrs.region === region) return;

  attrs.region = region;
  database.prepare(`
    UPDATE mock_providers
    SET attrs = ?, updated_at = unixepoch()
    WHERE id = ?
  `).run(JSON.stringify(attrs), providerId);
}

export function recordMockUsage(
  providerId: number,
  snapshot: UsageSnapshot
): void {
  const database = getMockDatabase();
  
  const items: any[] = [];
  
  if (snapshot.progress && snapshot.progress.length > 0) {
    items.push(...snapshot.progress);
  } else {
    const primary = (snapshot as any).primary;
    const secondary = (snapshot as any).secondary;
    const tertiary = (snapshot as any).tertiary;
    
    if (primary) {
      items.push({ name: 'Primary', ...primary });
    }
    if (secondary) {
      items.push({ name: 'Secondary', ...secondary });
    }
    if (tertiary) {
      items.push({ name: 'Tertiary', ...tertiary });
    }
  }
  
  const progressData = {
    items: items.map((item) => {
      const resetsAt = toUnixSecondsValue(item.resetsAt);
      return {
        ...item,
        ...(resetsAt !== undefined ? { resetsAt } : {}),
      };
    }),
    cost: snapshot.cost,
  };
  
  const stmt = database.prepare(`
    INSERT INTO mock_usage (
      provider_id, 
      progress,
      identity_data,
      created_at
    )
    VALUES (?, ?, ?, unixepoch())
  `);
  
  stmt.run(
    providerId,
    JSON.stringify(progressData),
    snapshot.identity ? JSON.stringify(snapshot.identity) : null
  );
}

export function getMockUsageHistory(
  providerId: number,
  days: number = 30
): any[] {
  const database = getMockDatabase();
  const cutoffTs = Math.floor(Date.now() / 1000) - (days * 86400);
  
  const stmt = database.prepare(`
    SELECT * FROM mock_usage 
    WHERE provider_id = ? 
    AND created_at >= ?
    ORDER BY created_at ASC
  `);
  
  const rows = stmt.all(providerId, cutoffTs) as any[];
  
  return rows.map(row => ({
    id: row.id,
    providerId: row.provider_id,
    progress: row.progress ? JSON.parse(row.progress) : null,
    identityData: row.identity_data ? JSON.parse(row.identity_data) : null,
    createdAt: fromUnixSeconds(row.created_at),
  }));
}

export function getAllMockUsageHistory(
  days: number = 30
): Map<string, any[]> {
  const database = getMockDatabase();
  const cutoffTs = Math.floor(Date.now() / 1000) - (days * 86400);
  
  const stmt = database.prepare(`
    SELECT * FROM mock_usage 
    WHERE created_at >= ?
    ORDER BY created_at ASC
  `);
  
  const rows = stmt.all(cutoffTs) as any[];
  const result = new Map<string, any[]>();
  
  rows.forEach((row) => {
    const record = {
      id: row.id,
      providerId: row.provider_id,
      progress: row.progress ? JSON.parse(row.progress) : null,
      identityData: row.identity_data ? JSON.parse(row.identity_data) : null,
      createdAt: fromUnixSeconds(row.created_at),
    };
    const existing = result.get(row.provider_id) || [];
    existing.push(record);
    result.set(row.provider_id, existing);
  });
  
  return result;
}

export function deleteMockProvider(providerId: number): void {
  const database = getMockDatabase();
  const stmt = database.prepare('DELETE FROM mock_providers WHERE id = ?');
  stmt.run(providerId);
}

export function generateMockHistoryData(providerId: number, config: MockProviderConfig): void {
  const database = getMockDatabase();

  const days = 45;
  const intervalsPerDay = 24; // hourly records
  const totalRecords = days * intervalsPerDay;
  const now = new Date();

  const stmt = database.prepare(`
    INSERT INTO mock_usage (
      provider_id,
      progress,
      created_at
    )
    VALUES (?, ?, ?)
  `);

  const insertMany = database.transaction((records: any[]) => {
    for (const record of records) {
      stmt.run(
        record.providerId,
        record.progress,
        record.createdAt
      );
    }
  });

  const records: any[] = [];
  const initialPercent = Math.max(1, Math.min(80, (config.initialUsage / config.limit) * 100 * 0.6));
  let cumulativePercent = initialPercent;

  const getNextResetAt = (date: Date): Date => {
    const reset = new Date(date);
    if (config.periodType === 'daily') {
      reset.setUTCDate(reset.getUTCDate() + 1);
      reset.setUTCHours(0, 0, 0, 0);
      return reset;
    }

    if (config.periodType === 'weekly') {
      const day = reset.getUTCDay();
      const offset = day === 0 ? 7 : 7 - day;
      reset.setUTCDate(reset.getUTCDate() + offset);
      reset.setUTCHours(0, 0, 0, 0);
      return reset;
    }

    const resetDay = config.resetDay || 1;
    reset.setUTCMonth(reset.getUTCMonth() + 1, resetDay);
    reset.setUTCHours(0, 0, 0, 0);
    return reset;
  };

  const shouldReset = (date: Date): boolean => {
    if (date.getUTCHours() !== 0) return false;
    if (config.periodType === 'daily') return true;
    if (config.periodType === 'weekly') return date.getUTCDay() === 0;
    const resetDay = config.resetDay || 1;
    return date.getUTCDate() === resetDay;
  };

  const getDailyTargetPercent = (): number => {
    const baseline = (config.consumptionRate * 24 / Math.max(config.limit, 1)) * 100;
    return Math.max(0.8, Math.min(8, baseline * 1.8));
  };

  const dailyTargetPercent = getDailyTargetPercent();

  for (let i = totalRecords - 1; i >= 0; i--) {
    const recordTime = new Date(now.getTime() - i * 60 * 60 * 1000);

    if (shouldReset(recordTime)) {
      cumulativePercent = 2 + Math.random() * 12;
    }

    const hour = recordTime.getUTCHours();
    const day = recordTime.getUTCDay();
    const dayFactor = day === 0 || day === 6 ? 0.72 : 1;
    const diurnalFactor = 0.55 + 0.45 * (Math.sin((hour / 24) * Math.PI * 2 - Math.PI / 2) + 1) / 2;
    const randomFactor = 0.75 + Math.random() * 0.8;
    const spike = Math.random() < 0.03 ? 1 + Math.random() * 4 : 0;

    const hourlyIncrement = (dailyTargetPercent / 24) * dayFactor * diurnalFactor * randomFactor + spike;
    cumulativePercent = Math.max(0.5, Math.min(100, cumulativePercent + hourlyIncrement));

    const usedPercent = cumulativePercent;
    const remainingPercent = 100 - usedPercent;
    const usedValue = (usedPercent / 100) * config.limit;
    const secondaryPercent = Math.min(100, Math.max(0, usedPercent * (0.35 + Math.random() * 0.35) + (Math.random() - 0.5) * 4));
    const nextResetAt = getNextResetAt(recordTime);
    const hasCost = config.consumptionUnit === 'dollars' || config.consumptionUnit === 'credits';

    records.push({
      providerId: providerId,
      progress: JSON.stringify({
        items: [
          {
            name: 'primary',
            usedPercent: roundPercentage(usedPercent),
            remainingPercent: roundPercentage(remainingPercent),
            used: roundPercentage(usedValue),
            limit: config.limit,
            windowMinutes: config.periodType === 'daily' ? 1440 : config.periodType === 'weekly' ? 10080 : 43200,
            resetsAt: toUnixSeconds(nextResetAt),
            resetDescription: `Resets ${config.periodType}`,
          },
          {
            name: 'secondary',
            usedPercent: roundPercentage(secondaryPercent),
            remainingPercent: roundPercentage(100 - secondaryPercent),
            used: roundPercentage((secondaryPercent / 100) * Math.max(config.limit * 0.6, 1)),
            limit: roundPercentage(Math.max(config.limit * 0.6, 1)),
            windowMinutes: 60,
          }
        ],
        cost: hasCost
          ? {
              used: roundPercentage(usedValue),
              limit: config.limit,
              remaining: roundPercentage(Math.max(0, config.limit - usedValue)),
              currency: config.consumptionUnit === 'dollars' ? 'USD' : undefined,
              period: config.periodType,
            }
          : undefined,
      }),
      createdAt: toUnixSeconds(recordTime),
    });
  }

  insertMany(records);
}

export function clearMockUsageHistory(providerId?: number): void {
  const database = getMockDatabase();
  if (providerId === undefined) {
    database.prepare('DELETE FROM mock_usage').run();
    return;
  }
  database.prepare('DELETE FROM mock_usage WHERE provider_id = ?').run(providerId);
}

export function hasMockHistoryData(providerId: number): boolean {
  const database = getMockDatabase();
  const stmt = database.prepare('SELECT COUNT(*) as count FROM mock_usage WHERE provider_id = ?');
  const row = stmt.get(providerId) as { count: number };
  return row.count > 0;
}

export function getSetting(key: string): string | undefined {
  const database = getMockDatabase();
  const stmt = database.prepare('SELECT value FROM mock_settings WHERE key = ?');
  const row = stmt.get(key) as { value: string } | undefined;
  return row?.value;
}

export function setSetting(key: string, value: string): void {
  const database = getMockDatabase();
  const stmt = database.prepare('INSERT OR REPLACE INTO mock_settings (key, value, updated_at) VALUES (?, ?, unixepoch())');
  stmt.run(key, value);
}

export function recordMockAuditLog(entry: {
  ip?: string | null;
  method: string;
  path: string;
  statusCode: number;
  durationMs: number;
  userAgent?: string | null;
  authenticated: boolean;
  eventType?: string;
  details?: Record<string, unknown>;
}): void {
  const database = getMockDatabase();
  const stmt = database.prepare(`
    INSERT INTO mock_audit_logs (
      ip, method, path, status_code, duration_ms, user_agent, authenticated, event_type, details, timestamp
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, unixepoch())
  `);

  stmt.run(
    entry.ip || null,
    entry.method,
    entry.path,
    entry.statusCode,
    entry.durationMs,
    entry.userAgent || null,
    entry.authenticated ? 1 : 0,
    entry.eventType || 'api_access',
    entry.details ? JSON.stringify(entry.details) : null
  );
}

export function getMockAuditLogs(limit: number = 200): MockAuditLogRow[] {
  const safeLimit = Math.max(1, Math.min(1000, limit));
  const database = getMockDatabase();
  const stmt = database.prepare(`
    SELECT * FROM mock_audit_logs
    ORDER BY id DESC
    LIMIT ?
  `);

  const rows = stmt.all(safeLimit) as Array<{
    id: number;
    timestamp: number;
    ip: string | null;
    method: string;
    path: string;
    status_code: number;
    duration_ms: number;
    user_agent: string | null;
    authenticated: number;
    event_type: string;
    details: string | null;
  }>;

  return rows.map((row) => ({
    id: row.id,
    timestamp: fromUnixSeconds(row.timestamp).toISOString(),
    ip: row.ip,
    method: row.method,
    path: row.path,
    statusCode: row.status_code,
    durationMs: row.duration_ms,
    userAgent: row.user_agent,
    authenticated: row.authenticated === 1,
    eventType: row.event_type,
    details: row.details ? JSON.parse(row.details) : null,
  }));
}

export function getMockLatestUsage(provider: number): {
  id: number;
  providerId: number;
  progress: {
    items: {
      name: string;
      usedPercent: number;
      remainingPercent?: number;
      used?: number;
      limit?: number;
      windowMinutes?: number;
      resetsAt?: string;
      resetDescription?: string;
    }[];
    cost?: {
      used: number;
      limit: number;
      remaining: number;
      currency?: string;
      period?: string;
    };
  } | null;
  identityData: Record<string, unknown> | null;
  createdAt: Date;
} | null {
  const database = getMockDatabase();
  const stmt = database.prepare(`
    SELECT * FROM mock_usage 
    WHERE provider_id = ? 
    ORDER BY id DESC 
    LIMIT 1
  `);
  
  const row = stmt.get(provider) as {
    id: number;
    provider_id: string;
    progress: string | null;
    identity_data: string | null;
    created_at: number;
  } | undefined;
  
  if (!row) return null;
  
  const parsedProgress = row.progress ? JSON.parse(row.progress) : null;
  
  let normalizedProgress: {
    items: {
      name: string;
      usedPercent: number;
      remainingPercent?: number;
      used?: number;
      limit?: number;
      windowMinutes?: number;
      resetsAt?: string;
      resetDescription?: string;
    }[];
    cost?: {
      used: number;
      limit: number;
      remaining: number;
      currency?: string;
      period?: string;
    };
  } | null = null;
  
  if (parsedProgress) {
    if (parsedProgress.items) {
      normalizedProgress = parsedProgress;
    } else if (parsedProgress.primary) {
      const items: any[] = [];
      if (parsedProgress.primary) {
        items.push({ name: 'Primary', ...parsedProgress.primary });
      }
      if (parsedProgress.secondary) {
        items.push({ name: 'Secondary', ...parsedProgress.secondary });
      }
      if (parsedProgress.tertiary) {
        items.push({ name: 'Tertiary', ...parsedProgress.tertiary });
      }
      normalizedProgress = {
        items,
        cost: parsedProgress.cost,
      };
    }
  }
  
  return {
    id: row.id,
    providerId: Number(row.provider_id),
    progress: normalizedProgress,
    identityData: row.identity_data ? JSON.parse(row.identity_data) : null,
    createdAt: fromUnixSeconds(row.created_at),
  };
}
