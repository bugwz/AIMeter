import { UsageProvider } from '../../src/types/index.js';

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

function formatWindowDescFromMinutes(windowMinutes?: number | null): string {
  if (!Number.isFinite(windowMinutes) || windowMinutes === null || windowMinutes === undefined || windowMinutes <= 0) {
    return '';
  }

  const minutes = Math.round(windowMinutes);
  const minutePerWeek = 7 * 24 * 60;
  const minutePerDay = 24 * 60;
  const minutePerHour = 60;

  if (minutes % minutePerWeek === 0) {
    const value = minutes / minutePerWeek;
    return `${value} ${value === 1 ? 'week' : 'weeks'}`;
  }
  if (minutes % minutePerDay === 0) {
    const value = minutes / minutePerDay;
    return `${value} ${value === 1 ? 'day' : 'days'}`;
  }
  if (minutes % minutePerHour === 0) {
    const value = minutes / minutePerHour;
    return `${value} ${value === 1 ? 'hour' : 'hours'}`;
  }

  return `${minutes} ${minutes === 1 ? 'minute' : 'minutes'}`;
}

function formatWindowDescription(windowMinutes?: number | null): string {
  const duration = formatWindowDescFromMinutes(windowMinutes);
  if (!duration) return '';
  return `${duration} window`;
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
    const fallbackTitle = provider === UsageProvider.CODEX
      ? formatWindowDescription(item.windowMinutes)
      : resolveProgressTitle(provider, item.name);
    return {
      ...item,
      desc: currentDesc || fallbackTitle || '',
    };
  });
}
