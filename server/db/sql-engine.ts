import crypto from 'crypto';
import {
  AuthType,
  Credential,
  ProgressData,
  ProgressItem,
  ProviderConfig,
  UsageProvider,
  UsageSnapshot,
} from '../../src/types/index.js';
import type { AuditLogRow, DatabaseEngine, DbClient, StoredProviderConfig, UsageRecordRow } from './engine.js';

type EngineType = 'sqlite' | 'postgres' | 'mysql';

interface DbProviderRow {
  id: number;
  uid: string | null;
  provider: string;
  name: string | null;
  key: string;
  refresh_interval: number;
  display_order: number;
  attrs: unknown;
  created_at: number;
  updated_at: number;
}

export function generateProviderUid(): string {
  // 128-bit: 42 bits millisecond timestamp | 86 bits random
  const ts = BigInt(Date.now()) & 0x3FFFFFFFFFFn; // 42 bits
  const randHigh = BigInt(Math.floor(Math.random() * 0x400000)); // 22 bits
  const randLow = (BigInt(Math.floor(Math.random() * 0x100000000)) << 32n)
                | BigInt(Math.floor(Math.random() * 0x100000000)); // 64 bits
  const uid = (ts << 86n) | (randHigh << 64n) | randLow;
  return uid.toString(16).padStart(32, '0');
}

interface DbUsageRow {
  id: number;
  provider_id: number;
  progress: string | null;
  identity_data: string | null;
  created_at: number;
}

interface DbAuditRow {
  id: number;
  timestamp: number;
  ip: string | null;
  method: string;
  path: string;
  status_code: number;
  duration_ms: number;
  user_agent: string | null;
  authenticated: number | boolean;
  event_type: string;
  details: string | null;
}

function deriveClaudeAuthMode(
  provider: UsageProvider,
  credentials: Credential
): ProviderConfig['claudeAuthMode'] {
  if (provider !== UsageProvider.CLAUDE) return undefined;
  if (credentials.type === AuthType.OAUTH) return 'oauth';
  if (credentials.type === AuthType.COOKIE) return 'cookie';
  return undefined;
}

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
  if (typeof raw === 'object' && !Array.isArray(raw)) {
    return raw as Record<string, unknown>;
  }
  return {};
}

function buildProviderAttrs(config: Partial<ProviderConfig>): Record<string, unknown> {
  const attrs: Record<string, unknown> = {
    ...((config.attrs && typeof config.attrs === 'object' && !Array.isArray(config.attrs)) ? config.attrs : {}),
  };

  if (config.region) attrs.region = config.region;
  else delete attrs.region;

  if (config.opencodeWorkspaceId) attrs.opencodeWorkspaceId = config.opencodeWorkspaceId;
  else delete attrs.opencodeWorkspaceId;

  if (config.defaultProgressItem) attrs.defaultProgressItem = config.defaultProgressItem;
  else delete attrs.defaultProgressItem;

  return attrs;
}

function toUnixSeconds(value?: Date | number | string): number {
  if (value instanceof Date) return Math.floor(value.getTime() / 1000);
  if (typeof value === 'number') return value > 1_000_000_000_000 ? Math.floor(value / 1000) : Math.floor(value);
  if (typeof value === 'string') {
    const numeric = Number(value);
    if (Number.isFinite(numeric)) return numeric > 1_000_000_000_000 ? Math.floor(numeric / 1000) : Math.floor(numeric);
    const parsed = Date.parse(value);
    if (Number.isFinite(parsed)) return Math.floor(parsed / 1000);
  }
  return Math.floor(Date.now() / 1000);
}

function toUnixSecondsValue(value: Date | number | string | undefined): number | undefined {
  if (value === undefined || value === null) return undefined;
  return toUnixSeconds(value);
}

function fromUnixSeconds(value: number | string | null | undefined): Date {
  return new Date(toUnixSeconds(value ?? Date.now()) * 1000);
}

