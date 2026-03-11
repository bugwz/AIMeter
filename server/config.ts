import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { AuthType, ProviderConfig, UsageProvider } from '../src/types/index.js';

type UnknownRecord = Record<string, unknown>;

export interface ConfiguredProvider {
  id: string;
  provider: UsageProvider;
  authType: AuthType;
  credential: string;
  refreshInterval: number;
  region?: string;
  name?: string;
  claudeAuthMode?: ProviderConfig['claudeAuthMode'];
  opencodeWorkspaceId?: string;
  defaultProgressItem?: string;
  source: 'environment' | 'config';
}

export interface AppConfig {
  configFilePath: string | null;
  server: {
    apiUrl: string;
    frontendPort: number;
    backendPort: number;
    corsOrigins: string[];
    protocol: 'http' | 'https';
  };
  runtime: {
    mockEnabled: boolean;
    mode: 'node' | 'serverless';
  };
  database: {
    enabled: boolean;
    engine: 'sqlite' | 'postgres' | 'mysql';
    connection: string;
    encryptionKey?: string;
  };
  auth: {
    sessionSecret?: string;
    sessionTtlSeconds: number;
    normalPassword?: string;
    adminPassword?: string;
    adminRoutePath?: string;
    cronSecret?: string;
    endpointSecret?: string;
    rateLimit: {
      windowMs: number;
      maxAttempts: number;
      blockMs: number;
    };
  };
  providers: ConfiguredProvider[];
}

interface ParsedLine {
  indent: number;
  content: string;
}

interface ConfigIssue {
  code: string;
  field: string;
  reason: string;
  expected: string;
  actualMasked?: string;
  hint: string;
}

interface ParseProvidersJsonResult {
  providers: ConfiguredProvider[] | null;
  issues: ConfigIssue[];
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');

let cachedConfig: AppConfig | null = null;

function stripComments(line: string): string {
  let result = '';
  let inSingle = false;
  let inDouble = false;

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (char === "'" && !inDouble) {
      inSingle = !inSingle;
    } else if (char === '"' && !inSingle) {
      inDouble = !inDouble;
    } else if (char === '#' && !inSingle && !inDouble) {
      break;
    }
    result += char;
  }

  return result.trimEnd();
}

function tokenizeYaml(input: string): ParsedLine[] {
  return input
    .split(/\r?\n/)
    .map(stripComments)
    .filter((line) => line.trim().length > 0)
    .map((line) => {
      const trimmed = line.trimStart();
      return {
        indent: line.length - trimmed.length,
        content: trimmed,
      };
    });
}

function parseScalar(raw: string): unknown {
  const value = raw.trim();
  if (value === 'true') return true;
  if (value === 'false') return false;
  if (value === 'null') return null;
  if (value === '[]') return [];
  if (value === '{}') return {};
  if (/^-?\d+(\.\d+)?$/.test(value)) return Number(value);
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
    return value.slice(1, -1);
  }
  return value;
}

function parseKeyValue(content: string): { key: string; hasValue: boolean; value?: unknown } {
  const separatorIndex = content.indexOf(':');
  if (separatorIndex === -1) {
    throw new Error(`Invalid YAML line: ${content}`);
  }

  const key = content.slice(0, separatorIndex).trim();
  const rawValue = content.slice(separatorIndex + 1).trim();

  if (!key) {
    throw new Error(`Invalid YAML key in line: ${content}`);
  }

  if (!rawValue) {
    return { key, hasValue: false };
  }

  return { key, hasValue: true, value: parseScalar(rawValue) };
}

