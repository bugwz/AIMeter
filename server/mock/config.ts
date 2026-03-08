import { UsageProvider } from '../../src/types/index.js';

export interface MockProviderConfig {
  provider: UsageProvider;
  name: string;
  initialUsage: number;
  limit: number;
  periodType: 'monthly' | 'weekly' | 'daily';
  consumptionRate: number;
  consumptionUnit: 'tokens' | 'requests' | 'credits' | 'dollars';
  resetDay?: number;
}

export const MOCK_PROVIDER_CONFIGS: Record<UsageProvider, MockProviderConfig> = {
  [UsageProvider.ALIYUN]: {
    provider: UsageProvider.ALIYUN,
    name: 'Aliyun',
    initialUsage: 1200,
    limit: 18000,
    periodType: 'monthly',
    consumptionRate: 150,
    consumptionUnit: 'requests',
    resetDay: 1,
  },
  [UsageProvider.CLAUDE]: {
    provider: UsageProvider.CLAUDE,
    name: 'Claude',
    initialUsage: 250000,
    limit: 500000,
    periodType: 'monthly',
    consumptionRate: 1000,
    consumptionUnit: 'tokens',
    resetDay: 1,
  },
  [UsageProvider.CODEX]: {
    provider: UsageProvider.CODEX,
    name: 'Codex',
    initialUsage: 150000,
    limit: 200000,
    periodType: 'monthly',
    consumptionRate: 800,
    consumptionUnit: 'tokens',
    resetDay: 1,
  },
  [UsageProvider.COPILOT]: {
    provider: UsageProvider.COPILOT,
    name: 'Copilot',
    initialUsage: 45,
    limit: 5000,
    periodType: 'monthly',
    consumptionRate: 2,
    consumptionUnit: 'requests',
    resetDay: 1,
  },
  [UsageProvider.CURSOR]: {
    provider: UsageProvider.CURSOR,
    name: 'Cursor',
    initialUsage: 500,
    limit: 2000,
    periodType: 'monthly',
    consumptionRate: 5,
    consumptionUnit: 'dollars',
    resetDay: 15,
  },
  [UsageProvider.OPENROUTER]: {
    provider: UsageProvider.OPENROUTER,
    name: 'OpenRouter',
    initialUsage: 5,
    limit: 20,
    periodType: 'monthly',
    consumptionRate: 0.01,
    consumptionUnit: 'dollars',
    resetDay: 1,
  },
  [UsageProvider.MINIMAX]: {
    provider: UsageProvider.MINIMAX,
    name: 'MiniMax',
    initialUsage: 10500,
    limit: 15000,
    periodType: 'monthly',
    consumptionRate: 500,
    consumptionUnit: 'tokens',
    resetDay: 1,
  },
  [UsageProvider.ZAI]: {
    provider: UsageProvider.ZAI,
    name: 'z.ai',
    initialUsage: 2500000,
    limit: 10000000,
    periodType: 'weekly',
    consumptionRate: 5000,
    consumptionUnit: 'tokens',
    resetDay: 1,
  },
  [UsageProvider.KIMI]: {
    provider: UsageProvider.KIMI,
    name: 'Kimi',
    initialUsage: 100000,
    limit: 200000,
    periodType: 'monthly',
    consumptionRate: 800,
    consumptionUnit: 'tokens',
    resetDay: 1,
  },
  [UsageProvider.OLLAMA]: {
    provider: UsageProvider.OLLAMA,
    name: 'Ollama',
    initialUsage: 0,
    limit: 1000000,
    periodType: 'monthly',
    consumptionRate: 0,
    consumptionUnit: 'tokens',
    resetDay: 1,
  },
  [UsageProvider.OPENCODE]: {
    provider: UsageProvider.OPENCODE,
    name: 'OpenCode',
    initialUsage: 50000,
    limit: 100000,
    periodType: 'monthly',
    consumptionRate: 300,
    consumptionUnit: 'tokens',
    resetDay: 1,
  },
};

export const MOCK_PORT = 3002;