function hasProgressItems(progressJson: string | null): boolean {
  if (!progressJson) return false;
  try {
    const parsed = JSON.parse(progressJson) as { items?: unknown[] };
    return Array.isArray(parsed.items) && parsed.items.length > 0;
  } catch {
    return false;
  }
}

function safeEqual(a: string, b: string): boolean {
  const aBuffer = Buffer.from(a, 'utf8');
  const bBuffer = Buffer.from(b, 'utf8');
  if (aBuffer.length !== bBuffer.length) return false;
  return crypto.timingSafeEqual(aBuffer, bBuffer);
}

const PASSWORD_KEY = 'password_hash';
const PASSWORD_SCHEME = 'pbkdf2_sha256';
const PBKDF2_ITERATIONS = 210000;
const PBKDF2_KEYLEN = 32;

function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('base64url');
  const digest = crypto
    .pbkdf2Sync(password, salt, PBKDF2_ITERATIONS, PBKDF2_KEYLEN, 'sha256')
    .toString('base64url');
  return `${PASSWORD_SCHEME}$${PBKDF2_ITERATIONS}$${salt}$${digest}`;
}

function verifyHashedPassword(password: string, storedHash: string): boolean {
  const parts = storedHash.split('$');

  if (parts.length === 4 && parts[0] === PASSWORD_SCHEME) {
    const iterations = Number(parts[1]);
    const salt = parts[2];
    const storedDigest = parts[3];

    if (!Number.isFinite(iterations) || iterations <= 0) return false;

    const candidate = crypto
      .pbkdf2Sync(password, salt, iterations, PBKDF2_KEYLEN, 'sha256')
      .toString('base64url');
    return safeEqual(candidate, storedDigest);
  }

  const legacyHash = crypto.createHash('sha256').update(password).digest('hex');
  return safeEqual(legacyHash, storedHash);
}

export async function runCommonBootstrap(client: DbClient, usageTable: string = 'usage_records'): Promise<void> {
  const missingOrders = await client.query<{ id: number }>(
    'SELECT id FROM providers WHERE display_order IS NULL OR display_order <= 0 ORDER BY id ASC'
  );

  if (missingOrders.length > 0) {
    await client.transaction(async (tx) => {
      for (let i = 0; i < missingOrders.length; i += 1) {
        await tx.execute('UPDATE providers SET display_order = ?, updated_at = ? WHERE id = ?', [i + 1, toUnixSeconds(), missingOrders[i].id]);
      }
    });
  }

  await client.execute(`DELETE FROM ${usageTable} WHERE provider_id IN (SELECT id FROM providers WHERE provider = 'factory')`);
  await client.execute("DELETE FROM providers WHERE provider = 'factory'");

  // Backfill uid for any existing providers that don't have one yet
  const missingUids = await client.query<{ id: number }>(
    'SELECT id FROM providers WHERE uid IS NULL ORDER BY id ASC'
  );
  if (missingUids.length > 0) {
    await client.transaction(async (tx) => {
      for (const row of missingUids) {
        await tx.execute('UPDATE providers SET uid = ? WHERE id = ?', [generateProviderUid(), row.id]);
      }
    });
  }

  // Auto-generate cron_secret and endpoint_secret if not yet present
  for (const key of ['cron_secret', 'endpoint_secret']) {
    const existing = await client.query<{ value: string }>(
      'SELECT value FROM settings WHERE key = ?', [key]
    );
    if (existing.length === 0) {
      const secret = crypto.randomBytes(32).toString('hex');
      const now = Math.floor(Date.now() / 1000);
      await client.execute(
        'INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?)',
        [key, secret, now]
      );
    }
  }
}

export class SqlEngine implements DatabaseEngine {
  private readonly encryptionKey: Buffer;

  constructor(
    private readonly client: DbClient,
    private readonly engine: EngineType,
    encryptionSecret?: string,
  ) {
    if (!encryptionSecret || !encryptionSecret.trim()) {
      throw new Error('AIMETER_ENCRYPTION_KEY is required when database storage is enabled.');
    }
    const secret = encryptionSecret.trim();
    this.encryptionKey = crypto.createHash('sha256').update(secret).digest();
  }

