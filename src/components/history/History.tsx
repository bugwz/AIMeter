import React, { useEffect, useMemo, useRef, useState } from 'react';
import { UsageChart } from './UsageChart';
import { MultiCharts, HistorySeriesMeta } from './MultiCharts';
import { apiService } from '../../services/ApiService';
import { UsageProvider, PROVIDER_NAMES } from '../../types';
import { providerLogos } from '../common/providerLogos';
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

type TimeRange = 7 | 14 | 30 | 60 | 90;
type BucketValue = 5 | 10 | 15 | 20 | 30 | 60 | 180;


const formatProviderDisplayName = (providerName: string, customName?: string | null): string => {
  const trimmed = customName?.trim();
  return trimmed ? `${providerName} - ${trimmed}` : providerName;
};

const renderProviderIcon = (provider?: UsageProvider, label?: string): React.ReactNode => {
  if (!provider) return null;
  const logo = providerLogos[provider];
  if (!logo) return null;
  return (
    <img
      src={logo}
      alt={label || provider}
      className="h-4 w-4 rounded bg-white p-[1px] object-contain"
    />
  );
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
  const logo = meta.provider ? providerLogos[meta.provider] : undefined;

  return (
    <span className={`inline-flex min-w-0 items-center gap-2 ${className || ''}`}>
      {logo ? (
        <img
          src={logo}
          alt={label}
          className="h-5 w-5 rounded bg-white p-[2px] object-contain"
        />
      ) : (
        <span className="inline-flex h-5 w-5 items-center justify-center rounded bg-[var(--color-bg-subtle)] text-[10px] font-semibold text-[var(--color-text-secondary)]">
          {(label || '?')[0]}
        </span>
      )}
      <span className="truncate">{label}</span>
    </span>
  );
};

const SkeletonLine: React.FC<{ className?: string }> = ({ className = '' }) => (
  <div className={`rounded skeleton-shimmer ${className}`} />
);

const getDefaultBucketByRange = (range: TimeRange): 5 | 10 | 15 | 20 | 30 => {
  if (range <= 7) return 5;
  if (range <= 14) return 10;
  if (range <= 30) return 15;
  if (range <= 60) return 20;
  return 30;
};

export const History: React.FC = () => {
  const [data, setData] = useState<Record<string, UsageRecord[]>>({});
  const [seriesMeta, setSeriesMeta] = useState<Record<string, HistorySeriesMeta>>({});
  const [loading, setLoading] = useState(true);
  const [filterLoading, setFilterLoading] = useState(false);
  const [selectedRange, setSelectedRange] = useState<TimeRange>(30);
  const [selectedSeries, setSelectedSeries] = useState<string>('');
  const [selectedBucket, setSelectedBucket] = useState<BucketValue>(15);
  const filterLoadingTimerRef = useRef<number | null>(null);

  useEffect(() => {
    if (selectedRange === 90 && selectedBucket < 20) {
      setSelectedBucket(20);
    }
  }, [selectedRange, selectedBucket]);

  useEffect(() => {
    setSelectedBucket(getDefaultBucketByRange(selectedRange));
  }, [selectedRange]);

  useEffect(() => {
    return () => {
      if (filterLoadingTimerRef.current !== null) {
        window.clearTimeout(filterLoadingTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    loadHistory();
  }, [selectedRange, selectedBucket]);

  const loadHistory = async () => {
    setLoading(true);
    try {
      const minBucket = selectedRange === 90 ? 20 : 5;
      const resolvedBucketMinutes = Math.max(selectedBucket, minBucket);
      const [history, providers] = await Promise.all([
        apiService.getUsageHistory(undefined, selectedRange, resolvedBucketMinutes),
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

        nextData[seriesKey] = records.map((record) => ({
          ...record,
          providerId: providerIdKey,
          provider: mapped?.provider,
          providerName: customName || undefined,
          providerDbId: mapped?.id,
          createdAt: new Date(record.createdAt),
        }));
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

  const rangeOptions = useMemo(
    () => [
      { value: 7 as TimeRange, label: 'Last 7 days' },
      { value: 14 as TimeRange, label: 'Last 14 days' },
      { value: 30 as TimeRange, label: 'Last 30 days' },
      { value: 60 as TimeRange, label: 'Last 60 days' },
      { value: 90 as TimeRange, label: 'Last 90 days' },
    ],
    [],
  );

  const bucketOptions = useMemo(
    () => {
      const minBucket = selectedRange === 90 ? 20 : 5;
      return [
        ...(minBucket <= 5 ? [{ value: 5 as BucketValue, label: '5 min' }] : []),
        ...(minBucket <= 10 ? [{ value: 10 as BucketValue, label: '10 min' }] : []),
        ...(minBucket <= 15 ? [{ value: 15 as BucketValue, label: '15 min' }] : []),
        { value: 20 as BucketValue, label: '20 min' },
        { value: 30 as BucketValue, label: '30 min' },
        { value: 60 as BucketValue, label: '60 min' },
        { value: 180 as BucketValue, label: '180 min' },
      ];
    },
    [selectedRange],
  );

  const providerOptions = useMemo(
    () => {
      return [
        { value: '', label: 'All Providers' },
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
            <label className="w-12 shrink-0 whitespace-nowrap text-xs text-[var(--color-text-tertiary)] md:w-auto">Range:</label>
            <div className="min-w-0 flex-1 md:w-36 md:shrink-0">
              <SelectField
                value={selectedRange}
                onChange={setSelectedRange}
                options={rangeOptions}
                className="input-field select-field text-sm w-full md:w-36"
              />
            </div>
          </div>

          <div className="flex w-full items-center gap-1 md:w-auto md:justify-end">
            <label className="w-12 shrink-0 whitespace-nowrap text-xs text-[var(--color-text-tertiary)] md:w-auto">Bucket:</label>
            <div className="min-w-0 flex-1 md:w-32 md:shrink-0">
              <SelectField
                value={selectedBucket}
                onChange={setSelectedBucket}
                options={bucketOptions}
                className="input-field select-field text-sm w-full md:w-32"
              />
            </div>
          </div>

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
              Usage Trend (Last {selectedRange} Days)
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
                <MultiCharts data={selectedSeriesKey ? filteredData : data} seriesMeta={seriesMeta} rangeDays={selectedRange} />
              )}
            </>
          )}
        </>
      )}
    </div>
  );
};
