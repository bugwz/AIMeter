// Adapter exports and registration
import { providerRegistry } from './registry';
import { claudeAdapter } from './ClaudeAdapter';
import { aliyunAdapter } from './AliyunAdapter';
import { codexAdapter } from './CodexAdapter';
import { kimiAdapter } from './KimiAdapter';
import { openRouterAdapter } from './OpenRouterAdapter';
import { miniMaxAdapter } from './MiniMaxAdapter';
import { copilotAdapter } from './CopilotAdapter';
import { ollamaAdapter } from './OllamaAdapter';
import { cursorAdapter } from './CursorAdapter';
import { openCodeAdapter } from './OpenCodeAdapter';
import { zaiAdapter } from './ZaiAdapter';
import { antigravityAdapter } from './AntigravityAdapter';

// Register all adapters
providerRegistry.registerAdapter(aliyunAdapter);
providerRegistry.registerAdapter(claudeAdapter);
providerRegistry.registerAdapter(codexAdapter);
providerRegistry.registerAdapter(kimiAdapter);
providerRegistry.registerAdapter(openRouterAdapter);
providerRegistry.registerAdapter(miniMaxAdapter);
providerRegistry.registerAdapter(copilotAdapter);
providerRegistry.registerAdapter(ollamaAdapter);
providerRegistry.registerAdapter(cursorAdapter);
providerRegistry.registerAdapter(openCodeAdapter);
providerRegistry.registerAdapter(zaiAdapter);
providerRegistry.registerAdapter(antigravityAdapter);

// Export all adapters
export * from './interface';
export * from './registry';
export { aliyunAdapter } from './AliyunAdapter';
export { claudeAdapter } from './ClaudeAdapter';
export { codexAdapter } from './CodexAdapter';
export { kimiAdapter } from './KimiAdapter';
export { openRouterAdapter } from './OpenRouterAdapter';
export { miniMaxAdapter } from './MiniMaxAdapter';
export { copilotAdapter } from './CopilotAdapter';
export { ollamaAdapter } from './OllamaAdapter';
export { cursorAdapter } from './CursorAdapter';
export { openCodeAdapter } from './OpenCodeAdapter';
export { zaiAdapter } from './ZaiAdapter';
export { antigravityAdapter } from './AntigravityAdapter';
