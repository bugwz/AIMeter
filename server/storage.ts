import crypto from 'crypto';
import {
  getAllProviders as getDbProviders,
  getProvider as getDbProvider,
  getProviderByName as getDbProviderByName,
  saveProvider as saveDbProvider,
  updateProvider as updateDbProvider,
  updateProviderDisplayOrders as updateDbProviderDisplayOrders,
  deleteProvider as deleteDbProvider,
  recordUsage as recordDbUsage,
  recordUsageAt as recordDbUsageAt,
  recordUsageBatchAt as recordDbUsageBatchAt,
  clearUsageHistory as clearDbUsageHistory,
  getUsageHistory as getDbUsageHistory,
  getAllUsageHistory as getDbAllUsageHistory,
  getLatestUsage as getDbLatestUsage,
  getSetting as getDbSetting,
  setSetting as setDbSetting,
  getAuditLogs as getDbAuditLogs,
  recordAuditLog as recordDbAuditLog,
  patchProviderAttrs as patchDbProviderAttrs,
  patchFetchState as patchDbFetchState,
  isDatabaseInitialized,
} from './database.js';
import { runtimeConfig } from './runtime.js';
import type { AuthRole } from './auth.js';
import { Credential, ProgressData, ProgressItem, ProviderConfig, UsageProvider, UsageSnapshot } from '../src/types/index.js';

export class ReadonlyStoreError extends Error {
  code = 'READ_ONLY_STORE';
}

export class ReadonlyAuthError extends Error {
  code = 'READ_ONLY_AUTH';
}

export class ReadonlyAdminRouteError extends Error {
  code = 'READ_ONLY_ADMIN_ROUTE';
}

export interface ProviderInstance extends ProviderConfig {
  id: string;
  configSource: 'database';
  storageMode: 'database';
  fetchState?: Record<string, unknown>;
}

export interface UsageRecordRow {
  id: number;
  providerId: string;
  progress: ProgressData | null;
  identityData: Record<string, unknown> | null;
  createdAt: Date;
}

export interface RuntimeCapabilities {
  viewerRole: AuthRole;
  storageMode: 'database';
  mockEnabled: boolean;
  providerConfigMutable: boolean;
  auth: Record<AuthRole, {
    enabled: boolean;
    needsSetup: boolean;
    mutable: boolean;
  }>;
  ui: {
    showSettings: boolean;
    showCredentialValues: boolean;
    allowProviderCreate: boolean;
    allowProviderEdit: boolean;
    allowProviderDelete: boolean;
    allowProviderReorder: boolean;
    allowManualRefresh: boolean;
  };
  history: {
    enabled: boolean;
    persisted: boolean;
    mode: 'database' | 'disabled';
  };
  secrets: {
    managedInDb: boolean;
    mutable: boolean;
  };
}

const ROLE_PASSWORD_KEYS: Record<AuthRole, string> = {
  normal: 'normal_password_hash',
  admin: 'admin_password_hash',
};
const ADMIN_ROUTE_PATH_KEY = 'admin_route_path';
const CRON_SECRET_KEY = 'cron_secret';
const ENDPOINT_SECRET_KEY = 'endpoint_secret';
const PASSWORD_SCHEME = 'pbkdf2_sha256';
const PBKDF2_KEYLEN = 32;
const PBKDF2_DEFAULT_ITERATIONS = 100000;
const latestUsageCache = new Map<string, UsageRecordRow>();

function normalizeAdminRoutePath(value: string | null | undefined): string | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim().replace(/^\/+|\/+$/g, '');
  return normalized || null;
}

function getPasswordSettingKey(role: AuthRole): string {
  return ROLE_PASSWORD_KEYS[role];
}

function safeEqual(a: string, b: string): boolean {
  const aBuffer = Buffer.from(a, 'utf8');
  const bBuffer = Buffer.from(b, 'utf8');
  if (aBuffer.length !== bBuffer.length) return false;
  return crypto.timingSafeEqual(aBuffer, bBuffer);
}

function verifyHashedPassword(password: string, storedHash: string): boolean {
  const parts = storedHash.split('$');
  if (parts.length === 4 && parts[0] === PASSWORD_SCHEME) {
    const iterations = Number(parts[1]) || PBKDF2_DEFAULT_ITERATIONS;
    const salt = parts[2];
    const storedDigest = parts[3];
    const candidate = crypto
      .pbkdf2Sync(password, salt, iterations, PBKDF2_KEYLEN, 'sha256')
      .toString('base64url');
    return safeEqual(candidate, storedDigest);
  }

  const legacyHash = crypto.createHash('sha256').update(password).digest('hex');
  return safeEqual(legacyHash, storedHash);
}

