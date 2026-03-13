import { MOCK_PROVIDER_CONFIGS } from './config.js';
import { UsageProvider, ProviderConfig, AuthType, Credential } from '../../src/types/index.js';
import { runtimeConfig } from '../runtime.js';
import { storage } from '../storage.js';
import { createMockProvider } from './providers/base.js';
import { generateRandomEnglishName } from './displayName.js';

function buildDefaultMockCredential(provider: UsageProvider): Credential {
  switch (provider) {
    case UsageProvider.ALIYUN:
    case UsageProvider.KIMI:
    case UsageProvider.OLLAMA:
    case UsageProvider.CURSOR:
    case UsageProvider.OPENCODE:
      return { type: AuthType.COOKIE, value: `mock-cookie-${provider}`, source: 'manual' };
    case UsageProvider.CLAUDE:
    case UsageProvider.CODEX:
    case UsageProvider.ANTIGRAVITY:
      return { type: AuthType.OAUTH, accessToken: `mock-oauth-${provider}` };
    case UsageProvider.COPILOT:
      return { type: AuthType.OAUTH, accessToken: `mock-oauth-${provider}` };
    case UsageProvider.MINIMAX:
    case UsageProvider.OPENROUTER:
    case UsageProvider.ZAI:
    default: {
      const value = `mock-key-${provider}`;
      return { type: AuthType.API_KEY, value, keyPrefix: 'mock' };
    }
  }
}

function getDefaultMockRegion(provider: UsageProvider): string | undefined {
  switch (provider) {
    case UsageProvider.MINIMAX:
      return 'minimax_global';
    case UsageProvider.ZAI:
      return 'zai_global';
    default:
      return undefined;
  }
}

function floorToHour(date: Date): Date {
  const value = new Date(date);
  value.setMinutes(0, 0, 0);
  return value;
}

function buildHourlyPoints(now: Date, totalPoints: number): Date[] {
  const latestAt = new Date(floorToHour(now).getTime() - 60 * 60 * 1000);
  const points: Date[] = [];
  for (let i = totalPoints - 1; i >= 0; i -= 1) {
    points.push(new Date(latestAt.getTime() - i * 60 * 60 * 1000));
  }
  return points;
}

export async function ensureMockRuntimeProvidersSeeded(): Promise<void> {
  if (!runtimeConfig.mockEnabled) {
    return;
  }

  // Step 1/3: write settings before provider/usage seed.
  const now = new Date();
  await storage.setSetting('mock_seed_initialized_at', now.toISOString());

  // Step 2/3: ensure mock runtime providers exist.
  const existingProviders = await storage.listProviders();
  const providersByType = new Set(existingProviders.map((item) => item.provider));
  const usedNames = new Set(existingProviders.map((item) => item.name).filter((name): name is string => typeof name === 'string' && name.length > 0));

  for (const provider of Object.keys(MOCK_PROVIDER_CONFIGS) as UsageProvider[]) {
    if (providersByType.has(provider)) {
      continue;
    }
    const generatedName = generateRandomEnglishName(usedNames);
    usedNames.add(generatedName);
    const config: ProviderConfig = {
      provider,
      credentials: buildDefaultMockCredential(provider),
      refreshInterval: 5,
      name: generatedName,
      region: getDefaultMockRegion(provider),
    };
    await storage.createProvider(provider, config);
  }

  const providers = await storage.listProviders();
  for (const provider of providers) {
    const defaultRegion = getDefaultMockRegion(provider.provider);
    if (defaultRegion && !provider.region) {
      await storage.updateProvider(provider.id, { region: defaultRegion });
      provider.region = defaultRegion;
    }
    await storage.clearUsageHistory(provider.id);
  }

  // Step 3/3: seed usage records in global order:
  // oldest hour -> newest hour, and for each hour iterate all providers.
  const points = buildHourlyPoints(now, 100);
  const mockProviders = providers
    .map((provider) => ({
      provider,
      source: createMockProvider(provider.provider, provider),
    }))
    .filter((item) => item.source && typeof item.source.fetchUsageAt === 'function');

  for (const at of points) {
    for (const item of mockProviders) {
      const snapshot = await item.source.fetchUsageAt(item.provider.credentials, item.provider.region, at);
      await storage.recordUsageAt(item.provider.id, snapshot, at);
    }
  }

  await storage.setSetting('mock_seed_usage_points', '100');
  await storage.setSetting('mock_seed_latest_point_at', points[points.length - 1]?.toISOString() || '');
}