function parseYamlBlock(lines: ParsedLine[], startIndex: number, indent: number): { value: unknown; nextIndex: number } {
  if (startIndex >= lines.length) {
    return { value: {}, nextIndex: startIndex };
  }

  const first = lines[startIndex];
  if (first.indent < indent) {
    return { value: {}, nextIndex: startIndex };
  }

  if (first.content.startsWith('- ')) {
    const items: unknown[] = [];
    let index = startIndex;

    while (index < lines.length) {
      const current = lines[index];
      if (current.indent < indent) break;
      if (current.indent !== indent || !current.content.startsWith('- ')) break;

      const itemContent = current.content.slice(2).trim();
      if (!itemContent) {
        const nested = parseYamlBlock(lines, index + 1, indent + 2);
        items.push(nested.value);
        index = nested.nextIndex;
        continue;
      }

      if (itemContent.includes(':')) {
        const parsed = parseKeyValue(itemContent);
        const obj: UnknownRecord = {};
        obj[parsed.key] = parsed.hasValue ? parsed.value : {};

        let nextIndex = index + 1;
        if (!parsed.hasValue) {
          const nested = parseYamlBlock(lines, nextIndex, indent + 2);
          obj[parsed.key] = nested.value;
          nextIndex = nested.nextIndex;
        }

        while (nextIndex < lines.length) {
          const next = lines[nextIndex];
          if (next.indent < indent + 2) break;
          if (next.indent === indent && next.content.startsWith('- ')) break;
          if (next.indent !== indent + 2) {
            throw new Error(`Unsupported YAML indentation near: ${next.content}`);
          }
          const nestedParsed = parseKeyValue(next.content);
          if (nestedParsed.hasValue) {
            obj[nestedParsed.key] = nestedParsed.value;
            nextIndex += 1;
          } else {
            const nested = parseYamlBlock(lines, nextIndex + 1, indent + 4);
            obj[nestedParsed.key] = nested.value;
            nextIndex = nested.nextIndex;
          }
        }

        items.push(obj);
        index = nextIndex;
        continue;
      }

      items.push(parseScalar(itemContent));
      index += 1;
    }

    return { value: items, nextIndex: index };
  }

  const obj: UnknownRecord = {};
  let index = startIndex;

  while (index < lines.length) {
    const current = lines[index];
    if (current.indent < indent) break;
    if (current.indent !== indent) break;
    if (current.content.startsWith('- ')) break;

    const parsed = parseKeyValue(current.content);
    if (parsed.hasValue) {
      obj[parsed.key] = parsed.value;
      index += 1;
      continue;
    }

    const nested = parseYamlBlock(lines, index + 1, indent + 2);
    obj[parsed.key] = nested.value;
    index = nested.nextIndex;
  }

  return { value: obj, nextIndex: index };
}

function parseYaml(input: string): UnknownRecord {
  const lines = tokenizeYaml(input);
  if (lines.length === 0) return {};
  const result = parseYamlBlock(lines, 0, 0).value;
  if (!result || typeof result !== 'object' || Array.isArray(result)) {
    throw new Error('YAML root must be a mapping object');
  }
  return result as UnknownRecord;
}

function resolveConfigFilePath(): string | null {
  const explicit = process.env.AIMETER_CONFIG_FILE?.trim();
  if (explicit) {
    return path.resolve(projectRoot, explicit);
  }

  const defaultPath = path.join(projectRoot, 'config.yaml');
  if (fs.existsSync(defaultPath)) {
    return defaultPath;
  }

  return null;
}

function readYamlConfigFile(): { path: string | null; config: UnknownRecord } {
  const configPath = resolveConfigFilePath();
  if (!configPath) {
    return { path: null, config: {} };
  }

  if (!fs.existsSync(configPath)) {
    throw new Error(`Configuration file not found: ${configPath}`);
  }

  const raw = fs.readFileSync(configPath, 'utf8');
  return {
    path: configPath,
    config: parseYaml(raw),
  };
}

function asRecord(value: unknown): UnknownRecord {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as UnknownRecord) : {};
}

function asString(value: unknown): string | undefined {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return undefined;
}

function asNumber(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return undefined;
}

function asBoolean(value: unknown): boolean | undefined {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    if (value === 'true') return true;
    if (value === 'false') return false;
  }
  return undefined;
}

function parseEnvBoolean(value: string | undefined): boolean | undefined {
  if (value === 'true') return true;
  if (value === 'false') return false;
  return undefined;
}

function parseEnvNumber(value: string | undefined): number | undefined {
  if (!value || !value.trim()) return undefined;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return undefined;
  return parsed;
}

function isWeakSecret(value: string | undefined, placeholders: string[] = []): boolean {
  const trimmed = value?.trim();
  if (!trimmed) return true;
  if (trimmed.length < 24) return true;
  const lower = trimmed.toLowerCase();
  if (lower.includes('change-me') || lower.includes('replace-with')) return true;
  if (placeholders.some((item) => lower === item.toLowerCase())) return true;
  return false;
}

function isWeakAdminRoutePath(value: string | undefined): boolean {
  const trimmed = value?.trim();
  if (!trimmed) return true;
  if (trimmed.length !== 32) return true;
  const lower = trimmed.toLowerCase();
  if (lower.includes('replace-with')) return true;
  return false;
}

