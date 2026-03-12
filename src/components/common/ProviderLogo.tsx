import React from 'react';
import { UsageProvider } from '../../types';
import { providerLogos } from './providerLogos';

interface ProviderLogoProps {
  provider: UsageProvider;
  size?: 'sm' | 'md' | 'lg' | number;
  className?: string;
  imgClassName?: string;
  alt?: string;
  frame?: 'auto' | 'none';
}

const SIZE_MAP = {
  sm: 20,
  md: 32,
  lg: 48,
};

const resolveSize = (size: ProviderLogoProps['size']): number =>
  typeof size === 'number' ? size : SIZE_MAP[size || 'md'];

const resolveRadiusClass = (dimension: number): string => {
  if (dimension <= 20) return 'rounded-[6px]';
  if (dimension <= 32) return 'rounded-[9px]';
  return 'rounded-xl';
};

const resolveFallbackFontSize = (dimension: number): number =>
  Math.max(9, Math.round(dimension * 0.4));

export const ProviderLogo: React.FC<ProviderLogoProps> = ({ 
  provider, 
  size = 'md',
  className = '',
  imgClassName = '',
  alt,
  frame = 'auto',
}) => {
  const logoPath = providerLogos[provider];
  const dimension = resolveSize(size);
  const radiusClass = resolveRadiusClass(dimension);
  const padding = Math.max(1, Math.round(dimension * 0.08));

  if (!logoPath) {
    return (
      <div 
        className={`${frame === 'auto' ? 'provider-logo-frame provider-logo-fallback' : ''} inline-flex items-center justify-center ${radiusClass} ${className}`}
        style={{ width: dimension, height: dimension, padding }}
      >
        <span
          className="font-semibold leading-none text-[var(--color-text-secondary)]"
          style={{ fontSize: resolveFallbackFontSize(dimension) }}
        >
          {provider.charAt(0).toUpperCase()}
        </span>
      </div>
    );
  }

  return (
    <span
      className={`${frame === 'auto' ? 'provider-logo-frame provider-logo-image-frame' : ''} inline-flex items-center justify-center overflow-hidden ${radiusClass} ${className}`}
      style={{ width: dimension, height: dimension, padding }}
    >
      <img
        src={logoPath}
        alt={alt || provider}
        className={`provider-logo-image h-full w-full object-contain ${imgClassName}`}
      />
    </span>
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
