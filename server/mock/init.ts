import { 
  initMockDatabase, 
  getAllMockProviders, 
  saveMockProvider, 
  generateMockHistoryData,
  clearMockUsageHistory,
  hasMockHistoryData,
  getSetting,
  setSetting,
  setMockProviderRegion,
} from './database.js';
import { MOCK_PROVIDER_CONFIGS } from './config.js';
import { UsageProvider, ProviderConfig, AuthType, Credential } from '../../src/types/index.js';
import { runtimeConfig } from '../runtime.js';
import { storage } from '../storage.js';
import { fetchUsageForProvider } from '../services/ProviderUsageService.js';
import { createMockProvider } from './providers/base.js';

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

export function initMock() {
  if (!runtimeConfig.mockEnabled) {
    return;
  }

  if (runtimeConfig.storageMode === 'database') {
    return;
  }

  const MOCK_HISTORY_MODEL_VERSION = '2';

  initMockDatabase();
  console.log('Mock Database initialized');

  const existingProviders = getAllMockProviders();
  if (existingProviders.length === 0) {
    console.log('Adding default mock providers...');
    
    for (const [provider, mockConfig] of Object.entries(MOCK_PROVIDER_CONFIGS)) {
      const config: ProviderConfig = {
        provider: provider as UsageProvider,
        credentials: buildDefaultMockCredential(provider as UsageProvider),
        refreshInterval: 5,
        region: getDefaultMockRegion(provider as UsageProvider),
      };
      const providerId = saveMockProvider(provider as UsageProvider, config);
      generateMockHistoryData(providerId, mockConfig);
    }
    console.log(`Default mock providers added: ${Object.keys(MOCK_PROVIDER_CONFIGS).length}`);
    console.log('Mock history data generated for 30 days');
  } else {
    console.log('Checking existing providers for history data...');
    const currentVersion = getSetting('mock_history_model_version');
    const shouldRegenerateAll = currentVersion !== MOCK_HISTORY_MODEL_VERSION;

    if (shouldRegenerateAll) {
      clearMockUsageHistory();
      console.log(`Regenerating mock history with model v${MOCK_HISTORY_MODEL_VERSION}...`);
    }

    for (const p of existingProviders) {
      const mockConfig = MOCK_PROVIDER_CONFIGS[p.provider];
      const defaultRegion = getDefaultMockRegion(p.provider);
      if (defaultRegion && !p.region) {
        setMockProviderRegion(p.id, defaultRegion);
      }
      if (mockConfig && (shouldRegenerateAll || !hasMockHistoryData(p.id))) {
        generateMockHistoryData(p.id, mockConfig);
        console.log(`Generated history data for ${p.provider}`);
      }
    }

    if (shouldRegenerateAll) {
      setSetting('mock_history_model_version', MOCK_HISTORY_MODEL_VERSION);
    }
  }

  if (!getSetting('password')) {
    setSetting('password', 'password');
  }

  if (!getSetting('mock_history_model_version')) {
    setSetting('mock_history_model_version', MOCK_HISTORY_MODEL_VERSION);
  }
}

export async function ensureMockRuntimeProvidersSeeded(): Promise<void> {
  if (!runtimeConfig.mockEnabled || runtimeConfig.storageMode !== 'database') {
    return;
  }

  const currentProviders = await storage.listProviders();
  if (currentProviders.length === 0) {
    for (const [provider, mockConfig] of Object.entries(MOCK_PROVIDER_CONFIGS)) {
      const config: ProviderConfig = {
        provider: provider as UsageProvider,
        credentials: buildDefaultMockCredential(provider as UsageProvider),
        refreshInterval: 5,
        name: `Mock ${mockConfig.name}`,
        region: getDefaultMockRegion(provider as UsageProvider),
      };
      await storage.createProvider(provider as UsageProvider, config);
    }
    console.log(`[mock] Seeded ${Object.keys(MOCK_PROVIDER_CONFIGS).length} runtime providers for database mode`);
  }

  const providers = await storage.listProviders();
  const BACKFILL_DAYS = 90;
  const BACKFILL_STEP_MINUTES = 5;
  const EXPECTED_POINTS = Math.floor((BACKFILL_DAYS * 24 * 60) / BACKFILL_STEP_MINUTES);
  const BATCH_SIZE = 720;

  for (const provider of providers) {
    const defaultRegion = getDefaultMockRegion(provider.provider);
    if (defaultRegion && !provider.region) {
      await storage.updateProvider(provider.id, { region: defaultRegion });
      provider.region = defaultRegion;
    }

    const historyRows = await storage.getUsageHistory(provider.id, BACKFILL_DAYS);
    const hasEnoughHistory = historyRows.length >= EXPECTED_POINTS;
    if (!hasEnoughHistory) {
      const mockProvider = createMockProvider(provider.provider, provider);
      if (mockProvider && typeof mockProvider.fetchUsageAt === 'function') {
        await storage.clearUsageHistory(provider.id);
        const nowMs = Date.now();
        const totalMinutes = BACKFILL_DAYS * 24 * 60;
        const batch: Array<{ snapshot: Awaited<ReturnType<typeof mockProvider.fetchUsageAt>>; createdAt: Date }> = [];

        for (let minutesAgo = totalMinutes; minutesAgo >= BACKFILL_STEP_MINUTES; minutesAgo -= BACKFILL_STEP_MINUTES) {
          const at = new Date(nowMs - minutesAgo * 60 * 1000);
          try {
            const snapshot = await mockProvider.fetchUsageAt(provider.credentials, provider.region, at);
            batch.push({ snapshot, createdAt: at });
            if (batch.length >= BATCH_SIZE) {
              await storage.recordUsageBatchAt(provider.id, batch.splice(0, batch.length));
            }
          } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            console.warn(`[mock] Failed to backfill history for ${provider.provider} (${provider.id}) at ${at.toISOString()}: ${message}`);
            break;
          }
        }

        if (batch.length > 0) {
          await storage.recordUsageBatchAt(provider.id, batch);
        }
      }
    }

    const latest = await storage.getLatestUsage(provider.id);
    if (latest) continue;
    try {
      const snapshot = await fetchUsageForProvider(provider);
      await storage.recordUsage(provider.id, snapshot);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.warn(`[mock] Failed to seed latest usage for ${provider.provider} (${provider.id}): ${message}`);
    }
  }

}
