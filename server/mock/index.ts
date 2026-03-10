import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { 
  initMockDatabase, 
  getAllMockProviders, 
  getMockProvider,
  saveMockProvider, 
  deleteMockProvider,
  recordMockUsage,
  getMockUsageHistory,
  getAllMockUsageHistory,
  getSetting,
  setSetting,
  generateMockHistoryData,
  hasMockHistoryData,
  getMockLatestUsage
} from './database.js';
import { MOCK_PORT, MOCK_PROVIDER_CONFIGS } from './config.js';
import { UsageProvider, ProviderConfig, Credential, AuthType, UsageSnapshot } from '../../src/types/index.js';
import { createMockProvider } from './providers/base.js';
import endpointMockRouter from '../routes/endpoint-mock.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();

app.use(cors());
app.use(express.json());

initMockDatabase();
console.log('Mock Database initialized');

// Initialize default providers and password
const existingProviders = getAllMockProviders();
if (existingProviders.length === 0) {
  console.log('Adding default mock providers...');
  
  for (const [provider, mockConfig] of Object.entries(MOCK_PROVIDER_CONFIGS)) {
    const config: ProviderConfig = {
      provider: provider as UsageProvider,
      credentials: { type: AuthType.API_KEY, value: 'mock-key-' + provider, keyPrefix: 'mock' },
      refreshInterval: 5,
    };
    const providerId = saveMockProvider(provider as UsageProvider, config);
    generateMockHistoryData(providerId, mockConfig);
  }
  console.log(`Default mock providers added: ${Object.keys(MOCK_PROVIDER_CONFIGS).length}`);
  console.log('Mock history data generated for 30 days');
} else {
  console.log('Checking existing providers for history data...');
  for (const p of existingProviders) {
    const mockConfig = MOCK_PROVIDER_CONFIGS[p.provider];
    if (mockConfig && !hasMockHistoryData(p.id)) {
      generateMockHistoryData(p.id, mockConfig);
      console.log(`Generated history data for ${p.provider}`);
    }
  }
}

// Set default password
if (!getSetting('password')) {
  setSetting('password', 'password');
  console.log('Default password set to: password');
}

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', mode: 'mock', timestamp: new Date().toISOString() });
});

app.get('/api/auth/status', (_req, res) => {
  res.json({
    success: true,
    data: { needsSetup: false }
  });
});

app.post('/api/auth/verify', (req, res) => {
  const { password } = req.body;
  const storedPassword = getSetting('password');
  if (password && password === storedPassword) {
    res.json({ success: true });
  } else {
    res.status(401).json({ success: false, error: { message: 'Invalid password' } });
  }
});

app.post('/api/auth/setup', (req, res) => {
  res.json({ success: true });
});

app.post('/api/auth/change-password', (req, res) => {
  const { oldPassword, newPassword } = req.body;
  
  if (!oldPassword || !newPassword) {
    return res.status(400).json({
      success: false,
      error: {
        code: 'INVALID_REQUEST',
        message: 'Old password and new password are required'
      }
    });
  }
  
  const storedPassword = getSetting('password');
  if (oldPassword !== storedPassword) {
    return res.status(401).json({
      success: false,
      error: {
        code: 'INVALID_PASSWORD',
        message: 'Old password is incorrect'
      }
    });
  }
  
  if (newPassword.length < 4) {
    return res.status(400).json({
      success: false,
      error: {
        code: 'INVALID_PASSWORD',
        message: 'New password must be at least 4 characters'
      }
    });
  }
  
  setSetting('password', newPassword);
  
  res.json({
    success: true,
    data: { message: 'Password changed successfully' }
  });
});

