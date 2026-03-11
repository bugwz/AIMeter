import type { UsageProvider } from '../../src/types/index.js';

export interface DbProvider {
  id: string;
  name: string | null;
  key: string;
  refresh_interval: number;
  display_order: number;
  attrs: string;
  created_at: number;
  updated_at: number;
}

export interface ProgressItem {
  name: string;
  desc?: string;
  usedPercent: number;
  remainingPercent?: number;
  used?: number;
  limit?: number;
  windowMinutes?: number;
  resetsAt?: string;
  resetDescription?: string;
}

export interface ProgressData {
  items: ProgressItem[];
  cost?: {
    used: number;
    limit: number;
    remaining: number;
    currency?: string;
    period?: string;
  };
}

export interface DbUsageRecord {
  id: number;
  provider_id: string;
  progress: string | null;
  identity_data: string | null;
  created_at: number;
}

export interface ProviderConfigRow {
  provider: UsageProvider;
  key: string;
  refreshInterval: number;
  displayOrder?: number;
  attrs?: Record<string, unknown>;
}

export interface UsageRecordRow {
  id: number;
  providerId: string;
  progress: ProgressData | null;
  identityData: Record<string, unknown> | null;
  createdAt: Date;
}
