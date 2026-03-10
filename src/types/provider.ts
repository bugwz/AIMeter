// Provider-related type definitions
export enum UsageProvider {
  ALIYUN = 'aliyun',
  CLAUDE = 'claude',
  CODEX = 'codex',
  KIMI = 'kimi',
  MINIMAX = 'minimax',
  ZAI = 'zai',
  COPILOT = 'copilot',
  OPENROUTER = 'openrouter',
  OLLAMA = 'ollama',
  OPENCODE = 'opencode',
  CURSOR = 'cursor',
}

// Provider metadata
export interface ProviderMeta {
  id: UsageProvider;
  name: string;
  logo: string;
  color: string;
  supportedAuthTypes: AuthType[];
  docsUrl?: string;
}

// Authentication types
export enum AuthType {
  COOKIE = 'cookie',
  API_KEY = 'api_key',
  OAUTH = 'oauth',
  JWT = 'jwt',
}

// Credential types
export type Credential =
  | { type: AuthType.COOKIE; value: string; source?: 'browser' | 'manual' }
  | { type: AuthType.API_KEY; value: string; keyPrefix?: string }
  | {
      type: AuthType.OAUTH;
      accessToken: string;
      refreshToken?: string;
      expiresAt?: Date | string;
      scope?: string;
      idToken?: string;
      clientId?: string;
      clientSecret?: string;
      projectId?: string;
    }
  | { type: AuthType.JWT; value: string };

// Account identity information
export interface Identity {
  plan?: string;
}

// Provider configuration
export interface ProviderConfig {
  id?: string;
  provider: UsageProvider;
  credentials: Credential;
  refreshInterval: number; // Minutes; 0 means no automatic refresh
  displayOrder?: number; // Display order on the dashboard
  attrs?: Record<string, unknown>; // provider-specific attributes persisted in database
  region?: string; // Optional region configuration
  name?: string; // Custom display name
  claudeAuthMode?: 'oauth' | 'cookie'; // Claude: user-selected query mode
  plan?: string; // Claude: optional manually selected plan
  opencodeWorkspaceId?: string; // OpenCode: optional workspace ID (wrk_...)
  defaultProgressItem?: string; // progress item name to show as primary in history
  configSource?: 'database' | 'environment' | 'config';
  storageMode?: 'database' | 'env';
}

// Region enum
export enum ProviderRegion {
  // MiniMax regions
  MINIMAX_GLOBAL = 'minimax_global',
  MINIMAX_CN = 'minimax_cn',
  // z.ai regions
  ZAI_GLOBAL = 'zai_global',
  ZAI_BIGMODEL_CN = 'zai_bigmodel_cn',
}

// Region metadata
export interface RegionMeta {
  id: string;
  provider: UsageProvider;
  name: string;
  displayName: string;
  baseURL: string;
}

// Region map
export const REGIONS: Record<ProviderRegion, RegionMeta> = {
  // MiniMax regions
  [ProviderRegion.MINIMAX_GLOBAL]: {
    id: ProviderRegion.MINIMAX_GLOBAL,
    provider: UsageProvider.MINIMAX,
    name: 'global',
    displayName: 'Global (platform.minimax.io)',
    baseURL: 'https://platform.minimax.io',
  },
  [ProviderRegion.MINIMAX_CN]: {
    id: ProviderRegion.MINIMAX_CN,
    provider: UsageProvider.MINIMAX,
    name: 'cn',
    displayName: 'China Mainland (platform.minimaxi.com)',
    baseURL: 'https://platform.minimaxi.com',
  },
  [ProviderRegion.ZAI_GLOBAL]: {
    id: ProviderRegion.ZAI_GLOBAL,
    provider: UsageProvider.ZAI,
    name: 'global',
    displayName: 'Global (api.z.ai)',
    baseURL: 'https://api.z.ai',
  },
  [ProviderRegion.ZAI_BIGMODEL_CN]: {
    id: ProviderRegion.ZAI_BIGMODEL_CN,
    provider: UsageProvider.ZAI,
    name: 'bigmodel-cn',
    displayName: 'BigModel CN (open.bigmodel.cn)',
    baseURL: 'https://open.bigmodel.cn',
  },
};

// Get regions supported by a provider
export function getRegionsForProvider(provider: UsageProvider): RegionMeta[] {
  return Object.values(REGIONS).filter(r => r.provider === provider);
}

// Provider name map
export const PROVIDER_NAMES: Record<UsageProvider, string> = {
  [UsageProvider.ALIYUN]: 'Aliyun',
  [UsageProvider.CLAUDE]: 'Claude',
  [UsageProvider.CODEX]: 'Codex',
  [UsageProvider.KIMI]: 'Kimi',
  [UsageProvider.MINIMAX]: 'MiniMax',
  [UsageProvider.ZAI]: 'z.ai',
  [UsageProvider.COPILOT]: 'Copilot',
  [UsageProvider.OPENROUTER]: 'OpenRouter',
  [UsageProvider.OLLAMA]: 'Ollama',
  [UsageProvider.OPENCODE]: 'OpenCode',
  [UsageProvider.CURSOR]: 'Cursor',
};

// Provider color map
export const PROVIDER_COLORS: Record<UsageProvider, string> = {
  [UsageProvider.ALIYUN]: '#FF6A00',
  [UsageProvider.CLAUDE]: '#D97757',
  [UsageProvider.CODEX]: '#10A37F',
  [UsageProvider.KIMI]: '#5B5FE3',
  [UsageProvider.MINIMAX]: '#2A2A2A',
  [UsageProvider.ZAI]: '#111827',
  [UsageProvider.COPILOT]: '#333333',
  [UsageProvider.OPENROUTER]: '#635BFF',
  [UsageProvider.OLLAMA]: '#000000',
  [UsageProvider.OPENCODE]: '#000000',
  [UsageProvider.CURSOR]: '#000000',
};