app.post('/api/proxy/:provider', async (req, res) => {
  const { provider } = req.params;
  
  const mockProvider = createMockProvider(provider as UsageProvider);
  if (!mockProvider) {
    res.status(400).json({
      success: false,
      error: { code: 'MOCK_PROVIDER_NOT_FOUND', message: 'Provider not found' },
    });
    return;
  }

  const providers = getAllMockProviders();
  const providerConfig = providers.find(p => p.provider === provider);
  
  try {
    const snapshot = await mockProvider.fetchUsage(providerConfig?.credentials || { type: AuthType.API_KEY, value: 'mock-key' });
    if (providerConfig) {
      recordMockUsage(providerConfig.id, snapshot);
    }
    res.json({ success: true, data: snapshot });
  } catch (error) {
    res.status(400).json({
      success: false,
      error: { code: 'FETCH_ERROR', message: error instanceof Error ? error.message : 'Unknown error' },
    });
  }
});

app.get('/api/providers', (_req, res) => {
  try {
    const providers = getAllMockProviders();
    const sanitized = providers.map(p => ({
      provider: p.provider,
      credentials: sanitizeCredential(p.credentials),
      name: p.name || null,
      refreshInterval: p.refreshInterval,
      region: p.region,
    }));
    
    res.json({
      success: true,
      data: sanitized,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
    });
  }
});

app.get('/api/providers/credentials', (_req, res) => {
  try {
    const providers = getAllMockProviders();
    const credentialsList = providers.map(p => ({
      provider: p.provider,
      credentials: p.credentials,
      name: p.name || null,
      refreshInterval: p.refreshInterval,
      region: p.region,
    }));
    
    res.json({
      success: true,
      data: credentialsList,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
    });
  }
});

app.post('/api/providers', async (req, res) => {
  try {
    const { provider, credentials, authType, refreshInterval, region, name } = req.body;
    
    if (!provider || !credentials) {
      res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_REQUEST',
          message: 'Provider and credentials are required',
        },
      });
      return;
    }

    const credential: Credential = createCredential(provider as UsageProvider, authType || 'cookie', credentials);
    
    const config: ProviderConfig = {
      provider: provider as UsageProvider,
      credentials: credential,
      refreshInterval: refreshInterval || 5,
      region,
      name,
    };

    saveMockProvider(provider as UsageProvider, config);
    
    res.json({
      success: true,
      data: {
        provider,
        refreshInterval: config.refreshInterval,
        region: config.region,
        name: config.name,
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
    });
  }
});

app.put('/api/providers/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { refreshInterval, region, name } = req.body;
    
    const providers = getAllMockProviders();
    const providerConfig = providers.find(p => p.provider === id);
    
    if (!providerConfig) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'Provider not found',
        },
      });
    }
    
    const updated: ProviderConfig = {
      ...providerConfig,
      refreshInterval: refreshInterval ?? providerConfig.refreshInterval,
      region: region !== undefined ? region : providerConfig.region,
      name: name !== undefined ? name : providerConfig.name,
    };

    saveMockProvider(id as UsageProvider, updated);
    
    res.json({
      success: true,
      data: updated,
    });
  } catch (error) {
    console.error('PUT provider error:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
    });
  }
});

app.delete('/api/:id', (req, res) => {
  try {
    const { id } = req.params;
    const providerId = Number(id);
    if (Number.isNaN(providerId)) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_PROVIDER_ID',
          message: 'Provider id must be numeric',
        },
      });
    }
    deleteMockProvider(providerId);
    
    res.json({
      success: true,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
    });
  }
});

app.post('/api/:id/refresh', async (req, res) => {
  try {
    const { id } = req.params;
    const providerId = parseInt(id);
    const provider = getMockProvider(providerId);
    
    if (!provider) {
      res.status(404).json({
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'Provider not found',
        },
      });
      return;
    }

    const providers = getAllMockProviders();
    const providerConfig = providers.find(p => p.id === providerId);
    const mockProvider = providerConfig ? createMockProvider(providerConfig.provider) : null;
    if (!mockProvider) {
      res.status(400).json({
        success: false,
        error: {
          code: 'MOCK_PROVIDER_NOT_FOUND',
          message: 'Mock provider implementation not found',
        },
      });
      return;
    }

    let snapshot: UsageSnapshot;
    try {
      snapshot = await mockProvider.fetchUsage(providerConfig?.credentials || { type: AuthType.API_KEY, value: 'mock-key' });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      res.status(400).json({
        success: false,
        error: {
          code: 'FETCH_ERROR',
          message: errorMessage,
        },
      });
      return;
    }

    if (providerConfig) {
      recordMockUsage(providerConfig.id, snapshot);
    }
    
    res.json({
      success: true,
      data: snapshot,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
    });
  }
});

