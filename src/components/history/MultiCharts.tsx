import React from 'react';
import {
  Area,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  PolarAngleAxis,
  PolarGrid,
  PolarRadiusAxis,
  Radar,
  RadarChart,
  ResponsiveContainer,
  ReferenceArea,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { UsageProvider } from '../../types';
import { ProviderLogo } from '../common/ProviderLogo';
import { providerLogos } from '../common/providerLogos';
import { buildProgressColorMap, getProviderBaseColor } from './colorSystem';

interface UsageRecord {
  id: number;
  providerId: string;
  provider?: UsageProvider;
  providerName?: string;
  progress: {
    items: {
      name: string;
      usedPercent: number;
      remainingPercent?: number;
      used?: number;
      limit?: number;
      windowMinutes?: number;
      resetsAt?: string;
    }[];
    cost?: {
      used: number;
      limit: number;
      remaining: number;
      currency?: string;
      period?: string;
    };
  } | null;
  identityData: Record<string, unknown> | null;
  createdAt: Date;
}

export interface HistorySeriesMeta {
  provider?: UsageProvider;
  name?: string;
  displayName: string;
  providerId?: string;
  color?: string;
  defaultProgressItem?: string;
}

interface UsageChartProps {
  data: Record<string, UsageRecord[]>;
  selectedSeries?: string;
  seriesMeta?: Record<string, HistorySeriesMeta>;
  mode?: 'providerSeries' | 'providerProgress';
  rangeDays?: number;
  rangeStartMs?: number;
  rangeEndMs?: number;
  intervalMinutes?: number | 'auto';
  onResolvedIntervalChange?: (minutes: number) => void;
}

interface MultiChartsProps {
  data: Record<string, UsageRecord[]>;
  seriesMeta?: Record<string, HistorySeriesMeta>;
  rangeDays?: number;
  rangeStartMs?: number;
  rangeEndMs?: number;
  selectedSeriesKey?: string;
}

interface ProviderMetrics {
  seriesKey: string;
  avg: number;
  latest: number;
  peak: number;
  volatility: number;
  records: number;
  daysWithData: number;
  costBurn: number | null;
}

interface TooltipEntry {
  color?: string;
  name?: string;
  value?: number | string;
  dataKey?: string | number;
  payload?: Record<string, unknown>;
}

type UsageTrendPoint = Record<string, number | null> & {
  bucketStartMs: number;
  bucketEndMs: number;
};

const pad2 = (value: number): string => String(value).padStart(2, '0');
const formatLocalDateTime = (input: Date | number): string => {
  const date = new Date(input);
  if (Number.isNaN(date.getTime())) return '';
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())} ${pad2(date.getHours())}:${pad2(date.getMinutes())}:${pad2(date.getSeconds())}`;
};
const parseDateTimeKey = (value: string): Date => {
  const [datePart, timePart = '00:00:00'] = value.trim().split(' ');
  const [year, month, day] = datePart.split('-').map(Number);
  const [hour, minute, second] = timePart.split(':').map(Number);
  if (
    !Number.isFinite(year) ||
    !Number.isFinite(month) ||
    !Number.isFinite(day) ||
    !Number.isFinite(hour) ||
    !Number.isFinite(minute) ||
    !Number.isFinite(second)
  ) {
    return new Date(value);
  }
  return new Date(year, month - 1, day, hour, minute, second);
};
const toDateKey = (date: Date): string => {
  const d = new Date(date);
  return formatLocalDateTime(new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0));
};
const buildDateKeysForRange = (startMs: number, endMs: number): string[] => {
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs < startMs) return [];
  if (endMs - startMs < DAY_MS) {
    const end = new Date(endMs);
    const endDay = new Date(end.getFullYear(), end.getMonth(), end.getDate(), 0, 0, 0);
    return [formatLocalDateTime(endDay)];
  }
  const start = new Date(startMs);
  const end = new Date(endMs);
  const startDay = new Date(start.getFullYear(), start.getMonth(), start.getDate(), 0, 0, 0);
  const endDay = new Date(end.getFullYear(), end.getMonth(), end.getDate(), 0, 0, 0);
  const keys: string[] = [];
  for (let current = new Date(startDay); current.getTime() <= endDay.getTime(); current.setDate(current.getDate() + 1)) {
    keys.push(formatLocalDateTime(current));
  }
  return keys;
};
const clampPercent = (value: number): number => Math.min(100, Math.max(0, value));
const normalizeProgressName = (name: string): string => String(name || '').trim().toLowerCase();
const safeProgressLabel = (name: string): string => {
  const trimmed = String(name || '').trim();
  return trimmed || 'unnamed';
};
const toSafeDomId = (value: string): string => value.replace(/[^a-zA-Z0-9_-]/g, '-');
const truncateByChars = (text: string, maxChars?: number): string => {
  if (!maxChars || maxChars <= 0) return text;
  const chars = Array.from(String(text || ''));
  if (chars.length <= maxChars) return text;
  return `${chars.slice(0, maxChars).join('')}...`;
};

const getSeriesLabel = (
  seriesKey: string,
  seriesMeta?: Record<string, HistorySeriesMeta>
): string => {
  return seriesMeta?.[seriesKey]?.displayName || seriesKey;
};

const getSeriesProvider = (
  seriesKey: string,
  seriesMeta?: Record<string, HistorySeriesMeta>
): UsageProvider | undefined => seriesMeta?.[seriesKey]?.provider;

const resolveSeriesKey = (
  input: string | undefined,
  seriesMeta?: Record<string, HistorySeriesMeta>
): string | null => {
  if (!input) return null;
  if (seriesMeta?.[input]) return input;
  const matched = Object.entries(seriesMeta || {}).find(([, meta]) => meta.displayName === input);
  return matched ? matched[0] : null;
};

const ProviderBadge: React.FC<{
  seriesKey: string;
  seriesMeta?: Record<string, HistorySeriesMeta>;
  className?: string;
  iconSize?: 'sm' | 'md' | 'lg';
  truncateLabel?: boolean;
  maxChars?: number;
}> = ({ seriesKey, seriesMeta, className, iconSize = 'sm', truncateLabel = true, maxChars }) => {
  const label = getSeriesLabel(seriesKey, seriesMeta);
  const displayLabel = truncateByChars(label, maxChars);
  const provider = getSeriesProvider(seriesKey, seriesMeta);
  const logo = provider ? providerLogos[provider] : undefined;
  const iconSizeClass = iconSize === 'lg' ? 'h-6 w-6' : iconSize === 'md' ? 'h-5 w-5' : 'h-4 w-4';
  const fallbackTextClass = iconSize === 'lg' ? 'text-[11px]' : iconSize === 'md' ? 'text-[10px]' : 'text-[9px]';
  const logoSize = iconSize === 'lg' ? 24 : iconSize === 'md' ? 20 : 16;

  return (
    <span className={`inline-flex min-w-0 items-center gap-2 ${className || ''}`} title={label}>
      {logo ? (
        <ProviderLogo provider={provider as UsageProvider} size={logoSize} alt={label} />
      ) : (
        <span className={`inline-flex ${iconSizeClass} items-center justify-center rounded bg-[var(--color-bg-subtle)] ${fallbackTextClass} font-semibold text-[var(--color-text-secondary)]`}>
          {(label || '?')[0]}
        </span>
      )}
      <span className={truncateLabel ? 'truncate' : 'whitespace-normal break-words'}>{displayLabel}</span>
    </span>
  );
};

const ChartCard: React.FC<{ title: string; subtitle?: string; delay?: number; children: React.ReactNode }> = ({
  title,
  subtitle,
  children,
  delay = 0,
}) => (
  <div className="bg-[var(--color-surface)] rounded-xl p-5 gradient-border animate-fade-in" style={{ boxShadow: 'var(--shadow-card)', animationDelay: `${delay}ms` }}>
    <div className="mb-4">
      <h3 className="text-sm font-semibold text-[var(--color-text-primary)] flex items-center gap-2">
        <span className="w-1 h-4 rounded-full bg-[var(--color-accent)]" />
        {title}
      </h3>
      {subtitle && <p className="text-xs text-[var(--color-text-muted)] mt-1">{subtitle}</p>}
    </div>
    {children}
  </div>
);

const getSeriesColor = (
  seriesKey: string,
  _index: number,
  seriesMeta?: Record<string, HistorySeriesMeta>
): string => {
  const assignedColor = seriesMeta?.[seriesKey]?.color;
  if (assignedColor) return assignedColor;
  const provider = seriesMeta?.[seriesKey]?.provider;
  return getProviderBaseColor(provider);
};

const getPrimaryItem = (record: UsageRecord, defaultProgressItem?: string) => {
  const items = record.progress?.items || [];
  if (defaultProgressItem) {
    const normalized = defaultProgressItem.trim().toLowerCase();
    const matched = items.find((item) => String(item.name).toLowerCase() === normalized);
    if (matched) return matched;
  }
  return items.find((item) => String(item.name).toLowerCase() === 'primary') || items[0];
};

const getPrimaryUsedPercent = (record: UsageRecord, defaultProgressItem?: string): number | null => {
  const value = getPrimaryItem(record, defaultProgressItem)?.usedPercent;
  if (value === undefined || value === null || Number.isNaN(value)) return null;
  return clampPercent(value);
};

const getConfiguredOrFirstUsedPercent = (record: UsageRecord, defaultProgressItem?: string): number | null => {
  const items = record.progress?.items || [];
  if (items.length === 0) return null;
  if (defaultProgressItem) {
    const normalized = defaultProgressItem.trim().toLowerCase();
    const matched = items.find((item) => String(item.name).toLowerCase() === normalized);
    if (matched && matched.usedPercent !== undefined && matched.usedPercent !== null && !Number.isNaN(matched.usedPercent)) {
      return clampPercent(matched.usedPercent);
    }
  }
  const first = items[0];
  if (!first || first.usedPercent === undefined || first.usedPercent === null || Number.isNaN(first.usedPercent)) return null;
  return clampPercent(first.usedPercent);
};

const getProgressUsedPercent = (record: UsageRecord, progressKey: string): number | null => {
  const items = record.progress?.items || [];
  let matched: typeof items[number] | undefined;
  for (const item of items) {
    if (normalizeProgressName(item.name) === progressKey) {
      matched = item;
    }
  }
  const value = matched?.usedPercent;
  if (value === undefined || value === null || Number.isNaN(value)) return null;
  return clampPercent(value);
};

const getCostBurnPercent = (record: UsageRecord): number | null => {
  const cost = record.progress?.cost;
  if (!cost || !cost.limit || cost.limit <= 0) return null;
  return clampPercent((cost.used / cost.limit) * 100);
};

const buildDateIndex = <T extends { createdAt: Date }>(
  data: Record<string, T[]>
): Map<string, Map<string, T>> => {
  const index = new Map<string, Map<string, T>>();
  Object.entries(data).forEach(([seriesKey, records]) => {
    const seriesIndex = new Map<string, T>();
    records.forEach((record) => {
      seriesIndex.set(toDateKey(record.createdAt), record);
    });
    index.set(seriesKey, seriesIndex);
  });
  return index;
};

const USAGE_INTERVAL_STEPS_MINUTES = [1, 5, 10, 15, 20, 30, 60, 180, 360, 720, 1440] as const;
const DAY_MS = 24 * 60 * 60 * 1000;

const getMinIntervalMinutesByRangeDays = (rangeDays?: number): number => {
  if (!rangeDays || rangeDays <= 0) return 1;
  return rangeDays >= 90 ? 20 : 1;
};
const getMinIntervalMinutesByRangeMs = (rangeMs?: number): number | null => {
  if (!rangeMs || !Number.isFinite(rangeMs) || rangeMs <= 0) return null;
  const hours = rangeMs / (60 * 60 * 1000);
  if (hours <= 5.0001) return 5;
  if (hours <= 12.0001) return 10;
  return null;
};

const floorToLocalBucketMs = (timestampMs: number, bucketMs: number): number => {
  const timezoneOffsetMs = new Date(timestampMs).getTimezoneOffset() * 60 * 1000;
  return Math.floor((timestampMs - timezoneOffsetMs) / bucketMs) * bucketMs + timezoneOffsetMs;
};

const resolveAutoIntervalMinutes = (rangeMs: number, chartWidth: number, minIntervalMinutes: number): number => {
  const safeRangeMs = Math.max(rangeMs, 60 * 1000);
  const safeWidth = chartWidth > 0 ? chartWidth : 960;
  const targetPoints = Math.max(30, Math.min(180, Math.floor(safeWidth / 14)));
  const desiredMinutes = safeRangeMs / targetPoints / (60 * 1000);
  const boundedDesired = Math.max(desiredMinutes, minIntervalMinutes);
  const matched = USAGE_INTERVAL_STEPS_MINUTES.find((step) => step >= boundedDesired);
  return matched || USAGE_INTERVAL_STEPS_MINUTES[USAGE_INTERVAL_STEPS_MINUTES.length - 1];
};

const formatUsageTrendAxisTick = (value: number, bucketMs: number): string => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  if (bucketMs >= DAY_MS) {
    return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
  }
  return `${pad2(date.getMonth() + 1)}-${pad2(date.getDate())} ${pad2(date.getHours())}:${pad2(date.getMinutes())}`;
};

const formatUsageTrendRangeLabel = (bucketStartMs: number, bucketMs: number): string => {
  const start = new Date(bucketStartMs);
  const end = new Date(bucketStartMs + bucketMs);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return '';
  const format = (date: Date): string => `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())} ${pad2(date.getHours())}:${pad2(date.getMinutes())}`;
  return `${format(start)} - ${format(end)}`;
};

const formatDateOnly = (date: Date): string => {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
};
const formatWeekRangeLabel = (value: string): string => {
  const start = parseDateTimeKey(value);
  if (Number.isNaN(start.getTime())) return value;
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  return `${formatDateOnly(start)} - ${formatDateOnly(end)}`;
};

const std = (values: number[]): number => {
  if (values.length <= 1) return 0;
  const avg = values.reduce((sum, value) => sum + value, 0) / values.length;
  const variance = values.reduce((sum, value) => sum + (value - avg) ** 2, 0) / values.length;
  return Math.sqrt(variance);
};

const getLegendDotColor = (entry: {
  color?: string;
  payload?: Record<string, unknown>;
}): string | undefined => {
  const normalizeColor = (value?: string): string | undefined => {
    if (!value) return undefined;
    const trimmed = String(value).trim();
    if (!trimmed || /^url\(/i.test(trimmed)) return undefined;
    return trimmed;
  };
  const payload = entry.payload || {};
  const stroke = typeof payload.stroke === 'string' ? payload.stroke : undefined;
  const fill = typeof payload.fill === 'string' ? payload.fill : undefined;
  return normalizeColor(entry.color) || normalizeColor(stroke) || normalizeColor(fill);
};

const estimateLegendLabelUnits = (label: string): number => {
  return Array.from(label).reduce((total, char) => total + (char.charCodeAt(0) > 255 ? 1.7 : 1), 0);
};

const resolveMobileLegendColumns = (
  labels: string[],
  availableWidth: number,
  minColumns: number = 1,
  maxColumns: number = 3,
): number => {
  const safeWidth = Math.max(220, availableWidth);
  const longestUnits = labels.reduce((max, label) => Math.max(max, estimateLegendLabelUnits(label)), 0);
  const estimatedItemWidth = Math.max(132, Math.min(safeWidth, Math.round(longestUnits * 7 + 56)));
  return Math.max(minColumns, Math.min(maxColumns, Math.floor(safeWidth / estimatedItemWidth)));
};

const ProviderLegend: React.FC<{
  payload?: Array<{ value?: string | number; dataKey?: string | number; payload?: Record<string, unknown>; color?: string }>;
  seriesMeta?: Record<string, HistorySeriesMeta>;
  isNarrowScreen?: boolean;
  viewportWidth?: number;
  mobileLabelMaxChars?: number;
  desktopLabelMaxChars?: number;
}> = ({ payload, seriesMeta, isNarrowScreen = false, viewportWidth = 0, mobileLabelMaxChars = 20, desktopLabelMaxChars = 25 }) => {
  if (!payload || payload.length === 0) return null;
  const uniquePayload = (() => {
    const bySeries = new Map<string, { value?: string | number; dataKey?: string | number; payload?: Record<string, unknown>; color?: string }>();
    payload.forEach((entry) => {
      const keyCandidate = String(entry.dataKey || entry.value || entry.payload?.seriesKey || '');
      const seriesKey = resolveSeriesKey(keyCandidate, seriesMeta) || keyCandidate;
      if (!seriesKey) return;
      const existing = bySeries.get(seriesKey);
      if (!existing) {
        bySeries.set(seriesKey, entry);
        return;
      }
      const existingColor = getLegendDotColor(existing);
      const currentColor = getLegendDotColor(entry);
      if (!existingColor && currentColor) {
        bySeries.set(seriesKey, entry);
      }
    });
    return Array.from(bySeries.values());
  })();
  const columns = isNarrowScreen
    ? resolveMobileLegendColumns(
      uniquePayload.map((entry) => {
        const keyCandidate = String(entry.dataKey || entry.value || entry.payload?.seriesKey || '');
        const seriesKey = resolveSeriesKey(keyCandidate, seriesMeta);
        return seriesKey ? getSeriesLabel(seriesKey, seriesMeta) : String(entry.value || keyCandidate);
      }),
      viewportWidth > 0 ? viewportWidth - 24 : 320,
      2,
    )
    : 1;
  const legendLabelMaxChars = isNarrowScreen ? mobileLabelMaxChars : desktopLabelMaxChars;

  return (
    <div
      className={isNarrowScreen ? 'mt-2 grid gap-x-1.5 gap-y-1 text-[11px]' : 'mt-2 flex flex-wrap items-center gap-3 text-xs'}
      style={isNarrowScreen ? { gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` } : undefined}
    >
      {uniquePayload.map((entry, index) => {
        const keyCandidate = String(entry.dataKey || entry.value || entry.payload?.seriesKey || '');
        const seriesKey = resolveSeriesKey(keyCandidate, seriesMeta);

        if (!seriesKey) {
          const dotColor = getLegendDotColor(entry);
          const fullLabel = String(entry.value || keyCandidate);
          return (
            <span
              key={`${keyCandidate}-${index}`}
              className={isNarrowScreen ? 'inline-flex w-full items-center gap-0.5 text-[var(--color-text-secondary)]' : 'inline-flex items-center gap-1 text-[var(--color-text-secondary)]'}
              title={fullLabel}
            >
              {dotColor ? <span className="h-2 w-2 rounded-full" style={{ backgroundColor: dotColor }} /> : null}
              <span className="whitespace-normal break-words">{truncateByChars(fullLabel, legendLabelMaxChars)}</span>
            </span>
          );
        }

        const dotColor = getLegendDotColor(entry);
        return (
          <span
            key={`${seriesKey}-${index}`}
            className={isNarrowScreen ? 'inline-flex w-full items-center gap-1 text-[var(--color-text-secondary)]' : 'inline-flex items-center gap-1.5 text-[var(--color-text-secondary)]'}
          >
            {dotColor ? <span className="h-2 w-2 rounded-full" style={{ backgroundColor: dotColor }} /> : null}
            <ProviderBadge seriesKey={seriesKey} seriesMeta={seriesMeta} truncateLabel={false} maxChars={legendLabelMaxChars} />
          </span>
        );
      })}
    </div>
  );
};