function isWeakIntegrationSecret(value: string | undefined): boolean {
  const trimmed = value?.trim();
  if (!trimmed) return true;
  if (trimmed.length !== 32) return true;
  const lower = trimmed.toLowerCase();
  if (lower.includes('replace-with') || lower.includes('change-me')) return true;
  return false;
}

function maskSecret(value: string | undefined): string {
  const trimmed = value?.trim();
  if (!trimmed) return '<unset>';
  return `<redacted len=${trimmed.length}>`;
}

function collectSecurityIssues(config: AppConfig, providerIssues: ConfigIssue[], protocolIssue: ConfigIssue | null): ConfigIssue[] {
  const issues: ConfigIssue[] = [];

  if (protocolIssue) {
    issues.push(protocolIssue);
  }

  issues.push(...providerIssues);

  if (!config.database.enabled) {
    if (!config.auth.sessionSecret) {
      issues.push({
        code: 'MISSING_SESSION_SECRET',
        field: 'AIMETER_AUTH_SESSION_SECRET',
        reason: 'Session secret is required in env-only mode',
        expected: 'A non-empty strong secret (>=24 chars)',
        actualMasked: '<unset>',
        hint: 'Set AIMETER_AUTH_SESSION_SECRET to a strong random value.',
      });
    } else if (isWeakSecret(config.auth.sessionSecret)) {
      issues.push({
        code: 'WEAK_SESSION_SECRET',
        field: 'AIMETER_AUTH_SESSION_SECRET',
        reason: 'Session secret is too weak',
        expected: 'A strong random secret with at least 24 characters',
        actualMasked: maskSecret(config.auth.sessionSecret),
        hint: 'Generate one with: openssl rand -hex 16',
      });
    }

    if (!config.auth.normalPassword) {
      issues.push({
        code: 'MISSING_NORMAL_PASSWORD',
        field: 'AIMETER_NORMAL_PASSWORD',
        reason: 'Normal password is required in env-only mode',
        expected: 'Password with >=12 chars containing letters and digits',
        actualMasked: '<unset>',
        hint: 'Set AIMETER_NORMAL_PASSWORD in env/config for env-only deployment.',
      });
    }
    if (!config.auth.adminPassword) {
      issues.push({
        code: 'MISSING_ADMIN_PASSWORD',
        field: 'AIMETER_ADMIN_PASSWORD',
        reason: 'Admin password is required in env-only mode',
        expected: 'Password with >=12 chars containing letters and digits',
        actualMasked: '<unset>',
        hint: 'Set AIMETER_ADMIN_PASSWORD in env/config for env-only deployment.',
      });
    }
    if (
      config.auth.normalPassword
      && config.auth.adminPassword
      && config.auth.normalPassword === config.auth.adminPassword
    ) {
      issues.push({
        code: 'DUPLICATE_PASSWORDS',
        field: 'AIMETER_NORMAL_PASSWORD,AIMETER_ADMIN_PASSWORD',
        reason: 'Normal and admin passwords must not be the same',
        expected: 'Two different password values',
        hint: 'Use different credentials for normal/admin roles.',
      });
    }

    if (!config.auth.adminRoutePath) {
      issues.push({
        code: 'MISSING_ADMIN_ROUTE_PATH',
        field: 'AIMETER_ADMIN_ROUTE_PATH',
        reason: 'Admin route path is required in env-only mode',
        expected: 'Exactly 32 random alphanumeric characters',
        actualMasked: '<unset>',
        hint: 'Set AIMETER_ADMIN_ROUTE_PATH to a 32-char random value.',
      });
    } else if (isWeakAdminRoutePath(config.auth.adminRoutePath)) {
      issues.push({
        code: 'WEAK_ADMIN_ROUTE_PATH',
        field: 'AIMETER_ADMIN_ROUTE_PATH',
        reason: 'Admin route path is weak or invalid',
        expected: 'Exactly 32 random alphanumeric characters',
        actualMasked: maskSecret(config.auth.adminRoutePath),
        hint: 'Regenerate a 32-char random path with only letters/numbers.',
      });
    }

  }

  if (config.auth.cronSecret && isWeakIntegrationSecret(config.auth.cronSecret)) {
    issues.push({
      code: 'WEAK_CRON_SECRET',
      field: 'AIMETER_CRON_SECRET',
      reason: 'Cron secret is weak or invalid',
      expected: 'Exactly 32 random characters when set',
      actualMasked: maskSecret(config.auth.cronSecret),
      hint: 'Regenerate a strong 32-char secret.',
    });
  }
  if (config.auth.endpointSecret && isWeakIntegrationSecret(config.auth.endpointSecret)) {
    issues.push({
      code: 'WEAK_ENDPOINT_SECRET',
      field: 'AIMETER_ENDPOINT_SECRET',
      reason: 'Endpoint secret is weak or invalid',
      expected: 'Exactly 32 random characters when set',
      actualMasked: maskSecret(config.auth.endpointSecret),
      hint: 'Regenerate a strong 32-char secret.',
    });
  }

  return issues;
}

