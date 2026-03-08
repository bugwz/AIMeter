import { providerRegistry } from '../../src/adapters/registry.js';
import { AuthType, Credential, ProviderConfig, UsageProvider, UsageSnapshot } from '../../src/types/index.js';
import { isMockMode } from '../runtime.js';
import { createMockProvider } from '../mock/providers/base.js';
import { runtimeConfig } from '../runtime.js';
import { storage } from '../storage.js';

export async function fetchUsageForProvider(config: ProviderConfig): Promise<UsageSnapshot> {
  if (isMockMode()) {
    const mockProvider = createMockProvider(config.provider, config);
    if (!mockProvider) {
      throw new Error(`Mock provider not found for ${config.provider}`);
    }
    return mockProvider.fetchUsage(config.credentials, config.region);
  }

  const adapter = providerRegistry.getProvider(config.provider);
  if (!adapter) {
    throw new Error(`Provider adapter not found for ${config.provider}`);
  }

  const beforeCredentialFingerprint = fingerprintOAuthCredential(config.credentials);
  const snapshot = await adapter.fetchUsage(config.credentials, config);

  await persistUpdatedCredentialIfNeeded(config, beforeCredentialFingerprint);
  return snapshot;
}

export function getAdapterForProvider(provider: UsageProvider) {
  if (runtimeConfig.mockEnabled) {
    return createMockProvider(provider);
  }

  return providerRegistry.getProvider(provider);
}

function fingerprintOAuthCredential(credential: Credential): string | undefined {
  if (credential.type !== AuthType.OAUTH) {
    return undefined;
  }

  const expiresAt = credential.expiresAt instanceof Date
    ? credential.expiresAt.toISOString()
    : credential.expiresAt;

  return JSON.stringify({
    accessToken: credential.accessToken || '',
    refreshToken: credential.refreshToken || '',
    idToken: credential.idToken || '',
    clientId: credential.clientId || '',
    clientSecret: credential.clientSecret || '',
    projectId: credential.projectId || '',
    expiresAt: expiresAt || '',
  });
}

async function persistUpdatedCredentialIfNeeded(
  config: ProviderConfig,
  beforeCredentialFingerprint: string | undefined,
): Promise<void> {
  if (config.provider !== UsageProvider.CLAUDE) {
    return;
  }
  if (!config.id || config.storageMode !== 'database') {
    return;
  }
  if (config.credentials.type !== AuthType.OAUTH) {
    return;
  }

  const afterCredentialFingerprint = fingerprintOAuthCredential(config.credentials);
  if (!beforeCredentialFingerprint || !afterCredentialFingerprint || beforeCredentialFingerprint === afterCredentialFingerprint) {
    return;
  }

  try {
    await storage.updateProvider(config.id, { credentials: config.credentials });
  } catch (error) {
    console.warn(`Failed to persist refreshed ${config.provider} OAuth credentials for ${config.id}:`, error);
  }
}