app.get('/api/history', (req, res) => {
  try {
    const days = parseInt(req.query.days as string) || 30;
    const resolveBucketMinutes = (rangeDays: number, bucketMinutesParam?: string): number => {
      const explicitBucket = Number(bucketMinutesParam);
      const minBucket = rangeDays >= 90 ? 20 : 1;
      if (Number.isFinite(explicitBucket) && explicitBucket >= 1) return Math.max(Math.floor(explicitBucket), minBucket);
      if (rangeDays <= 7) return 5;
      if (rangeDays <= 14) return 10;
      if (rangeDays <= 30) return 15;
      if (rangeDays <= 60) return 20;
      if (rangeDays <= 90) return 30;
      return 60;
    };
    const bucketMinutes = resolveBucketMinutes(days, req.query.bucketMinutes as string | undefined);
    const provider = req.query.provider as string;
    const compactHistory = (records: Array<{
      progress: { items: Array<{ name: string; usedPercent: number }>; cost?: { used: number; limit: number } } | null;
      createdAt: Date;
    }>) => {
      const progressNameToIndex = new Map<string, number>();
      const progressKeys: string[] = [];
      const ensureProgressKey = (name: string): number => {
        const existing = progressNameToIndex.get(name);
        if (existing !== undefined) return existing;
        const nextIndex = progressKeys.length;
        progressNameToIndex.set(name, nextIndex);
        progressKeys.push(name);
        return nextIndex;
      };
      const data = records.map((record) => {
        const items = (record.progress?.items || [])
          .filter((item) => typeof item.name === 'string' && typeof item.usedPercent === 'number')
          .map((item) => [ensureProgressKey(item.name), item.usedPercent] as [number, number]);
        const cost = record.progress?.cost;
        return {
          t: Math.floor(record.createdAt.getTime() / 1000),
          ...(items.length > 0 ? { p: items } : {}),
          ...(cost && typeof cost.used === 'number' && typeof cost.limit === 'number'
            ? { c: [cost.used, cost.limit] as [number, number] }
            : {}),
        };
      });
      const bucketSeconds = bucketMinutes * 60;
      const byBucket = new Map<number, typeof data[number]>();
      data.forEach((record) => {
        const key = Math.floor(record.t / bucketSeconds) * bucketSeconds;
        const existing = byBucket.get(key);
        if (!existing || record.t >= existing.t) {
          byBucket.set(key, record);
        }
      });
      const downsampled = Array.from(byBucket.entries())
        .sort((a, b) => a[0] - b[0])
        .map(([, record]) => record);
      return { k: progressKeys, d: downsampled };
    };
    
    let data;
    if (provider) {
      const providerId = Number(provider);
      if (Number.isNaN(providerId)) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'INVALID_PROVIDER_ID',
            message: 'Provider id must be numeric',
          },
        });
      }
      const history = getMockUsageHistory(providerId, days);
      data = { [provider]: compactHistory(history) };
    } else {
      const allHistory = getAllMockUsageHistory(days);
      data = Object.fromEntries(
        Array.from(allHistory.entries()).map(([providerId, records]) => [providerId, compactHistory(records)])
      );
    }
    
    res.json({
      success: true,
      data,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
    });
  }
});

