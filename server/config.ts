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
    trustProxy: boolean;
  };
  runtime: {
    mockEnabled: boolean;
    mode: 'node' | 'serverless';
    isProduction: boolean;
  };
  database: {
    enabled: boolean;
    engine: 'sqlite' | 'postgres' | 'mysql';
    connection: string;
    mockConnection?: string;
    encryptionKey?: string;
  };
  auth: {
    sessionSecret?: string;
    sessionTtlSeconds: number;
    secureCookie: boolean;
    normalPasswordHash?: string;
    adminPasswordHash?: string;
    adminRouteSecret?: string;
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

function isProductionRuntime(): boolean {
  return (process.env.NODE_ENV || '').trim().toLowerCase() === 'production';
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

function isWeakAdminRouteSecret(value: string | undefined): boolean {
  const trimmed = value?.trim();
  if (!trimmed) return true;
  if (trimmed.length !== 64) return true;
  const lower = trimmed.toLowerCase();
  if (lower.includes('replace-with')) return true;
  return false;
}

function validateSecurityConfig(config: AppConfig): void {
  if (!config.runtime.isProduction) {
    // Emit warnings so developers catch misconfigurations before going to production.
    if (isWeakSecret(config.auth.sessionSecret) && !config.database.enabled) {
      console.warn('[SECURITY] sessionSecret is weak or unset. Set AIMETER_AUTH_SESSION_SECRET before deploying to production.');
    }
    if (config.database.enabled && config.database.encryptionKey && isWeakSecret(config.database.encryptionKey, ['aimeter-secret-key'])) {
      console.warn('[SECURITY] encryptionKey is set but weak. Set AIMETER_ENCRYPTION_KEY to a strong random secret.');
    }
    if (config.auth.adminRouteSecret && isWeakAdminRouteSecret(config.auth.adminRouteSecret)) {
      console.warn('[SECURITY] adminRouteSecret is weak or invalid. Set AIMETER_ADMIN_ROUTE_SECRET to exactly 64 random characters before deploying to production.');
    }
    return;
  }

  // If a value is explicitly set but weak, always reject it.
  // If unset and database mode is enabled, allow it — secrets are auto-managed in the DB.
  if (config.auth.sessionSecret && isWeakSecret(config.auth.sessionSecret)) {
    throw new Error('Security check failed: AIMETER_AUTH_SESSION_SECRET is set but too weak. Use a strong random secret.');
  }
  if (!config.auth.sessionSecret && !config.database.enabled) {
    throw new Error('Security check failed: AIMETER_AUTH_SESSION_SECRET must be set to a strong secret in production.');
  }

  if (!config.auth.secureCookie) {
    throw new Error('Security check failed: secureCookie must be enabled in production.');
  }

  if (config.database.enabled && config.database.encryptionKey && isWeakSecret(config.database.encryptionKey, ['aimeter-secret-key'])) {
    throw new Error('Security check failed: AIMETER_ENCRYPTION_KEY is set but too weak. Use a strong random secret.');
  }

  if (config.auth.adminRouteSecret && isWeakAdminRouteSecret(config.auth.adminRouteSecret)) {
    throw new Error('Security check failed: AIMETER_ADMIN_ROUTE_SECRET must be exactly 64 random characters in production.');
  }

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

function parseYamlProviders(root: UnknownRecord): ConfiguredProvider[] {
  const providers = root.providers;
  if (!Array.isArray(providers)) return [];

  return providers
    .map((item) => {
      const obj = asRecord(item);
      const id = normalizeAlias(asString(obj.id) || '');
      const provider = (asString(obj.type) || '').trim().toLowerCase() as UsageProvider;
      const authType = (asString(obj.authType) || AuthType.COOKIE) as AuthType;
      const credential = asString(obj.credential) || '';

      if (!id || !provider) return null;

      return {
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
        source: 'config' as const,
      };
    })
    .filter(Boolean) as ConfiguredProvider[];
}

function parseEnvProviders(): ConfiguredProvider[] | null {
  const providerIds = (process.env.AIMETER_PROVIDER_IDS || '')
    .split(',')
    .map((value) => normalizeAlias(value))
    .filter(Boolean);

  if (providerIds.length === 0) {
    return null;
  }

  return providerIds.map((id) => {
    const prefix = `AIMETER_PROVIDER__${id.toUpperCase().replace(/[^A-Z0-9]+/g, '_')}__`;
    const provider = (process.env[`${prefix}TYPE`] || '').trim().toLowerCase() as UsageProvider;
    const authType = (process.env[`${prefix}AUTH_TYPE`] || AuthType.COOKIE).trim() as AuthType;
    const credential = process.env[`${prefix}CREDENTIAL`] || '';

    if (!provider || !credential) {
      throw new Error(`Provider override ${id} is missing required TYPE or CREDENTIAL`);
    }

    return {
      id,
      provider,
      authType,
      credential,
      refreshInterval: Number(process.env[`${prefix}REFRESH_INTERVAL`] || 0) || 0,
      region: process.env[`${prefix}REGION`] || undefined,
      name: process.env[`${prefix}NAME`] || undefined,
      claudeAuthMode: process.env[`${prefix}CLAUDE_AUTH_MODE`] as ProviderConfig['claudeAuthMode'] | undefined,
      opencodeWorkspaceId: process.env[`${prefix}OPENCODE_WORKSPACE_ID`] || undefined,
      defaultProgressItem: process.env[`${prefix}DEFAULT_PROGRESS_ITEM`] || undefined,
      source: 'environment' as const,
    };
  });
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
  const isProduction = isProductionRuntime();
  const yamlProviders = parseYamlProviders(config);
  const envProviders = parseEnvProviders();
  const databaseEngine = (process.env.AIMETER_DATABASE_ENGINE
    || asString(database.engine)
    || 'sqlite') as AppConfig['database']['engine'];
  const databaseEnabled = parseEnvBoolean(process.env.AIMETER_DATABASE_ENABLED)
    ?? asBoolean(database.enabled)
    ?? true;

  cachedConfig = {
    configFilePath,
    server: {
      apiUrl: process.env.AIMETER_API_URL || asString(server.apiUrl) || '/api',
      frontendPort: Number(process.env.AIMETER_FRONTEND_PORT) || asNumber(server.frontendPort) || 3000,
      backendPort: Number(process.env.AIMETER_BACKEND_PORT) || asNumber(server.backendPort) || 3001,
      corsOrigins: (process.env.AIMETER_CORS_ORIGIN
        ? asStringArray(process.env.AIMETER_CORS_ORIGIN)
        : asStringArray(server.corsOrigins)),
      trustProxy: parseEnvBoolean(process.env.AIMETER_TRUST_PROXY)
        ?? asBoolean(server.trustProxy)
        ?? isProduction,
    },
    runtime: {
      mockEnabled: parseEnvBoolean(process.env.AIMETER_MOCK_ENABLED)
        ?? asBoolean(runtime.mockEnabled)
        ?? false,
      mode: (process.env.AIMETER_RUNTIME_MODE || asString(runtime.mode) || 'node') as 'node' | 'serverless',
      isProduction,
    },
    database: {
      enabled: databaseEnabled,
      engine: databaseEngine,
      connection: process.env.AIMETER_DATABASE_CONNECTION
        || asString(database.connection)
        || path.join(projectRoot, 'data/aimeter.db'),
      mockConnection: process.env.AIMETER_DATABASE_MOCK_CONNECTION
        || asString(database.mockConnection),
      encryptionKey: process.env.AIMETER_ENCRYPTION_KEY || asString(database.encryptionKey),
    },
    auth: {
      sessionSecret: process.env.AIMETER_AUTH_SESSION_SECRET || asString(auth.sessionSecret),
      sessionTtlSeconds: Number(process.env.AIMETER_AUTH_SESSION_TTL_SECONDS)
        || asNumber(auth.sessionTtlSeconds)
        || 4 * 60 * 60,
      secureCookie: process.env.AIMETER_SECURE_COOKIE === 'true'
        ? true
        : (process.env.AIMETER_SECURE_COOKIE === 'false'
          ? false
          : (asBoolean(auth.secureCookie) ?? isProduction)),
      normalPasswordHash: process.env.AIMETER_NORMAL_PASSWORD_HASH
        || asString(auth.normalPasswordHash),
      adminPasswordHash: process.env.AIMETER_ADMIN_PASSWORD_HASH
        || asString(auth.adminPasswordHash),
      adminRouteSecret: process.env.AIMETER_ADMIN_ROUTE_SECRET
        || asString(auth.adminRouteSecret),
      cronSecret: process.env.AIMETER_CRON_SECRET
        || asString(auth.cronSecret),
      endpointSecret: process.env.AIMETER_ENDPOINT_SECRET?.trim() || asString(auth.endpointSecret) || undefined,
      rateLimit: {
        windowMs: Number(process.env.AIMETER_AUTH_RATE_LIMIT_WINDOW_MS)
          || asNumber(authRateLimit.windowMs)
          || 60_000,
        maxAttempts: Number(process.env.AIMETER_AUTH_RATE_LIMIT_MAX_ATTEMPTS)
          || asNumber(authRateLimit.maxAttempts)
          || 5,
        blockMs: Number(process.env.AIMETER_AUTH_RATE_LIMIT_BLOCK_MS)
          || asNumber(authRateLimit.blockMs)
          || 300_000,
      },
    },
    providers: envProviders || yamlProviders,
  };

  validateSecurityConfig(cachedConfig);

  return cachedConfig;
}