  private usageTable(): string {
    return this.engine === 'mysql' ? '`usage_records`' : 'usage_records';
  }

  private providersTable(): string {
    return 'providers';
  }

  private settingsTable(): string {
    return 'settings';
  }

  private auditLogsTable(): string {
    return 'audit_logs';
  }

  private providerKeyColumn(): string {
    return this.engine === 'mysql' ? '`key`' : 'key';
  }

  private settingsKeyColumn(): string {
    return this.engine === 'mysql' ? '`key`' : 'key';
  }

  async init(): Promise<void> {
    return;
  }

  private encrypt(text: string): string {
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv('aes-256-cbc', this.encryptionKey, iv);
    let encrypted = cipher.update(text, 'utf-8', 'base64');
    encrypted += cipher.final('base64');
    return JSON.stringify({ iv: iv.toString('base64'), data: encrypted });
  }

  private decrypt(encryptedStr: string): string {
    try {
      const payload = JSON.parse(encryptedStr) as { iv?: string; data?: string };
      if (!payload || typeof payload.iv !== 'string' || typeof payload.data !== 'string') {
        throw new Error('Invalid encrypted credential payload');
      }
      const decipher = crypto.createDecipheriv('aes-256-cbc', this.encryptionKey, Buffer.from(payload.iv, 'base64'));
      let decrypted = decipher.update(payload.data, 'base64', 'utf-8');
      decrypted += decipher.final('utf-8');
      return decrypted;
    } catch {
      throw new Error('Failed to decrypt stored credentials');
    }
  }

  private mapProviderRow(row: DbProviderRow): StoredProviderConfig {
    const attrs = parseProviderAttrs(row.attrs);
    const credentials = JSON.parse(this.decrypt(row.key));
    return {
      id: Number(row.id),
      uid: row.uid || '',
      provider: row.provider as UsageProvider,
      credentials: credentials as Credential,
      refreshInterval: Number(row.refresh_interval),
      displayOrder: Number(row.display_order),
      attrs,
      region: typeof attrs.region === 'string' ? attrs.region : undefined,
      name: row.name || undefined,
      claudeAuthMode: deriveClaudeAuthMode(row.provider as UsageProvider, credentials as Credential),
      opencodeWorkspaceId: typeof attrs.opencodeWorkspaceId === 'string' ? attrs.opencodeWorkspaceId : undefined,
      defaultProgressItem: typeof attrs.defaultProgressItem === 'string' ? attrs.defaultProgressItem : undefined,
    };
  }

  private mapUsageRow(row: DbUsageRow): UsageRecordRow {
    return {
      id: Number(row.id),
      providerId: String(row.provider_id),
      progress: row.progress ? JSON.parse(row.progress) : null,
      identityData: row.identity_data ? JSON.parse(row.identity_data) : null,
      createdAt: fromUnixSeconds(row.created_at),
    };
  }

  private buildProgressData(snapshot: UsageSnapshot): ProgressData {
    const items: ProgressItem[] = [];

    if (snapshot.progress && snapshot.progress.length > 0) {
      items.push(...snapshot.progress);
    } else {
      const legacy = snapshot as UsageSnapshot & Record<string, unknown>;
      if (legacy.primary) items.push({ name: 'Primary', ...(legacy.primary as object) } as ProgressItem);
      if (legacy.secondary) items.push({ name: 'Secondary', ...(legacy.secondary as object) } as ProgressItem);
      if (legacy.tertiary) items.push({ name: 'Tertiary', ...(legacy.tertiary as object) } as ProgressItem);
    }

    return {
      items: items.map((item) => ({
        ...item,
        ...(item.resetsAt ? { resetsAt: toUnixSecondsValue(item.resetsAt as unknown as Date | number | string) as unknown as Date } : {}),
      })),
      cost: snapshot.cost,
    };
  }