// ========== Endpoint API ==========
interface ProviderUsageInfo {
  id: string;
  name: string;
  provider: string;
  usage: {
    primary: {
      used?: number;
      usedPercent?: number;
      remaining?: number;
      remainingPercent?: number;
      total: number;
    } | null;
    secondary: { used?: number; usedPercent?: number } | null;
    tertiary: { used?: number; usedPercent?: number } | null;
  } | null;
  lastRefresh: string | null;
  error?: string;
}

function formatPercent(value: number | null | undefined): number | undefined {
  if (value === null || value === undefined) return undefined;
  return Number(value.toFixed(2));
}

function formatPercentDisplay(value: number | undefined): string {
  if (value === undefined) return '-';
  return `${value.toFixed(2)}%`;
}

function formatDateTime(isoString: string | null, timezone: string): string {
  if (!isoString) return '-';
  try {
    const date = new Date(isoString);
    const formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    });
    const parts = formatter.formatToParts(date);
    const year = parts.find(p => p.type === 'year')?.value;
    const month = parts.find(p => p.type === 'month')?.value;
    const day = parts.find(p => p.type === 'day')?.value;
    const hour = parts.find(p => p.type === 'hour')?.value;
    const minute = parts.find(p => p.type === 'minute')?.value;
    const second = parts.find(p => p.type === 'second')?.value;
    return `${year}-${month}-${day} ${hour}:${minute}:${second}`;
  } catch {
    return isoString;
  }
}

function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function formatAsXml(providers: ProviderUsageInfo[], summary: { total: number; totalUsedPercent: number }, pretty: boolean, timezone: string): string {
  const indent = pretty ? '  ' : '';
  const newline = pretty ? '\n' : '';
  
  let xml = `<?xml version="1.0" encoding="UTF-8"?>${newline}`;
  xml += `<subscriptions>${newline}`;
  xml += `${indent}<timestamp>${formatDateTime(new Date().toISOString(), timezone)}</timestamp>${newline}`;
  xml += `${indent}<summary>${newline}`;
  xml += `${indent}${indent}<total>${summary.total}</total>${newline}`;
  xml += `${indent}${indent}<totalUsedPercent>${summary.totalUsedPercent ?? 0}</totalUsedPercent>${newline}`;
  xml += `${indent}</summary>${newline}`;
  xml += `${indent}<providers>${newline}`;
  
  for (const p of providers) {
    xml += `${indent}${indent}<provider id="${p.id}">${newline}`;
    xml += `${indent}${indent}${indent}<provider>${escapeXml(p.provider)}</provider>${newline}`;
    if (p.name) {
      xml += `${indent}${indent}${indent}<name>${escapeXml(p.name)}</name>${newline}`;
    }
    if (p.usage?.primary) {
      xml += `${indent}${indent}${indent}<usage>${newline}`;
      xml += `${indent}${indent}${indent}${indent}<primary>${newline}`;
      xml += `${indent}${indent}${indent}${indent}${indent}<usedPercent>${p.usage.primary.usedPercent ?? 0}</usedPercent>${newline}`;
      xml += `${indent}${indent}${indent}${indent}${indent}<remainingPercent>${p.usage.primary.remainingPercent ?? 0}</remainingPercent>${newline}`;
      xml += `${indent}${indent}${indent}${indent}</primary>${newline}`;
      xml += `${indent}${indent}${indent}</usage>${newline}`;
    }
    if (p.lastRefresh) {
      xml += `${indent}${indent}${indent}<lastRefresh>${formatDateTime(p.lastRefresh, timezone)}</lastRefresh>${newline}`;
    }
    if (p.error) {
      xml += `${indent}${indent}${indent}<error>${escapeXml(p.error)}</error>${newline}`;
    }
    xml += `${indent}${indent}</provider>${newline}`;
  }
  
  xml += `${indent}</providers>${newline}`;
  xml += `</subscriptions>`;
  
  return xml;
}