function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('base64url');
  const digest = crypto
    .pbkdf2Sync(password, salt, PBKDF2_DEFAULT_ITERATIONS, PBKDF2_KEYLEN, 'sha256')
    .toString('base64url');
  return `${PASSWORD_SCHEME}$${PBKDF2_DEFAULT_ITERATIONS}$${salt}$${digest}`;
}

function mapDbProvider({ id: _internalId, uid, ...rest }: Omit<ProviderConfig, 'id'> & { id: number; uid: string; fetchState?: Record<string, unknown> }): ProviderInstance {
  return {
    ...rest,
    id: uid,
    fetchState: rest.fetchState,
    configSource: 'database',
    storageMode: 'database',
  };
}

function normalizeSnapshot(snapshot: UsageSnapshot): UsageRecordRow {
  const items: ProgressItem[] = [];
  if (Array.isArray(snapshot.progress) && snapshot.progress.length > 0) {
    items.push(...snapshot.progress);
  } else {
    const legacy = snapshot as UsageSnapshot & Record<string, unknown>;
    const primary = legacy.primary as ProgressItem | undefined;
    const secondary = legacy.secondary as ProgressItem | undefined;
    const tertiary = legacy.tertiary as ProgressItem | undefined;
    if (primary) {
      const { name: _name, ...rest } = primary;
      items.push({ name: 'Primary', ...rest });
    }
    if (secondary) {
      const { name: _name, ...rest } = secondary;
      items.push({ name: 'Secondary', ...rest });
    }
    if (tertiary) {
      const { name: _name, ...rest } = tertiary;
      items.push({ name: 'Tertiary', ...rest });
    }
  }

  return {
    id: Date.now(),
    providerId: '',
    progress: {
      items,
      cost: snapshot.cost,
    },
    identityData: snapshot.identity ? { ...snapshot.identity } : null,
    createdAt: snapshot.updatedAt,
  };
}

function setLatestUsage(providerId: string, snapshot: UsageSnapshot): void {
  const record = normalizeSnapshot(snapshot);
  record.providerId = providerId;
  latestUsageCache.set(providerId, record);
}

function hasPersistableProgress(snapshot: UsageSnapshot): boolean {
  if (Array.isArray(snapshot.progress) && snapshot.progress.length > 0) {
    return true;
  }

  const legacy = snapshot as UsageSnapshot & Record<string, unknown>;
  return Boolean(legacy.primary || legacy.secondary || legacy.tertiary);
}

async function listDbProviders(): Promise<ProviderInstance[]> {
  const providers = await getDbProviders();
  return providers.map(mapDbProvider);
}

async function hasInitializedDatabaseSchema(): Promise<boolean> {
  return isDatabaseInitialized();
}

async function getCapabilities(viewerRole: AuthRole): Promise<RuntimeCapabilities> {
  const normalHash = await storage.getPasswordHash('normal');
  const adminHash = await storage.getPasswordHash('admin');
  const isAdmin = viewerRole === 'admin';
  const authMutable = !runtimeConfig.isReadonlyAuth;
  return {
    viewerRole,
    storageMode: runtimeConfig.storageMode,
    mockEnabled: runtimeConfig.mockEnabled,
    providerConfigMutable: isAdmin && !runtimeConfig.isReadonlyConfig,
    auth: {
      normal: {
        enabled: !!normalHash,
        needsSetup: !normalHash,
        mutable: authMutable,
      },
      admin: {
        enabled: !!adminHash,
        needsSetup: !adminHash,
        mutable: authMutable,
      },
    },
    ui: {
      showSettings: isAdmin,
      showCredentialValues: isAdmin,
      allowProviderCreate: isAdmin && !runtimeConfig.isReadonlyConfig,
      allowProviderEdit: isAdmin && !runtimeConfig.isReadonlyConfig,
      allowProviderDelete: isAdmin && !runtimeConfig.isReadonlyConfig,
      allowProviderReorder: isAdmin && !runtimeConfig.isReadonlyConfig,
      allowManualRefresh: isAdmin,
    },
    history: {
      enabled: runtimeConfig.historyMode !== 'disabled',
      persisted: runtimeConfig.historyMode === 'database',
      mode: runtimeConfig.historyMode,
    },
    secrets: {
      managedInDb: runtimeConfig.storageMode === 'database',
      mutable: runtimeConfig.storageMode === 'database',
    },
  };
}

