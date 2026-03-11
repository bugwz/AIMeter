import { runtimeConfig } from '../runtime.js';

const ENGLISH_NAMES = [
  'Alex', 'Ava', 'Ben', 'Chloe', 'Daniel', 'Emma', 'Ethan', 'Grace', 'Henry', 'Ivy',
  'Jack', 'James', 'Leo', 'Liam', 'Lily', 'Logan', 'Lucas', 'Mason', 'Mia', 'Nora',
  'Noah', 'Olivia', 'Owen', 'Ryan', 'Sophia', 'Stella', 'Theo', 'Violet', 'William', 'Zoe',
];

const mockEnvDisplayNameStore = new Map<string, string>();

function randomIndex(max: number): number {
  if (max <= 1) return 0;
  return Math.floor(Math.random() * max);
}

export function generateRandomEnglishName(usedNames?: Set<string>): string {
  if (!usedNames || usedNames.size >= ENGLISH_NAMES.length) {
    return ENGLISH_NAMES[randomIndex(ENGLISH_NAMES.length)];
  }

  const candidates = ENGLISH_NAMES.filter((name) => !usedNames.has(name));
  if (candidates.length === 0) {
    return ENGLISH_NAMES[randomIndex(ENGLISH_NAMES.length)];
  }
  return candidates[randomIndex(candidates.length)];
}

function getMockEnvDisplayName(providerId: string): string {
  const existing = mockEnvDisplayNameStore.get(providerId);
  if (existing) return existing;
  const next = generateRandomEnglishName();
  mockEnvDisplayNameStore.set(providerId, next);
  return next;
}

export function resolveMockDisplayNameForResponse(provider: {
  id: string;
  name?: string | null;
}): string | null {
  if (!runtimeConfig.mockEnabled) {
    return provider.name || null;
  }
  if (runtimeConfig.storageMode === 'database') {
    return provider.name || null;
  }
  return getMockEnvDisplayName(provider.id);
}