  async saveProvider(provider: UsageProvider, config: ProviderConfig): Promise<string> {
    const uid = generateProviderUid();
    const encryptedKey = this.encrypt(JSON.stringify(config.credentials));
    const attrs = buildProviderAttrs(config);
    const now = toUnixSeconds();
    const maxOrderRow = await this.client.queryOne<{ maxOrder: number | null }>(`SELECT COALESCE(MAX(display_order), 0) AS maxOrder FROM ${this.providersTable()}`);
    const maxOrder = Number(maxOrderRow?.maxOrder || 0);

    if (this.engine === 'postgres') {
      await this.client.execute(
        `INSERT INTO ${this.providersTable()} (uid, provider, name, ${this.providerKeyColumn()}, refresh_interval, display_order, attrs, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          uid,
          provider,
          config.name || null,
          encryptedKey,
          config.refreshInterval,
          config.displayOrder || maxOrder + 1,
          JSON.stringify(attrs),
          now,
          now,
        ]
      );
      return uid;
    }

    await this.client.execute(
      `INSERT INTO ${this.providersTable()} (uid, provider, name, ${this.providerKeyColumn()}, refresh_interval, display_order, attrs, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        uid,
        provider,
        config.name || null,
        encryptedKey,
        config.refreshInterval,
        config.displayOrder || maxOrder + 1,
        JSON.stringify(attrs),
        now,
        now,
      ]
    );

    return uid;
  }

  async getAllProviders(): Promise<StoredProviderConfig[]> {
    const rows = await this.client.query<DbProviderRow>(`SELECT * FROM ${this.providersTable()} ORDER BY display_order ASC, id ASC`);
    return rows.map((row) => this.mapProviderRow(row));
  }

  async getProvider(uid: string): Promise<StoredProviderConfig | null> {
    const row = await this.client.queryOne<DbProviderRow>(`SELECT * FROM ${this.providersTable()} WHERE uid = ?`, [uid]);
    return row ? this.mapProviderRow(row) : null;
  }

  async getFirstProviderByType(provider: UsageProvider): Promise<StoredProviderConfig | null> {
    const row = await this.client.queryOne<DbProviderRow>(`SELECT * FROM ${this.providersTable()} WHERE provider = ? ORDER BY display_order ASC, id ASC LIMIT 1`, [provider]);
    return row ? this.mapProviderRow(row) : null;
  }

  async getProviderByName(provider: UsageProvider, name: string): Promise<StoredProviderConfig | null> {
    const row = await this.client.queryOne<DbProviderRow>(`SELECT * FROM ${this.providersTable()} WHERE provider = ? AND name = ?`, [provider, name]);
    return row ? this.mapProviderRow(row) : null;
  }

  async deleteProvider(uid: string): Promise<void> {
    await this.client.transaction(async (tx) => {
      const existing = await tx.queryOne<{ display_order: number }>(`SELECT display_order FROM ${this.providersTable()} WHERE uid = ?`, [uid]);
      if (!existing) return;
      await tx.execute(`DELETE FROM ${this.providersTable()} WHERE uid = ?`, [uid]);
      await tx.execute(`UPDATE ${this.providersTable()} SET display_order = display_order - 1, updated_at = ? WHERE display_order > ?`, [toUnixSeconds(), existing.display_order]);
    });
  }

  async updateProvider(uid: string, updates: Partial<ProviderConfig> & { credentials?: Credential }): Promise<void> {
    const existing = await this.getProvider(uid);
    if (!existing) return;

    const updated = { ...existing, ...updates };
    const attrs = buildProviderAttrs(updated);
    let encryptedKey: string;

    if (updates.credentials) {
      encryptedKey = this.encrypt(JSON.stringify(updates.credentials));
    } else {
      const row = await this.client.queryOne<{ key: string }>(`SELECT ${this.providerKeyColumn()} AS key FROM ${this.providersTable()} WHERE uid = ?`, [uid]);
      encryptedKey = row?.key || '';
    }

    await this.client.execute(
      `UPDATE ${this.providersTable()} SET
        name = ?,
        ${this.providerKeyColumn()} = ?,
        refresh_interval = ?,
        display_order = ?,
        attrs = ?,
        updated_at = ?
      WHERE uid = ?`,
      [
        updated.name || null,
        encryptedKey,
        updated.refreshInterval,
        updated.displayOrder || existing.displayOrder || 0,
        JSON.stringify(attrs),
        toUnixSeconds(),
        uid,
      ]
    );
  }

  async updateProviderDisplayOrders(items: Array<{ uid: string; displayOrder: number }>): Promise<void> {
    await this.client.transaction(async (tx) => {
      const now = toUnixSeconds();
      for (const row of items) {
        await tx.execute(`UPDATE ${this.providersTable()} SET display_order = ?, updated_at = ? WHERE uid = ?`, [row.displayOrder, now, row.uid]);
      }
    });
  }

  private async insertUsageRecord(uid: string, snapshot: UsageSnapshot, createdAtUnixSeconds?: number): Promise<void> {
    const createdAt = createdAtUnixSeconds ?? toUnixSeconds();
    await this.client.execute(
      `INSERT INTO ${this.usageTable()} (provider_id, progress, identity_data, created_at)
       SELECT id, ?, ?, ? FROM ${this.providersTable()} WHERE uid = ?`,
      [
        JSON.stringify(this.buildProgressData(snapshot)),
        snapshot.identity ? JSON.stringify(snapshot.identity) : null,
        createdAt,
        uid,
      ]
    );
  }

  async recordUsage(uid: string, snapshot: UsageSnapshot): Promise<void> {
    await this.insertUsageRecord(uid, snapshot);
  }

  async recordUsageAt(uid: string, snapshot: UsageSnapshot, createdAt: Date): Promise<void> {
    await this.insertUsageRecord(uid, snapshot, toUnixSeconds(createdAt));
  }

  async recordUsageBatchAt(
    uid: string,
    entries: Array<{ snapshot: UsageSnapshot; createdAt: Date }>
  ): Promise<void> {
    if (entries.length === 0) return;

    await this.client.transaction(async (tx) => {
      for (const item of entries) {
        await tx.execute(
          `INSERT INTO ${this.usageTable()} (provider_id, progress, identity_data, created_at)
           SELECT id, ?, ?, ? FROM ${this.providersTable()} WHERE uid = ?`,
          [
            JSON.stringify(this.buildProgressData(item.snapshot)),
            item.snapshot.identity ? JSON.stringify(item.snapshot.identity) : null,
            toUnixSeconds(item.createdAt),
            uid,
          ]
        );
      }
    });
  }

  async clearUsageHistory(uid: string): Promise<void> {
    await this.client.execute(
      `DELETE FROM ${this.usageTable()} WHERE provider_id = (SELECT id FROM ${this.providersTable()} WHERE uid = ?)`,
      [uid]
    );
  }

  async getUsageHistory(uid: string, days: number = 30): Promise<UsageRecordRow[]> {
    const cutoff = toUnixSeconds() - (days * 86400);
    const rows = await this.client.query<DbUsageRow>(
      `SELECT ur.* FROM ${this.usageTable()} ur
       JOIN ${this.providersTable()} p ON ur.provider_id = p.id
       WHERE p.uid = ? AND ur.created_at >= ? ORDER BY ur.created_at ASC`,
      [uid, cutoff]
    );
    return rows.map((row) => this.mapUsageRow(row));
  }

  async getAllUsageHistory(days: number = 30): Promise<Map<string, UsageRecordRow[]>> {
    const cutoff = toUnixSeconds() - (days * 86400);
    const rows = await this.client.query<DbUsageRow & { provider_uid: string }>(
      `SELECT ur.*, p.uid AS provider_uid FROM ${this.usageTable()} ur
       JOIN ${this.providersTable()} p ON ur.provider_id = p.id
       WHERE ur.created_at >= ? ORDER BY ur.created_at ASC`,
      [cutoff]
    );

    const result = new Map<string, UsageRecordRow[]>();
    for (const row of rows) {
      const mapped = this.mapUsageRow(row);
      const key = row.provider_uid || String(row.provider_id);
      const list = result.get(key) || [];
      list.push(mapped);
      result.set(key, list);
    }
    return result;
  }

  async getLatestUsage(uid: string): Promise<UsageRecordRow | null> {
    const rows = await this.client.query<DbUsageRow>(
      `SELECT ur.* FROM ${this.usageTable()} ur
       JOIN ${this.providersTable()} p ON ur.provider_id = p.id
       WHERE p.uid = ? ORDER BY ur.created_at DESC, ur.id DESC LIMIT 50`,
      [uid]
    );

    if (rows.length === 0) return null;
    const preferred = rows.find((row) => hasProgressItems(row.progress));
    return this.mapUsageRow(preferred || rows[0]);
  }

  async getSetting(key: string): Promise<string | null> {
    const row = await this.client.queryOne<{ value: string }>(`SELECT value FROM ${this.settingsTable()} WHERE ${this.settingsKeyColumn()} = ?`, [key]);
    return row ? row.value : null;
  }

  async setSetting(key: string, value: string): Promise<void> {
    const now = toUnixSeconds();

    if (this.engine === 'postgres') {
      await this.client.execute(
        `INSERT INTO ${this.settingsTable()} (${this.settingsKeyColumn()}, value, updated_at)
         VALUES (?, ?, ?)
         ON CONFLICT(${this.settingsKeyColumn()}) DO UPDATE SET value = EXCLUDED.value, updated_at = EXCLUDED.updated_at`,
        [key, value, now]
      );
      return;
    }

    if (this.engine === 'mysql') {
      await this.client.execute(
      `INSERT INTO ${this.settingsTable()} (${this.settingsKeyColumn()}, value, updated_at)
       VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE value = VALUES(value), updated_at = VALUES(updated_at)`,
        [key, value, now]
      );
      return;
    }

    await this.client.execute(
      `INSERT INTO ${this.settingsTable()} (${this.settingsKeyColumn()}, value, updated_at)
       VALUES (?, ?, ?)
       ON CONFLICT(${this.settingsKeyColumn()}) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
      [key, value, now]
    );
  }

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
    await this.client.execute(
      `INSERT INTO ${this.auditLogsTable()}
        (ip, method, path, status_code, duration_ms, user_agent, authenticated, event_type, details, timestamp)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        entry.ip || null,
        entry.method,
        entry.path,
        entry.statusCode,
        entry.durationMs,
        entry.userAgent || null,
        entry.authenticated ? 1 : 0,
        entry.eventType || 'api_access',
        entry.details ? JSON.stringify(entry.details) : null,
        toUnixSeconds(),
      ]
    );
  }

