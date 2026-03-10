import axios, { AxiosInstance } from 'axios';
import { UsageProvider, UsageSnapshot, UsageError, DashboardProviderData, RuntimeCapabilities, Credential } from '../types';
import { getRuntimeEntry, type ViewerRole } from '../runtimeContext';

const API_BASE_URL = import.meta.env.AIMETER_API_URL || '/api';

interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
  };
}

export interface ProviderSummary {
  id: string;
  provider: UsageProvider;
  credentials: unknown;
  name: string | null;
  refreshInterval: number;
  displayOrder?: number;
  region?: string;
  claudeAuthMode?: 'oauth' | 'cookie';
  plan?: string;
  opencodeWorkspaceId?: string;
  defaultProgressItem?: string | null;
}

export interface ProviderDetail extends Omit<ProviderSummary, 'credentials'> {
  credentials: Credential;
}

interface UsageRecord {
  id: number;
  providerId: string;
  progress: {
    items: {
      name: string;
      usedPercent: number;
      remainingPercent?: number;
      used?: number;
      limit?: number;
      windowMinutes?: number;
      resetsAt?: string;
      resetDescription?: string;
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

interface CompactHistoryRecord {
  t: string;
  p?: Array<{ n: string; u: number }>;
  c?: { u: number; l: number };
}

interface UltraCompactHistoryRecord {
  t: number;
  p?: Array<[number, number]>;
  c?: [number, number];
}

interface UltraCompactHistorySeries {
  k: string[];
  d: UltraCompactHistoryRecord[];
}

interface AuthStatus {
  role?: ViewerRole;
  needsSetup: boolean;
  bootstrapRequired?: boolean;
  authenticated?: boolean;
  authEnabled?: boolean;
  authMutable?: boolean;
}

export interface ClaudeOAuthTokenResult {
  accessToken: string;
  refreshToken?: string;
  expiresAt?: string;
  clientId?: string;
}

export interface CopilotAuthStartResponse {
  flowId: string;
  userCode: string;
  verificationUri: string;
  expiresIn: number;
  interval: number;
}

export interface CopilotAuthStatusResponse {
  status: 'pending' | 'authorized' | 'expired' | 'error';
  userCode?: string;
  verificationUri?: string;
  expiresAt?: string;
  tempCredentialId?: string;
  error?: string;
}

export interface AuditLogItem {
  id: number;
  timestamp: string;
  ip: string | null;
  method: string;
  path: string;
  statusCode: number;
  durationMs: number;
  userAgent: string | null;
  authenticated: boolean;
  eventType: string;
  details: Record<string, unknown> | null;
}

class ApiService {
  private client: AxiosInstance;

  private toDate(value: Date | string | number | null | undefined): Date {
    if (value instanceof Date) return value;
    if (typeof value === 'number') {
      const timestampMs = value > 1_000_000_000_000 ? value : value * 1000;
      return new Date(timestampMs);
    }
    return value ? new Date(value) : new Date(0);
  }

  private normalizeSnapshot(snapshot: UsageSnapshot): UsageSnapshot {
    return {
      ...snapshot,
      updatedAt: this.toDate(snapshot.updatedAt as unknown as Date | string | number),
      progress: (snapshot.progress || []).map((item) => ({
        ...item,
        resetsAt: item.resetsAt ? this.toDate(item.resetsAt as unknown as Date | string | number) : undefined,
      })),
    };
  }

  private getCurrentRole(): ViewerRole {
    return getRuntimeEntry().role;
  }

  private normalizeHistoryRecord(record: UsageRecord | CompactHistoryRecord, providerId: string): UsageRecord {
    if ('t' in record) {
      return {
        id: 0,
        providerId,
        progress: {
          items: (record.p || []).map((item) => ({
            name: item.n,
            usedPercent: item.u,
          })),
          ...(record.c ? { cost: { used: record.c.u, limit: record.c.l, remaining: Math.max(record.c.l - record.c.u, 0) } } : {}),
        },
        identityData: null,
        createdAt: new Date(record.t),
      };
    }
    return record;
  }

  private normalizeUltraCompactSeries(series: UltraCompactHistorySeries, providerId: string): UsageRecord[] {
    const keys = Array.isArray(series.k) ? series.k : [];
    const records = Array.isArray(series.d) ? series.d : [];
    return records.map((record, index) => {
      const timestampMs = record.t < 1_000_000_000_000 ? record.t * 1000 : record.t;
      const items = (record.p || [])
        .filter((item) => Array.isArray(item) && item.length >= 2)
        .map(([nameIndex, usedPercent]) => ({
          name: keys[nameIndex] || String(nameIndex),
          usedPercent,
        }));
      const costTuple = record.c;
      return {
        id: index,
        providerId,
        progress: {
          items,
          ...(costTuple
            ? { cost: { used: costTuple[0], limit: costTuple[1], remaining: Math.max(costTuple[1] - costTuple[0], 0) } }
            : {}),
        },
        identityData: null,
        createdAt: new Date(timestampMs),
      };
    });
  }

  constructor() {
    this.client = axios.create({
      baseURL: API_BASE_URL,
      timeout: 30000,
      withCredentials: true,
    });

    this.client.interceptors.request.use((config) => {
      config.headers = config.headers || {};
      config.headers['X-AIMeter-Role'] = this.getCurrentRole();
      return config;
    });
  }

  async getProviders(): Promise<ProviderSummary[]> {
    const response = await this.client.get<ApiResponse<ProviderSummary[]>>('/providers');
    if (!response.data.success) {
      throw new Error(response.data.error?.message || 'Failed to fetch providers');
    }
    return response.data.data || [];
  }

  async getCredentials(): Promise<ProviderDetail[]> {
    const response = await this.client.get<ApiResponse<ProviderDetail[]>>('/providers/credentials');
    if (!response.data.success) {
      throw new Error(response.data.error?.message || 'Failed to fetch credentials');
    }
    return response.data.data || [];
  }

  async getProvider(id: string): Promise<ProviderDetail> {
    const response = await this.client.get<ApiResponse<ProviderDetail>>(`/providers/${id}`);
    if (!response.data.success) {
      throw new Error(response.data.error?.message || 'Failed to fetch provider');
    }
    return response.data.data!;
  }

  async addProvider(
    provider: UsageProvider,
    credentials: string,
    authType: string,
    options?: {
      refreshInterval?: number;
      region?: string;
      name?: string;
      claudeAuthMode?: 'oauth' | 'cookie';
      plan?: string;
      opencodeWorkspaceId?: string;
      defaultProgressItem?: string;
    }
  ): Promise<ProviderSummary> {
    const response = await this.client.post<ApiResponse<ProviderSummary>>('/providers', {
      provider,
      credentials,
      authType,
      ...options,
    });
    if (!response.data.success) {
      throw new Error(response.data.error?.message || 'Failed to add provider');
    }
    return response.data.data!;
  }

  async generateClaudeOAuthUrl(): Promise<{ authUrl: string; sessionId: string }> {
    const response = await this.client.post<ApiResponse<{ authUrl: string; sessionId: string }>>('/providers/claude/oauth/generate-auth-url');
    if (!response.data.success) {
      throw new Error(response.data.error?.message || 'Failed to generate Claude OAuth URL');
    }
    return response.data.data!;
  }

  async exchangeClaudeOAuthCode(sessionId: string, code: string, state?: string): Promise<ClaudeOAuthTokenResult> {
    const response = await this.client.post<ApiResponse<ClaudeOAuthTokenResult>>('/providers/claude/oauth/exchange-code', {
      sessionId,
      code,
      ...(state ? { state } : {}),
    });
    if (!response.data.success) {
      throw new Error(response.data.error?.message || 'Failed to exchange Claude OAuth code');
    }
    return response.data.data!;
  }

  async startCopilotAuth(): Promise<CopilotAuthStartResponse> {
    const response = await this.client.post<ApiResponse<CopilotAuthStartResponse>>('/providers/copilot/auth/start');
    if (!response.data.success) {
      throw new Error(response.data.error?.message || 'Failed to start Copilot sign-in');
    }
    return response.data.data!;
  }

  async getCopilotAuthStatus(flowId: string): Promise<CopilotAuthStatusResponse> {
    const response = await this.client.get<ApiResponse<CopilotAuthStatusResponse>>(`/providers/copilot/auth/status/${flowId}`);
    if (!response.data.success) {
      throw new Error(response.data.error?.message || 'Failed to check Copilot sign-in');
    }
    return response.data.data!;
  }

  async completeCopilotAuth(options: {
    tempCredentialId: string;
    name: string;
    refreshInterval: number;
  }): Promise<ProviderSummary> {
    const response = await this.client.post<ApiResponse<ProviderSummary>>('/providers/copilot/auth/complete', options);
    if (!response.data.success) {
      throw new Error(response.data.error?.message || 'Failed to complete Copilot sign-in');
    }
    return response.data.data!;
  }

  async updateProvider(
    id: string,
    updates: {
      authType?: string;
      credentials?: string;
      refreshInterval?: number;
      region?: string;
      name?: string;
      claudeAuthMode?: 'oauth' | 'cookie';
      plan?: string;
      opencodeWorkspaceId?: string;
      defaultProgressItem?: string;
    }
  ): Promise<ProviderSummary> {
    const response = await this.client.put<ApiResponse<ProviderSummary>>(
      `/providers/${id}`,
      updates
    );
    if (!response.data.success) {
      throw new Error(response.data.error?.message || 'Failed to update provider');
    }
    return response.data.data!;
  }

  async updateProviderOrder(ids: string[]): Promise<ProviderSummary[]> {
    const response = await this.client.put<ApiResponse<ProviderSummary[]>>('/providers/order', { ids });
    if (!response.data.success) {
      throw new Error(response.data.error?.message || 'Failed to update provider order');
    }
    return response.data.data || [];
  }

  async changePassword(targetRole: ViewerRole, oldPassword: string, newPassword: string): Promise<void> {
    const response = await this.client.post('/auth/admin/change-password', {
      targetRole,
      oldPassword,
      newPassword,
    });
    if (!response.data.success) {
      throw new Error(response.data.error?.message || 'Failed to change password');
    }
  }

  async logout(): Promise<void> {
    await this.client.post(`/auth/${this.getCurrentRole()}/logout`);
  }

  async getAuditLogs(limit: number = 200): Promise<AuditLogItem[]> {
    const response = await this.client.get<ApiResponse<AuditLogItem[]>>(`/auth/admin/audit-logs?limit=${limit}`);
    if (!response.data.success) {
      throw new Error(response.data.error?.message || 'Failed to fetch audit logs');
    }
    return response.data.data || [];
  }

  async deleteProvider(id: string): Promise<void> {
    const response = await this.client.delete<ApiResponse<void>>(`/providers/${id}`);
    if (!response.data.success) {
      throw new Error(response.data.error?.message || 'Failed to delete provider');
    }
  }

  async refreshProvider(id: string): Promise<UsageSnapshot> {
    const response = await this.client.post<ApiResponse<UsageSnapshot>>(`/providers/${id}/refresh`);
    if (!response.data.success) {
      throw new Error(response.data.error?.message || 'Failed to refresh provider');
    }
    return this.normalizeSnapshot(response.data.data!);
  }

  async fetchLatest(): Promise<(DashboardProviderData | UsageError)[]> {
    const response = await this.client.post<ApiResponse<(DashboardProviderData | UsageError)[]>>('/proxy/latest');
    if (!response.data.success) {
      throw new Error(response.data.error?.message || 'Failed to fetch latest');
    }
    return response.data.data!;
  }

  async fetchRefresh(): Promise<(DashboardProviderData | UsageError)[]> {
    const response = await this.client.post<ApiResponse<(DashboardProviderData | UsageError)[]>>('/proxy/refresh');
    if (!response.data.success) {
      throw new Error(response.data.error?.message || 'Failed to refresh');
    }
    return response.data.data!;
  }

  async getUsageHistory(
    provider?: string,
    days: number = 30,
    bucketMinutes?: number
  ): Promise<Record<string, UsageRecord[]>> {
    const params = new URLSearchParams();
    params.append('days', days.toString());
    if (bucketMinutes && Number.isFinite(bucketMinutes) && bucketMinutes > 0) {
      params.append('bucketMinutes', Math.floor(bucketMinutes).toString());
    }
    if (provider) {
      params.append('provider', provider);
    }

    const response = await this.client.get<ApiResponse<Record<string, Array<UsageRecord | CompactHistoryRecord> | UltraCompactHistorySeries>>>(
      `/history?${params}`
    );
    if (!response.data.success) {
      throw new Error(response.data.error?.message || 'Failed to fetch history');
    }
    const payload = response.data.data || {};
    return Object.fromEntries(
      Object.entries(payload).map(([providerId, records]) => [
        providerId,
        Array.isArray(records)
          ? (records || []).map((record) => this.normalizeHistoryRecord(record, providerId))
          : this.normalizeUltraCompactSeries(records as UltraCompactHistorySeries, providerId),
      ])
    );
  }

  async getProviderHistory(
    id: string,
    days: number = 30
  ): Promise<UsageRecord[]> {
    const response = await this.client.get<ApiResponse<UsageRecord[]>>(
      `/providers/${id}/history?days=${days}`
    );
    if (!response.data.success) {
      throw new Error(response.data.error?.message || 'Failed to fetch provider history');
    }
    return response.data.data || [];
  }

  async getAuthStatus(): Promise<AuthStatus> {
    const response = await this.client.get<ApiResponse<AuthStatus>>(`/auth/${this.getCurrentRole()}/status`);
    if (!response.data.success) {
      throw new Error(response.data.error?.message || 'Failed to fetch auth status');
    }
    return response.data.data || { needsSetup: true };
  }

  async getCapabilities(): Promise<RuntimeCapabilities> {
    const response = await this.client.get<ApiResponse<RuntimeCapabilities>>('/system/capabilities');
    if (!response.data.success) {
      throw new Error(response.data.error?.message || 'Failed to fetch capabilities');
    }
    return response.data.data!;
  }

  async setupPassword(password: string): Promise<void> {
    const response = await this.client.post(`/auth/${this.getCurrentRole()}/setup`, { password });
    if (!response.data.success) {
      throw new Error(response.data.error?.message || 'Failed to setup password');
    }
  }

  async bootstrapSetup(normalPassword: string, adminPassword: string, adminRouteSecret: string): Promise<{ adminBasePath: string }> {
    const response = await this.client.post<ApiResponse<{ adminBasePath: string }>>('/auth/bootstrap', {
      normalPassword,
      adminPassword,
      adminRouteSecret,
    });
    if (!response.data.success) {
      throw new Error(response.data.error?.message || 'Failed to complete initial setup');
    }
    return response.data.data!;
  }

  async verifyPassword(password: string): Promise<boolean> {
    const response = await this.client.post(`/auth/${this.getCurrentRole()}/verify`, { password });
    if (response.data?.data?.valid !== undefined) {
      return Boolean(response.data.data.valid);
    }
    return Boolean(response.data.success);
  }

  async getSecrets(): Promise<{ cronSecret: string | null; endpointSecret: string | null }> {
    const response = await this.client.get<ApiResponse<{ cronSecret: string | null; endpointSecret: string | null }>>('/system/secrets');
    if (!response.data.success) {
      throw new Error(response.data.error?.message || 'Failed to fetch secrets');
    }
    return response.data.data!;
  }

  async resetCronSecret(): Promise<string> {
    const response = await this.client.post<ApiResponse<{ cronSecret: string }>>('/system/secrets/cron/reset');
    if (!response.data.success) {
      throw new Error(response.data.error?.message || 'Failed to reset cron secret');
    }
    return response.data.data!.cronSecret;
  }

  async resetEndpointSecret(): Promise<string> {
    const response = await this.client.post<ApiResponse<{ endpointSecret: string }>>('/system/secrets/endpoint/reset');
    if (!response.data.success) {
      throw new Error(response.data.error?.message || 'Failed to reset endpoint secret');
    }
    return response.data.data!.endpointSecret;
  }

  async getSubscriptions(params?: {
    providers?: string;
    format?: 'json' | 'xml' | 'table' | 'markdown' | 'csv';
    pretty?: boolean;
    days?: number;
  }): Promise<unknown> {
    const queryParams = new URLSearchParams();
    if (params?.providers) queryParams.append('providers', params.providers);
    if (params?.format) queryParams.append('format', params.format);
    if (params?.pretty !== undefined) queryParams.append('pretty', params.pretty.toString());
    if (params?.days) queryParams.append('days', params.days.toString());

    const response = await this.client.get(`/endpoint/subscriptions?${queryParams}`);
    if (params?.format && params.format !== 'json') {
      return response.data;
    }
    return response.data;
  }
}

export const apiService = new ApiService();