export const storage = {
  getCapabilities,

  async getPasswordHash(role: AuthRole): Promise<string | null> {
    if (!await hasInitializedDatabaseSchema()) {
      return null;
    }
    return getDbSetting(getPasswordSettingKey(role));
  },

  async getAdminRoutePath(): Promise<string | null> {
    if (!await hasInitializedDatabaseSchema()) {
      return null;
    }
    return normalizeAdminRoutePath(await getDbSetting(ADMIN_ROUTE_PATH_KEY));
  },

  async setAdminRoutePath(value: string): Promise<void> {
    if (runtimeConfig.isReadonlyAuth) {
      throw new ReadonlyAdminRouteError('Admin route path is currently read-only');
    }
    const normalized = normalizeAdminRoutePath(value);
    if (!normalized) {
      throw new ReadonlyAdminRouteError('Admin route path cannot be empty');
    }
    await setDbSetting(ADMIN_ROUTE_PATH_KEY, normalized);
  },

  async getCronSecret(): Promise<string | null> {
    if (!await hasInitializedDatabaseSchema()) {
      return null;
    }
    return getDbSetting(CRON_SECRET_KEY);
  },

  async getEndpointSecret(): Promise<string | null> {
    if (!await hasInitializedDatabaseSchema()) {
      return null;
    }
    return getDbSetting(ENDPOINT_SECRET_KEY);
  },

  async resetCronSecret(): Promise<string> {
    const secret = crypto.randomBytes(16).toString('hex');
    await setDbSetting(CRON_SECRET_KEY, secret);
    return secret;
  },

  async resetEndpointSecret(): Promise<string> {
    const secret = crypto.randomBytes(16).toString('hex');
    await setDbSetting(ENDPOINT_SECRET_KEY, secret);
    return secret;
  },

  async isInitialSetupRequired(): Promise<boolean> {
    if (!await hasInitializedDatabaseSchema()) {
      return true;
    }
    return !(await storage.getPasswordHash('normal')) || !(await storage.getPasswordHash('admin')) || !(await storage.getAdminRoutePath());
  },

  async listProviders(): Promise<ProviderInstance[]> {
    return listDbProviders();
  },

  async getProvider(id: string): Promise<ProviderInstance | null> {
    const row = await getDbProvider(id);
    return row ? mapDbProvider(row) : null;
  },

  async getProviderByName(provider: UsageProvider, name: string): Promise<ProviderInstance | null> {
    const row = await getDbProviderByName(provider, name);
    return row ? mapDbProvider(row) : null;
  },

  async createProvider(provider: UsageProvider, config: ProviderConfig): Promise<ProviderInstance> {
    if (runtimeConfig.isReadonlyConfig) {
      throw new ReadonlyStoreError('Provider configuration is currently read-only');
    }

    const uid = await saveDbProvider(provider, config);
    try {
      const created = await getDbProvider(uid);
      if (!created) {
        throw new Error('Failed to load created provider');
      }
      return mapDbProvider(created);
    } catch (error) {
      // Avoid "write succeeded but API returned 500" partial success semantics.
      // If post-insert read fails (e.g. decrypt/compat issues), remove the inserted row.
      try {
        await deleteDbProvider(uid);
      } catch {
        // Keep the original error as primary signal.
      }
      throw error;
    }
  },

  async updateProvider(id: string, updates: Partial<ProviderConfig> & { credentials?: Credential }): Promise<ProviderInstance> {
    if (runtimeConfig.isReadonlyConfig) {
      throw new ReadonlyStoreError('Provider configuration is currently read-only');
    }

    await updateDbProvider(id, updates);
    const updated = await getDbProvider(id);
    if (!updated) {
      throw new Error('Provider not found');
    }
    return mapDbProvider(updated);
  },

  async updateProviderOrder(idsInOrder: string[]): Promise<ProviderInstance[]> {
    if (runtimeConfig.isReadonlyConfig) {
      throw new ReadonlyStoreError('Provider configuration is currently read-only');
    }

    const currentProviders = await listDbProviders();
    if (idsInOrder.length === 0) {
      throw new Error('Provider order cannot be empty');
    }

    const uniqueIds = new Set(idsInOrder);
    if (uniqueIds.size !== idsInOrder.length) {
      throw new Error('Provider order contains duplicate ids');
    }

    if (currentProviders.length !== idsInOrder.length) {
      throw new Error('Provider order must include all providers');
    }

    const providerMap = new Map(currentProviders.map((provider) => [provider.id, provider]));
    idsInOrder.forEach((id) => {
      if (!providerMap.has(id)) {
        throw new Error(`Unknown provider id: ${id}`);
      }
    });

    const updates = idsInOrder.map((uid, index) => ({
      uid,
      displayOrder: index + 1,
    }));

    await updateDbProviderDisplayOrders(updates);
    return listDbProviders();
  },

  async deleteProvider(id: string): Promise<void> {
    if (runtimeConfig.isReadonlyConfig) {
      throw new ReadonlyStoreError('Provider configuration is currently read-only');
    }

    await deleteDbProvider(id);
  },

  async recordUsage(id: string, snapshot: UsageSnapshot): Promise<void> {
    if (!hasPersistableProgress(snapshot)) {
      return;
    }

    if (runtimeConfig.historyMode === 'database') {
      await recordDbUsage(id, snapshot);
      setLatestUsage(id, snapshot);
      return;
    }
    setLatestUsage(id, snapshot);
  },

  async recordUsageAt(id: string, snapshot: UsageSnapshot, createdAt: Date): Promise<void> {
    if (!hasPersistableProgress(snapshot)) {
      return;
    }

    if (runtimeConfig.historyMode === 'database') {
      await recordDbUsageAt(id, snapshot, createdAt);
    }
  },

  async recordUsageBatchAt(id: string, entries: Array<{ snapshot: UsageSnapshot; createdAt: Date }>): Promise<void> {
    if (entries.length === 0) {
      return;
    }

    if (runtimeConfig.historyMode !== 'database') {
      return;
    }

    const validEntries = entries.filter((entry) => hasPersistableProgress(entry.snapshot));
    if (validEntries.length === 0) {
      return;
    }

    await recordDbUsageBatchAt(id, validEntries);
  },

  async clearUsageHistory(id: string): Promise<void> {
    if (runtimeConfig.historyMode !== 'database') {
      return;
    }

    await clearDbUsageHistory(id);
  },

  async getUsageHistory(id: string, days: number = 30): Promise<UsageRecordRow[]> {
    if (runtimeConfig.historyMode === 'disabled') return [];

    if (runtimeConfig.historyMode === 'database') {
      return (await getDbUsageHistory(id, days)).map((row) => ({
        ...row,
        providerId: id,
      }));
    }

    void id;
    void days;
    return [];
  },

  async getAllUsageHistory(days: number = 30): Promise<Record<string, UsageRecordRow[]>> {
    if (runtimeConfig.historyMode === 'disabled') return {};

    if (runtimeConfig.historyMode === 'database') {
      const data = await getDbAllUsageHistory(days);
      const result: Record<string, UsageRecordRow[]> = {};
      for (const [uid, rows] of data.entries()) {
        result[uid] = rows.map((row) => ({ ...row, providerId: uid }));
      }
      return result;
    }

    void days;
    return {};
  },

  async getLatestUsage(id: string): Promise<UsageRecordRow | null> {
    if (runtimeConfig.historyMode === 'database') {
      const row = await getDbLatestUsage(id);
      return row ? { ...row, providerId: id } : null;
    }
    return latestUsageCache.get(id) || null;
  },

  async getSetting(key: string): Promise<string | null> {
    if (!await hasInitializedDatabaseSchema()) {
      return null;
    }
    return getDbSetting(key);
  },

  async patchProviderAttrs(id: string, patch: Record<string, unknown>): Promise<void> {
    await patchDbProviderAttrs(id, patch);
  },

  async patchFetchState(id: string, patch: Record<string, unknown>): Promise<void> {
    await patchDbFetchState(id, patch);
  },

  async setSetting(key: string, value: string): Promise<void> {
    await setDbSetting(key, value);
  },

  async hasPasswordSet(): Promise<boolean> {
    return Boolean((await storage.getPasswordHash('normal')) || (await storage.getPasswordHash('admin')));
  },

  async setPassword(role: AuthRole, password: string): Promise<void> {
    if (runtimeConfig.isReadonlyAuth) {
      throw new ReadonlyAuthError('Authentication is currently read-only');
    }
    await setDbSetting(getPasswordSettingKey(role), hashPassword(password));
  },

  async verifyPassword(role: AuthRole, password: string): Promise<boolean> {
    if (!await hasInitializedDatabaseSchema()) {
      return false;
    }
    const hash = await storage.getPasswordHash(role);
    if (!hash) return false;
    return verifyHashedPassword(password, hash);
  },

  async getAuditLogs(limit: number) {
    if (!await hasInitializedDatabaseSchema()) {
      return [];
    }
    return getDbAuditLogs(limit);
  },

  async recordAuditLog(entry: {
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
    if (!await hasInitializedDatabaseSchema()) {
      return;
    }
    await recordDbAuditLog(entry);
  },
};

export function tryParseReadonlyError(error: unknown): { code: string; message: string } | null {
  if (
    error instanceof ReadonlyStoreError
    || error instanceof ReadonlyAuthError
    || error instanceof ReadonlyAdminRouteError
  ) {
    return {
      code: error.code,
      message: error.message,
    };
  }

  return null;
}