function validateSecurityConfig(config: AppConfig, providerIssues: ConfigIssue[], protocolIssue: ConfigIssue | null): void {
  const issues = collectSecurityIssues(config, providerIssues, protocolIssue);
  if (issues.length === 0) {
    if (!config.database.enabled) {
      console.log(`[CONFIG] Validation passed (mode=env, protocol=${config.server.protocol})`);
    }
    return;
  }

  console.error(config.database.enabled
    ? '[CONFIG] Validation failed (database mode)'
    : '[CONFIG] Validation failed (env-only)');
  for (const issue of issues) {
    const details = [
      `[CONFIG][${issue.code}] field=${issue.field}`,
      `reason=${issue.reason}`,
      `expected=${issue.expected}`,
    ];
    if (issue.actualMasked) {
      details.push(`actual=${issue.actualMasked}`);
    }
    details.push(`hint=${issue.hint}`);
    console.error(details.join(' | '));
  }
  console.error(`[CONFIG] Total issues: ${issues.length}`);

  throw new Error(`Configuration validation failed with ${issues.length} issue(s).`);
}

function asStringArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map((item) => asString(item)).filter((item): item is string => Boolean(item));
  }
  if (typeof value === 'string') {
    return value
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean);
  }
  return [];
}

function normalizeAlias(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
}

function hasLegacyProviderEnv(): boolean {
  if ((process.env.AIMETER_PROVIDER_IDS || '').trim()) return true;
  return Object.keys(process.env).some((key) => key.startsWith('AIMETER_PROVIDER__'));
}

function parseProvidersJson(raw: string): ParseProvidersJsonResult {
  const issues: ConfigIssue[] = [];
  const providers: ConfiguredProvider[] = [];
  let parsed: unknown;

  try {
    parsed = JSON.parse(raw);
  } catch {
    return {
      providers: null,
      issues: [{
        code: 'INVALID_PROVIDERS_JSON',
        field: 'AIMETER_PROVIDERS_JSON',
        reason: 'JSON parsing failed',
        expected: 'A valid JSON array of provider objects',
        actualMasked: `<redacted len=${raw.length}>`,
        hint: 'Ensure AIMETER_PROVIDERS_JSON is valid JSON (double quotes, no trailing commas).',
      }],
    };
  }

  if (!Array.isArray(parsed)) {
    return {
      providers: null,
      issues: [{
        code: 'INVALID_PROVIDERS_JSON',
        field: 'AIMETER_PROVIDERS_JSON',
        reason: 'Top-level JSON value must be an array',
        expected: 'A JSON array with at least one provider object',
        hint: 'Wrap providers in [ ... ].',
      }],
    };
  }

  if (parsed.length === 0) {
    return {
      providers: null,
      issues: [{
        code: 'EMPTY_PROVIDERS_JSON',
        field: 'AIMETER_PROVIDERS_JSON',
        reason: 'Provider list is empty',
        expected: 'A non-empty provider array',
        hint: 'Add at least one provider object in AIMETER_PROVIDERS_JSON.',
      }],
    };
  }

  parsed.forEach((item, index) => {
    const obj = asRecord(item);
    const id = normalizeAlias(asString(obj.id) || '');
    const provider = (asString(obj.type) || '').trim().toLowerCase() as UsageProvider;
    const authType = (asString(obj.authType) || AuthType.COOKIE).trim() as AuthType;
    const credential = asString(obj.credential) || '';
    const fieldPrefix = `AIMETER_PROVIDERS_JSON[${index}]`;

    if (!id) {
      issues.push({
        code: 'INVALID_PROVIDER_ITEM',
        field: `${fieldPrefix}.id`,
        reason: 'Missing or invalid id',
        expected: 'Non-empty provider id',
        hint: 'Set id to a unique provider identifier (snake_case recommended).',
      });
    }
    if (!provider) {
      issues.push({
        code: 'INVALID_PROVIDER_ITEM',
        field: `${fieldPrefix}.type`,
        reason: 'Missing provider type',
        expected: 'A supported provider type string',
        hint: 'Set type, for example cursor/openrouter/claude.',
      });
    }
    if (!credential.trim()) {
      issues.push({
        code: 'INVALID_PROVIDER_ITEM',
        field: `${fieldPrefix}.credential`,
        reason: 'Missing credential',
        expected: 'Non-empty credential string',
        actualMasked: '<unset>',
        hint: 'Provide credential for the selected authType.',
      });
    }

    if (!id || !provider || !credential.trim()) {
      return;
    }

    providers.push({
      id,
      provider,
      authType,
      credential,
      refreshInterval: asNumber(obj.refreshInterval) ?? 0,
      region: asString(obj.region),
      name: asString(obj.name),
      claudeAuthMode: asString(obj.claudeAuthMode) as ProviderConfig['claudeAuthMode'] | undefined,
      opencodeWorkspaceId: asString(obj.opencodeWorkspaceId),
      defaultProgressItem: asString(obj.defaultProgressItem),
      source: 'environment' as const,
    });
  });

  return { providers, issues };
}

