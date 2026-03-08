import React from 'react';
import { UsageProvider } from '../../types';
import { providerLogos } from './providerLogos';

interface ProviderLogoProps {
  provider: UsageProvider;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

const SIZE_MAP = {
  sm: 20,
  md: 32,
  lg: 48,
};

export const ProviderLogo: React.FC<ProviderLogoProps> = ({ 
  provider, 
  size = 'md',
  className = ''
}) => {
  const logoPath = providerLogos[provider];
  const dimension = SIZE_MAP[size];

  if (!logoPath) {
    return (
      <div 
        className={`rounded-md bg-[var(--color-bg-subtle)] flex items-center justify-center ${className}`}
        style={{ width: dimension, height: dimension }}
      >
        <span className="text-xs font-medium text-[var(--color-text-muted)]">
          {provider.charAt(0).toUpperCase()}
        </span>
      </div>
    );
  }

  return (
    <img
      src={logoPath}
      alt={provider}
      className={className}
      style={{ width: dimension, height: dimension }}
    />
  );
};

interface ProviderLogoWithNameProps {
  provider: UsageProvider;
  name?: string;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

export const ProviderLogoWithName: React.FC<ProviderLogoWithNameProps> = ({
  provider,
  name,
  size = 'md',
  className = ''
}) => {
  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <ProviderLogo provider={provider} size={size} />
      {name && <span className="text-sm font-medium">{name}</span>}
    </div>
  );
};
