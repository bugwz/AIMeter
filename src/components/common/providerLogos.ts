import { UsageProvider } from '../../types';

export const providerLogos: Partial<Record<UsageProvider, string>> = {
  [UsageProvider.ALIYUN]: '/providers/aliyun.svg',
  [UsageProvider.CLAUDE]: '/providers/claude.svg',
  [UsageProvider.CODEX]: '/providers/codex.svg',
  [UsageProvider.KIMI]: '/providers/kimi.svg',
  [UsageProvider.MINIMAX]: '/providers/minimax.svg',
  [UsageProvider.ZAI]: '/providers/zai.svg',
  [UsageProvider.COPILOT]: '/providers/copilot.svg',
  [UsageProvider.OPENROUTER]: '/providers/openrouter.svg',
  [UsageProvider.OLLAMA]: '/providers/ollama.svg',
  [UsageProvider.OPENCODE]: '/providers/opencode.svg',
  [UsageProvider.CURSOR]: '/providers/cursor.svg',
};
