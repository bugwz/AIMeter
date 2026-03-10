import { UsageProvider } from '../../types';

export const PROVIDER_BASE_COLORS: Record<UsageProvider, string> = {
  [UsageProvider.ALIYUN]: '#FF6A00',
  [UsageProvider.ANTIGRAVITY]: '#4285F4',
  [UsageProvider.CLAUDE]: '#D97757',
  [UsageProvider.CODEX]: '#10A37F',
  [UsageProvider.KIMI]: '#3B5BDB',
  [UsageProvider.MINIMAX]: '#DD4433',
  [UsageProvider.ZAI]: '#111827',
  [UsageProvider.COPILOT]: '#1F6FEB',
  [UsageProvider.OPENROUTER]: '#635BFF',
  [UsageProvider.OLLAMA]: '#334155',
  [UsageProvider.OPENCODE]: '#22C55E',
  [UsageProvider.CURSOR]: '#0F172A',
};

const FALLBACK_COLOR = '#3b82f6';

const clamp = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, value));

const normalizeName = (value?: string): string => String(value || '').trim().toLowerCase();

const stableCompare = (a: string, b: string): number => {
  if (a === b) return 0;
  return a < b ? -1 : 1;
};

const hashString = (input: string): number => {
  let hash = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash += (hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24);
  }
  return Math.abs(hash >>> 0);
};

const hexToHsl = (hex: string): { h: number; s: number; l: number } => {
  const normalized = hex.replace('#', '');
  const value = normalized.length === 3
    ? normalized.split('').map((c) => c + c).join('')
    : normalized;
  const r = parseInt(value.slice(0, 2), 16) / 255;
  const g = parseInt(value.slice(2, 4), 16) / 255;
  const b = parseInt(value.slice(4, 6), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return { h: 0, s: 0, l: l * 100 };
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h = 0;
  switch (max) {
    case r: h = (g - b) / d + (g < b ? 6 : 0); break;
    case g: h = (b - r) / d + 2; break;
    case b: h = (r - g) / d + 4; break;
  }
  return { h: h * 60, s: s * 100, l: l * 100 };
};

const hslToHex = (h: number, s: number, l: number): string => {
  const normalizedH = ((h % 360) + 360) % 360;
  const normalizedS = clamp(s, 0, 100) / 100;
  const normalizedL = clamp(l, 0, 100) / 100;
  const c = (1 - Math.abs(2 * normalizedL - 1)) * normalizedS;
  const x = c * (1 - Math.abs((normalizedH / 60) % 2 - 1));
  const m = normalizedL - c / 2;
  let r = 0;
  let g = 0;
  let b = 0;
  if (normalizedH < 60) { r = c; g = x; b = 0; }
  else if (normalizedH < 120) { r = x; g = c; b = 0; }
  else if (normalizedH < 180) { r = 0; g = c; b = x; }
  else if (normalizedH < 240) { r = 0; g = x; b = c; }
  else if (normalizedH < 300) { r = x; g = 0; b = c; }
  else { r = c; g = 0; b = x; }
  const toHex = (channel: number) => Math.round((channel + m) * 255).toString(16).padStart(2, '0');
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
};

const createVariantColor = (baseColor: string, seed: string, variantIndex: number): string => {
  if (variantIndex === 0) return baseColor;
  const { h, s, l } = hexToHsl(baseColor);
  const hash = hashString(seed);
  const hueShift = variantIndex * 17 + ((hash % 23) - 11);
  const satShift = (variantIndex % 2 === 0 ? 7 : -5) + ((hash % 7) - 3);
  const lightShift = (variantIndex % 3 === 0 ? 6 : variantIndex % 3 === 1 ? -6 : 2);
  return hslToHex(h + hueShift, clamp(s + satShift, 45, 88), clamp(l + lightShift, 32, 70));
};

export const getProviderBaseColor = (provider?: UsageProvider): string => {
  if (!provider) return FALLBACK_COLOR;
  return PROVIDER_BASE_COLORS[provider] || FALLBACK_COLOR;
};

export const buildProviderSeriesColorMap = (
  entries: Array<{ seriesKey: string; provider?: UsageProvider; name?: string }>
): Record<string, string> => {
  const grouped = new Map<string, Array<{ seriesKey: string; provider?: UsageProvider; name?: string; key: string }>>();
  entries.forEach((entry) => {
    const providerKey = entry.provider || 'unknown';
    const normalized = normalizeName(entry.name);
    const key = `${providerKey}|${normalized || '__default__'}`;
    const bucket = grouped.get(providerKey) || [];
    bucket.push({ ...entry, key });
    grouped.set(providerKey, bucket);
  });

  const result: Record<string, string> = {};
  grouped.forEach((bucket) => {
    const sorted = [...bucket].sort((a, b) => stableCompare(a.key, b.key));
    sorted.forEach((entry, index) => {
      const base = getProviderBaseColor(entry.provider);
      result[entry.seriesKey] = createVariantColor(base, entry.key, index);
    });
  });
  return result;
};

export const buildProgressColorMap = (params: {
  provider?: UsageProvider;
  providerName?: string;
  progressKeys: string[];
  activeProviderCount: number;
}): Record<string, string> => {
  const { provider, providerName, progressKeys, activeProviderCount } = params;
  const baseColor = getProviderBaseColor(provider);
  const uniqueSortedKeys = [...new Set(progressKeys)]
    .map((key) => normalizeName(key))
    .filter(Boolean)
    .sort(stableCompare);

  const singleColorOnly = activeProviderCount === 1 && uniqueSortedKeys.length <= 1;
  const result: Record<string, string> = {};
  uniqueSortedKeys.forEach((key, index) => {
    if (singleColorOnly) {
      result[key] = baseColor;
      return;
    }
    const seed = `${provider || 'unknown'}|${normalizeName(providerName) || '__default__'}|${key}`;
    result[key] = createVariantColor(baseColor, seed, index);
  });

  return result;
};
