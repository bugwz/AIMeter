import React from 'react';

interface LoadingSpinnerProps {
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

export const LoadingSpinner: React.FC<LoadingSpinnerProps> = ({ 
  size = 'md',
  className = '' 
}) => {
  const sizes = {
    sm: 16,
    md: 24,
    lg: 36,
  };

  const s = sizes[size];
  
  return (
    <div 
      className={`relative flex items-center justify-center ${className}`}
      style={{ width: s, height: s }}
    >
      <svg
        width={s}
        height={s}
        viewBox="0 0 24 24"
        fill="none"
        className="animate-spin"
        style={{ animationDuration: '1.2s' }}
      >
        <circle
          cx="12"
          cy="12"
          r="10"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeDasharray="32"
          strokeDashoffset="12"
          className="opacity-30"
        />
        <path
          d="M12 2a10 10 0 0 1 10 10"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          className="opacity-80"
        />
      </svg>
    </div>
  );
};

export const LoadingOverlay: React.FC<{ message?: string }> = ({ message }) => (
  <div className="absolute inset-0 flex flex-col items-center justify-center bg-white/80 backdrop-blur-sm rounded-xl">
    <LoadingSpinner size="lg" />
    {message && (
      <p className="mt-3 text-sm text-[var(--color-text-secondary)]">{message}</p>
    )}
  </div>
);

export const PageLoader: React.FC = () => (
  <div className="min-h-[400px] flex flex-col items-center justify-center">
    <LoadingSpinner size="lg" />
    <p className="mt-4 text-sm text-[var(--color-text-secondary)]">Loading...</p>
  </div>
);
