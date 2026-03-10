import React from 'react';

interface QuotaBarProps {
  className?: string;
  percent: number;
  label?: string;
  labelDesc?: string;
  resetsAt?: Date;
  showPercent?: boolean;
  size?: 'sm' | 'md' | 'lg';
  color?: 'default' | 'warning' | 'danger';
  used?: number;
  limit?: number;
}

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

export const QuotaBar: React.FC<QuotaBarProps> = ({
  className,
  percent,
  label,
  labelDesc,
  resetsAt,
  showPercent = true,
  size = 'md',
  color: forcedColor,
  used,
  limit,
}) => {
  const normalizedLabelDesc = labelDesc?.trim();
  const isOverquota = percent > 100;
  const effectiveColor = isOverquota ? 'danger' : (forcedColor ?? (percent >= 90 ? 'danger' : percent >= 70 ? 'warning' : 'default'));
  
  const heights = { sm: 4, md: 6, lg: 8 };
  const h = heights[size];
  
  const colors = {
    default: {
      bg: 'rgba(16, 185, 129, 0.1)',
      fill: 'linear-gradient(90deg, #10b981 0%, #34d399 100%)',
    },
    warning: {
      bg: 'rgba(245, 158, 11, 0.1)',
      fill: 'linear-gradient(90deg, #f59e0b 0%, #fbbf24 100%)',
    },
    danger: {
      bg: 'rgba(239, 68, 68, 0.1)',
      fill: 'linear-gradient(90deg, #ef4444 0%, #f87171 100%)',
    },
  };
  
  const formatValue = (val?: number | null) => {
    if (val === undefined || val === null) return '';
    if (val >= 1000000) return `${(val / 1000000).toFixed(1)}M`;
    if (val >= 1000) return `${(val / 1000).toFixed(1)}K`;
    return Number.isInteger(val) ? val.toString() : val.toString();
  };
  
  const hasUsedLimit = used !== undefined && used !== null && limit !== undefined && limit !== null;
  
  return (
    <div className={className ? `w-full ${className}` : 'w-full'}>
      {(label || showPercent) && (
        <div className="flex justify-between items-center mb-2">
          <span className="text-xs font-medium text-[var(--color-text-secondary)]">
            <span title={normalizedLabelDesc || undefined}>{label}</span>
          </span>
              {showPercent && (
            <span
              className="text-xs font-medium"
              style={{
                color: effectiveColor === 'default' ? 'var(--color-text-primary)' :
                       effectiveColor === 'warning' ? '#b45309' : '#dc2626'
              }}
            >
              {hasUsedLimit ? (
                <span className="mr-1.5">{formatValue(used)}/{formatValue(limit)}</span>
              ) : null}
              ({Math.round(percent ?? 0)}% used)
            </span>
          )}
        </div>
      )}
      <div
        className="w-full rounded-full overflow-hidden"
        style={{
          height: h,
          background: colors[effectiveColor].bg,
        }}
      >
        <div
          className="h-full rounded-full transition-all duration-700 ease-out"
          style={{
            width: `${Math.min(100, Math.max(0, percent))}%`,
            background: colors[effectiveColor].fill,
          }}
        />
      </div>
      {resetsAt && (
        <p
          className="mt-1.5 text-[10px]"
          style={{ color: effectiveColor === 'danger' ? '#dc2626' : effectiveColor === 'warning' ? '#d97706' : 'var(--color-text-secondary)' }}
        >
          {formatResetTime(resetsAt)}
        </p>
      )}
      {isOverquota && (
        <p className="mt-1 text-[10px]" style={{ color: '#dc2626' }}>
          Overquota
        </p>
      )}
    </div>
  );
};

function formatDateTime(date: Date | string | number | null | undefined): string {
  const safeDate = coerceDate(date);
  if (!safeDate) return '--';

  const year = safeDate.getFullYear();
  const month = String(safeDate.getMonth() + 1).padStart(2, '0');
  const day = String(safeDate.getDate()).padStart(2, '0');
  const hours = String(safeDate.getHours()).padStart(2, '0');
  const minutes = String(safeDate.getMinutes()).padStart(2, '0');
  const seconds = String(safeDate.getSeconds()).padStart(2, '0');
  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
}

function formatResetTime(date: Date): string {
  const safeDate = coerceDate(date);
  if (!safeDate) return 'Reset time unavailable';

  const now = new Date();
  const diff = safeDate.getTime() - now.getTime();
  
  if (diff < 0) return `Expired at ${formatDateTime(safeDate)}`;
  
  const hours = Math.floor(diff / (1000 * 60 * 60));
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
  
  let remainingText: string;
  if (hours > 24) {
    const days = Math.floor(hours / 24);
    remainingText = `${days} day${days > 1 ? 's' : ''}`;
  } else if (hours > 0) {
    remainingText = `${hours}h ${minutes}m`;
  } else {
    remainingText = `${minutes}m`;
  }
  
  return `Resets in ${remainingText} (${formatDateTime(safeDate)})`;
}
