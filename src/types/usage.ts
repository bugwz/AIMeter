// Usage-related type definitions
import { UsageProvider, Identity } from './provider';

// Rate window
export interface RateWindow {
  name?: string;               // Account label (primary, secondary, tertiary, etc.)
  desc?: string;               // Progress item helper text (used for frontend tooltips)
  usedPercent: number;          // Used percentage (0-100)
  remainingPercent?: number;    // Remaining percentage
  used?: number;                // Used value
  limit?: number;               // Limit value
  windowMinutes?: number;        // Window duration (minutes)
  resetsAt?: Date;              // Reset time
  resetDescription?: string;    // Reset description
}

// Progress item (used in the progress array)
export interface ProgressItem {
  name: string;
  desc?: string;
  usedPercent: number;
  remainingPercent?: number;
  used?: number;
  limit?: number;
  windowMinutes?: number;
  resetsAt?: Date;
  resetDescription?: string;
}

// Progress data (database storage format)
export interface ProgressData {
  items: ProgressItem[];
  cost?: ProviderCostSnapshot;
}

// Full provider data used by the dashboard
export interface DashboardProviderData {
  id: string;
  provider: UsageProvider;
  name?: string;              // User-defined name
  region?: string;            // Optional region configuration
  credential?: string;         // Credential value (string form)
  progress: ProgressItem[];   // Progress array replacing the legacy primary/secondary/tertiary fields
  cost?: ProviderCostSnapshot;
  identity?: Identity;
  updatedAt: Date;
  stale?: boolean;
  staleAt?: Date;
  fromCache?: boolean;
  authRequired?: boolean;
  refreshInterval?: number;
}

// Complete usage snapshot
export interface UsageSnapshot {
  provider: UsageProvider;
  progress: ProgressItem[];    // Progress array replacing the legacy primary/secondary/tertiary fields
  cost?: ProviderCostSnapshot;
  identity?: Identity;
  updatedAt: Date;
}

// Provider-specific extended data
export interface ProviderSpecificData {
  // OpenRouter
  totalCredits?: number;
  totalUsage?: number;
  balance?: number;
  keyLimit?: number;
  keyUsage?: number;
  rateLimit?: { requests: number; interval: string };
  limitReset?: string;
  
  // Legacy token/time limit fields
  tokenLimit?: ZaiLimitEntry;
  timeLimit?: ZaiLimitEntry;
  
  // Kimi / MiniMax
  weekly?: ProviderCostSnapshot;
  rateLimitDetail?: ProviderCostSnapshot;
}

// Limit entry
export interface ZaiLimitEntry {
  type: 'TIME_LIMIT' | 'TOKENS_LIMIT';
  unit: number;
  number: number;
  usage?: number;
  currentValue?: number;
  remaining?: number;
  percentage: number;
  nextResetTime?: Date;
}

// Cost snapshot
export interface ProviderCostSnapshot {
  used: number;
  limit: number;
  remaining: number;
  currency?: string;
  period?: string;
}

// Error type
export interface UsageError {
  id?: string;
  provider: UsageProvider;
  code: UsageErrorCode;
  message: string;
  statusCode?: number;
  timestamp: Date;
}

export enum UsageErrorCode {
  INVALID_CREDENTIALS = 'INVALID_CREDENTIALS',
  NETWORK_ERROR = 'NETWORK_ERROR',
  API_ERROR = 'API_ERROR',
  PARSE_ERROR = 'PARSE_ERROR',
  RATE_LIMIT_EXCEEDED = 'RATE_LIMIT_EXCEEDED',
  TIMEOUT = 'TIMEOUT',
  UNKNOWN = 'UNKNOWN',
}

// Usage status
export type UsageStatus = 'loading' | 'success' | 'error' | 'stale';

// API response type
export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
  };
}

export interface RuntimeCapabilities {
  viewerRole: 'normal' | 'admin';
  storageMode: 'database' | 'env';
  mockEnabled: boolean;
  providerConfigMutable: boolean;
  auth: {
    normal: {
      enabled: boolean;
      needsSetup: boolean;
      mutable: boolean;
    };
    admin: {
      enabled: boolean;
      needsSetup: boolean;
      mutable: boolean;
    };
  };
  ui: {
    showSettings: boolean;
    allowProviderCreate: boolean;
    allowProviderEdit: boolean;
    allowProviderDelete: boolean;
    allowProviderReorder: boolean;
    allowManualRefresh: boolean;
  };
  history: {
    enabled: boolean;
    persisted: boolean;
    mode: 'database' | 'disabled';
  };
  secrets: {
    managedInDb: boolean;
    mutable: boolean;
  };
}

// Batch query result
export interface BatchUsageResult {
  results: Map<UsageProvider, UsageSnapshot | UsageError>;
  timestamp: Date;
  duration: number; // Milliseconds
}