  async getAuditLogs(limit: number = 200): Promise<AuditLogRow[]> {
    const safeLimit = Math.max(1, Math.min(1000, limit));
    const rows = await this.client.query<DbAuditRow>(`SELECT * FROM ${this.auditLogsTable()} ORDER BY id DESC LIMIT ?`, [safeLimit]);
    return rows.map((row) => ({
      id: Number(row.id),
      timestamp: fromUnixSeconds(row.timestamp).toISOString(),
      ip: row.ip,
      method: row.method,
      path: row.path,
      statusCode: Number(row.status_code),
      durationMs: Number(row.duration_ms),
      userAgent: row.user_agent,
      authenticated: row.authenticated === 1 || row.authenticated === true,
      eventType: row.event_type,
      details: row.details ? JSON.parse(row.details) : null,
    }));
  }

  async hasPasswordSet(): Promise<boolean> {
    const value = await this.getSetting(PASSWORD_KEY);
    return !!value;
  }

  async setPassword(password: string): Promise<void> {
    const hash = hashPassword(password);
    await this.setSetting(PASSWORD_KEY, hash);
  }

  async verifyPassword(password: string): Promise<boolean> {
    const row = await this.getSetting(PASSWORD_KEY);
    if (!row) return false;
    const isValid = verifyHashedPassword(password, row);

    if (isValid && !row.startsWith(`${PASSWORD_SCHEME}$`)) {
      await this.setPassword(password);
    }

    return isValid;
  }
}
