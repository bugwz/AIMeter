import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

type UnknownRecord = Record<string, unknown>;

type DatabaseEngineType = 'sqlite' | 'postgres' | 'mysql' | 'd1';

export interface AppConfig {
  configFilePath: string | null;
  server: {
    apiUrl: string;
    frontendPort: number;
    backendPort: number;
    protocol: 'http' | 'https';
  };
  runtime: {
    mockEnabled: boolean;
    mode: 'node' | 'serverless';
  };
  database: {
    engine: DatabaseEngineType;
    connection: string;
    encryptionKey?: string;
  };
  auth: {
    sessionTtlSeconds: number;
    cronSecret?: string;
    endpointSecret?: string;
    rateLimit: {
      windowMs: number;
      maxAttempts: number;
      blockMs: number;
    };
  };
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

function getProjectRoot(): string | null {
  try {
    if (typeof import.meta.url === 'string' && import.meta.url.startsWith('file://')) {
      return path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
    }
  } catch {
    // not a file URL (e.g. Cloudflare Workers)
  }
  return null;
}

const projectRoot = getProjectRoot();

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
  if (!projectRoot) {
    return null;
  }

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

function parseEnvNumber(value: string | undefined): number | undefined {
  if (!value || !value.trim()) return undefined;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return undefined;
  return parsed;
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

function parseDatabaseEngine(value: string | undefined): DatabaseEngineType | undefined {
  if (!value) return undefined;
  const normalized = value.trim().toLowerCase();
  if (normalized === 'sqlite' || normalized === 'postgres' || normalized === 'mysql' || normalized === 'd1') {
    return normalized;
  }
  return undefined;
}

function collectConfigIssues(
  protocolIssue: ConfigIssue | null,
  rawDatabaseEngine: string | undefined,
  databaseEngine: DatabaseEngineType | undefined,
  databaseConnection: string,
  cronSecret: string | undefined,
  endpointSecret: string | undefined,
): ConfigIssue[] {
  const issues: ConfigIssue[] = [];

  if (protocolIssue) {
    issues.push(protocolIssue);
  }

  if (!rawDatabaseEngine?.trim()) {
    issues.push({
      code: 'MISSING_DATABASE_ENGINE',
      field: 'database.engine/AIMETER_DATABASE_ENGINE',
      reason: 'Database engine is required',
      expected: 'One of: sqlite, d1, mysql, postgres',
      actualMasked: '<unset>',
      hint: 'Set database.engine in config.yaml or AIMETER_DATABASE_ENGINE in env.',
    });
  } else if (!databaseEngine) {
    issues.push({
      code: 'INVALID_DATABASE_ENGINE',
      field: 'database.engine/AIMETER_DATABASE_ENGINE',
      reason: 'Unsupported database engine value',
      expected: 'sqlite, d1, mysql, or postgres',
      actualMasked: rawDatabaseEngine.trim(),
      hint: 'Use one of the supported database engines.',
    });
  }

  if (!databaseConnection) {
    issues.push({
      code: 'MISSING_DATABASE_CONNECTION',
      field: 'database.connection/AIMETER_DATABASE_CONNECTION',
      reason: 'Database connection is required',
      expected: 'A non-empty database connection string or binding name',
      actualMasked: '<unset>',
      hint: 'Set database.connection in config.yaml or AIMETER_DATABASE_CONNECTION in env.',
    });
  }

  if (cronSecret && isWeakIntegrationSecret(cronSecret)) {
    issues.push({
      code: 'WEAK_CRON_SECRET',
      field: 'AIMETER_CRON_SECRET',
      reason: 'Cron secret is weak or invalid',
      expected: 'Exactly 32 random characters when set',
      actualMasked: maskSecret(cronSecret),
      hint: 'Regenerate a strong 32-char secret.',
    });
  }
  if (endpointSecret && isWeakIntegrationSecret(endpointSecret)) {
    issues.push({
      code: 'WEAK_ENDPOINT_SECRET',
      field: 'AIMETER_ENDPOINT_SECRET',
      reason: 'Endpoint secret is weak or invalid',
      expected: 'Exactly 32 random characters when set',
      actualMasked: maskSecret(endpointSecret),
      hint: 'Regenerate a strong 32-char secret.',
    });
  }

  return issues;
}

function validateConfig(issues: ConfigIssue[]): void {
  if (issues.length === 0) {
    return;
  }

  console.error('[CONFIG] Validation failed');
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

  const rawDatabaseEngine = asString(database.engine) || process.env.AIMETER_DATABASE_ENGINE;
  const databaseEngine = parseDatabaseEngine(rawDatabaseEngine);
  const databaseConnection = (asString(database.connection) || process.env.AIMETER_DATABASE_CONNECTION || '').trim();
  const databaseEncryptionKey = asString(database.encryptionKey)?.trim() || process.env.AIMETER_ENCRYPTION_KEY?.trim() || undefined;

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

  const cronSecret = asString(auth.cronSecret) || process.env.AIMETER_CRON_SECRET;
  const endpointSecret = asString(auth.endpointSecret)?.trim() || process.env.AIMETER_ENDPOINT_SECRET?.trim() || undefined;

  const issues = collectConfigIssues(
    protocolIssue,
    rawDatabaseEngine,
    databaseEngine,
    databaseConnection,
    cronSecret,
    endpointSecret,
  );
  validateConfig(issues);

  cachedConfig = {
    configFilePath,
    server: {
      apiUrl: asString(server.apiUrl) || process.env.AIMETER_API_URL || '/api',
      frontendPort: asNumber(server.frontendPort) ?? parseEnvNumber(process.env.AIMETER_FRONTEND_PORT) ?? 3000,
      backendPort: asNumber(server.backendPort) ?? parseEnvNumber(process.env.AIMETER_BACKEND_PORT) ?? 3001,
      protocol,
    },
    runtime: {
      mockEnabled: (asString(runtime.mockEnabled) === 'true' || process.env.AIMETER_MOCK_ENABLED === 'true')
        ? true
        : false,
      mode: runtimeMode,
    },
    database: {
      engine: databaseEngine as DatabaseEngineType,
      connection: databaseConnection,
      encryptionKey: databaseEncryptionKey,
    },
    auth: {
      sessionTtlSeconds: asNumber(auth.sessionTtlSeconds)
        ?? parseEnvNumber(process.env.AIMETER_AUTH_SESSION_TTL_SECONDS)
        ?? 4 * 60 * 60,
      cronSecret,
      endpointSecret,
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
  };

  return cachedConfig;
}