export function getAppConfig(): AppConfig {
  if (cachedConfig) {
    return cachedConfig;
  }

  const { path: configFilePath, config } = readYamlConfigFile();
  const server = asRecord(config.server);
  const runtime = asRecord(config.runtime);
  const database = asRecord(config.database);
  const auth = asRecord(config.auth);
  const authRateLimit = asRecord(auth.rateLimit);
  const databaseEngine = (asString(database.engine)
    || process.env.AIMETER_DATABASE_ENGINE
    || 'sqlite') as AppConfig['database']['engine'];
  const databaseEnabled = asBoolean(database.enabled)
    ?? parseEnvBoolean(process.env.AIMETER_DATABASE_ENABLED)
    ?? true;
  const runtimeMode = (asString(runtime.mode) || process.env.AIMETER_RUNTIME_MODE || 'node') as 'node' | 'serverless';
  const protocolRaw = (asString(server.protocol) || process.env.AIMETER_SERVER_PROTOCOL || '').trim().toLowerCase();
  const protocolFallback: 'http' | 'https' = runtimeMode === 'serverless' ? 'https' : 'http';
  let protocol: 'http' | 'https' = protocolFallback;
  let protocolIssue: ConfigIssue | null = null;
  if (protocolRaw) {
    if (protocolRaw === 'http' || protocolRaw === 'https') {
      protocol = protocolRaw;
    } else {
      protocolIssue = {
        code: 'INVALID_SERVER_PROTOCOL',
        field: 'AIMETER_SERVER_PROTOCOL',
        reason: 'Unsupported server protocol value',
        expected: 'http or https',
        actualMasked: protocolRaw,
        hint: 'Set AIMETER_SERVER_PROTOCOL=http or AIMETER_SERVER_PROTOCOL=https.',
      };
    }
  }

  if (databaseEnabled) {
    if (asString(database.encryptionKey)?.trim() || process.env.AIMETER_ENCRYPTION_KEY?.trim()) {
      console.warn('[CONFIG] Ignoring AIMETER_ENCRYPTION_KEY from env/config in database mode (auto-managed in DB).');
    }
    if (asString(auth.sessionSecret)?.trim() || process.env.AIMETER_AUTH_SESSION_SECRET?.trim()) {
      console.warn('[CONFIG] Ignoring AIMETER_AUTH_SESSION_SECRET from env/config in database mode (auto-managed in DB).');
    }
    if (asString(auth.adminRoutePath)?.trim() || process.env.AIMETER_ADMIN_ROUTE_PATH?.trim()) {
      console.warn('[CONFIG] Ignoring AIMETER_ADMIN_ROUTE_PATH from env/config in database mode (managed by bootstrap/DB).');
    }
    if ((process.env.AIMETER_PROVIDERS_JSON || '').trim()) {
      console.warn('[CONFIG] Ignoring AIMETER_PROVIDERS_JSON in database mode (providers are managed in DB).');
    }
    if (hasLegacyProviderEnv()) {
      console.warn('[CONFIG] Ignoring deprecated provider env vars in database mode (providers are managed in DB).');
    }
  }

  const providerIssues: ConfigIssue[] = [];
  let providersFromJson: ConfiguredProvider[] = [];
  if (!databaseEnabled) {
    if (Object.prototype.hasOwnProperty.call(config, 'providers')) {
      providerIssues.push({
        code: 'DEPRECATED_PROVIDER_CONFIG_BLOCK',
        field: 'config.yaml:providers',
        reason: 'File-based providers configuration has been removed',
        expected: 'Use AIMETER_PROVIDERS_JSON only',
        hint: 'Remove providers block from config.yaml and move data to AIMETER_PROVIDERS_JSON.',
      });
    }
    if (hasLegacyProviderEnv()) {
      providerIssues.push({
        code: 'DEPRECATED_PROVIDER_ENV_VARS',
        field: 'AIMETER_PROVIDER_IDS/AIMETER_PROVIDER__*',
        reason: 'Legacy provider environment variables have been removed',
        expected: 'Use AIMETER_PROVIDERS_JSON only',
        hint: 'Migrate legacy provider variables into AIMETER_PROVIDERS_JSON.',
      });
    }

    const providersJsonRaw = (process.env.AIMETER_PROVIDERS_JSON || '').trim();
    if (providersJsonRaw) {
      const parsed = parseProvidersJson(providersJsonRaw);
      providersFromJson = parsed.providers || [];
      providerIssues.push(...parsed.issues);
    }
  }

  const configCorsOrigins = asStringArray(server.corsOrigins);
  const envCorsOrigins = asStringArray(process.env.AIMETER_CORS_ORIGIN);
  const configuredSessionSecret = asString(auth.sessionSecret) || process.env.AIMETER_AUTH_SESSION_SECRET;
  const configuredAdminRoutePath = asString(auth.adminRoutePath) || process.env.AIMETER_ADMIN_ROUTE_PATH;

  cachedConfig = {
    configFilePath,
    server: {
      apiUrl: asString(server.apiUrl) || process.env.AIMETER_API_URL || '/api',
      frontendPort: asNumber(server.frontendPort) ?? parseEnvNumber(process.env.AIMETER_FRONTEND_PORT) ?? 3000,
      backendPort: asNumber(server.backendPort) ?? parseEnvNumber(process.env.AIMETER_BACKEND_PORT) ?? 3001,
      corsOrigins: (Object.prototype.hasOwnProperty.call(server, 'corsOrigins')
        ? configCorsOrigins
        : envCorsOrigins),
      protocol,
    },
    runtime: {
      mockEnabled: asBoolean(runtime.mockEnabled)
        ?? parseEnvBoolean(process.env.AIMETER_MOCK_ENABLED)
        ?? false,
      mode: runtimeMode,
    },
    database: {
      enabled: databaseEnabled,
      engine: databaseEngine,
      connection: asString(database.connection)
        || process.env.AIMETER_DATABASE_CONNECTION
        || path.join(projectRoot, 'data/aimeter.db'),
      encryptionKey: databaseEnabled ? undefined : (asString(database.encryptionKey) || process.env.AIMETER_ENCRYPTION_KEY),
    },
    auth: {
      sessionSecret: databaseEnabled ? undefined : configuredSessionSecret,
      sessionTtlSeconds: asNumber(auth.sessionTtlSeconds)
        ?? parseEnvNumber(process.env.AIMETER_AUTH_SESSION_TTL_SECONDS)
        ?? 4 * 60 * 60,
      normalPassword: asString(auth.normalPassword)
        || process.env.AIMETER_NORMAL_PASSWORD,
      adminPassword: asString(auth.adminPassword)
        || process.env.AIMETER_ADMIN_PASSWORD,
      adminRoutePath: databaseEnabled ? undefined : configuredAdminRoutePath,
      cronSecret: asString(auth.cronSecret)
        || process.env.AIMETER_CRON_SECRET,
      endpointSecret: asString(auth.endpointSecret)?.trim() || process.env.AIMETER_ENDPOINT_SECRET?.trim() || undefined,
      rateLimit: {
        windowMs: asNumber(authRateLimit.windowMs)
          ?? parseEnvNumber(process.env.AIMETER_AUTH_RATE_LIMIT_WINDOW_MS)
          ?? 60_000,
        maxAttempts: asNumber(authRateLimit.maxAttempts)
          ?? parseEnvNumber(process.env.AIMETER_AUTH_RATE_LIMIT_MAX_ATTEMPTS)
          ?? 5,
        blockMs: asNumber(authRateLimit.blockMs)
          ?? parseEnvNumber(process.env.AIMETER_AUTH_RATE_LIMIT_BLOCK_MS)
          ?? 300_000,
      },
    },
    providers: databaseEnabled ? [] : providersFromJson,
  };

  validateSecurityConfig(cachedConfig, providerIssues, protocolIssue);

  return cachedConfig;
}
