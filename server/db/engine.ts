import { ProviderConfig, Credential, UsageProvider, UsageSnapshot, ProgressData } from '../../src/types/index.js';

export type StoredProviderConfig = Omit<ProviderConfig, 'id'> & { id: number; uid: string };

export interface UsageRecordRow {
  id: number;
  providerId: string;
  progress: ProgressData | null;
  identityData: Record<string, unknown> | null;
  createdAt: Date;
}

export interface AuditLogRow {
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

export type ExecuteResult = {
  insertId?: number;
  affectedRows: number;
};

export interface DbClient {
  query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T[]>;
  queryOne<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T | undefined>;
  execute(sql: string, params?: unknown[]): Promise<ExecuteResult>;
  transaction<T>(fn: (tx: DbClient) => Promise<T>): Promise<T>;
}

export interface DatabaseEngine {
  init(): Promise<void>;
  saveProvider(provider: UsageProvider, config: ProviderConfig): Promise<string>;
  getAllProviders(): Promise<StoredProviderConfig[]>;
  getProvider(uid: string): Promise<StoredProviderConfig | null>;
  getFirstProviderByType(provider: UsageProvider): Promise<StoredProviderConfig | null>;
  getProviderByName(provider: UsageProvider, name: string): Promise<StoredProviderConfig | null>;
  deleteProvider(uid: string): Promise<void>;
  updateProvider(uid: string, updates: Partial<ProviderConfig> & { credentials?: Credential }): Promise<void>;
  updateProviderDisplayOrders(items: Array<{ uid: string; displayOrder: number }>): Promise<void>;
  recordUsage(uid: string, snapshot: UsageSnapshot): Promise<void>;
  recordUsageAt(uid: string, snapshot: UsageSnapshot, createdAt: Date): Promise<void>;
  recordUsageBatchAt(uid: string, entries: Array<{ snapshot: UsageSnapshot; createdAt: Date }>): Promise<void>;
  clearUsageHistory(uid: string): Promise<void>;
  getUsageHistory(uid: string, days?: number): Promise<UsageRecordRow[]>;
  getAllUsageHistory(days?: number): Promise<Map<string, UsageRecordRow[]>>;
  getLatestUsage(uid: string): Promise<UsageRecordRow | null>;
  getSetting(key: string): Promise<string | null>;
  setSetting(key: string, value: string): Promise<void>;
  recordAuditLog(entry: {
    ip?: string | null;
    method: string;
    path: string;
    statusCode: number;
    durationMs: number;
    userAgent?: string | null;
    authenticated: boolean;
    eventType?: string;
    details?: Record<string, unknown>;
  }): Promise<void>;
  getAuditLogs(limit?: number): Promise<AuditLogRow[]>;
  hasPasswordSet(): Promise<boolean>;
  setPassword(password: string): Promise<void>;
  verifyPassword(password: string): Promise<boolean>;
}
