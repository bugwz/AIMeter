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
} from './database.js';
import { runtimeConfig } from './runtime.js';
import { getAppConfig } from './config.js';
import type { AuthRole } from './auth.js';
import { AuthType, Credential, ProgressData, ProgressItem, ProviderConfig, UsageProvider, UsageSnapshot } from '../src/types/index.js';

export class ReadonlyStoreError extends Error {
  code = 'READ_ONLY_STORE';
}

export class ReadonlyAuthError extends Error {
  code = 'READ_ONLY_AUTH';
}

export class ReadonlyAdminRouteError extends Error {
  code = 'READ_ONLY_ADMIN_ROUTE';
}

export class ReadonlySecretError extends Error {
  code = 'READ_ONLY_SECRET';
}

export interface ProviderInstance extends ProviderConfig {
  id: string;
  configSource: 'database' | 'environment' | 'config';
  storageMode: 'database' | 'env';
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
  storageMode: 'database' | 'env';
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
const PBKDF2_DEFAULT_ITERATIONS = 210000;
const appConfig = getAppConfig();
const latestUsageCache = new Map<string, UsageRecordRow>();

function getConfiguredPasswordHash(role: AuthRole): string | null {
  if (role === 'normal') {
    return appConfig.auth.normalPasswordHash || null;
  }
  return appConfig.auth.adminPasswordHash || null;
}

function getConfiguredAdminRoutePath(): string | null {
  return appConfig.auth.adminRoutePath || null;
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

function toConfigExternalId(alias: string): string {
  return `cfg:${alias}`;
}

function parseConfiguredCredential(provider: UsageProvider, authType: string, raw: string): Credential {
  const parseOAuthJSONCredential = (value: string): Credential | null => {
    const trimmed = value.trim();
    if (!trimmed.startsWith('{')) return null;
    try {
      const payload = JSON.parse(trimmed) as Record<string, unknown>;
      const accessToken = typeof payload.accessToken === 'string'
        ? payload.accessToken
        : (typeof payload.access_token === 'string' ? payload.access_token : '');
      if (!accessToken) return null;
      return {
        type: AuthType.OAUTH,
        accessToken,
        refreshToken: typeof payload.refreshToken === 'string'
          ? payload.refreshToken
          : (typeof payload.refresh_token === 'string' ? payload.refresh_token : undefined),
        idToken: typeof payload.idToken === 'string'
          ? payload.idToken
          : (typeof payload.id_token === 'string' ? payload.id_token : undefined),
        expiresAt: typeof payload.expiresAt === 'string'
          ? payload.expiresAt
          : (typeof payload.expiry_date === 'string' ? payload.expiry_date : undefined),
        clientId: typeof payload.clientId === 'string'
          ? payload.clientId
          : (typeof payload.client_id === 'string' ? payload.client_id : undefined),
        clientSecret: typeof payload.clientSecret === 'string'
          ? payload.clientSecret
          : (typeof payload.client_secret === 'string' ? payload.client_secret : undefined),
        projectId: typeof payload.projectId === 'string'
          ? payload.projectId
          : (typeof payload.project_id === 'string' ? payload.project_id : undefined),
      };
    } catch {
      return null;
    }
  };

  switch (authType) {
    case AuthType.API_KEY:
      return { type: AuthType.API_KEY, value: raw, keyPrefix: raw.slice(0, 8) };
    case AuthType.OAUTH:
      if (
        provider === UsageProvider.CLAUDE
        || provider === UsageProvider.CODEX
        || provider === UsageProvider.ANTIGRAVITY
      ) {
        const parsed = parseOAuthJSONCredential(raw);
        if (parsed) return parsed;
      }
      return { type: AuthType.OAUTH, accessToken: raw };
    case AuthType.JWT:
      return { type: AuthType.JWT, value: raw };
    case AuthType.COOKIE:
    default:
      return { type: AuthType.COOKIE, value: raw, source: 'manual' };
  }
}

function listConfiguredProviders(): ProviderInstance[] {
  return appConfig.providers.map((provider, index) => ({
    id: toConfigExternalId(provider.id),
    provider: provider.provider,
    credentials: parseConfiguredCredential(provider.provider, provider.authType, provider.credential),
    refreshInterval: provider.refreshInterval,
    displayOrder: index + 1,
    region: provider.region,
    name: provider.name,
    claudeAuthMode: provider.claudeAuthMode,
    opencodeWorkspaceId: provider.opencodeWorkspaceId,
    defaultProgressItem: provider.defaultProgressItem,
    configSource: provider.source,
    storageMode: 'env',
  }));
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
    if (primary) items.push({ name: 'Primary', ...primary });
    if (secondary) items.push({ name: 'Secondary', ...secondary });
    if (tertiary) items.push({ name: 'Tertiary', ...tertiary });
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
    if (runtimeConfig.storageMode === 'env') {
      return getConfiguredPasswordHash(role);
    }
    return getDbSetting(getPasswordSettingKey(role));
  },

  async getAdminRoutePath(): Promise<string | null> {
    if (runtimeConfig.storageMode === 'env') {
      return getConfiguredAdminRoutePath();
    }
    return getDbSetting(ADMIN_ROUTE_PATH_KEY);
  },

  async setAdminRoutePath(value: string): Promise<void> {
    if (runtimeConfig.isReadonlyAuth) {
      throw new ReadonlyAdminRouteError('Admin route path is managed by environment variables');
    }
    await setDbSetting(ADMIN_ROUTE_PATH_KEY, value);
  },

  async getCronSecret(): Promise<string | null> {
    if (runtimeConfig.storageMode === 'database') {
      return getDbSetting(CRON_SECRET_KEY);
    }
    return getAppConfig().auth.cronSecret?.trim() || null;
  },

  async getEndpointSecret(): Promise<string | null> {
    if (runtimeConfig.storageMode === 'database') {
      return getDbSetting(ENDPOINT_SECRET_KEY);
    }
    return getAppConfig().auth.endpointSecret?.trim() || null;
  },

  async resetCronSecret(): Promise<string> {
    if (runtimeConfig.storageMode !== 'database') {
      throw new ReadonlySecretError('Not editable in env mode; modify config and restart.');
    }
    const secret = crypto.randomBytes(16).toString('hex');
    await setDbSetting(CRON_SECRET_KEY, secret);
    return secret;
  },

  async resetEndpointSecret(): Promise<string> {
    if (runtimeConfig.storageMode !== 'database') {
      throw new ReadonlySecretError('Not editable in env mode; modify config and restart.');
    }
    const secret = crypto.randomBytes(16).toString('hex');
    await setDbSetting(ENDPOINT_SECRET_KEY, secret);
    return secret;
  },

  async isInitialSetupRequired(): Promise<boolean> {
    if (runtimeConfig.storageMode !== 'database') {
      return false;
    }
    return !(await storage.getPasswordHash('normal')) || !(await storage.getPasswordHash('admin')) || !(await storage.getAdminRoutePath());
  },

  async listProviders(): Promise<ProviderInstance[]> {
    return runtimeConfig.storageMode === 'env' ? listConfiguredProviders() : listDbProviders();
  },

  async getProvider(id: string): Promise<ProviderInstance | null> {
    if (runtimeConfig.storageMode === 'env') {
      return listConfiguredProviders().find((provider) => provider.id === id) || null;
    }

    const row = await getDbProvider(id);
    return row ? mapDbProvider(row) : null;
  },

  async getProviderByName(provider: UsageProvider, name: string): Promise<ProviderInstance | null> {
    if (runtimeConfig.storageMode === 'env') {
      return listConfiguredProviders().find((item) => item.provider === provider && item.name === name) || null;
    }

    const row = await getDbProviderByName(provider, name);
    return row ? mapDbProvider(row) : null;
  },

  async createProvider(provider: UsageProvider, config: ProviderConfig): Promise<ProviderInstance> {
    if (runtimeConfig.isReadonlyConfig) {
      throw new ReadonlyStoreError('Provider configuration is managed by environment variables');
    }

    const uid = await saveDbProvider(provider, config);
    const created = await getDbProvider(uid);
    if (!created) {
      throw new Error('Failed to load created provider');
    }
    return mapDbProvider(created);
  },

  async updateProvider(id: string, updates: Partial<ProviderConfig> & { credentials?: Credential }): Promise<ProviderInstance> {
    if (runtimeConfig.isReadonlyConfig) {
      throw new ReadonlyStoreError('Provider configuration is managed by environment variables');
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
      throw new ReadonlyStoreError('Provider configuration is managed by environment variables');
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
      throw new ReadonlyStoreError('Provider configuration is managed by environment variables');
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
    if (runtimeConfig.storageMode === 'env') {
      return null;
    }
    return getDbSetting(key);
  },

  async patchProviderAttrs(id: string, patch: Record<string, unknown>): Promise<void> {
    if (runtimeConfig.storageMode === 'env') return;
    await patchDbProviderAttrs(id, patch);
  },

  async patchFetchState(id: string, patch: Record<string, unknown>): Promise<void> {
    if (runtimeConfig.storageMode === 'env') return;
    await patchDbFetchState(id, patch);
  },

  async setSetting(key: string, value: string): Promise<void> {
    if (runtimeConfig.storageMode === 'env') {
      if (Object.values(ROLE_PASSWORD_KEYS).includes(key as (typeof ROLE_PASSWORD_KEYS)[AuthRole])) {
        throw new ReadonlyAuthError('Authentication is managed by environment variables');
      }
      if (key === ADMIN_ROUTE_PATH_KEY) {
        throw new ReadonlyAdminRouteError('Admin route path is managed by environment variables');
      }
      throw new ReadonlyStoreError('Settings are not writable in env storage mode');
    }
    await setDbSetting(key, value);
  },

  async hasPasswordSet(): Promise<boolean> {
    return Boolean((await storage.getPasswordHash('normal')) || (await storage.getPasswordHash('admin')));
  },

  async setPassword(role: AuthRole, password: string): Promise<void> {
    if (runtimeConfig.isReadonlyAuth) {
      throw new ReadonlyAuthError('Authentication is managed by environment variables');
    }
    await setDbSetting(getPasswordSettingKey(role), hashPassword(password));
  },

  async verifyPassword(role: AuthRole, password: string): Promise<boolean> {
    const hash = await storage.getPasswordHash(role);
    if (!hash) return false;
    return verifyHashedPassword(password, hash);
  },

  async getAuditLogs(limit: number) {
    if (runtimeConfig.storageMode === 'env') {
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
    if (runtimeConfig.storageMode === 'env') {
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
    || error instanceof ReadonlySecretError
  ) {
    return {
      code: error.code,
      message: error.message,
    };
  }

  return null;
}
