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
}

interface MultiChartsProps {
  data: Record<string, UsageRecord[]>;
  seriesMeta?: Record<string, HistorySeriesMeta>;
  rangeDays?: number;
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
const clampPercent = (value: number): number => Math.min(100, Math.max(0, value));
const normalizeProgressName = (name: string): string => String(name || '').trim().toLowerCase();
const safeProgressLabel = (name: string): string => {
  const trimmed = String(name || '').trim();
  return trimmed || 'unnamed';
};
const toSafeDomId = (value: string): string => value.replace(/[^a-zA-Z0-9_-]/g, '-');

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
  iconSize?: 'sm' | 'md';
}> = ({ seriesKey, seriesMeta, className, iconSize = 'sm' }) => {
  const label = getSeriesLabel(seriesKey, seriesMeta);
  const provider = getSeriesProvider(seriesKey, seriesMeta);
  const logo = provider ? providerLogos[provider] : undefined;
  const iconSizeClass = iconSize === 'md' ? 'h-5 w-5' : 'h-4 w-4';
  const fallbackTextClass = iconSize === 'md' ? 'text-[10px]' : 'text-[9px]';

  return (
    <span className={`inline-flex min-w-0 items-center gap-2 ${className || ''}`}>
      {logo ? (
        <ProviderLogo provider={provider as UsageProvider} size={iconSize === 'md' ? 20 : 16} alt={label} />
      ) : (
        <span className={`inline-flex ${iconSizeClass} items-center justify-center rounded bg-[var(--color-bg-subtle)] ${fallbackTextClass} font-semibold text-[var(--color-text-secondary)]`}>
          {(label || '?')[0]}
        </span>
      )}
      <span className="truncate">{label}</span>
    </span>
  );
};

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

const getUsageTrendBucketMs = (timestamps: number[]): number => {
  if (timestamps.length <= 1) return 60 * 60 * 1000;
  const min = Math.min(...timestamps);
  const max = Math.max(...timestamps);
  const spanDays = (max - min) / (24 * 60 * 60 * 1000);

  if (spanDays <= 7) return 30 * 60 * 1000;
  if (spanDays <= 30) return 60 * 60 * 1000;
  if (spanDays <= 90) return 3 * 60 * 60 * 1000;
  if (spanDays <= 180) return 6 * 60 * 60 * 1000;
  return 24 * 60 * 60 * 1000;
};

const toTimeBucketKey = (date: Date, bucketMs: number): string => {
  const timestamp = new Date(date).getTime();
  const timezoneOffsetMs = new Date(timestamp).getTimezoneOffset() * 60 * 1000;
  const bucketStart = Math.floor((timestamp - timezoneOffsetMs) / bucketMs) * bucketMs + timezoneOffsetMs;
  return formatLocalDateTime(bucketStart);
};