const UsageTrendLegend: React.FC<{
  lineKeys: string[];
  lineLabelByKey: Record<string, string>;
  lineColorByKey: Record<string, string>;
  lineProviderByKey: Record<string, UsageProvider | undefined>;
  isNarrowScreen?: boolean;
  viewportWidth?: number;
  mobileLabelMaxChars?: number;
  desktopLabelMaxChars?: number;
  activeLineKey?: string | null;
  onToggleLineKey?: (lineKey: string) => void;
}> = ({
  lineKeys,
  lineLabelByKey,
  lineColorByKey,
  lineProviderByKey,
  isNarrowScreen = false,
  viewportWidth = 0,
  mobileLabelMaxChars = 20,
  desktopLabelMaxChars = 25,
  activeLineKey,
  onToggleLineKey,
}) => {
  if (lineKeys.length === 0) return null;
  const columns = isNarrowScreen
    ? resolveMobileLegendColumns(lineKeys.map((lineKey) => lineLabelByKey[lineKey] || lineKey), viewportWidth > 0 ? viewportWidth - 24 : 320, 2)
    : 1;
  const legendLabelMaxChars = isNarrowScreen ? mobileLabelMaxChars : desktopLabelMaxChars;
  return (
    <div
      className={isNarrowScreen ? 'mt-2 grid gap-x-1.5 gap-y-1 text-[11px]' : 'mt-2 flex flex-wrap items-center gap-3 text-xs'}
      style={isNarrowScreen ? { gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` } : undefined}
    >
      {lineKeys.map((lineKey) => {
        const fullLabel = lineLabelByKey[lineKey] || lineKey;
        const isActive = !activeLineKey || activeLineKey === lineKey;
        return (
          <span
            key={lineKey}
            className={isNarrowScreen ? 'inline-flex w-full cursor-pointer items-center gap-0.5 text-[var(--color-text-secondary)] transition-opacity' : 'inline-flex cursor-pointer items-center gap-1 text-[var(--color-text-secondary)] transition-opacity'}
            title={fullLabel}
            style={{ opacity: isActive ? 1 : 0.35 }}
            onClick={() => onToggleLineKey?.(lineKey)}
          >
            <span className="h-2 w-2 rounded-full" style={{ backgroundColor: lineColorByKey[lineKey] || '#666666' }} />
            {lineProviderByKey[lineKey] && providerLogos[lineProviderByKey[lineKey] as UsageProvider] ? (
              <ProviderLogo provider={lineProviderByKey[lineKey] as UsageProvider} size={16} alt={fullLabel} />
            ) : null}
            <span className="whitespace-normal break-words">{truncateByChars(fullLabel, legendLabelMaxChars)}</span>
          </span>
        );
      })}
    </div>
  );
};

const UsageTrendTooltip: React.FC<{
  active?: boolean;
  payload?: TooltipEntry[];
  label?: string | number;
  valueSuffix?: string;
  bucketMs: number;
  lineLabelByKey: Record<string, string>;
  lineColorByKey: Record<string, string>;
  lineProviderByKey: Record<string, UsageProvider | undefined>;
  labelMaxChars?: number;
}> = ({ active, payload, label, valueSuffix = '%', bucketMs, lineLabelByKey, lineColorByKey, lineProviderByKey, labelMaxChars }) => {
  if (!active || !payload || payload.length === 0) return null;

  const uniquePayload = payload.filter((entry, index, list) => {
    const key = String(entry.dataKey || entry.name || '').trim().toLowerCase();
    if (!key) return true;
    return list.findIndex((candidate) => {
      const candidateKey = String(candidate.dataKey || candidate.name || '').trim().toLowerCase();
      return candidateKey === key;
    }) === index;
  });

  return (
    <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-3 shadow-lg">
      {typeof label === 'number' ? (
        <p className="text-xs font-medium text-[var(--color-text-primary)] mb-1">{formatUsageTrendRangeLabel(label, bucketMs)}</p>
      ) : label ? (
        <p className="text-xs font-medium text-[var(--color-text-primary)] mb-1">{label}</p>
      ) : null}
      {uniquePayload.map((entry, index) => {
        const rawValue = entry.value;
        const isNumber = typeof rawValue === 'number';
        const valueText = isNumber ? rawValue.toFixed(1) : String(rawValue ?? '-');
        const key = String(entry.dataKey || entry.name || '');
        const dotColor = lineColorByKey[key] || getLegendDotColor(entry) || 'var(--color-text-muted)';
        const displayLabel = truncateByChars(lineLabelByKey[key] || String(entry.name || key), labelMaxChars);
        const provider = lineProviderByKey[key];
        const logo = provider ? providerLogos[provider] : undefined;

        return (
          <div key={`${key || 'row'}-${index}`} className="mb-1 flex items-center gap-2 text-xs last:mb-0">
            <span className="h-2 w-2 rounded-full" style={{ backgroundColor: dotColor }} />
            {logo ? (
              <ProviderLogo provider={provider as UsageProvider} size={16} alt={displayLabel} />
            ) : null}
            <span className="text-[var(--color-text-secondary)]">{displayLabel}</span>
            <span className="ml-auto font-medium text-[var(--color-text-primary)]">
              {valueText}{isNumber ? valueSuffix : ''}
            </span>
          </div>
        );
      })}
    </div>
  );
};

const CustomTooltip: React.FC<{
  active?: boolean;
  payload?: TooltipEntry[];
  label?: string;
  valueSuffix?: string;
  seriesMeta?: Record<string, HistorySeriesMeta>;
  labelMaxChars?: number;
}> = ({ active, payload, label, valueSuffix = '%', seriesMeta, labelMaxChars }) => {
  if (!active || !payload || payload.length === 0) return null;
  const uniquePayload = payload.filter((entry, index, list) => {
    const key = String(entry.dataKey || entry.name || '').trim().toLowerCase();
    if (!key) return true;
    return list.findIndex((candidate) => {
      const candidateKey = String(candidate.dataKey || candidate.name || '').trim().toLowerCase();
      return candidateKey === key;
    }) === index;
  });

  return (
    <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-3 shadow-lg">
      {label && <p className="text-xs font-medium text-[var(--color-text-primary)] mb-1">{label}</p>}
      {uniquePayload.map((entry, index) => {
        const rawValue = entry.value;
        const isNumber = typeof rawValue === 'number';
        const valueText = isNumber ? rawValue.toFixed(1) : String(rawValue ?? '-');
        const keyCandidate = String(entry.dataKey || entry.name || entry.payload?.seriesKey || '');
        const seriesKey = resolveSeriesKey(keyCandidate, seriesMeta);
        const dotColor = getLegendDotColor(entry);
        return (
          <div key={`${entry.name || keyCandidate || 'row'}-${index}`} className="mb-1 flex items-center gap-2 text-xs last:mb-0">
            <span className="h-2 w-2 rounded-full" style={{ backgroundColor: dotColor || 'var(--color-text-muted)' }} />
            {seriesKey ? (
              <ProviderBadge seriesKey={seriesKey} seriesMeta={seriesMeta} className="max-w-[220px]" maxChars={labelMaxChars} />
            ) : (
              <span className="text-[var(--color-text-secondary)]">{truncateByChars(String(entry.name || keyCandidate), labelMaxChars)}</span>
            )}
            <span className="ml-auto font-medium text-[var(--color-text-primary)]">
              {valueText}{isNumber ? valueSuffix : ''}
            </span>
          </div>
        );
      })}
    </div>
  );
};

export const UsageChart: React.FC<UsageChartProps> = ({
  data,
  selectedSeries,
  seriesMeta,
  mode = 'providerSeries',
  rangeDays,
  rangeStartMs,
  rangeEndMs,
  intervalMinutes = 'auto',
  onResolvedIntervalChange,
}) => {
  const isProviderProgressMode = mode === 'providerProgress';
  const chartRootRef = React.useRef<HTMLDivElement | null>(null);
  const [chartWidth, setChartWidth] = React.useState(0);
  const [selectionStartMs, setSelectionStartMs] = React.useState<number | null>(null);
  const [selectionEndMs, setSelectionEndMs] = React.useState<number | null>(null);
  const [zoomDomain, setZoomDomain] = React.useState<[number, number] | null>(null);
  const [activeLineKey, setActiveLineKey] = React.useState<string | null>(null);

  React.useEffect(() => {
    const element = chartRootRef.current;
    if (!element) return undefined;

    const updateSize = () => {
      const nextWidth = element.clientWidth || 0;
      setChartWidth((current) => (current !== nextWidth ? nextWidth : current));
    };
    updateSize();

    let observer: ResizeObserver | null = null;
    if (typeof ResizeObserver !== 'undefined') {
      observer = new ResizeObserver(() => updateSize());
      observer.observe(element);
    }
    window.addEventListener('resize', updateSize);

    return () => {
      observer?.disconnect();
      window.removeEventListener('resize', updateSize);
    };
  }, []);

  const seriesKeys = React.useMemo(() => {
    if (selectedSeries) return [selectedSeries];
    return Object.keys(data).filter((key) => (data[key] || []).length > 0);
  }, [data, selectedSeries]);

  const selectedProviderKey = selectedSeries || seriesKeys[0] || '';
  const selectedProviderRecords = selectedProviderKey ? (data[selectedProviderKey] || []) : [];

  const progressSeries = React.useMemo(() => {
    if (!isProviderProgressMode) return [] as Array<{ key: string; label: string }>;
    const progressMap = new Map<string, string>();
    selectedProviderRecords.forEach((record) => {
      const items = record.progress?.items || [];
      items.forEach((item) => {
        const key = normalizeProgressName(item.name);
        if (!key) return;
        const label = safeProgressLabel(item.name);
        if (!progressMap.has(key) || progressMap.get(key) === 'unnamed') {
          progressMap.set(key, label);
        }
      });
    });
    return Array.from(progressMap.entries()).map(([key, label]) => ({ key, label }));
  }, [isProviderProgressMode, selectedProviderRecords]);

  const lineKeys = React.useMemo(
    () => {
      if (isProviderProgressMode) {
        return [...progressSeries]
          .sort((a, b) => a.label.localeCompare(b.label, undefined, { sensitivity: 'base' }))
          .map((item) => item.key);
      }
      return [...seriesKeys].sort((a, b) =>
        getSeriesLabel(a, seriesMeta).localeCompare(getSeriesLabel(b, seriesMeta), undefined, { sensitivity: 'base' }),
      );
    },
    [isProviderProgressMode, progressSeries, seriesKeys, seriesMeta]
  );

  const lineLabelByKey = React.useMemo(() => {
    if (!isProviderProgressMode) return {} as Record<string, string>;
    return progressSeries.reduce<Record<string, string>>((acc, item) => {
      acc[item.key] = item.label;
      return acc;
    }, {});
  }, [isProviderProgressMode, progressSeries]);

  const usageTrendLabelByKey = React.useMemo(() => {
    if (isProviderProgressMode) {
      const providerLabel = selectedProviderKey
        ? getSeriesLabel(selectedProviderKey, seriesMeta)
        : 'Provider';
      return lineKeys.reduce<Record<string, string>>((acc, progressKey) => {
        const progressLabel = lineLabelByKey[progressKey] || progressKey;
        acc[progressKey] = `${providerLabel} · ${progressLabel}`;
        return acc;
      }, {});
    }
    return lineKeys.reduce<Record<string, string>>((acc, seriesKey) => {
      acc[seriesKey] = getSeriesLabel(seriesKey, seriesMeta);
      return acc;
    }, {});
  }, [isProviderProgressMode, lineKeys, lineLabelByKey, selectedProviderKey, seriesMeta]);

  const lineProviderByKey = React.useMemo(() => {
    if (isProviderProgressMode) {
      const provider = selectedProviderKey ? seriesMeta?.[selectedProviderKey]?.provider : undefined;
      return lineKeys.reduce<Record<string, UsageProvider | undefined>>((acc, key) => {
        acc[key] = provider;
        return acc;
      }, {});
    }
    return lineKeys.reduce<Record<string, UsageProvider | undefined>>((acc, key) => {
      acc[key] = seriesMeta?.[key]?.provider;
      return acc;
    }, {});
  }, [isProviderProgressMode, lineKeys, selectedProviderKey, seriesMeta]);
  React.useEffect(() => {
    if (activeLineKey && !lineKeys.includes(activeLineKey)) {
      setActiveLineKey(null);
    }
  }, [activeLineKey, lineKeys]);
  const visibleLineKeys = React.useMemo(
    () => (activeLineKey && lineKeys.includes(activeLineKey) ? [activeLineKey] : lineKeys),
    [activeLineKey, lineKeys],
  );

  const minIntervalMinutes = React.useMemo(
    () => {
      const hasExplicitRange = Number.isFinite(rangeStartMs) && Number.isFinite(rangeEndMs) && (rangeEndMs as number) >= (rangeStartMs as number);
      if (hasExplicitRange) {
        const explicitRangeMs = (rangeEndMs as number) - (rangeStartMs as number);
        const mappedMin = getMinIntervalMinutesByRangeMs(explicitRangeMs);
        if (mappedMin) return mappedMin;
      }
      return getMinIntervalMinutesByRangeDays(rangeDays);
    },
    [rangeDays, rangeEndMs, rangeStartMs],
  );

  const { chartData, bucketMs, resolvedIntervalMinutes } = React.useMemo(() => {
    const timestamps = (isProviderProgressMode ? selectedProviderRecords : Object.values(data).flatMap((records) => records))
      .map((record) => new Date(record.createdAt).getTime())
      .filter((timestamp) => Number.isFinite(timestamp));
    const latestDataTimestamp = timestamps.length > 0 ? Math.max(...timestamps) : Date.now();
    const earliestDataTimestamp = timestamps.length > 0 ? Math.min(...timestamps) : latestDataTimestamp;
    const hasExplicitRange = Number.isFinite(rangeStartMs) && Number.isFinite(rangeEndMs) && (rangeEndMs as number) >= (rangeStartMs as number);
    const effectiveStartMs = hasExplicitRange
      ? (rangeStartMs as number)
      : (rangeDays && rangeDays > 0 ? latestDataTimestamp - rangeDays * DAY_MS : earliestDataTimestamp);
    const effectiveEndMs = hasExplicitRange
      ? (rangeEndMs as number)
      : latestDataTimestamp;
    const rangeMs = Math.max(effectiveEndMs - effectiveStartMs, 60 * 1000);
    const nextResolvedIntervalMinutes = intervalMinutes === 'auto'
      ? resolveAutoIntervalMinutes(rangeMs, chartWidth, minIntervalMinutes)
      : Math.max(intervalMinutes, minIntervalMinutes);
    const resolvedBucketMs = nextResolvedIntervalMinutes * 60 * 1000;
    const startBucketMs = floorToLocalBucketMs(effectiveStartMs, resolvedBucketMs);
    const endBucketMs = floorToLocalBucketMs(effectiveEndMs, resolvedBucketMs);
    const seriesBucketIndex = new Map<string, Map<number, UsageRecord>>();

    if (isProviderProgressMode) {
      const bucketIndex = new Map<number, UsageRecord>();
      selectedProviderRecords.forEach((record) => {
        const bucketKey = floorToLocalBucketMs(new Date(record.createdAt).getTime(), resolvedBucketMs);
        const existing = bucketIndex.get(bucketKey);
        if (!existing || new Date(record.createdAt).getTime() >= new Date(existing.createdAt).getTime()) {
          bucketIndex.set(bucketKey, record);
        }
      });
      seriesBucketIndex.set(selectedProviderKey, bucketIndex);
    } else {
      seriesKeys.forEach((seriesKey) => {
        const bucketIndex = new Map<number, UsageRecord>();
        (data[seriesKey] || []).forEach((record) => {
          const bucketKey = floorToLocalBucketMs(new Date(record.createdAt).getTime(), resolvedBucketMs);
          const existing = bucketIndex.get(bucketKey);
          if (!existing || new Date(record.createdAt).getTime() >= new Date(existing.createdAt).getTime()) {
            bucketIndex.set(bucketKey, record);
          }
        });
        seriesBucketIndex.set(seriesKey, bucketIndex);
      });
    }

    const nextChartData: UsageTrendPoint[] = [];
    for (let bucketStartMs = startBucketMs; bucketStartMs <= endBucketMs; bucketStartMs += resolvedBucketMs) {
      const point: UsageTrendPoint = {
        bucketStartMs,
        bucketEndMs: bucketStartMs + resolvedBucketMs,
      };
        if (isProviderProgressMode) {
          const bucketIndex = seriesBucketIndex.get(selectedProviderKey);
          const record = bucketIndex?.get(bucketStartMs);
          lineKeys.forEach((lineKey) => {
            const value = record ? getProgressUsedPercent(record, lineKey) : null;
            point[lineKey] = typeof value === 'number' ? value : null;
          });
        } else {
          seriesKeys.forEach((seriesKey) => {
            const bucketIndex = seriesBucketIndex.get(seriesKey);
            const record = bucketIndex?.get(bucketStartMs);
            const value = record ? getPrimaryUsedPercent(record, seriesMeta?.[seriesKey]?.defaultProgressItem) : null;
            point[seriesKey] = typeof value === 'number' ? value : null;
          });
        }
      nextChartData.push(point);
    }

    return { chartData: nextChartData, bucketMs: resolvedBucketMs, resolvedIntervalMinutes: nextResolvedIntervalMinutes };
  }, [
    chartWidth,
    data,
    intervalMinutes,
    isProviderProgressMode,
    lineKeys,
    minIntervalMinutes,
    rangeDays,
    rangeEndMs,
    rangeStartMs,
    selectedProviderKey,
    selectedProviderRecords,
    seriesKeys,
    seriesMeta,
  ]);

  React.useEffect(() => {
    if (onResolvedIntervalChange) {
      onResolvedIntervalChange(resolvedIntervalMinutes);
    }
  }, [onResolvedIntervalChange, resolvedIntervalMinutes]);

  React.useEffect(() => {
    setZoomDomain(null);
    setSelectionStartMs(null);
    setSelectionEndMs(null);
  }, [chartData, bucketMs]);

  const extractActiveLabelMs = (state: unknown): number | null => {
    const activeLabel = (state as { activeLabel?: unknown })?.activeLabel;
    return typeof activeLabel === 'number' && Number.isFinite(activeLabel) ? activeLabel : null;
  };

  const handleMouseDown = (state: unknown) => {
    const labelMs = extractActiveLabelMs(state);
    if (labelMs === null) return;
    setSelectionStartMs(labelMs);
    setSelectionEndMs(labelMs);
  };

  const handleMouseMove = (state: unknown) => {
    if (selectionStartMs === null) return;
    const labelMs = extractActiveLabelMs(state);
    if (labelMs === null) return;
    setSelectionEndMs(labelMs);
  };

  const handleMouseUp = () => {
    if (selectionStartMs === null || selectionEndMs === null) {
      setSelectionStartMs(null);
      setSelectionEndMs(null);
      return;
    }

    const start = Math.min(selectionStartMs, selectionEndMs);
    const end = Math.max(selectionStartMs, selectionEndMs);
    if (end - start > 0) {
      setZoomDomain([start, end]);
    }
    setSelectionStartMs(null);
    setSelectionEndMs(null);
  };

  const lineColorByKey = React.useMemo(() => {
    if (!isProviderProgressMode) {
      return lineKeys.reduce<Record<string, string>>((acc, seriesKey, index) => {
        acc[seriesKey] = getSeriesColor(seriesKey, index, seriesMeta);
        return acc;
      }, {});
    }

    const selectedProvider = selectedProviderKey ? seriesMeta?.[selectedProviderKey]?.provider : undefined;
    const selectedProviderName = selectedProviderKey ? seriesMeta?.[selectedProviderKey]?.name : undefined;
    const activeProviderCount = Object.keys(data).filter((key) => (data[key] || []).length > 0).length;
    const progressColors = buildProgressColorMap({
      provider: selectedProvider,
      providerName: selectedProviderName,
      progressKeys: lineKeys,
      activeProviderCount,
    });
    return lineKeys.reduce<Record<string, string>>((acc, progressKey) => {
      acc[progressKey] = progressColors[progressKey] || getProviderBaseColor(selectedProvider);
      return acc;
    }, {});
  }, [isProviderProgressMode, lineKeys, selectedProviderKey, seriesMeta, data]);

  const hasPlottableData = React.useMemo(
    () => chartData.some((point) => visibleLineKeys.some((lineKey) => typeof point[lineKey] === 'number')),
    [chartData, visibleLineKeys]
  );
  const isNarrowScreen = chartWidth > 0 && chartWidth < 640;
  const tooltipLabelMaxChars = isNarrowScreen ? 20 : 25;
  const usageTrendChartMargin = React.useMemo(
    () => (isNarrowScreen ? { top: 14, right: 4, left: 0, bottom: 6 } : { top: 20, right: 24, left: 8, bottom: 8 }),
    [isNarrowScreen],
  );
  const usageTrendYAxisWidth = isNarrowScreen ? 34 : 46;
  const compactChartMargin = React.useMemo(
    () => (isNarrowScreen ? { top: 8, right: 4, left: 0, bottom: 0 } : { top: 10, right: 10, left: 0, bottom: 0 }),
    [isNarrowScreen],
  );
  const compactScatterMargin = React.useMemo(
    () => (isNarrowScreen ? { top: 10, right: 6, bottom: 6, left: 2 } : { top: 20, right: 20, bottom: 10, left: 10 }),
    [isNarrowScreen],
  );
  const compactYAxisWidth = isNarrowScreen ? 32 : 42;

  if (chartData.length === 0 || lineKeys.length === 0 || !hasPlottableData) {
    return (
      <div className="flex items-center justify-center h-64 text-[var(--color-text-muted)]">
        {isProviderProgressMode
          ? 'No progress history available for this provider.'
          : 'No historical data available yet.'}
      </div>
    );
  }

  return (
    <div ref={chartRootRef} className="relative h-[400px] w-full select-none">
      {zoomDomain ? (
        <button
          type="button"
          className="absolute right-2 top-2 z-10 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1 text-xs text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]"
          onClick={() => setZoomDomain(null)}
        >
          Reset Zoom
        </button>
      ) : null}
      <ResponsiveContainer width="100%" height="100%">
      <ComposedChart
        data={chartData}
        margin={usageTrendChartMargin}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
      >
        <defs>
          {lineKeys.map((lineKey) => {
            const color = lineColorByKey[lineKey];
            const safeId = toSafeDomId(lineKey);
            return (
              <linearGradient key={`usage-trend-fill-${lineKey}`} id={`usage-trend-fill-${safeId}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={color} stopOpacity={0.28} />
                <stop offset="95%" stopColor={color} stopOpacity={0.02} />
              </linearGradient>
            );
          })}
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border-subtle)" />
        <XAxis
          type="number"
          scale="time"
          dataKey="bucketStartMs"
          domain={zoomDomain || ['dataMin', 'dataMax']}
          allowDataOverflow
          allowDuplicatedCategory={false}
          stroke="var(--color-text-muted)"
          fontSize={12}
          minTickGap={20}
          tickFormatter={(value) => formatUsageTrendAxisTick(Number(value), bucketMs)}
        />
        <YAxis
          width={usageTrendYAxisWidth}
          stroke="var(--color-text-muted)"
          fontSize={12}
          domain={[0, 100]}
          tickFormatter={(value) => `${value}%`}
        />
        <Tooltip
          isAnimationActive={false}
          animationDuration={0}
          filterNull={false}
          content={(
            <UsageTrendTooltip
              bucketMs={bucketMs}
              lineLabelByKey={usageTrendLabelByKey}
              lineColorByKey={lineColorByKey}
              lineProviderByKey={lineProviderByKey}
              labelMaxChars={tooltipLabelMaxChars}
            />
          )}
          labelFormatter={(value) => formatUsageTrendRangeLabel(Number(value), bucketMs)}
        />
        {selectionStartMs !== null && selectionEndMs !== null ? (
          <ReferenceArea
            x1={Math.min(selectionStartMs, selectionEndMs)}
            x2={Math.max(selectionStartMs, selectionEndMs)}
            strokeOpacity={0}
            fill="var(--color-accent)"
            fillOpacity={0.14}
          />
        ) : null}
        <Legend
          content={(
            <UsageTrendLegend
              lineKeys={lineKeys}
              lineLabelByKey={usageTrendLabelByKey}
              lineColorByKey={lineColorByKey}
              lineProviderByKey={lineProviderByKey}
              isNarrowScreen={isNarrowScreen}
              viewportWidth={chartWidth}
              activeLineKey={activeLineKey}
              onToggleLineKey={(lineKey) => setActiveLineKey((current) => (current === lineKey ? null : lineKey))}
            />
          )}
        />
        {visibleLineKeys.map((lineKey) => (
          <Area
            key={`usage-trend-area-${lineKey}`}
            type="monotone"
            dataKey={lineKey}
            stroke="none"
            fill={`url(#usage-trend-fill-${toSafeDomId(lineKey)})`}
            isAnimationActive={false}
            connectNulls
            legendType="none"
          />
        ))}
        {visibleLineKeys.map((lineKey) => (
          <Line
            key={lineKey}
            type="monotone"
            dataKey={lineKey}
            stroke={lineColorByKey[lineKey]}
            strokeWidth={1.3}
            dot={false}
            activeDot={false}
            connectNulls
            name={usageTrendLabelByKey[lineKey] || lineKey}
            isAnimationActive={false}
          />
        ))}
      </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
};

