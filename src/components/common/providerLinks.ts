import { UsageProvider } from '../../types';

const DEFAULT_PROVIDER_LINKS: Record<UsageProvider, string> = {
  [UsageProvider.ALIYUN]: 'https://bailian.console.aliyun.com/',
  [UsageProvider.ANTIGRAVITY]: 'https://antigravity.so/',
  [UsageProvider.CLAUDE]: 'https://claude.ai/',
  [UsageProvider.CODEX]: 'https://chatgpt.com/',
  [UsageProvider.KIMI]: 'https://www.kimi.com/',
  [UsageProvider.MINIMAX]: 'https://minimaxi.com/',
  [UsageProvider.ZAI]: 'https://z.ai/',
  [UsageProvider.COPILOT]: 'https://github.com/copilot',
  [UsageProvider.OPENROUTER]: 'https://openrouter.ai/',
  [UsageProvider.OLLAMA]: 'https://ollama.com/',
  [UsageProvider.OPENCODE]: 'https://opencode.ai/',
  [UsageProvider.CURSOR]: 'https://cursor.com/',
};

const REGION_LINKS: Partial<Record<UsageProvider, Record<string, string>>> = {
  [UsageProvider.MINIMAX]: {
    minimax_global: 'https://minimax.io/',
    global: 'https://minimax.io/',
    minimax_cn: 'https://minimaxi.com',
    cn: 'https://minimaxi.com',
    china: 'https://minimaxi.com',
  },
  [UsageProvider.ZAI]: {
    zai_global: 'https://z.ai/',
    global: 'https://z.ai/',
    zai_bigmodel_cn: 'https://open.bigmodel.cn/',
    bigmodel_cn: 'https://open.bigmodel.cn/',
    'bigmodel-cn': 'https://open.bigmodel.cn/',
    cn: 'https://open.bigmodel.cn/',
    china: 'https://open.bigmodel.cn/',
  },
};

export function resolveProviderWebsite(provider: UsageProvider, region?: string): string | undefined {
  const normalizedRegion = region?.trim().toLowerCase();
  if (normalizedRegion) {
    const providerRegionMap = REGION_LINKS[provider];
    if (providerRegionMap?.[normalizedRegion]) {
      return providerRegionMap[normalizedRegion];
    }
  }

  return DEFAULT_PROVIDER_LINKS[provider];
}