function formatAsTable(providers: ProviderUsageInfo[], summary: { total: number; totalUsedPercent: number }, timezone: string): string {
  const header = '│ Provider   │ Name        │ Used %   │ Remaining %  │ Last Refresh          │';
  const separator = '├────────────┼──────────────┼──────────┼──────────────┼──────────────────────┤';
  
  let table = '\n';
  table += '┌────────────┬──────────────┬──────────┬──────────────┬──────────────────────┐\n';
  table += header + '\n';
  table += separator + '\n';
  
  for (const p of providers) {
    const provider = (p.provider + '          ').slice(0, 10);
    const name = ((p.name || '-') + '          ').slice(0, 10);
    const used = (formatPercentDisplay(p.usage?.primary?.usedPercent) + '        ').slice(0, 8);
    const remaining = (formatPercentDisplay(p.usage?.primary?.remainingPercent) + '           ').slice(0, 12);
    const lastRefresh = p.lastRefresh ? formatDateTime(p.lastRefresh, timezone).slice(0, 20) : '-';
    
    table += `│ ${provider} │ ${name} │ ${used} │ ${remaining} │ ${(lastRefresh + '                    ').slice(0, 20)} │\n`;
  }
  
  table += '└────────────┴──────────────┴──────────┴──────────────┴──────────────────────┘\n';
  table += `\nSummary: ${summary.total} providers, Avg Used: ${formatPercentDisplay(summary.totalUsedPercent)}\n`;
  
  return table;
}

function formatAsMarkdown(providers: ProviderUsageInfo[], summary: { total: number; totalUsedPercent: number }, pretty: boolean, timezone: string): string {
  let md = '# Subscription Usage\n\n';
  
  const providerWidth = Math.max(8, ...providers.map(p => p.provider.length));
  const nameWidth = Math.max(4, ...providers.map(p => (p.name || '-').length));
  const usedWidth = 8;
  const remainingWidth = 12;
  const lastRefreshWidth = 19;
  
  const header = `| ${'Provider'.padEnd(providerWidth)} | ${'Name'.padEnd(nameWidth)} | ${'Used %'.padEnd(usedWidth)} | ${'Remaining %'.padEnd(remainingWidth)} | ${'Last Refresh'.padEnd(lastRefreshWidth)} |`;
  const separator = `|:${'-'.repeat(providerWidth)}:|:${'-'.repeat(nameWidth)}:|:${'-'.repeat(usedWidth)}:|:${'-'.repeat(remainingWidth)}:|:${'-'.repeat(lastRefreshWidth)}:|`;
  
  md += header + '\n';
  md += separator + '\n';
  
  for (const p of providers) {
    const name = (p.name || '-');
    const used = formatPercentDisplay(p.usage?.primary?.usedPercent);
    const remaining = formatPercentDisplay(p.usage?.primary?.remainingPercent);
    const lastRefresh = p.lastRefresh ? formatDateTime(p.lastRefresh, timezone).slice(0, 19) : '-';
    
    const centerProvider = p.provider.padStart(Math.floor((providerWidth + p.provider.length) / 2)).padEnd(providerWidth);
    const centerName = name.padStart(Math.floor((nameWidth + name.length) / 2)).padEnd(nameWidth);
    const centerUsed = used.padStart(Math.floor((usedWidth + used.length) / 2)).padEnd(usedWidth);
    const centerRemaining = remaining.padStart(Math.floor((remainingWidth + remaining.length) / 2)).padEnd(remainingWidth);
    const centerLastRefresh = lastRefresh.padStart(Math.floor((lastRefreshWidth + lastRefresh.length) / 2)).padEnd(lastRefreshWidth);
    
    md += `| ${centerProvider} | ${centerName} | ${centerUsed} | ${centerRemaining} | ${centerLastRefresh} |\n`;
  }
  
  md += `\n**Summary**: ${summary.total} providers, Average Used: ${formatPercentDisplay(summary.totalUsedPercent)}\n`;
  
  return md;
}