export const MultiCharts: React.FC<MultiChartsProps> = ({ data, seriesMeta, rangeDays, rangeStartMs, rangeEndMs, selectedSeriesKey }) => {
  const heatmapTooltipRef = React.useRef<HTMLDivElement | null>(null);
  const [viewportWidth, setViewportWidth] = React.useState<number>(
    typeof window !== 'undefined' ? window.innerWidth : 1024,
  );
  const [activeWeeklySeriesKey, setActiveWeeklySeriesKey] = React.useState<string | null>(null);
  const [activeDonutSeriesKey, setActiveDonutSeriesKey] = React.useState<string | null>(null);
  const [activeScatterSeriesKey, setActiveScatterSeriesKey] = React.useState<string | null>(null);
  const [activeRadarSeriesKey, setActiveRadarSeriesKey] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const onResize = () => setViewportWidth(window.innerWidth);
    onResize();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const showHeatmapHover = (event: React.MouseEvent<HTMLDivElement>, text: string) => {
    const el = heatmapTooltipRef.current;
    if (!el) return;
    el.textContent = text;
    el.style.left = `${event.clientX + 12}px`;
    el.style.top = `${event.clientY + 12}px`;
    el.style.opacity = '1';
  };
  const moveHeatmapHover = (event: React.MouseEvent<HTMLDivElement>) => {
    const el = heatmapTooltipRef.current;
    if (!el || el.style.opacity !== '1') return;
    el.style.left = `${event.clientX + 12}px`;
    el.style.top = `${event.clientY + 12}px`;
  };
  const clearHeatmapHover = () => {
    const el = heatmapTooltipRef.current;
    if (!el) return;
    el.style.opacity = '0';
  };

  const rangedData = React.useMemo(() => {
    if (!rangeDays || rangeDays <= 0) return data;
    const cutoff = Date.now() - rangeDays * 24 * 60 * 60 * 1000;
    return Object.entries(data).reduce<Record<string, UsageRecord[]>>((acc, [seriesKey, records]) => {
      acc[seriesKey] = (records || []).filter(
        (record) => new Date(record.createdAt).getTime() >= cutoff,
      );
      return acc;
    }, {});
  }, [data, rangeDays]);

  const seriesKeys = React.useMemo(
    () =>
      Object.keys(rangedData)
        .filter((seriesKey) => (rangedData[seriesKey] || []).length > 0)
        .sort((a, b) =>
          getSeriesLabel(a, seriesMeta).localeCompare(getSeriesLabel(b, seriesMeta), undefined, {
            sensitivity: 'base',
          }),
        ),
    [rangedData, seriesMeta]
  );
  React.useEffect(() => {
    if (activeDonutSeriesKey && !seriesKeys.includes(activeDonutSeriesKey)) setActiveDonutSeriesKey(null);
    if (activeScatterSeriesKey && !seriesKeys.includes(activeScatterSeriesKey)) setActiveScatterSeriesKey(null);
    if (activeRadarSeriesKey && !seriesKeys.includes(activeRadarSeriesKey)) setActiveRadarSeriesKey(null);
  }, [activeDonutSeriesKey, activeRadarSeriesKey, activeScatterSeriesKey, seriesKeys]);

  const dateIndex = React.useMemo(() => buildDateIndex(rangedData), [rangedData]);

  const allDates = React.useMemo(() => {
    const dateSet = new Set<string>();
    Object.values(rangedData).forEach((records) => records.forEach((record) => dateSet.add(toDateKey(record.createdAt))));
    return Array.from(dateSet).sort((a, b) => parseDateTimeKey(a).getTime() - parseDateTimeKey(b).getTime());
  }, [rangedData]);

  const providerMetrics = React.useMemo<ProviderMetrics[]>(() => {
    return seriesKeys
      .map((seriesKey) => {
        const records = [...(rangedData[seriesKey] || [])].sort(
          (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
        );
        const percentages = records
          .map((record) => getPrimaryUsedPercent(record, seriesMeta?.[seriesKey]?.defaultProgressItem))
          .filter((value): value is number => value !== null);
        if (percentages.length === 0) return null;

        const costPercentages = records
          .map((record) => getCostBurnPercent(record))
          .filter((value): value is number => value !== null);

        return {
          seriesKey,
          avg: percentages.reduce((sum, value) => sum + value, 0) / percentages.length,
          latest: percentages[percentages.length - 1],
          peak: Math.max(...percentages),
          volatility: std(percentages),
          records: records.length,
          daysWithData: new Set(records.map((record) => toDateKey(record.createdAt))).size,
          costBurn: costPercentages.length
            ? costPercentages.reduce((sum, value) => sum + value, 0) / costPercentages.length
            : null,
        };
      })
      .filter((metric): metric is ProviderMetrics => metric !== null)
      .sort((a, b) =>
        getSeriesLabel(a.seriesKey, seriesMeta).localeCompare(getSeriesLabel(b.seriesKey, seriesMeta), undefined, {
          sensitivity: 'base',
        }),
      );
  }, [rangedData, seriesKeys, seriesMeta]);
  const isWeeklyProgressMode = Boolean(selectedSeriesKey);
  const selectedWeeklyProviderKey = selectedSeriesKey && rangedData[selectedSeriesKey]
    ? selectedSeriesKey
    : seriesKeys[0] || '';
  const weeklyProgressSeries = React.useMemo(() => {
    if (!isWeeklyProgressMode || !selectedWeeklyProviderKey) return [] as Array<{ key: string; label: string }>;
    const records = rangedData[selectedWeeklyProviderKey] || [];
    const progressMap = new Map<string, string>();
    records.forEach((record) => {
      const items = record.progress?.items || [];
      items.forEach((item) => {
        const key = normalizeProgressName(item.name);
        if (!key) return;
        const label = safeProgressLabel(item.name);
        if (!progressMap.has(key) || progressMap.get(key) === 'unnamed') {
          progressMap.set(key, label);
        }
      });
    });
    return Array.from(progressMap.entries())
      .map(([key, label]) => ({ key, label }))
      .sort((a, b) => a.label.localeCompare(b.label, undefined, { sensitivity: 'base' }));
  }, [isWeeklyProgressMode, rangedData, selectedWeeklyProviderKey]);
  const weeklySeriesDefs = React.useMemo(() => {
    if (isWeeklyProgressMode) {
      const provider = selectedWeeklyProviderKey ? seriesMeta?.[selectedWeeklyProviderKey]?.provider : undefined;
      const providerName = selectedWeeklyProviderKey ? seriesMeta?.[selectedWeeklyProviderKey]?.name : undefined;
      const progressKeys = weeklyProgressSeries.map((item) => item.key);
      const progressColors = buildProgressColorMap({
        provider,
        providerName,
        progressKeys,
        activeProviderCount: 1,
      });
      return weeklyProgressSeries.map((item) => ({
        key: item.key,
        label: item.label,
        color: progressColors[item.key] || getProviderBaseColor(provider),
        seriesKey: selectedWeeklyProviderKey,
      }));
    }
    return seriesKeys.map((seriesKey, index) => ({
      key: seriesKey,
      label: getSeriesLabel(seriesKey, seriesMeta),
      color: getSeriesColor(seriesKey, index, seriesMeta),
      seriesKey,
    }));
  }, [isWeeklyProgressMode, selectedWeeklyProviderKey, seriesKeys, seriesMeta, weeklyProgressSeries]);
  const weeklyLineColorByKey = React.useMemo(
    () => weeklySeriesDefs.reduce<Record<string, string>>((acc, item) => {
      acc[item.key] = item.color;
      return acc;
    }, {}),
    [weeklySeriesDefs],
  );
  const weeklyLineLabelByKey = React.useMemo(() => {
    if (isWeeklyProgressMode) {
      const providerLabel = selectedWeeklyProviderKey ? getSeriesLabel(selectedWeeklyProviderKey, seriesMeta) : 'Provider';
      return weeklySeriesDefs.reduce<Record<string, string>>((acc, item) => {
        acc[item.key] = `${providerLabel} · ${item.label}`;
        return acc;
      }, {});
    }
    return weeklySeriesDefs.reduce<Record<string, string>>((acc, item) => {
      acc[item.key] = item.label;
      return acc;
    }, {});
  }, [isWeeklyProgressMode, selectedWeeklyProviderKey, seriesMeta, weeklySeriesDefs]);
  const weeklyLineProviderByKey = React.useMemo(() => {
    if (isWeeklyProgressMode) {
      const provider = selectedWeeklyProviderKey ? seriesMeta?.[selectedWeeklyProviderKey]?.provider : undefined;
      return weeklySeriesDefs.reduce<Record<string, UsageProvider | undefined>>((acc, item) => {
        acc[item.key] = provider;
        return acc;
      }, {});
    }
    return weeklySeriesDefs.reduce<Record<string, UsageProvider | undefined>>((acc, item) => {
      acc[item.key] = seriesMeta?.[item.seriesKey]?.provider;
      return acc;
    }, {});
  }, [isWeeklyProgressMode, selectedWeeklyProviderKey, seriesMeta, weeklySeriesDefs]);
  React.useEffect(() => {
    if (activeWeeklySeriesKey && !weeklySeriesDefs.some((item) => item.key === activeWeeklySeriesKey)) {
      setActiveWeeklySeriesKey(null);
    }
  }, [activeWeeklySeriesKey, weeklySeriesDefs]);

  const weeklyData = React.useMemo(() => {
    const hasValidRange = Number.isFinite(rangeStartMs) && Number.isFinite(rangeEndMs) && (rangeEndMs as number) >= (rangeStartMs as number);
    const datesInRange = hasValidRange
      ? buildDateKeysForRange(rangeStartMs as number, rangeEndMs as number)
      : allDates;

    const weeks: Record<string, Record<string, { sum: number; count: number }>> = {};
    datesInRange.forEach((date) => {
      const current = parseDateTimeKey(date);
      const weekStart = new Date(current);
      weekStart.setDate(current.getDate() - current.getDay());
      const weekKey = toDateKey(weekStart);

      if (!weeks[weekKey]) {
        const emptyWeek: Record<string, { sum: number; count: number }> = {};
        weeklySeriesDefs.forEach((item) => {
          emptyWeek[item.key] = { sum: 0, count: 0 };
        });
        weeks[weekKey] = emptyWeek;
      }

      if (isWeeklyProgressMode) {
        if (!selectedWeeklyProviderKey) return;
        const record = dateIndex.get(selectedWeeklyProviderKey)?.get(date);
        if (!record) return;
        weeklySeriesDefs.forEach((item) => {
          const value = getProgressUsedPercent(record, item.key);
          if (value !== null) {
            weeks[weekKey][item.key].sum += value;
            weeks[weekKey][item.key].count += 1;
          }
        });
        return;
      }

      weeklySeriesDefs.forEach((item) => {
        const record = dateIndex.get(item.seriesKey)?.get(date);
        if (!record) return;
        const value = getConfiguredOrFirstUsedPercent(record, seriesMeta?.[item.seriesKey]?.defaultProgressItem);
        if (value !== null) {
          weeks[weekKey][item.key].sum += value;
          weeks[weekKey][item.key].count += 1;
        }
      });
    });

    return Object.entries(weeks)
      .sort(([weekA], [weekB]) => parseDateTimeKey(weekA).getTime() - parseDateTimeKey(weekB).getTime())
      .map(([week, values]) => ({
        week: formatLocalDateTime(parseDateTimeKey(week)).slice(0, 10),
        ...Object.fromEntries(
          Object.entries(values).map(([seriesKey, stats]) => [seriesKey, stats.count > 0 ? Number((stats.sum / stats.count).toFixed(2)) : 0]),
        ),
      }));
  }, [allDates, dateIndex, isWeeklyProgressMode, rangeEndMs, rangeStartMs, selectedWeeklyProviderKey, seriesMeta, weeklySeriesDefs]);

  const distributionData = React.useMemo(() => {
    return providerMetrics.map((metric) => ({
      name: getSeriesLabel(metric.seriesKey, seriesMeta),
      seriesKey: metric.seriesKey,
      value: metric.avg,
    }));
  }, [providerMetrics, seriesMeta]);
  const visibleWeeklySeriesKeys = React.useMemo(
    () => {
      const keys = weeklySeriesDefs.map((item) => item.key);
      return activeWeeklySeriesKey && keys.includes(activeWeeklySeriesKey) ? [activeWeeklySeriesKey] : keys;
    },
    [activeWeeklySeriesKey, weeklySeriesDefs],
  );
  const visibleDonutSeriesKeys = React.useMemo(
    () => (activeDonutSeriesKey && seriesKeys.includes(activeDonutSeriesKey) ? [activeDonutSeriesKey] : seriesKeys),
    [activeDonutSeriesKey, seriesKeys],
  );
  const visibleDistributionData = React.useMemo(
    () => distributionData.filter((item) => visibleDonutSeriesKeys.includes(item.seriesKey)),
    [distributionData, visibleDonutSeriesKeys],
  );
  const visibleScatterSeriesKeys = React.useMemo(
    () => (activeScatterSeriesKey && seriesKeys.includes(activeScatterSeriesKey) ? [activeScatterSeriesKey] : seriesKeys),
    [activeScatterSeriesKey, seriesKeys],
  );
  const visibleRadarSeriesKeys = React.useMemo(
    () => (activeRadarSeriesKey && seriesKeys.includes(activeRadarSeriesKey) ? [activeRadarSeriesKey] : seriesKeys),
    [activeRadarSeriesKey, seriesKeys],
  );

  const scatterData = React.useMemo(() => {
    return providerMetrics.map((metric) => ({
      seriesKey: metric.seriesKey,
      name: getSeriesLabel(metric.seriesKey, seriesMeta),
      intensity: Number(metric.avg.toFixed(2)),
      volatility: Number(metric.volatility.toFixed(2)),
      samples: metric.daysWithData,
    }));
  }, [providerMetrics, seriesMeta]);

  const radarData = React.useMemo(() => {
    const dimensions = [
      { label: 'Average Load', getValue: (metric: ProviderMetrics) => metric.avg },
      { label: 'Latest Snapshot', getValue: (metric: ProviderMetrics) => metric.latest },
      { label: 'Peak Pressure', getValue: (metric: ProviderMetrics) => metric.peak },
      { label: 'Volatility', getValue: (metric: ProviderMetrics) => metric.volatility },
      { label: 'Cost Burn', getValue: (metric: ProviderMetrics) => metric.costBurn || 0 },
    ];

    return dimensions.map((dimension) => {
      const point: Record<string, string | number> = { dimension: dimension.label };
      providerMetrics.forEach((metric) => {
        point[metric.seriesKey] = Number(dimension.getValue(metric).toFixed(2));
      });
      return point;
    });
  }, [providerMetrics]);

  const sparklineByProvider = React.useMemo(() => {
    return seriesKeys.reduce<Record<string, { date: string; value: number }[]>>((acc, seriesKey) => {
      acc[seriesKey] = allDates
        .map((date) => {
          const record = dateIndex.get(seriesKey)?.get(date);
          const value = record ? getPrimaryUsedPercent(record, seriesMeta?.[seriesKey]?.defaultProgressItem) : null;
          return {
            date: formatLocalDateTime(parseDateTimeKey(date)),
            value: value ?? 0,
          };
        })
        .filter((item) => item.value > 0);
      return acc;
    }, {});
  }, [seriesKeys, allDates, dateIndex]);

  const heatmapDates = React.useMemo(() => {
    const hasValidRange = Number.isFinite(rangeStartMs) && Number.isFinite(rangeEndMs) && (rangeEndMs as number) >= (rangeStartMs as number);
    if (hasValidRange) {
      return buildDateKeysForRange(rangeStartMs as number, rangeEndMs as number);
    }
    return allDates;
  }, [allDates, rangeStartMs, rangeEndMs]);
  const heatmapDayCount = heatmapDates.length;
  const isNarrowScreen = viewportWidth < 640;
  const tooltipLabelMaxChars = isNarrowScreen ? 20 : 25;
  const mobileHeatmapDates = React.useMemo(
    () => heatmapDates,
    [heatmapDates],
  );
  const shouldShowDesktopHeatmapDateLabels = !isNarrowScreen && heatmapDates.length <= 21;
  const shouldShowDonutSliceLabel = !isNarrowScreen && distributionData.length <= 8;
  const mobileDonutLegendLayout = React.useMemo(() => {
    if (!isNarrowScreen) {
      return { columns: 1 };
    }
    const labels = distributionData.map((item) => getSeriesLabel(item.seriesKey, seriesMeta));
    const columns = resolveMobileLegendColumns(labels, viewportWidth - 56, 2);
    return { columns };
  }, [distributionData, isNarrowScreen, seriesMeta, viewportWidth]);
  const mobileWeeklyLegendColumns = React.useMemo(() => {
    if (!isNarrowScreen) return 1;
    const labels = weeklySeriesDefs.map((item) => item.label);
    return resolveMobileLegendColumns(labels, viewportWidth - 56, 2);
  }, [isNarrowScreen, viewportWidth, weeklySeriesDefs]);
  const mobileRadarLegendColumns = React.useMemo(() => {
    if (!isNarrowScreen) return 1;
    const labels = seriesKeys.map((seriesKey) => getSeriesLabel(seriesKey, seriesMeta));
    return resolveMobileLegendColumns(labels, viewportWidth - 56, 2);
  }, [isNarrowScreen, seriesKeys, seriesMeta, viewportWidth]);
  const primaryChartsHeight = isNarrowScreen ? 246 : 280;
  const primaryLegendsMinHeight = isNarrowScreen ? 94 : 74;
  const compactChartMargin = isNarrowScreen ? { top: 8, right: 4, left: 0, bottom: 0 } : { top: 10, right: 10, left: 0, bottom: 0 };
  const compactScatterMargin = isNarrowScreen ? { top: 10, right: 6, bottom: 6, left: 2 } : { top: 20, right: 20, bottom: 10, left: 10 };
  const compactYAxisWidth = isNarrowScreen ? 32 : 42;

  if (seriesKeys.length === 0 || allDates.length === 0) {
    return null;
  }

  return (
    <div className="space-y-6 mt-6">
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <ChartCard title="Weekly Comparison (Bar)" subtitle="Weekly aggregation to reveal stage-by-stage usage shifts." delay={120}>
          <ResponsiveContainer width="100%" height={primaryChartsHeight}>
            <BarChart data={weeklyData} margin={compactChartMargin}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border-subtle)" />
              <XAxis dataKey="week" stroke="var(--color-text-muted)" fontSize={11} />
              <YAxis width={compactYAxisWidth} stroke="var(--color-text-muted)" fontSize={11} />
              <Tooltip
                content={isWeeklyProgressMode ? (
                  <UsageTrendTooltip
                    bucketMs={DAY_MS}
                    lineLabelByKey={weeklyLineLabelByKey}
                    lineColorByKey={weeklyLineColorByKey}
                    lineProviderByKey={weeklyLineProviderByKey}
                    labelMaxChars={tooltipLabelMaxChars}
                  />
                ) : (
                  <CustomTooltip seriesMeta={seriesMeta} labelMaxChars={tooltipLabelMaxChars} />
                )}
                labelFormatter={(value) => formatWeekRangeLabel(String(value))}
              />
              {visibleWeeklySeriesKeys.map((weeklyKey) => {
                const item = weeklySeriesDefs.find((entry) => entry.key === weeklyKey);
                if (!item) return null;
                return (
                  <Bar
                    key={weeklyKey}
                    dataKey={weeklyKey}
                    fill={item.color}
                    name={item.label}
                    radius={[4, 4, 0, 0]}
                    isAnimationActive={false}
                  />
                );
              })}
            </BarChart>
          </ResponsiveContainer>
          <div className="mt-2 border-t border-[var(--color-border-subtle)] pt-2" style={{ minHeight: `${primaryLegendsMinHeight}px` }}>
            {isWeeklyProgressMode ? (
              <UsageTrendLegend
                lineKeys={weeklySeriesDefs.map((item) => item.key)}
                lineLabelByKey={weeklyLineLabelByKey}
                lineColorByKey={weeklyLineColorByKey}
                lineProviderByKey={weeklyLineProviderByKey}
                isNarrowScreen={isNarrowScreen}
                viewportWidth={viewportWidth}
                activeLineKey={activeWeeklySeriesKey}
                onToggleLineKey={(lineKey) => setActiveWeeklySeriesKey((current) => (current === lineKey ? null : lineKey))}
              />
            ) : (
              <div
                className={isNarrowScreen ? 'grid gap-x-1.5 gap-y-1 text-[11px]' : 'flex flex-wrap items-center gap-2 text-xs'}
                style={isNarrowScreen ? { gridTemplateColumns: `repeat(${mobileWeeklyLegendColumns}, minmax(0, 1fr))` } : undefined}
              >
                {weeklySeriesDefs.map((item) => {
                  const isActive = !activeWeeklySeriesKey || activeWeeklySeriesKey === item.key;
                  return (
                  <span
                    key={`weekly-legend-${item.key}`}
                    className={isNarrowScreen ? 'inline-flex w-full min-w-0 cursor-pointer items-center gap-1 text-[var(--color-text-secondary)] transition-opacity' : 'inline-flex min-w-0 cursor-pointer items-center gap-1.5 text-[var(--color-text-secondary)] transition-opacity'}
                    style={{ opacity: isActive ? 1 : 0.35 }}
                    onClick={() => setActiveWeeklySeriesKey((current) => (current === item.key ? null : item.key))}
                  >
                    <span className="h-2 w-2 rounded-full" style={{ backgroundColor: item.color }} />
                    <ProviderBadge seriesKey={item.seriesKey} seriesMeta={seriesMeta} truncateLabel={false} maxChars={isNarrowScreen ? 20 : 25} />
                  </span>
                )})}
              </div>
            )}
          </div>
        </ChartCard>

        <ChartCard title="Share of Consumption (Donut)" subtitle="Average consumption share to identify dominant providers." delay={160}>
          <ResponsiveContainer width="100%" height={primaryChartsHeight}>
            <PieChart margin={{ top: 8, right: 8, bottom: 8, left: 8 }}>
              <Pie
                data={visibleDistributionData}
                cx="50%"
                cy="50%"
                innerRadius={isNarrowScreen ? 44 : 56}
                outerRadius={isNarrowScreen ? 72 : 84}
                dataKey="value"
                nameKey="name"
                label={shouldShowDonutSliceLabel ? ({ percent }) => `${((percent || 0) * 100).toFixed(0)}%` : false}
                labelLine={false}
                isAnimationActive={false}
              >
                {visibleDistributionData.map((entry, index) => (
                  <Cell key={entry.seriesKey} fill={getSeriesColor(entry.seriesKey, index, seriesMeta)} />
                ))}
              </Pie>
              <Tooltip content={<CustomTooltip seriesMeta={seriesMeta} labelMaxChars={tooltipLabelMaxChars} />} />
            </PieChart>
          </ResponsiveContainer>
          <div className="mt-2 border-t border-[var(--color-border-subtle)] pt-2" style={{ minHeight: `${primaryLegendsMinHeight}px` }}>
            <div
              className={isNarrowScreen ? 'grid gap-x-1.5 gap-y-1 text-[11px]' : 'flex flex-wrap items-center gap-2 text-xs'}
              style={isNarrowScreen ? { gridTemplateColumns: `repeat(${mobileDonutLegendLayout.columns}, minmax(0, 1fr))` } : undefined}
            >
              {distributionData.map((entry, index) => {
                const isActive = !activeDonutSeriesKey || activeDonutSeriesKey === entry.seriesKey;
                return (
                <span
                  key={`donut-legend-${entry.seriesKey}`}
                  className={isNarrowScreen ? 'inline-flex w-full min-w-0 cursor-pointer items-center gap-1 text-[var(--color-text-secondary)] transition-opacity' : 'inline-flex min-w-0 cursor-pointer items-center gap-1.5 text-[var(--color-text-secondary)] transition-opacity'}
                  style={{ opacity: isActive ? 1 : 0.35 }}
                  onClick={() => setActiveDonutSeriesKey((current) => (current === entry.seriesKey ? null : entry.seriesKey))}
                >
                  <span className="h-2 w-2 rounded-full" style={{ backgroundColor: getSeriesColor(entry.seriesKey, index, seriesMeta) }} />
                  <ProviderBadge
                    seriesKey={entry.seriesKey}
                    seriesMeta={seriesMeta}
                    truncateLabel={false}
                    maxChars={isNarrowScreen ? 20 : 25}
                  />
                </span>
              )})}
            </div>
          </div>
        </ChartCard>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <ChartCard title="Intensity vs Volatility" subtitle="X = average usage, Y = volatility, bubble size = active days." delay={220}>
          <ResponsiveContainer width="100%" height={primaryChartsHeight}>
            <ScatterChart margin={compactScatterMargin}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border-subtle)" />
              <XAxis type="number" dataKey="intensity" name="Average" stroke="var(--color-text-muted)" fontSize={11} domain={[0, 100]} tickFormatter={(value) => `${value}%`} />
              <YAxis width={compactYAxisWidth} type="number" dataKey="volatility" name="Volatility" stroke="var(--color-text-muted)" fontSize={11} domain={[0, 100]} tickFormatter={(value) => `${value}%`} />
              <Tooltip
                cursor={{ strokeDasharray: '3 3' }}
                formatter={(value: number | string, name: string) => {
                  if (typeof value === 'number') {
                    if (name === 'samples') return [`${value.toFixed(0)} days`, 'Active Days'];
                    return [`${value.toFixed(1)}%`, name === 'intensity' ? 'Average' : 'Volatility'];
                  }
                  return [value, name];
                }}
              />
              {scatterData.filter((point) => visibleScatterSeriesKeys.includes(point.seriesKey)).map((point, index) => (
                <Scatter
                  key={point.seriesKey}
                  name={point.seriesKey}
                  data={[point]}
                  fill={getSeriesColor(point.seriesKey, index, seriesMeta)}
                  shape="circle"
                  isAnimationActive={false}
                />
              ))}
            </ScatterChart>
          </ResponsiveContainer>
          <div className="mt-2 border-t border-[var(--color-border-subtle)] pt-2" style={{ minHeight: `${primaryLegendsMinHeight}px` }}>
            <div
              className={isNarrowScreen ? 'grid gap-x-1.5 gap-y-1 text-[11px]' : 'flex flex-wrap items-center gap-2 text-xs'}
              style={isNarrowScreen ? { gridTemplateColumns: `repeat(${mobileWeeklyLegendColumns}, minmax(0, 1fr))` } : undefined}
            >
              {seriesKeys.map((seriesKey, index) => {
                const isActive = !activeScatterSeriesKey || activeScatterSeriesKey === seriesKey;
                return (
                <span
                  key={`scatter-legend-${seriesKey}`}
                  className={isNarrowScreen ? 'inline-flex w-full min-w-0 cursor-pointer items-center gap-1 text-[var(--color-text-secondary)] transition-opacity' : 'inline-flex min-w-0 cursor-pointer items-center gap-1.5 text-[var(--color-text-secondary)] transition-opacity'}
                  style={{ opacity: isActive ? 1 : 0.35 }}
                  onClick={() => setActiveScatterSeriesKey((current) => (current === seriesKey ? null : seriesKey))}
                >
                  <span className="h-2 w-2 rounded-full" style={{ backgroundColor: getSeriesColor(seriesKey, index, seriesMeta) }} />
                  <ProviderBadge seriesKey={seriesKey} seriesMeta={seriesMeta} truncateLabel={false} maxChars={isNarrowScreen ? 20 : 25} />
                </span>
              )})}
            </div>
          </div>
        </ChartCard>

        <ChartCard title="Provider Radar Matrix" subtitle="Compare multiple dimensions in one view (average/latest/peak/volatility/cost)." delay={300}>
          <ResponsiveContainer width="100%" height={primaryChartsHeight}>
            <RadarChart cx="50%" cy={isNarrowScreen ? '44%' : '50%'} outerRadius={isNarrowScreen ? '56%' : '72%'} data={radarData}>
              <PolarGrid stroke="var(--color-border-subtle)" />
              <PolarAngleAxis
                dataKey="dimension"
                stroke="var(--color-text-muted)"
                fontSize={isNarrowScreen ? 9 : 11}
                tickFormatter={(value) => {
                  if (!isNarrowScreen) return String(value);
                  const text = String(value);
                  if (text === 'Average Load') return 'Average';
                  if (text === 'Latest Snapshot') return 'Latest';
                  if (text === 'Peak Pressure') return 'Peak';
                  if (text === 'Volatility') return 'Volatility';
                  if (text === 'Cost Burn') return 'Cost';
                  return text;
                }}
              />
              <PolarRadiusAxis angle={30} domain={[0, 100]} stroke="var(--color-text-muted)" fontSize={10} />
              {visibleRadarSeriesKeys.map((seriesKey, index) => (
                <Radar
                  key={seriesKey}
                  name={seriesKey}
                  dataKey={seriesKey}
                  stroke={getSeriesColor(seriesKey, index, seriesMeta)}
                  fill={getSeriesColor(seriesKey, index, seriesMeta)}
                  fillOpacity={0.16}
                  isAnimationActive={false}
                />
              ))}
              <Tooltip content={<CustomTooltip seriesMeta={seriesMeta} labelMaxChars={tooltipLabelMaxChars} />} />
            </RadarChart>
          </ResponsiveContainer>
          <div className="mt-2 border-t border-[var(--color-border-subtle)] pt-2" style={{ minHeight: `${primaryLegendsMinHeight}px` }}>
            <div
              className={isNarrowScreen ? 'grid gap-x-1.5 gap-y-1 text-[11px]' : 'flex flex-wrap items-center gap-2 text-xs'}
              style={isNarrowScreen ? { gridTemplateColumns: `repeat(${mobileRadarLegendColumns}, minmax(0, 1fr))` } : undefined}
            >
              {seriesKeys.map((seriesKey, index) => {
                const isActive = !activeRadarSeriesKey || activeRadarSeriesKey === seriesKey;
                return (
                <span
                  key={`radar-legend-${seriesKey}`}
                  className={isNarrowScreen ? 'inline-flex w-full min-w-0 cursor-pointer items-center gap-1 text-[var(--color-text-secondary)] transition-opacity' : 'inline-flex min-w-0 cursor-pointer items-center gap-1.5 text-[var(--color-text-secondary)] transition-opacity'}
                  style={{ opacity: isActive ? 1 : 0.35 }}
                  onClick={() => setActiveRadarSeriesKey((current) => (current === seriesKey ? null : seriesKey))}
                >
                  <span className="h-2 w-2 rounded-full" style={{ backgroundColor: getSeriesColor(seriesKey, index, seriesMeta) }} />
                  <ProviderBadge seriesKey={seriesKey} seriesMeta={seriesMeta} truncateLabel={false} maxChars={isNarrowScreen ? 20 : 25} />
                </span>
              )})}
            </div>
          </div>
        </ChartCard>
      </div>

      <ChartCard title="Provider Heatmap" subtitle="Rows: providers, columns: days, darker = higher usage." delay={340}>
        {isNarrowScreen ? (
          <div className="space-y-3">
            <p className="text-[11px] text-[var(--color-text-muted)]">
              Each row renders the full selected range in one line.
            </p>
            {seriesKeys.map((seriesKey, index) => (
              <div key={`mobile-heatmap-${seriesKey}`} className="rounded-lg border border-[var(--color-border-subtle)] bg-[var(--color-bg-subtle)]/40 p-2.5">
                <ProviderBadge
                  seriesKey={seriesKey}
                  seriesMeta={seriesMeta}
                  className="text-xs font-medium text-[var(--color-text-secondary)]"
                  maxChars={20}
                />
                <div
                  className={`mt-2 grid ${mobileHeatmapDates.length > 45 ? 'gap-px' : mobileHeatmapDates.length > 24 ? 'gap-[1px]' : 'gap-1'}`}
                  style={{ gridTemplateColumns: `repeat(${mobileHeatmapDates.length || 1}, minmax(0, 1fr))` }}
                >
                  {mobileHeatmapDates.map((date) => {
                    const record = dateIndex.get(seriesKey)?.get(date);
                    const value = record ? getPrimaryUsedPercent(record, seriesMeta?.[seriesKey]?.defaultProgressItem) || 0 : 0;
                    const intensity = Math.max(0.08, value / 100);
                    return (
                      <div
                        key={`${seriesKey}-${date}`}
                        className={`rounded-[2px] ${
                          mobileHeatmapDates.length > 60
                            ? 'h-[8px]'
                            : mobileHeatmapDates.length > 30
                              ? 'h-[10px]'
                              : 'h-[14px]'
                        }`}
                        style={{
                          backgroundColor: value === 0 ? 'var(--color-bg-subtle)' : getSeriesColor(seriesKey, index, seriesMeta),
                          opacity: value === 0 ? 1 : intensity,
                        }}
                        onMouseEnter={(event) => showHeatmapHover(event, `${truncateByChars(getSeriesLabel(seriesKey, seriesMeta), tooltipLabelMaxChars)} ${formatDateOnly(parseDateTimeKey(date))}: ${value.toFixed(1)}%`)}
                        onMouseMove={moveHeatmapHover}
                        onMouseLeave={clearHeatmapHover}
                      />
                    );
                  })}
                </div>
              </div>
            ))}
            <div className="flex items-center justify-end gap-2 mt-2">
              <span className="text-xs text-[var(--color-text-muted)]">Less</span>
              <div className="flex gap-1">
                {[0.15, 0.35, 0.55, 0.75, 0.95].map((opacity) => (
                  <div key={opacity} className="w-3 h-3 rounded" style={{ backgroundColor: 'var(--color-accent)', opacity }} />
                ))}
              </div>
              <span className="text-xs text-[var(--color-text-muted)]">More</span>
            </div>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <div className="min-w-[720px] space-y-2">
              {shouldShowDesktopHeatmapDateLabels ? (
                <div className="grid" style={{ gridTemplateColumns: `220px repeat(${heatmapDates.length}, minmax(18px, 1fr))` }}>
                  <div className="text-xs text-[var(--color-text-muted)] px-2">Provider / Name</div>
                  {heatmapDates.map((date) => {
                    return (
                      <div key={date} className="text-[10px] text-center text-[var(--color-text-muted)]">
                        {formatDateOnly(parseDateTimeKey(date))}
                      </div>
                    );
                  })}
                </div>
              ) : null}
              {seriesKeys.map((seriesKey, index) => (
                <div key={seriesKey} className="grid items-center" style={{ gridTemplateColumns: `220px repeat(${heatmapDates.length}, minmax(18px, 1fr))` }}>
                  <div className="text-xs font-medium text-[var(--color-text-secondary)] pr-3 truncate">
                    <ProviderBadge seriesKey={seriesKey} seriesMeta={seriesMeta} maxChars={25} />
                  </div>
                  {heatmapDates.map((date) => {
                    const record = dateIndex.get(seriesKey)?.get(date);
                    const value = record ? getPrimaryUsedPercent(record, seriesMeta?.[seriesKey]?.defaultProgressItem) || 0 : 0;
                    const intensity = Math.max(0.08, value / 100);
                    return (
                      <div
                        key={`${seriesKey}-${date}`}
                        className="h-[18px] rounded-[4px]"
                        style={{
                          backgroundColor: value === 0 ? 'var(--color-bg-subtle)' : getSeriesColor(seriesKey, index, seriesMeta),
                          opacity: value === 0 ? 1 : intensity,
                        }}
                        onMouseEnter={(event) => showHeatmapHover(event, `${truncateByChars(getSeriesLabel(seriesKey, seriesMeta), tooltipLabelMaxChars)} ${formatDateOnly(parseDateTimeKey(date))}: ${value.toFixed(1)}%`)}
                        onMouseMove={moveHeatmapHover}
                        onMouseLeave={clearHeatmapHover}
                      />
                    );
                  })}
                </div>
              ))}
            </div>
            <div className="flex items-center justify-end gap-2 mt-4">
              <span className="text-xs text-[var(--color-text-muted)]">Less</span>
              <div className="flex gap-1">
                {[0.15, 0.35, 0.55, 0.75, 0.95].map((opacity) => (
                  <div key={opacity} className="w-4 h-4 rounded" style={{ backgroundColor: 'var(--color-accent)', opacity }} />
                ))}
              </div>
              <span className="text-xs text-[var(--color-text-muted)]">More</span>
            </div>
          </div>
        )}
      </ChartCard>

      <div
        ref={heatmapTooltipRef}
        className="pointer-events-none fixed z-[120] rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1 text-xs text-[var(--color-text-primary)] shadow-lg opacity-0"
        style={{ left: '-9999px', top: '-9999px' }}
      />

      <ChartCard title="Provider Insights" subtitle="Avg, peak, latest, and volatility per provider." delay={380}>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {providerMetrics.map((metric, index) => {
            const color = getSeriesColor(metric.seriesKey, index, seriesMeta);
            const sparklineData = sparklineByProvider[metric.seriesKey] || [];

            return (
              <div key={metric.seriesKey} className="p-4 rounded-xl bg-[var(--color-bg-subtle)] border border-[var(--color-border-subtle)]">
                <div className="flex items-center justify-between mb-3">
                  <ProviderBadge
                    seriesKey={metric.seriesKey}
                    seriesMeta={seriesMeta}
                    iconSize="lg"
                    className="max-w-[360px] text-base font-semibold text-[var(--color-text-primary)]"
                    maxChars={isNarrowScreen ? 20 : 25}
                  />
                  <span className="text-xs font-medium px-2 py-1 rounded-full" style={{ backgroundColor: `${color}22`, color }}>
                    {metric.records} records
                  </span>
                </div>
                <div className="mb-3 grid grid-cols-2 gap-3">
                  <div className="rounded-lg bg-[var(--color-surface)]/65 px-2.5 py-2">
                    <div className="grid w-full grid-cols-[minmax(0,1fr)_4.25rem] items-baseline gap-x-1.5">
                      <p className="truncate text-xs font-medium tracking-wide text-[var(--color-text-muted)]">Average</p>
                      <p className="text-right text-lg font-semibold leading-tight tabular-nums text-[var(--color-text-primary)]">{metric.avg.toFixed(1)}%</p>
                    </div>
                  </div>
                  <div className="rounded-lg bg-[var(--color-surface)]/65 px-2.5 py-2">
                    <div className="grid w-full grid-cols-[minmax(0,1fr)_4.25rem] items-baseline gap-x-1.5">
                      <p className="truncate text-xs font-medium tracking-wide text-[var(--color-text-muted)]">Latest</p>
                      <p className="text-right text-lg font-semibold leading-tight tabular-nums text-[var(--color-text-primary)]">{metric.latest.toFixed(1)}%</p>
                    </div>
                  </div>
                  <div className="rounded-lg bg-[var(--color-surface)]/65 px-2.5 py-2">
                    <div className="grid w-full grid-cols-[minmax(0,1fr)_4.25rem] items-baseline gap-x-1.5">
                      <p className="truncate text-xs font-medium tracking-wide text-[var(--color-text-muted)]">Peak</p>
                      <p className="text-right text-lg font-semibold leading-tight tabular-nums text-[var(--color-text-primary)]">{metric.peak.toFixed(1)}%</p>
                    </div>
                  </div>
                  <div className="rounded-lg bg-[var(--color-surface)]/65 px-2.5 py-2">
                    <div className="grid w-full grid-cols-[minmax(0,1fr)_4.25rem] items-baseline gap-x-1.5">
                      <p className="truncate text-xs font-medium tracking-wide text-[var(--color-text-muted)]">Volatility</p>
                      <p className="text-right text-lg font-semibold leading-tight tabular-nums text-[var(--color-text-primary)]">{metric.volatility.toFixed(1)}%</p>
                    </div>
                  </div>
                </div>
                <div className="h-16">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={sparklineData}>
                      <Line dataKey="value" stroke={color} strokeWidth={2} dot={false} isAnimationActive={false} type="monotone" />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>
            );
          })}
        </div>
      </ChartCard>
    </div>
  );
};
