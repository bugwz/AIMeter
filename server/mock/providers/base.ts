import { UsageProvider, ProviderConfig } from '../../../src/types/index.js';
import { MockProviderConfig, MOCK_PROVIDER_CONFIGS } from '../config.js';
import {
  ClaudeMockProvider,
  CopilotMockProvider,
  CursorMockProvider,
  OpenRouterMockProvider,
  ZaiMockProvider,
  MiniMaxMockProvider,
  KimiMockProvider,
  CodexMockProvider,
  OpenCodeMockProvider,
  OllamaMockProvider,
} from './mock-providers.js';

export interface MockProviderOptions {
  provider: UsageProvider;
  config: MockProviderConfig;
  instanceId?: string;
}

export function createMockProvider(provider: UsageProvider, providerConfig?: Pick<ProviderConfig, 'id'>): any {
  const config = MOCK_PROVIDER_CONFIGS[provider];
  
  if (!config) {
    console.warn(`No mock config for provider: ${provider}`);
    return null;
  }

  const options: MockProviderOptions = {
    provider,
    config,
    instanceId: providerConfig?.id,
  };

  switch (provider) {
    case UsageProvider.ALIYUN:
      return new ClaudeMockProvider(options);
    case UsageProvider.CLAUDE:
      return new ClaudeMockProvider(options);
    case UsageProvider.COPILOT:
      return new CopilotMockProvider(options);
    case UsageProvider.CURSOR:
      return new CursorMockProvider(options);
    case UsageProvider.OPENROUTER:
      return new OpenRouterMockProvider(options);
    case UsageProvider.MINIMAX:
      return new MiniMaxMockProvider(options);
    case UsageProvider.ZAI:
      return new ZaiMockProvider(options);
    case UsageProvider.KIMI:
      return new KimiMockProvider(options);
    case UsageProvider.CODEX:
      return new CodexMockProvider(options);
    case UsageProvider.OPENCODE:
      return new OpenCodeMockProvider(options);
    case UsageProvider.OLLAMA:
      return new OllamaMockProvider(options);
    default:
      return null;
  }
}
