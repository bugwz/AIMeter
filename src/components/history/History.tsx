import React, { useEffect, useMemo, useRef, useState } from 'react';
import { UsageChart } from './UsageChart';
import { MultiCharts, HistorySeriesMeta } from './MultiCharts';
import { apiService } from '../../services/ApiService';
import { UsageProvider, PROVIDER_NAMES } from '../../types';
import { ProviderLogo } from '../common/ProviderLogo';
import { SelectField } from '../common';
import { buildProviderSeriesColorMap } from './colorSystem';

interface UsageRecord {
  id: number;
  providerId: string;
  provider?: UsageProvider;
  providerName?: string;
  providerDbId?: string;
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

type IntervalMinutes = 5 | 10 | 15 | 20 | 30 | 60 | 180;
type IntervalValue = 'auto' | IntervalMinutes;
type PresetRangeValue = '5h' | '12h' | '1d' | '2d' | '1w' | '2w' | '1m' | '2m' | '3m';
const DAY_MS = 24 * 60 * 60 * 1000;


const formatProviderDisplayName = (providerName: string, customName?: string | null): string => {
  const trimmed = customName?.trim();
  return trimmed ? `${providerName} - ${trimmed}` : providerName;
};

const renderProviderIcon = (provider?: UsageProvider, label?: string): React.ReactNode => {
  if (!provider) return null;
  return <ProviderLogo provider={provider} size={16} alt={label || provider} className="rounded" imgClassName="rounded" frame="none" />;
};

const ProviderDisplay: React.FC<{
  seriesKey?: string;
  seriesMeta: Record<string, HistorySeriesMeta>;
  className?: string;
}> = ({ seriesKey, seriesMeta, className }) => {
  if (!seriesKey || !seriesMeta[seriesKey]) {
    return <span className={className}>--</span>;
  }

  const meta = seriesMeta[seriesKey];
  const label = meta.displayName || seriesKey;

  return (
    <span className={`inline-flex max-w-full min-w-0 items-center gap-2 ${className || ''}`}>
      {meta.provider ? (
        <span className="shrink-0">
          <ProviderLogo provider={meta.provider} size={20} alt={label} />
        </span>
      ) : (
        <span className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded bg-[var(--color-bg-subtle)] text-[10px] font-semibold text-[var(--color-text-secondary)]">
          {(label || '?')[0]}
        </span>
      )}
      <span className="min-w-0 flex-1 truncate">{label}</span>
    </span>
  );
};

const SkeletonLine: React.FC<{ className?: string }> = ({ className = '' }) => (
  <div className={`rounded skeleton-shimmer ${className}`} />
);

const PRESET_RANGE_MS: Record<PresetRangeValue, number> = {
  '5h': 5 * 60 * 60 * 1000,
  '12h': 12 * 60 * 60 * 1000,
  '1d': 1 * DAY_MS,
  '2d': 2 * DAY_MS,
  '1w': 7 * DAY_MS,
  '2w': 14 * DAY_MS,
  '1m': 30 * DAY_MS,
  '2m': 60 * DAY_MS,
  '3m': 90 * DAY_MS,
};
const PRESET_RANGE_LABEL: Record<PresetRangeValue, string> = {
  '5h': 'Last 5 hours',
  '12h': 'Last 12 hours',
  '1d': 'Last 1 day',
  '2d': 'Last 2 days',
  '1w': 'Last 1 week',
  '2w': 'Last 2 weeks',
  '1m': 'Last 1 month',
  '2m': 'Last 2 months',
  '3m': 'Last 3 months',
};
const PRESET_RANGE_DAYS: Partial<Record<PresetRangeValue, number>> = {
  '1d': 1,
  '2d': 2,
  '1w': 7,
  '2w': 14,
  '1m': 30,
  '2m': 60,
  '3m': 90,
};

const getStartOfDayMs = (timestampMs: number): number => {
  const date = new Date(timestampMs);
  date.setHours(0, 0, 0, 0);
  return date.getTime();
};

const resolveRangeStartMs = (preset: PresetRangeValue, endMs: number): number => {
  const daySpan = PRESET_RANGE_DAYS[preset];
  if (daySpan && daySpan > 0) {
    const startDay = new Date(endMs);
    startDay.setHours(0, 0, 0, 0);
    startDay.setDate(startDay.getDate() - (daySpan - 1));
    return startDay.getTime();
  }
  return endMs - PRESET_RANGE_MS[preset];
};

const getRangeDays = (startMs: number, endMs: number): number => {
  const startDayMs = getStartOfDayMs(startMs);
  const endDayMs = getStartOfDayMs(endMs);
  const diffMs = Math.max(endDayMs - startDayMs, 0);
  return Math.max(1, Math.floor(diffMs / DAY_MS) + 1);
};

const getMinIntervalByDays = (days: number): number => {
  return days >= 90 ? 20 : 5;
};

const formatIntervalLabel = (minutes: number): string => {
  if (minutes % 60 === 0) {
    return `${minutes / 60}h`;
  }
  return `${minutes}m`;
};

export const History: React.FC = () => {
  const [data, setData] = useState<Record<string, UsageRecord[]>>({});
  const [seriesMeta, setSeriesMeta] = useState<Record<string, HistorySeriesMeta>>({});
  const [loading, setLoading] = useState(true);
  const [filterLoading, setFilterLoading] = useState(false);
  const [selectedRange, setSelectedRange] = useState<PresetRangeValue>('1d');
  const [selectedSeries, setSelectedSeries] = useState<string>('');
  const [selectedInterval, setSelectedInterval] = useState<IntervalValue>('auto');
  const [resolvedUsageIntervalMinutes, setResolvedUsageIntervalMinutes] = useState<number | null>(null);
  const filterLoadingTimerRef = useRef<number | null>(null);
  const rangeEndMs = useMemo(() => Date.now(), [selectedRange, loading]);
  const rangeStartMs = useMemo(() => resolveRangeStartMs(selectedRange, rangeEndMs), [selectedRange, rangeEndMs]);
  const rangeDays = useMemo(() => getRangeDays(rangeStartMs, rangeEndMs), [rangeStartMs, rangeEndMs]);

  useEffect(() => {
    const minInterval = getMinIntervalByDays(rangeDays);
    if (selectedInterval !== 'auto' && selectedInterval < minInterval) {
      setSelectedInterval(minInterval as IntervalMinutes);
    }
  }, [rangeDays, selectedInterval]);

  useEffect(() => {
    return () => {
      if (filterLoadingTimerRef.current !== null) {
        window.clearTimeout(filterLoadingTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    loadHistory();
  }, [selectedRange, selectedInterval]);

  const loadHistory = async () => {
    setLoading(true);
    try {
      const minInterval = getMinIntervalByDays(rangeDays);
      const resolvedIntervalMinutes = selectedInterval === 'auto'
        ? undefined
        : Math.max(selectedInterval, minInterval);
      const [history, providers] = await Promise.all([
        apiService.getUsageHistory(undefined, rangeDays, resolvedIntervalMinutes),
        apiService.getProviders(),
      ]);

      const providerById = new Map<string, { id: string; provider: UsageProvider; name: string | null; defaultProgressItem?: string | null }>();
      providers.forEach((provider) => {
        providerById.set(String(provider.id), {
          id: provider.id,
          provider: provider.provider,
          name: provider.name,
          defaultProgressItem: provider.defaultProgressItem,
        });
      });

      const nextData: Record<string, UsageRecord[]> = {};
      const nextMeta: Record<string, HistorySeriesMeta> = {};
      Object.entries(history).forEach(([providerIdKey, records]) => {
        const mapped = providerById.get(providerIdKey);
        const baseProviderName = mapped ? (PROVIDER_NAMES[mapped.provider] || mapped.provider) : `Provider #${providerIdKey}`;
        const customName = mapped?.name?.trim();
        const displayName = formatProviderDisplayName(baseProviderName, customName);
        const seriesKey = mapped ? `${mapped.provider}:${providerIdKey}` : `unknown:${providerIdKey}`;

        nextMeta[seriesKey] = {
          provider: mapped?.provider,
          name: customName || undefined,
          displayName,
          providerId: mapped?.id,
          defaultProgressItem: mapped?.defaultProgressItem || undefined,
        };

        nextData[seriesKey] = records
          .map((record) => ({
            ...record,
            providerId: providerIdKey,
            provider: mapped?.provider,
            providerName: customName || undefined,
            providerDbId: mapped?.id,
            createdAt: new Date(record.createdAt),
          }))
          .filter((record) => {
            const timestamp = record.createdAt.getTime();
            return timestamp >= rangeStartMs && timestamp <= rangeEndMs;
          });
      });

      const colorMap = buildProviderSeriesColorMap(
        Object.keys(nextMeta).map((seriesKey) => ({
          seriesKey,
          provider: nextMeta[seriesKey].provider,
          name: nextMeta[seriesKey].name,
        })),
      );
      Object.keys(nextMeta).forEach((seriesKey) => {
        nextMeta[seriesKey].color = colorMap[seriesKey];
      });

      setData(nextData);
      setSeriesMeta(nextMeta);
      setSelectedSeries((prev) => {
        if (prev === '') return '';
        if (prev && nextData[prev]) return prev;
        return '';
      });
    } catch (error) {
      console.error('Failed to load history:', error);
    } finally {
      setLoading(false);
    }
  };

  const seriesList = useMemo(
    () =>
      Object.keys(data).sort((a, b) =>
        (seriesMeta[a]?.displayName || a).localeCompare(seriesMeta[b]?.displayName || b, undefined, {
          sensitivity: 'base',
        }),
      ),
    [data, seriesMeta],
  );
  const selectedSeriesKey = useMemo(() => {
    if (!selectedSeries) return '';
    if (data[selectedSeries]) return selectedSeries;
    return '';
  }, [selectedSeries, seriesList, data]);
  const filteredData = selectedSeriesKey ? { [selectedSeriesKey]: data[selectedSeriesKey] } : data;
  const hasData = seriesList.length > 0 && Object.values(data).some((records) => records.length > 0);
  const isPanelsLoading = loading || filterLoading;
  const showLoadingLayout = isPanelsLoading;

  const handleSeriesChange = (value: string) => {
    setSelectedSeries(value);
    setFilterLoading(true);
    if (filterLoadingTimerRef.current !== null) {
      window.clearTimeout(filterLoadingTimerRef.current);
    }
    filterLoadingTimerRef.current = window.setTimeout(() => {
      setFilterLoading(false);
      filterLoadingTimerRef.current = null;
    }, 220);
  };

  const getPrimaryUsedPercent = (record: UsageRecord, seriesKey?: string): number => {
    const items = record.progress?.items || [];
    const defItem = seriesKey ? seriesMeta[seriesKey]?.defaultProgressItem : undefined;
    let primary: typeof items[0] | undefined;
    if (defItem) {
      primary = items.find((i) => String(i.name).toLowerCase() === defItem.toLowerCase());
    }
    primary ??= items.find((i) => String(i.name).toLowerCase() === 'primary') ?? items[0];
    return primary?.usedPercent || 0;
  };

  const getSeriesLabel = (seriesKey?: string): string => {
    if (!seriesKey) return '--';
    return seriesMeta[seriesKey]?.displayName || seriesKey;
  };

  const intervalOptions = useMemo(
    () => {
      const minInterval = getMinIntervalByDays(rangeDays);
      return [
        { value: 'auto' as const, label: 'Auto' },
        ...(minInterval <= 5 ? [{ value: 5 as IntervalMinutes, label: '5m' }] : []),
        ...(minInterval <= 10 ? [{ value: 10 as IntervalMinutes, label: '10m' }] : []),
        ...(minInterval <= 15 ? [{ value: 15 as IntervalMinutes, label: '15m' }] : []),
        { value: 20 as IntervalMinutes, label: '20m' },
        { value: 30 as IntervalMinutes, label: '30m' },
        { value: 60 as IntervalMinutes, label: '1h' },
        { value: 180 as IntervalMinutes, label: '3h' },
      ];
    },
    [rangeDays],
  );

  const rangeOptions = useMemo(
    () => ([
      { value: '5h' as PresetRangeValue, label: PRESET_RANGE_LABEL['5h'] },
      { value: '12h' as PresetRangeValue, label: PRESET_RANGE_LABEL['12h'] },
      { value: '1d' as PresetRangeValue, label: PRESET_RANGE_LABEL['1d'] },
      { value: '2d' as PresetRangeValue, label: PRESET_RANGE_LABEL['2d'] },
      { value: '1w' as PresetRangeValue, label: PRESET_RANGE_LABEL['1w'] },
      { value: '2w' as PresetRangeValue, label: PRESET_RANGE_LABEL['2w'] },
      { value: '1m' as PresetRangeValue, label: PRESET_RANGE_LABEL['1m'] },
      { value: '2m' as PresetRangeValue, label: PRESET_RANGE_LABEL['2m'] },
      { value: '3m' as PresetRangeValue, label: PRESET_RANGE_LABEL['3m'] },
    ]),
    [],
  );

  const intervalSummaryLabel = useMemo(() => {
    if (selectedInterval === 'auto') {
      return resolvedUsageIntervalMinutes ? `Auto ${formatIntervalLabel(resolvedUsageIntervalMinutes)}` : 'Auto';
    }
    const minInterval = getMinIntervalByDays(rangeDays);
    return formatIntervalLabel(Math.max(selectedInterval, minInterval));
  }, [selectedInterval, rangeDays, resolvedUsageIntervalMinutes]);

  const providerOptions = useMemo(
    () => {
      return [
        {
          value: '',
          label: 'All Providers',
          icon: <img src="/img/logo-light.svg" alt="AIMeter" className="h-4 w-4" />,
        },
        ...seriesList.map((seriesKey) => ({
          value: seriesKey,
          label: getSeriesLabel(seriesKey),
          icon: renderProviderIcon(seriesMeta[seriesKey]?.provider, getSeriesLabel(seriesKey)),
        })),
      ];
    },
    [seriesList, seriesMeta],
  );

  const overviewStats = useMemo(() => {
    const activeSeries = Object.entries(filteredData).filter(([, records]) => records && records.length > 0);
    const snapshots = activeSeries.flatMap(([seriesKey, records]) => (records || []).map((r) => ({ record: r, seriesKey })));
    const avgUsage = snapshots.length > 0
      ? snapshots.reduce((sum, { record, seriesKey }) => sum + getPrimaryUsedPercent(record, seriesKey), 0) / snapshots.length
      : 0;

    const volatilityBySeries = activeSeries.map(([seriesKey, records]) => {
      const values = records.map((r) => getPrimaryUsedPercent(r, seriesKey));
      if (values.length <= 1) return { seriesKey, value: 0 };
      const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
      const variance = values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length;
      return { seriesKey, value: Math.sqrt(variance) };
    });

    const highestPeak = activeSeries
      .map(([seriesKey, records]) => ({
        seriesKey,
        value: Math.max(...records.map((r) => getPrimaryUsedPercent(r, seriesKey)), 0),
      }))
      .sort((a, b) => b.value - a.value)[0];

    const hottest = activeSeries
      .map(([seriesKey, records]) => ({
        seriesKey,
        value: getPrimaryUsedPercent(records[records.length - 1], seriesKey),
      }))
      .sort((a, b) => b.value - a.value)[0];

    const avgVolatility = volatilityBySeries.length > 0
      ? volatilityBySeries.reduce((sum, item) => sum + item.value, 0) / volatilityBySeries.length
      : 0;

    return {
      providerCount: activeSeries.length,
      snapshotCount: snapshots.length,
      avgUsage,
      avgVolatility,
      highestPeak,
      hottest,
    };
  }, [filteredData, seriesMeta]);

  return (
    <div className="p-4 sm:p-8 max-w-7xl mx-auto">
      <div className="mb-8 animate-fade-in flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-[var(--color-text-primary)] tracking-tight">
            Usage History
          </h1>
          <p className="text-sm text-[var(--color-text-tertiary)] mt-1">
            View historical usage data for your AI providers
          </p>
        </div>

        <div className="flex w-full flex-col items-stretch gap-1 md:flex-row md:flex-wrap md:items-center md:justify-end md:gap-1.5 lg:w-[56rem]">
          <div className="flex w-full items-center gap-1 md:w-auto md:justify-end">
            <label className="w-12 shrink-0 whitespace-nowrap text-xs text-[var(--color-text-tertiary)] md:w-auto">Provider:</label>
            <div className="min-w-0 flex-1 md:w-[14.5rem] md:shrink-0">
              <SelectField
                value={selectedSeriesKey}
                onChange={handleSeriesChange}
                options={providerOptions}
                className="input-field select-field text-sm w-full"
                showTriggerIcon={false}
              />
            </div>
          </div>

          <div className="flex w-full items-center gap-1 md:w-auto md:justify-end">
            <label className="w-12 shrink-0 whitespace-nowrap text-xs text-[var(--color-text-tertiary)] md:w-auto">Range:</label>
            <div className="min-w-0 flex-1 md:w-[9.5rem] md:shrink-0">
              <SelectField
                value={selectedRange}
                onChange={setSelectedRange}
                options={rangeOptions}
                className="input-field select-field text-sm w-full md:w-[9.5rem]"
              />
            </div>
          </div>

          <div className="flex w-full items-center gap-1 md:w-auto md:justify-end">
            <label className="w-12 shrink-0 whitespace-nowrap text-xs text-[var(--color-text-tertiary)] md:w-auto">Interval:</label>
            <div className="min-w-0 flex-1 md:w-24 md:shrink-0">
              <SelectField
                value={selectedInterval}
                onChange={setSelectedInterval}
                options={intervalOptions}
                className="input-field select-field text-sm w-full md:w-24"
              />
            </div>
          </div>
        </div>
      </div>

      {(hasData || showLoadingLayout) && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6 animate-fade-in">
          {showLoadingLayout ? (
            Array.from({ length: 4 }).map((_, index) => (
              <div key={`stats-skeleton-${index}`} className="p-4 bg-[var(--color-surface)] rounded-xl gradient-border skeleton-panel" style={{ boxShadow: 'var(--shadow-card)' }}>
                <SkeletonLine className="h-3 w-24" />
                <SkeletonLine className="h-8 w-16 mt-2" />
                <SkeletonLine className="h-3 w-28 mt-2" />
              </div>
            ))
          ) : (
            <>
              <div className="p-4 bg-[var(--color-surface)] rounded-xl gradient-border" style={{ boxShadow: 'var(--shadow-card)' }}>
                <p className="text-xs text-[var(--color-text-muted)]">Providers in View</p>
                <p className="text-2xl font-semibold text-[var(--color-text-primary)] mt-1">{overviewStats.providerCount}</p>
                <p className="text-xs text-[var(--color-text-muted)] mt-1">{overviewStats.snapshotCount} snapshots</p>
              </div>
              <div className="p-4 bg-[var(--color-surface)] rounded-xl gradient-border" style={{ boxShadow: 'var(--shadow-card)' }}>
                <p className="text-xs text-[var(--color-text-muted)]">Average Consumption</p>
                <p className="text-2xl font-semibold text-[var(--color-text-primary)] mt-1">{overviewStats.avgUsage.toFixed(1)}%</p>
                <p className="text-xs text-[var(--color-text-muted)] mt-1">Across selected range</p>
              </div>
              <div className="p-4 bg-[var(--color-surface)] rounded-xl gradient-border" style={{ boxShadow: 'var(--shadow-card)' }}>
                <p className="text-xs text-[var(--color-text-muted)]">Peak Provider</p>
                <div className="text-lg font-semibold text-[var(--color-text-primary)] mt-1 min-w-0">
                  <ProviderDisplay seriesKey={overviewStats.highestPeak?.seriesKey} seriesMeta={seriesMeta} className="truncate" />
                </div>
                <p className="text-xs text-[var(--color-text-muted)] mt-1">
                  {overviewStats.highestPeak ? `${overviewStats.highestPeak.value.toFixed(1)}% peak` : 'No data'}
                </p>
              </div>
              <div className="p-4 bg-[var(--color-surface)] rounded-xl gradient-border" style={{ boxShadow: 'var(--shadow-card)' }}>
                <p className="text-xs text-[var(--color-text-muted)]">Current Pressure</p>
                <div className="text-lg font-semibold text-[var(--color-text-primary)] mt-1 min-w-0">
                  <ProviderDisplay seriesKey={overviewStats.hottest?.seriesKey} seriesMeta={seriesMeta} className="truncate" />
                </div>
                <p className="text-xs text-[var(--color-text-muted)] mt-1">
                  Volatility {overviewStats.avgVolatility.toFixed(1)}%
                </p>
              </div>
            </>
          )}
        </div>
      )}

      {!isPanelsLoading && !hasData ? (
        <div className="bg-[var(--color-surface)] rounded-xl p-6 gradient-border animate-fade-in" style={{ boxShadow: 'var(--shadow-card)' }}>
          <div className="flex flex-col items-center justify-center h-64 text-[var(--color-text-muted)]">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="mb-4">
              <path d="M3 3v18h18" />
              <path d="M18 9l-5 5-4-4-3 3" />
            </svg>
            <p className="text-lg font-medium">No historical data</p>
            <p className="text-sm mt-1">
              Usage data will appear here after your providers are refreshed.
            </p>
          </div>
        </div>
      ) : (
        <>
          <div className="bg-[var(--color-surface)] rounded-xl p-6 gradient-border animate-fade-in" style={{ boxShadow: 'var(--shadow-card)' }}>
            <h3 className="text-sm font-semibold text-[var(--color-text-primary)] mb-4 flex items-center gap-2">
              <span className="w-1 h-4 rounded-full bg-[var(--color-accent)]"></span>
              Usage Trend ({PRESET_RANGE_LABEL[selectedRange]} · Interval {intervalSummaryLabel})
            </h3>
            {isPanelsLoading ? (
              <div className="h-64 space-y-4 animate-fade-in skeleton-panel rounded-lg p-2">
                <SkeletonLine className="h-4 w-40" />
                <SkeletonLine className="h-48 w-full" />
                <div className="flex flex-wrap gap-3">
                  <SkeletonLine className="h-3 w-28" />
                  <SkeletonLine className="h-3 w-24" />
                  <SkeletonLine className="h-3 w-32" />
                </div>
              </div>
            ) : (
              <UsageChart
                data={filteredData}
                selectedSeries={selectedSeriesKey || undefined}
                seriesMeta={seriesMeta}
                mode={selectedSeriesKey ? 'providerProgress' : 'providerSeries'}
                rangeDays={rangeDays}
                rangeStartMs={rangeStartMs}
                rangeEndMs={rangeEndMs}
                intervalMinutes={selectedInterval}
                onResolvedIntervalChange={setResolvedUsageIntervalMinutes}
              />
            )}
          </div>

          {(hasData || showLoadingLayout) && (
            <>
              {showLoadingLayout ? (
                <>
                  <div className="space-y-6 mt-6">
                    <div className="bg-[var(--color-surface)] rounded-xl p-5 gradient-border animate-fade-in skeleton-panel" style={{ boxShadow: 'var(--shadow-card)' }}>
                      <SkeletonLine className="h-4 w-52 mb-4" />
                      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                        {Array.from({ length: 6 }).map((_, index) => (
                          <div key={`multi-skeleton-card-${index}`} className="p-4 rounded-xl bg-[var(--color-bg-subtle)] border border-[var(--color-border-subtle)]">
                            <SkeletonLine className="h-4 w-36 mb-3" />
                            <SkeletonLine className="h-20 w-full" />
                          </div>
                        ))}
                      </div>
                    </div>
                    <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
                      {Array.from({ length: 4 }).map((_, index) => (
                        <div key={`multi-skeleton-chart-${index}`} className="bg-[var(--color-surface)] rounded-xl p-5 gradient-border animate-fade-in skeleton-panel" style={{ boxShadow: 'var(--shadow-card)' }}>
                          <SkeletonLine className="h-4 w-48 mb-4" />
                          <SkeletonLine className="h-64 w-full" />
                        </div>
                      ))}
                    </div>
                  </div>
                </>
              ) : (
                <MultiCharts
                  data={selectedSeriesKey ? filteredData : data}
                  seriesMeta={seriesMeta}
                  rangeStartMs={rangeStartMs}
                  rangeEndMs={rangeEndMs}
                  selectedSeriesKey={selectedSeriesKey || undefined}
                />
              )}
            </>
          )}
        </>
      )}
    </div>
  );
};