function formatAsCsv(providers: ProviderUsageInfo[], timezone: string): string {
  let csv = 'Provider,Name,Used%,Remaining%,Last Refresh\n';
  
  for (const p of providers) {
    const provider = p.provider;
    const name = p.name || '';
    const used = p.usage?.primary?.usedPercent?.toFixed(2) ?? '';
    const remaining = p.usage?.primary?.remainingPercent?.toFixed(2) ?? '';
    const lastRefresh = p.lastRefresh ? formatDateTime(p.lastRefresh, timezone) : '';
    
    csv += `"${provider}","${name}",${used},${remaining},${lastRefresh}\n`;
  }
  
  return csv;
}

app.use('/api/endpoint', endpointMockRouter);

app.get('/api/history/providers', (req, res) => {
  try {
    const days = parseInt(req.query.days as string) || 30;
    const history = getAllMockUsageHistory(days);
    
    const providers = Array.from(history.keys()).map(providerId => ({
      id: providerId,
      recordCount: history.get(providerId)?.length || 0,
    }));
    
    res.json({
      success: true,
      data: providers,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
    });
  }
});

app.get('/api/:id/history', (req, res) => {
  try {
    const { id } = req.params;
    const days = parseInt(req.query.days as string) || 30;
    const providerId = Number(id);
    if (Number.isNaN(providerId)) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_PROVIDER_ID',
          message: 'Provider id must be numeric',
        },
      });
    }
    
    const history = getMockUsageHistory(providerId, days);
    
    res.json({
      success: true,
      data: history,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
    });
  }
});

function createCredential(provider: UsageProvider, type: string, value: string): Credential {
  switch (type) {
    case 'api_key':
      return { type: AuthType.API_KEY, value, keyPrefix: value.substring(0, 8) };
    case 'cookie':
      return { type: AuthType.COOKIE, value, source: 'manual' };
    case 'oauth':
      if (provider === UsageProvider.ANTIGRAVITY) {
        const trimmed = value.trim();
        if (trimmed.startsWith('{')) {
          try {
            const parsed = JSON.parse(trimmed) as Record<string, unknown>;
            const accessToken = typeof parsed.accessToken === 'string'
              ? parsed.accessToken
              : (typeof parsed.access_token === 'string' ? parsed.access_token : '');
            if (!accessToken) {
              throw new Error('Antigravity OAuth JSON is missing access_token');
            }
            return {
              type: AuthType.OAUTH,
              accessToken,
              refreshToken: typeof parsed.refreshToken === 'string'
                ? parsed.refreshToken
                : (typeof parsed.refresh_token === 'string' ? parsed.refresh_token : undefined),
              projectId: typeof parsed.projectId === 'string'
                ? parsed.projectId
                : (typeof parsed.project_id === 'string' ? parsed.project_id : undefined),
            };
          } catch (error) {
            throw new Error(error instanceof Error ? error.message : 'Invalid Antigravity OAuth JSON');
          }
        }
      }
      return { type: AuthType.OAUTH, accessToken: value };
    case 'jwt':
      if (provider === UsageProvider.KIMI) {
        throw new Error('Kimi only supports Browser Cookie authentication');
      }
      return { type: AuthType.JWT, value };
    default:
      return { type: AuthType.COOKIE, value, source: 'manual' };
  }
}

function sanitizeCredential(credential: Credential): Credential {
  if (credential.type === AuthType.API_KEY) {
    return { ...credential, value: credential.value.substring(0, 4) + '****' + credential.value.substring(credential.value.length - 4) };
  }
  if (credential.type === AuthType.COOKIE) {
    return { ...credential, value: '[COOKIE]' };
  }
  if (credential.type === AuthType.OAUTH) {
    return { ...credential, accessToken: '[TOKEN]' };
  }
  if (credential.type === AuthType.JWT) {
    return { ...credential, value: '[JWT]' };
  }
  return credential;
}

app.use(express.static(path.join(__dirname, '../../public')));

app.listen(MOCK_PORT, '0.0.0.0', () => {
  console.log(`Mock Server running on http://0.0.0.0:${MOCK_PORT}`);
  console.log('Mock mode: Usage data will dynamically increase over time');
});
