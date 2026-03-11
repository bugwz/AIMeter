// Adapter exports and registration
import { providerRegistry } from './registry.js';
import { claudeAdapter } from './ClaudeAdapter.js';
import { aliyunAdapter } from './AliyunAdapter.js';
import { codexAdapter } from './CodexAdapter.js';
import { kimiAdapter } from './KimiAdapter.js';
import { openRouterAdapter } from './OpenRouterAdapter.js';
import { miniMaxAdapter } from './MiniMaxAdapter.js';
import { copilotAdapter } from './CopilotAdapter.js';
import { ollamaAdapter } from './OllamaAdapter.js';
import { cursorAdapter } from './CursorAdapter.js';
import { openCodeAdapter } from './OpenCodeAdapter.js';
import { zaiAdapter } from './ZaiAdapter.js';
import { antigravityAdapter } from './AntigravityAdapter.js';

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
export * from './interface.js';
export * from './registry.js';
export { aliyunAdapter } from './AliyunAdapter.js';
export { claudeAdapter } from './ClaudeAdapter.js';
export { codexAdapter } from './CodexAdapter.js';
export { kimiAdapter } from './KimiAdapter.js';
export { openRouterAdapter } from './OpenRouterAdapter.js';
export { miniMaxAdapter } from './MiniMaxAdapter.js';
export { copilotAdapter } from './CopilotAdapter.js';
export { ollamaAdapter } from './OllamaAdapter.js';
export { cursorAdapter } from './CursorAdapter.js';
export { openCodeAdapter } from './OpenCodeAdapter.js';
export { zaiAdapter } from './ZaiAdapter.js';
export { antigravityAdapter } from './AntigravityAdapter.js';
