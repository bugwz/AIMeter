import React from 'react';
import { QuotaBar } from './QuotaBar';
import { LoadingSpinner } from './LoadingSpinner';
import { UsageProvider, UsageSnapshot, UsageError, PROVIDER_NAMES } from '../../types';
import { providerLogos } from './providerLogos';

function coerceDate(value: Date | string | number | null | undefined): Date | null {
  if (!value) return null;
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }
  if (typeof value === 'number') {
    const timestampMs = value > 1_000_000_000_000 ? value : value * 1000;
    const parsed = new Date(timestampMs);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function formatDateTime(date: Date | string | number | null | undefined): string {
  const safeDate = coerceDate(date);
  if (!safeDate) return 'N/A';

  const dateValue = safeDate;
  const year = dateValue.getFullYear();
  const month = String(dateValue.getMonth() + 1).padStart(2, '0');
  const day = String(dateValue.getDate()).padStart(2, '0');
  const hours = String(dateValue.getHours()).padStart(2, '0');
  const minutes = String(dateValue.getMinutes()).padStart(2, '0');
  const seconds = String(dateValue.getSeconds()).padStart(2, '0');
  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
}

function formatPlanLabel(plan?: string): string {
  if (!plan) return '';

  const trimmedPlan = plan.trim();
  if (!trimmedPlan) return '';

  return trimmedPlan.charAt(0).toUpperCase() + trimmedPlan.slice(1);
}

function getUpdatedAtColor(updatedAt: Date | undefined, refreshIntervalMinutes: number): string {
  if (!updatedAt) return 'var(--color-text-secondary)';
  const ageMin = (Date.now() - updatedAt.getTime()) / 60000;
  if (ageMin >= refreshIntervalMinutes * 5) return '#dc2626';
  if (ageMin >= refreshIntervalMinutes) return '#d97706';
  return 'var(--color-text-secondary)';
}

interface ProviderCardProps {
  provider: UsageProvider;
  usage?: UsageSnapshot | UsageError;
  logoUrl?: string;
  onRemove?: () => void;
  onEdit?: () => void;
  onRefresh?: () => void;
  refreshLoading?: boolean;
  displayName?: string;
  delay?: number;
  dragHandleProps?: React.HTMLAttributes<HTMLButtonElement>;
  isDragging?: boolean;
  isDropTarget?: boolean;
  dropIndicator?: 'before' | 'after' | null;
  dragDisabled?: boolean;
  refreshInterval?: number;
  staleAt?: Date;
  authRequired?: boolean;
}

export const ProviderCard: React.FC<ProviderCardProps> = ({
  provider,
  usage,
  logoUrl,
  onRemove,
  onEdit,
  onRefresh,
  refreshLoading = false,
  displayName,
  delay = 0,
  dragHandleProps,
  isDragging = false,
  isDropTarget = false,
  dropIndicator = null,
  dragDisabled = false,
  refreshInterval = 5,
  staleAt,
  authRequired,
}) => {
  const isError = usage && 'code' in usage;
  const error = isError ? (usage as UsageError) : undefined;
  const snapshot = !isError ? (usage as UsageSnapshot) : undefined;
  const isLoading = !usage;
  
  const progressItems = snapshot?.progress || [];
  
  const displayProviderName = displayName
    ? `${PROVIDER_NAMES[provider]} - ${displayName}`
    : PROVIDER_NAMES[provider];

  const identity = snapshot?.identity;
  const planLabel = formatPlanLabel(identity?.plan);
  const updatedAt = snapshot?.updatedAt instanceof Date ? snapshot.updatedAt : undefined;
  const updatedAtText = formatDateTime(snapshot?.updatedAt);
  const updatedAtColor = getUpdatedAtColor(updatedAt, refreshInterval);
  const updatedAtTitle = staleAt ? `Data as of ${formatDateTime(staleAt)}` : undefined;
  const logoStatusColor = snapshot ? '#10b981' : isLoading ? '#f59e0b' : '#ef4444';
  const logoNode = (
    <>
      {providerLogos[provider] ? (
        <img
          src={providerLogos[provider]}
          alt={PROVIDER_NAMES[provider]}
          className="w-8 h-8"
        />
      ) : (
        <span className="text-gray-800 font-semibold text-lg">
          {PROVIDER_NAMES[provider]?.[0] || '?'}
        </span>
      )}
      <div
        className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-gray-200"
        style={{ background: logoStatusColor }}
      />
    </>
  );

  return (
    <div 
      className={`group provider-card relative flex h-full flex-col bg-[var(--color-surface)] rounded-xl p-5 gradient-border animate-fade-in transition-[transform,box-shadow,opacity,filter] duration-200 ease-out ${
        isDragging ? '' : 'card-hover'
      }`}
      style={{ 
        animationDelay: `${delay}ms`,
        boxShadow: isDropTarget
          ? '0 0 0 2px rgba(59, 130, 246, 0.38), 0 18px 46px rgba(59, 130, 246, 0.14), var(--shadow-card)'
          : isDragging
            ? '0 28px 60px rgba(0, 0, 0, 0.34), 0 0 0 1px rgba(255,255,255,0.06), 0 0 0 2px rgba(59,130,246,0.22)'
            : undefined,
        opacity: isDragging ? 0.94 : 1,
        transform: isDragging ? 'scale(1.03) rotate(0.6deg)' : undefined,
        filter: isDragging ? 'saturate(1.08) brightness(1.02)' : 'none',
        willChange: isDragging ? 'transform, box-shadow, filter' : 'auto',
      }}
      data-reorder-item="true"
    >
      {isDragging && (
        <div className="pointer-events-none absolute inset-x-5 top-3 z-20 flex justify-center">
          <div className="inline-flex items-center gap-1.5 rounded-full border border-blue-400/25 bg-blue-400/12 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-blue-200 shadow-[0_10px_24px_rgba(59,130,246,0.14)]">
            <span className="block h-1.5 w-1.5 rounded-full bg-blue-300" />
            Dragging
          </div>
        </div>
      )}
      {dropIndicator && (
        <div
          className={`pointer-events-none absolute left-4 right-4 z-20 ${dropIndicator === 'before' ? 'top-0 -translate-y-1/2' : 'bottom-0 translate-y-1/2'}`}
        >
          <div className="relative">
            <div className="h-[4px] rounded-full bg-blue-400 shadow-[0_0_0_1px_rgba(59,130,246,0.25),0_0_18px_rgba(59,130,246,0.35)]" />
            <div className="absolute top-1/2 h-2.5 w-2.5 -translate-y-1/2 rounded-full bg-blue-300 shadow-[0_0_0_2px_rgba(13,17,22,0.75)]" />
            <div className="absolute right-0 top-1/2 h-2.5 w-2.5 -translate-y-1/2 rounded-full bg-blue-300 shadow-[0_0_0_2px_rgba(13,17,22,0.75)]" />
          </div>
        </div>
      )}
      
      <div className="mb-4 flex flex-wrap items-start gap-3">
        <div className="flex min-w-0 flex-1 items-center gap-3">
          {logoUrl ? (
            <a
              href={logoUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="relative w-12 h-12 rounded-xl flex items-center justify-center bg-white transition-transform duration-200 hover:scale-[1.03] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-text-primary)]"
              style={{
                boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
              }}
              title={`Open ${PROVIDER_NAMES[provider]} website`}
              aria-label={`Open ${PROVIDER_NAMES[provider]} website`}
            >
              {logoNode}
            </a>
          ) : (
            <div
              className="relative w-12 h-12 rounded-xl flex items-center justify-center bg-white"
              style={{
                boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
              }}
            >
              {logoNode}
            </div>
          )}
          <div className="min-w-0">
            <h3
              className="truncate font-semibold text-[15px] text-[var(--color-text-primary)]"
              title={displayProviderName}
            >
              {displayProviderName}
            </h3>
              <div className="flex items-center gap-1 mt-0.5 h-[18px]">
                <span
                  className="text-xs max-w-[220px] truncate text-[var(--color-text-tertiary)]"
                  title={planLabel || 'N/A'}
                >
                  {planLabel || 'N/A'}
                </span>
              </div>
          </div>
        </div>
        
        <div className="ml-auto flex shrink-0 items-center gap-1 self-start">
          {!dragDisabled && dragHandleProps && (
            <button
              type="button"
              {...dragHandleProps}
              className={`opacity-0 group-hover:opacity-100 w-7 h-7 flex items-center justify-center rounded-lg transition-all duration-200 touch-none ${
                isDragging
                  ? 'bg-blue-400/16 text-blue-200 shadow-[0_8px_18px_rgba(59,130,246,0.18)] ring-1 ring-blue-400/35 cursor-grabbing opacity-100 scale-110'
                  : 'text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-bg-subtle)] active:bg-[var(--color-bg-subtle)] active:text-[var(--color-text-primary)] cursor-grab'
              }`}
              aria-label="Reorder provider"
              title="Drag to reorder"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <circle cx="5" cy="5" r="1.8" />
                <circle cx="12" cy="5" r="1.8" />
                <circle cx="19" cy="5" r="1.8" />
                <circle cx="5" cy="12" r="1.8" />
                <circle cx="12" cy="12" r="1.8" />
                <circle cx="19" cy="12" r="1.8" />
                <circle cx="5" cy="19" r="1.8" />
                <circle cx="12" cy="19" r="1.8" />
                <circle cx="19" cy="19" r="1.8" />
              </svg>
            </button>
          )}
          {onEdit && (
            <button
              onClick={onEdit}
              className="opacity-0 group-hover:opacity-100 w-7 h-7 flex items-center justify-center rounded-lg text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-bg-subtle)] transition-all duration-200"
              aria-label="Edit provider"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M17 3a2.85 2.85 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/>
              </svg>
            </button>
          )}
          {onRemove && (
            <button
              onClick={onRemove}
              className="opacity-0 group-hover:opacity-100 w-7 h-7 flex items-center justify-center rounded-lg text-[var(--color-text-muted)] hover:text-[var(--color-error)] hover:bg-[var(--color-error-subtle)] transition-all duration-200"
              aria-label="Remove provider"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M18 6 6 18M6 6l12 12"/>
              </svg>
            </button>
          )}
        </div>
      </div>
      
      {isLoading ? (
        <div className="flex-1 flex items-center gap-2 py-4">
          <LoadingSpinner size="sm" />
          <span className="text-sm text-[var(--color-text-tertiary)]">Loading usage data...</span>
        </div>
      ) : error ? (
        <div 
          className="flex-1 flex items-start gap-2 p-3 rounded-lg text-sm"
          style={{ background: 'var(--color-error-subtle)', color: '#dc2626' }}
        >
          <svg className="w-4 h-4 mt-0.5 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10"/>
            <path d="M12 8v4M12 16h.01"/>
          </svg>
          <span>{error.message}</span>
        </div>
      ) : snapshot ? (
        <React.Fragment>
          {authRequired && (
            <div
              className="mb-3 flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-medium"
              style={{ background: 'rgba(239, 68, 68, 0.1)', color: '#dc2626' }}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="flex-shrink-0">
                <circle cx="12" cy="12" r="10"/>
                <path d="M12 8v4M12 16h.01"/>
              </svg>
              <span>Re-authentication required</span>
            </div>
          )}
          <div className="flex-1 flex flex-col min-h-0">
            <div className="flex flex-col gap-4">
              {progressItems.map((item, index) => (
                <QuotaBar
                  key={item.name || index}
                  percent={item.usedPercent}
                  label={item.name}
                  labelDesc={item.desc}
                  resetsAt={item.resetsAt}
                  used={item.used}
                  limit={item.limit}
                />
              ))}

              {snapshot.cost && (
                <div className="pt-4 border-t border-[var(--color-border-subtle)]">
                  <div className="flex justify-between items-center mb-2">
                    {provider === UsageProvider.OPENROUTER ? (
                      <div className="flex items-center gap-2">
                        <div className="w-5 h-5 rounded-md bg-emerald-500/10 flex items-center justify-center text-emerald-500">
                          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                            <line x1="12" x2="12" y1="2" y2="22"/>
                            <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>
                          </svg>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2">
                        <div className="w-5 h-5 rounded-md bg-emerald-500/10 flex items-center justify-center text-emerald-500">
                          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                            <line x1="12" x2="12" y1="2" y2="22"/>
                            <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>
                          </svg>
                        </div>
                        <span className="text-xs font-medium text-[var(--color-text-secondary)] tracking-wide">
                          Extra Usage / Cost
                        </span>
                      </div>
                    )}
                    <span className="text-xs font-semibold text-[var(--color-text-primary)]">
                      {snapshot.cost.currency === 'USD' ? '$' : snapshot.cost.currency}
                      {snapshot.cost.used}/{snapshot.cost.limit}
                    </span>
                  </div>
                  <QuotaBar 
                    percent={snapshot.cost.used / snapshot.cost.limit * 100} 
                    showPercent={false} 
                    color="danger" 
                  />
                </div>
              )}
            </div>

          </div>
        </React.Fragment>
      ) : null}

      <div className="mt-auto flex items-center justify-end gap-1 pt-3">
        {onRefresh && (
          <button
            type="button"
            onClick={onRefresh}
            disabled={refreshLoading}
            className="opacity-0 group-hover:opacity-100 w-6 h-6 flex items-center justify-center rounded-md text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-bg-subtle)] transition-all duration-200 disabled:opacity-60 disabled:cursor-not-allowed"
            aria-label="Refresh provider"
            title="Refresh provider"
          >
            <svg
              width="12"
              height="12"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className={refreshLoading ? 'animate-spin' : ''}
            >
              <path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8" />
              <path d="M21 3v5h-5" />
            </svg>
          </button>
        )}
        <span
          className="text-[10px]"
          style={{ color: updatedAtColor }}
          title={updatedAtTitle}
        >
          Updated at {updatedAtText}
        </span>
      </div>
    </div>
  );
};