const formatUsageTrendTick = (value: string, _bucketMs: number): string => {
  return formatLocalDateTime(parseDateTimeKey(value));
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

const ProviderLegend: React.FC<{
  payload?: Array<{ value?: string | number; dataKey?: string | number; payload?: Record<string, unknown>; color?: string }>;
  seriesMeta?: Record<string, HistorySeriesMeta>;
}> = ({ payload, seriesMeta }) => {
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

  return (
    <div className="mt-2 flex flex-wrap items-center gap-3 text-xs">
      {uniquePayload.map((entry, index) => {
        const keyCandidate = String(entry.dataKey || entry.value || entry.payload?.seriesKey || '');
        const seriesKey = resolveSeriesKey(keyCandidate, seriesMeta);

        if (!seriesKey) {
          const dotColor = getLegendDotColor(entry);
          return (
            <span key={`${keyCandidate}-${index}`} className="inline-flex items-center gap-1 text-[var(--color-text-secondary)]">
              {dotColor ? <span className="h-2 w-2 rounded-full" style={{ backgroundColor: dotColor }} /> : null}
              <span>{String(entry.value || keyCandidate)}</span>
            </span>
          );
        }

        const dotColor = getLegendDotColor(entry);
        return (
          <span key={`${seriesKey}-${index}`} className="inline-flex items-center gap-1.5 text-[var(--color-text-secondary)]">
            {dotColor ? <span className="h-2 w-2 rounded-full" style={{ backgroundColor: dotColor }} /> : null}
            <ProviderBadge seriesKey={seriesKey} seriesMeta={seriesMeta} />
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
}> = ({ lineKeys, lineLabelByKey, lineColorByKey, lineProviderByKey }) => {
  if (lineKeys.length === 0) return null;
  return (
    <div className="mt-2 flex flex-wrap items-center gap-3 text-xs">
      {lineKeys.map((lineKey) => (
        <span key={lineKey} className="inline-flex items-center gap-1 text-[var(--color-text-secondary)]">
          <span className="h-2 w-2 rounded-full" style={{ backgroundColor: lineColorByKey[lineKey] || '#666666' }} />
          {lineProviderByKey[lineKey] && providerLogos[lineProviderByKey[lineKey] as UsageProvider] ? (
            <ProviderLogo provider={lineProviderByKey[lineKey] as UsageProvider} size={16} alt={lineLabelByKey[lineKey] || lineKey} />
          ) : null}
          <span>{lineLabelByKey[lineKey] || lineKey}</span>
        </span>
      ))}
    </div>
  );
};

const UsageTrendTooltip: React.FC<{
  active?: boolean;
  payload?: TooltipEntry[];
  label?: string;
  valueSuffix?: string;
  lineLabelByKey: Record<string, string>;
  lineColorByKey: Record<string, string>;
  lineProviderByKey: Record<string, UsageProvider | undefined>;
}> = ({ active, payload, label, valueSuffix = '%', lineLabelByKey, lineColorByKey, lineProviderByKey }) => {
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
        const key = String(entry.dataKey || entry.name || '');
        const dotColor = lineColorByKey[key] || getLegendDotColor(entry) || 'var(--color-text-muted)';
        const displayLabel = lineLabelByKey[key] || String(entry.name || key);
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
}> = ({ active, payload, label, valueSuffix = '%', seriesMeta }) => {
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
              <ProviderBadge seriesKey={seriesKey} seriesMeta={seriesMeta} className="max-w-[220px]" />
            ) : (
              <span className="text-[var(--color-text-secondary)]">{entry.name || keyCandidate}</span>
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
}) => {
  const isProviderProgressMode = mode === 'providerProgress';
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

  const { chartData, bucketMs } = React.useMemo(() => {
    const timestamps = (isProviderProgressMode ? selectedProviderRecords : Object.values(data).flatMap((records) => records))
      .map((record) => new Date(record.createdAt).getTime())
      .filter((timestamp) => Number.isFinite(timestamp));

    const resolvedBucketMs = getUsageTrendBucketMs(timestamps);
    const allBuckets = new Set<string>();
    const seriesBucketIndex = new Map<string, Map<string, UsageRecord>>();

    if (isProviderProgressMode) {
      const bucketIndex = new Map<string, UsageRecord>();
      selectedProviderRecords.forEach((record) => {
        const bucketKey = toTimeBucketKey(record.createdAt, resolvedBucketMs);
        const existing = bucketIndex.get(bucketKey);
        if (!existing || new Date(record.createdAt).getTime() >= new Date(existing.createdAt).getTime()) {
          bucketIndex.set(bucketKey, record);
        }
        allBuckets.add(bucketKey);
      });
      seriesBucketIndex.set(selectedProviderKey, bucketIndex);
    } else {
      seriesKeys.forEach((seriesKey) => {
        const bucketIndex = new Map<string, UsageRecord>();
        (data[seriesKey] || []).forEach((record) => {
          const bucketKey = toTimeBucketKey(record.createdAt, resolvedBucketMs);
          const existing = bucketIndex.get(bucketKey);
          if (!existing || new Date(record.createdAt).getTime() >= new Date(existing.createdAt).getTime()) {
            bucketIndex.set(bucketKey, record);
          }
          allBuckets.add(bucketKey);
        });
        seriesBucketIndex.set(seriesKey, bucketIndex);
      });
    }

    const nextChartData = Array.from(allBuckets)
      .sort((a, b) => parseDateTimeKey(a).getTime() - parseDateTimeKey(b).getTime())
      .map((bucket) => {
        const point: Record<string, number | string | null> = { date: bucket };
        if (isProviderProgressMode) {
          const bucketIndex = seriesBucketIndex.get(selectedProviderKey) as Map<string, UsageRecord> | undefined;
          const record = bucketIndex?.get(bucket);
          lineKeys.forEach((lineKey) => {
            point[lineKey] = record ? getProgressUsedPercent(record, lineKey) : null;
          });
        } else {
          seriesKeys.forEach((seriesKey) => {
            const bucketIndex = seriesBucketIndex.get(seriesKey) as Map<string, UsageRecord> | undefined;
            const record = bucketIndex?.get(bucket);
            point[seriesKey] = record ? getPrimaryUsedPercent(record, seriesMeta?.[seriesKey]?.defaultProgressItem) : null;
          });
        }
        return point;
      });

    return { chartData: nextChartData, bucketMs: resolvedBucketMs };
  }, [data, isProviderProgressMode, lineKeys, selectedProviderKey, selectedProviderRecords, seriesKeys]);

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
    () => chartData.some((point) => lineKeys.some((lineKey) => typeof point[lineKey] === 'number')),
    [chartData, lineKeys]
  );

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
    <ResponsiveContainer width="100%" height={400}>
      <ComposedChart data={chartData} margin={{ top: 20, right: 24, left: 8, bottom: 8 }}>
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
          dataKey="date"
          stroke="var(--color-text-muted)"
          fontSize={12}
          minTickGap={20}
          tickFormatter={(value) => formatUsageTrendTick(String(value), bucketMs)}
        />
        <YAxis stroke="var(--color-text-muted)" fontSize={12} domain={[0, 100]} tickFormatter={(value) => `${value}%`} />
        <Tooltip
          content={(
            <UsageTrendTooltip
              lineLabelByKey={usageTrendLabelByKey}
              lineColorByKey={lineColorByKey}
              lineProviderByKey={lineProviderByKey}
            />
          )}
          labelFormatter={(value) => formatUsageTrendTick(String(value), bucketMs)}
        />
        <Legend
          content={(
            <UsageTrendLegend
              lineKeys={lineKeys}
              lineLabelByKey={usageTrendLabelByKey}
              lineColorByKey={lineColorByKey}
              lineProviderByKey={lineProviderByKey}
            />
          )}
        />
        {lineKeys.map((lineKey) => (
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
        {lineKeys.map((lineKey) => (
          <Line
            key={lineKey}
            type="monotone"
            dataKey={lineKey}
            stroke={lineColorByKey[lineKey]}
            strokeWidth={1.3}
            dot={false}
            connectNulls
            name={usageTrendLabelByKey[lineKey] || lineKey}
            isAnimationActive={false}
          />
        ))}
      </ComposedChart>
    </ResponsiveContainer>
  );
};

export const MultiCharts: React.FC<MultiChartsProps> = ({ data, seriesMeta, rangeDays }) => {
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

  const weeklyData = React.useMemo(() => {
    const weeks: Record<string, Record<string, number>> = {};

    allDates.forEach((date) => {
      const current = parseDateTimeKey(date);
      const weekStart = new Date(current);
      weekStart.setDate(current.getDate() - current.getDay());
      const weekKey = toDateKey(weekStart);

      if (!weeks[weekKey]) {
        weeks[weekKey] = {};
        seriesKeys.forEach((seriesKey) => {
          weeks[weekKey][seriesKey] = 0;
        });
      }

      seriesKeys.forEach((seriesKey) => {
        const record = dateIndex.get(seriesKey)?.get(date);
        if (!record) return;
        const value = getPrimaryUsedPercent(record, seriesMeta?.[seriesKey]?.defaultProgressItem);
        if (value !== null) {
          weeks[weekKey][seriesKey] = (weeks[weekKey][seriesKey] || 0) + value;
        }
      });
    });

    return Object.entries(weeks)
      .sort(([weekA], [weekB]) => parseDateTimeKey(weekA).getTime() - parseDateTimeKey(weekB).getTime())
      .map(([week, values]) => ({
        week: formatLocalDateTime(parseDateTimeKey(week)).slice(0, 10),
        ...values,
      }));
  }, [allDates, seriesKeys, dateIndex]);

  const distributionData = React.useMemo(() => {
    return providerMetrics.map((metric) => ({
      name: getSeriesLabel(metric.seriesKey, seriesMeta),
      seriesKey: metric.seriesKey,
      value: metric.avg,
    }));
  }, [providerMetrics, seriesMeta]);

  const scatterData = React.useMemo(() => {
    return providerMetrics.map((metric) => ({
      seriesKey: metric.seriesKey,
      name: getSeriesLabel(metric.seriesKey, seriesMeta),
      intensity: Number(metric.avg.toFixed(2)),
      volatility: Number(metric.volatility.toFixed(2)),
      samples: metric.daysWithData,
    }));
  }, [providerMetrics, seriesMeta]);

  const costCompareData = React.useMemo(() => {
    return providerMetrics
      .filter((metric) => metric.costBurn !== null)
      .map((metric) => ({
        seriesKey: metric.seriesKey,
        name: getSeriesLabel(metric.seriesKey, seriesMeta),
        usage: Number(metric.avg.toFixed(2)),
        cost: Number((metric.costBurn || 0).toFixed(2)),
      }));
  }, [providerMetrics, seriesMeta]);

  const costLabelToSeriesKey = React.useMemo(() => {
    const map = new Map<string, string>();
    costCompareData.forEach((item) => {
      map.set(item.name, item.seriesKey);
    });
    return map;
  }, [costCompareData]);

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

  const heatmapDates = React.useMemo(() => allDates, [allDates]);
  const heatmapDayCount = heatmapDates.length;

  if (seriesKeys.length === 0 || allDates.length === 0) {
    return null;
  }

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

  return (
    <div className="space-y-6 mt-6">
      <ChartCard title="Provider Insights" subtitle="Avg, peak, latest, and volatility per provider.">
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
                    iconSize="md"
                    className="max-w-[220px] text-sm font-semibold text-[var(--color-text-primary)]"
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

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <ChartCard title="Weekly Comparison (Bar)" subtitle="Weekly aggregation to reveal stage-by-stage usage shifts." delay={120}>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={weeklyData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border-subtle)" />
              <XAxis dataKey="week" stroke="var(--color-text-muted)" fontSize={11} />
              <YAxis stroke="var(--color-text-muted)" fontSize={11} />
              <Tooltip
                content={<CustomTooltip seriesMeta={seriesMeta} />}
                labelFormatter={(value) => formatWeekRangeLabel(String(value))}
              />
              <Legend content={<ProviderLegend seriesMeta={seriesMeta} />} />
              {seriesKeys.map((seriesKey, index) => (
                <Bar
                  key={seriesKey}
                  dataKey={seriesKey}
                  fill={getSeriesColor(seriesKey, index, seriesMeta)}
                  name={seriesKey}
                  radius={[4, 4, 0, 0]}
                  isAnimationActive={false}
                />
              ))}
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Share of Consumption (Donut)" subtitle="Average consumption share to identify dominant providers." delay={160}>
          <ResponsiveContainer width="100%" height={300}>
            <PieChart>
              <Pie
                data={distributionData}
                cx="50%"
                cy="50%"
                innerRadius={62}
                outerRadius={102}
                dataKey="value"
                nameKey="name"
                label={({ percent }) => `${((percent || 0) * 100).toFixed(0)}%`}
                labelLine={false}
                isAnimationActive={false}
              >
                {distributionData.map((entry, index) => (
                  <Cell key={entry.seriesKey} fill={getSeriesColor(entry.seriesKey, index, seriesMeta)} />
                ))}
              </Pie>
              <Tooltip content={<CustomTooltip seriesMeta={seriesMeta} />} />
              <Legend content={<ProviderLegend seriesMeta={seriesMeta} />} />
            </PieChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <ChartCard title="Intensity vs Volatility" subtitle="X = average usage, Y = volatility, bubble size = active days." delay={220}>
          <ResponsiveContainer width="100%" height={300}>
            <ScatterChart margin={{ top: 20, right: 20, bottom: 10, left: 10 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border-subtle)" />
              <XAxis type="number" dataKey="intensity" name="Average" stroke="var(--color-text-muted)" fontSize={11} domain={[0, 100]} tickFormatter={(value) => `${value}%`} />
              <YAxis type="number" dataKey="volatility" name="Volatility" stroke="var(--color-text-muted)" fontSize={11} domain={[0, 100]} tickFormatter={(value) => `${value}%`} />
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
              <Legend content={<ProviderLegend seriesMeta={seriesMeta} />} />
              {scatterData.map((point, index) => (
                <Scatter key={point.seriesKey} name={point.seriesKey} data={[point]} fill={getSeriesColor(point.seriesKey, index, seriesMeta)} shape="circle" />
              ))}
            </ScatterChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Usage vs Cost Burn" subtitle="Compare quota burn and cost burn for each provider." delay={260}>
          {costCompareData.length > 0 ? (
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={costCompareData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border-subtle)" />
                <XAxis
                  dataKey="name"
                  stroke="var(--color-text-muted)"
                  fontSize={11}
                  height={40}
                  tick={(props: any) => {
                    const value = String(props.payload?.value || '');
                    const seriesKey = costLabelToSeriesKey.get(value);
                    if (!seriesKey) {
                      return (
                        <g transform={`translate(${props.x},${props.y})`}>
                          <text x={0} y={0} dy={12} textAnchor="middle" fill="var(--color-text-muted)" fontSize={11}>
                            {value}
                          </text>
                        </g>
                      );
                    }

                    const provider = getSeriesProvider(seriesKey, seriesMeta);
                    const logo = provider ? providerLogos[provider] : undefined;
                    const label = getSeriesLabel(seriesKey, seriesMeta);
                    return (
                      <g transform={`translate(${props.x},${props.y})`}>
                        {logo ? (
                          <>
                            <rect
                              x={-36}
                              y={2}
                              width={12}
                              height={12}
                              rx={2}
                              style={{
                                fill: 'var(--provider-logo-bg)',
                                stroke: 'var(--provider-logo-border)',
                              }}
                            />
                            <image
                              href={logo}
                              x={-35}
                              y={3}
                              width={10}
                              height={10}
                              preserveAspectRatio="xMidYMid meet"
                            />
                          </>
                        ) : (
                          <rect x={-36} y={2} width={12} height={12} rx={2} fill="var(--color-bg-subtle)" />
                        )}
                        <text
                          x={-20}
                          y={8}
                          dy={4}
                          textAnchor="start"
                          fill="var(--color-text-muted)"
                          fontSize={11}
                        >
                          {label.length > 18 ? `${label.slice(0, 18)}...` : label}
                        </text>
                      </g>
                    );
                  }}
                />
                <YAxis stroke="var(--color-text-muted)" fontSize={11} domain={[0, 100]} tickFormatter={(value) => `${value}%`} />
                <Tooltip content={<CustomTooltip seriesMeta={seriesMeta} />} />
                <Legend wrapperStyle={{ fontSize: '11px' }} />
                <Bar dataKey="usage" fill="var(--color-accent)" name="Quota Burn" radius={[4, 4, 0, 0]} />
                <Bar dataKey="cost" fill="var(--color-warning)" name="Cost Burn" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-[300px] flex items-center justify-center text-sm text-[var(--color-text-muted)]">
              No cost fields found in current history; cost comparison is unavailable.
            </div>
          )}
        </ChartCard>
      </div>

      <ChartCard title="Provider Radar Matrix" subtitle="Compare multiple dimensions in one view (average/latest/peak/volatility/cost)." delay={300}>
        <ResponsiveContainer width="100%" height={340}>
          <RadarChart cx="50%" cy="50%" outerRadius="72%" data={radarData}>
            <PolarGrid stroke="var(--color-border-subtle)" />
            <PolarAngleAxis dataKey="dimension" stroke="var(--color-text-muted)" fontSize={11} />
            <PolarRadiusAxis angle={30} domain={[0, 100]} stroke="var(--color-text-muted)" fontSize={10} />
            {seriesKeys.map((seriesKey, index) => (
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
            <Legend content={<ProviderLegend seriesMeta={seriesMeta} />} />
            <Tooltip content={<CustomTooltip seriesMeta={seriesMeta} />} />
          </RadarChart>
        </ResponsiveContainer>
      </ChartCard>

      <ChartCard title="Provider Heatmap" subtitle="Rows: providers, columns: days, darker = higher usage." delay={340}>
        <div className="overflow-x-auto">
          <div className="min-w-[720px] space-y-2">
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
            {seriesKeys.map((seriesKey, index) => (
              <div key={seriesKey} className="grid items-center" style={{ gridTemplateColumns: `220px repeat(${heatmapDates.length}, minmax(18px, 1fr))` }}>
                <div className="text-xs font-medium text-[var(--color-text-secondary)] pr-3 truncate">
                  <ProviderBadge seriesKey={seriesKey} seriesMeta={seriesMeta} />
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
                      title={`${getSeriesLabel(seriesKey, seriesMeta)} ${formatDateOnly(parseDateTimeKey(date))}: ${value.toFixed(1)}%`}
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
      </ChartCard>
    </div>
  );
};
