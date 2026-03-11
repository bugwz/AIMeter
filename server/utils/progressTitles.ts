import { UsageProvider } from '../../src/types/index.js';
import { formatWindowDurationFromMinutes } from './windowDuration.js';

type ProgressTitleMap = Partial<Record<UsageProvider, Record<string, string>>>;

const PROGRESS_TITLE_MAP: ProgressTitleMap = {
  [UsageProvider.CLAUDE]: {
    session: 'Session quota window',
    weekly: 'Weekly quota window',
  },
  [UsageProvider.OLLAMA]: {
    session: 'Session quota window',
    weekly: 'Weekly quota window',
  },
  [UsageProvider.OPENROUTER]: {
    'daily credits': '1 day window',
    'weekly credits': '7 days window',
    'monthly credits': '30 days window',
    'total credits': 'total window',
    credits: 'total window',
  },
  [UsageProvider.KIMI]: {
    primary: 'Primary quota window',
    secondary: 'Secondary quota window',
  },
};

function normalizeName(name: string): string {
  return name.trim().replace(/\s+/g, ' ').toLowerCase();
}

function formatWindowDescription(windowMinutes?: number | null): string {
  const duration = formatWindowDurationFromMinutes(windowMinutes);
  if (!duration) return '';
  return `${duration} window`;
}

function normalizeWindowLikeDescription(desc: string, windowDesc: string): string {
  const normalized = desc.trim();
  if (!normalized) return windowDesc;

  const pattern = /^(\d+(?:\.\d+)?\s+(?:second|seconds|minute|minutes|min|hour|hours|day|days|week|weeks|month|months)\s+window)(\s+for\s+.+)?$/i;
  const matched = normalized.match(pattern);
  if (!matched) return normalized;

  const suffix = matched[2] || '';
  return `${windowDesc}${suffix}`;
}

export function resolveProgressTitle(provider: UsageProvider, name: string): string | undefined {
  const providerMap = PROGRESS_TITLE_MAP[provider];
  if (!providerMap) return undefined;
  return providerMap[normalizeName(name)];
}

export function enrichProgressTitles<T extends { name: string; desc?: string; windowMinutes?: number | null }>(
  provider: UsageProvider,
  items: T[]
): T[] {
  return items.map((item) => {
    const legacyTitle = (item as T & { title?: string }).title;
    const currentDescRaw = typeof item.desc === 'string'
      ? item.desc
      : (typeof legacyTitle === 'string' ? legacyTitle : '');
    const currentDesc = currentDescRaw.trim();
    const computedWindowDesc = formatWindowDescription(item.windowMinutes);
    const fallbackTitle = computedWindowDesc || resolveProgressTitle(provider, item.name);
    const resolvedDesc = computedWindowDesc
      ? normalizeWindowLikeDescription(currentDesc, computedWindowDesc)
      : currentDesc;
    return {
      ...item,
      desc: resolvedDesc || fallbackTitle || '',
    };
  });
}
