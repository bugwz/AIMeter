import { IProviderAdapter, ValidationResult } from './interface';
import {
  UsageProvider,
  AuthType,
  Credential,
  ProviderMeta,
  ProviderConfig,
  UsageSnapshot,
  ProgressItem,
} from '../types';
import { roundPercentage } from './utils';

const ANTIGRAVITY_META: ProviderMeta = {
  id: UsageProvider.ANTIGRAVITY,
  name: 'Antigravity',
  logo: '/providers/antigravity.svg',
  color: '#4285F4',
  supportedAuthTypes: [AuthType.OAUTH],
  docsUrl: 'https://antigravity.so/',
};

const GOOGLE_OAUTH_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const DEFAULT_CLIENT_ID = '1071006060591-tmhssin2h21lcre235vtolojh4g403ep.apps.googleusercontent.com';
const DEFAULT_CLIENT_SECRET = process.env.ANTIGRAVITY_OAUTH_CLIENT_SECRET || '';
const DEFAULT_BASE_URLS = [
  'https://daily-cloudcode-pa.googleapis.com',
  'https://cloudcode-pa.googleapis.com',
];
const REFRESH_SKEW_MS = 5 * 60 * 1000;

interface AntigravityOAuthCredential {
  accessToken: string;
  refreshToken?: string;
  expiresAt?: Date;
  clientId?: string;
  clientSecret?: string;
  projectId?: string;
}

interface AntigravityTierInfo {
  id?: string;
  name?: string;
  description?: string;
}

interface AntigravityLoadCodeAssistResponse {
  cloudaicompanionProject?: string | { id?: string };
  paidTier?: string | AntigravityTierInfo;
  currentTier?: string | AntigravityTierInfo;
}

interface AntigravityOnboardResponse {
  done?: boolean;
  response?: {
    cloudaicompanionProject?: string | { id?: string };
  };
}

interface AntigravityModelQuotaInfo {
  remainingFraction?: number;
  resetTime?: string;
}

interface AntigravityModelInfo {
  displayName?: string;
  model?: string;
  isInternal?: boolean;
  quotaInfo?: AntigravityModelQuotaInfo;
}

interface AntigravityFetchModelsResponse {
  models?: Record<string, AntigravityModelInfo>;
}

interface AntigravityModelProgress {
  name: string;
  remainingFraction: number;
  resetsAt?: Date;
}

interface CloudRequestContext {
  accessToken: string;
  allowTokenRefresh: boolean;
  oauth: AntigravityOAuthCredential;
}

class AuthError extends Error {
  readonly code = 'AUTH_ERROR';
}

class AntigravityAdapter implements IProviderAdapter {
  readonly id = UsageProvider.ANTIGRAVITY;
  readonly meta = ANTIGRAVITY_META;

  private preferredBaseURL: string | null = null;

  async validateCredentials(credentials: Credential, config?: ProviderConfig): Promise<ValidationResult> {
    try {
      const oauth = this.requireOAuthCredential(credentials);
      const context = await this.buildRequestContext(oauth, false);
      const projectId = await this.ensureProjectId(context, oauth.projectId);
      await this.fetchAvailableModels(context, projectId);
      return { valid: true, expiresAt: oauth.expiresAt };
    } catch (error) {
      if (error instanceof AuthError) {
        return { valid: false, reason: 'Invalid or expired Antigravity OAuth credentials' };
      }
      return { valid: false, reason: error instanceof Error ? error.message : 'Validation failed' };
    }
  }

  async fetchUsage(credentials: Credential, _config?: ProviderConfig): Promise<UsageSnapshot> {
    const oauth = this.requireOAuthCredential(credentials);
    const context = await this.buildRequestContext(oauth, true);

    const loadInfo = await this.loadCodeAssist(context).catch(() => null);
    const projectId = await this.ensureProjectId(context, oauth.projectId, loadInfo || undefined);
    const modelList = await this.fetchAvailableModels(context, projectId);

    if (modelList.length === 0) {
      throw new Error('No model quota data returned by Antigravity API');
    }

    oauth.projectId = projectId;
    if (credentials.type === AuthType.OAUTH) {
      credentials.accessToken = context.accessToken;
      credentials.expiresAt = oauth.expiresAt;
      credentials.clientId = oauth.clientId;
      credentials.projectId = oauth.projectId;
    }

    const progress = modelList
      .sort((left, right) => left.name.localeCompare(right.name))
      .map((model): ProgressItem => {
        const usedPercent = roundPercentage((1 - model.remainingFraction) * 100);
        return {
          name: model.name,
          usedPercent,
          remainingPercent: roundPercentage(100 - usedPercent),
          limit: 100,
          used: usedPercent,
          resetsAt: model.resetsAt,
          windowMinutes: 300,
        };
      });

    const plan = this.extractPlanName(loadInfo || undefined);

    return {
      provider: UsageProvider.ANTIGRAVITY,
      progress,
      identity: plan ? { plan } : undefined,
      updatedAt: new Date(),
    };
  }

  async refreshCredentials(credentials: Credential): Promise<Credential> {
    const oauth = this.requireOAuthCredential(credentials);
    if (!oauth.refreshToken) {
      throw new Error('Cannot refresh Antigravity OAuth token: missing refresh token');
    }

    const refreshed = await this.refreshAccessToken(oauth.refreshToken, oauth.clientId, oauth.clientSecret);
    return {
      type: AuthType.OAUTH,
      accessToken: refreshed.accessToken,
      refreshToken: oauth.refreshToken,
      expiresAt: refreshed.expiresAt,
      clientId: oauth.clientId || DEFAULT_CLIENT_ID,
      clientSecret: oauth.clientSecret,
      projectId: oauth.projectId,
    };
  }

  getErrorMessage(error: unknown): string {
    if (error instanceof AuthError) {
      return 'Antigravity OAuth token expired. Please re-authenticate.';
    }

    if (error instanceof Error) {
      if (error.message.includes('429')) return 'Antigravity API rate limit exceeded. Please try again later.';
      return error.message;
    }

    return 'Failed to fetch Antigravity usage';
  }

  private requireOAuthCredential(credentials: Credential): AntigravityOAuthCredential {
    if (credentials.type !== AuthType.OAUTH) {
      throw new Error('Antigravity requires OAuth authentication');
    }

    const accessToken = credentials.accessToken?.trim();
    if (!accessToken) {
      throw new Error('Antigravity OAuth access token is required');
    }

    return {
      accessToken,
      refreshToken: credentials.refreshToken?.trim() || undefined,
      expiresAt: this.toDate(credentials.expiresAt),
      clientId: credentials.clientId?.trim() || undefined,
      clientSecret: credentials.clientSecret?.trim() || undefined,
      projectId: credentials.projectId?.trim() || undefined,
    };
  }

  private async buildRequestContext(oauth: AntigravityOAuthCredential, allowTokenRefresh: boolean): Promise<CloudRequestContext> {
    let accessToken = oauth.accessToken;
    if (allowTokenRefresh && this.isTokenExpiringSoon(oauth.expiresAt) && oauth.refreshToken) {
      const refreshed = await this.refreshAccessToken(oauth.refreshToken, oauth.clientId, oauth.clientSecret);
      accessToken = refreshed.accessToken;
      oauth.accessToken = refreshed.accessToken;
      oauth.expiresAt = refreshed.expiresAt;
      if (!oauth.clientId) oauth.clientId = refreshed.clientId;
    }

    return {
      accessToken,
      allowTokenRefresh,
      oauth,
    };
  }

  private isTokenExpiringSoon(expiresAt?: Date): boolean {
    if (!expiresAt || Number.isNaN(expiresAt.getTime())) return false;
    return expiresAt.getTime() <= Date.now() + REFRESH_SKEW_MS;
  }

  private async ensureProjectId(
    context: CloudRequestContext,
    existingProjectId?: string,
    loadInfo?: AntigravityLoadCodeAssistResponse,
  ): Promise<string> {
    if (existingProjectId?.trim()) return existingProjectId.trim();

    const loaded = loadInfo || await this.loadCodeAssist(context);
    let projectId = this.extractProjectId(loaded);
    if (projectId) return projectId;

    const tierId = this.extractTierId(loaded);
    if (tierId) {
      const onboard = await this.onboardUser(context, tierId);
      projectId = this.extractProjectIdFromOnboard(onboard);
      if (projectId) return projectId;

      const reloaded = await this.loadCodeAssist(context);
      projectId = this.extractProjectId(reloaded);
      if (projectId) return projectId;
    }

    throw new Error('Antigravity project ID is unavailable. Re-authenticate and retry.');
  }

  private async loadCodeAssist(context: CloudRequestContext): Promise<AntigravityLoadCodeAssistResponse> {
    return this.requestWithFallback<AntigravityLoadCodeAssistResponse>(context, '/v1internal:loadCodeAssist', {
      metadata: {
        ideType: 'ANTIGRAVITY',
      },
    });
  }

  private async onboardUser(context: CloudRequestContext, tierId: string): Promise<AntigravityOnboardResponse> {
    return this.requestWithFallback<AntigravityOnboardResponse>(context, '/v1internal:onboardUser', {
      tierId,
      metadata: {
        ideType: 'ANTIGRAVITY',
        platform: 'PLATFORM_UNSPECIFIED',
        pluginType: 'GEMINI',
      },
    });
  }

  private async fetchAvailableModels(context: CloudRequestContext, projectId: string): Promise<AntigravityModelProgress[]> {
    const payload = await this.requestWithFallback<AntigravityFetchModelsResponse>(
      context,
      '/v1internal:fetchAvailableModels',
      { project: projectId },
    );

    const models = payload.models || {};
    const result: AntigravityModelProgress[] = [];

    for (const [fallbackModelId, model] of Object.entries(models)) {
      if (!model || model.isInternal) continue;

      const name = (model.displayName || model.model || fallbackModelId || '').trim();
      if (!name) continue;

      const remainingFraction = this.normalizeRemainingFraction(model.quotaInfo?.remainingFraction);
      if (remainingFraction === null) continue;

      result.push({
        name,
        remainingFraction,
        resetsAt: this.toDate(model.quotaInfo?.resetTime),
      });
    }

    return result;
  }

  private normalizeRemainingFraction(value: unknown): number | null {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      return null;
    }
    if (value < 0) return 0;
    if (value > 1) return 1;
    return value;
  }

  private extractProjectId(load: AntigravityLoadCodeAssistResponse): string | undefined {
    const project = load.cloudaicompanionProject;
    if (typeof project === 'string' && project.trim()) return project.trim();
    if (project && typeof project === 'object' && typeof project.id === 'string' && project.id.trim()) {
      return project.id.trim();
    }
    return undefined;
  }

  private extractProjectIdFromOnboard(payload: AntigravityOnboardResponse): string | undefined {
    const project = payload.response?.cloudaicompanionProject;
    if (typeof project === 'string' && project.trim()) return project.trim();
    if (project && typeof project === 'object' && typeof project.id === 'string' && project.id.trim()) {
      return project.id.trim();
    }
    return undefined;
  }

  private extractTierId(load: AntigravityLoadCodeAssistResponse): string | undefined {
    const read = (tier: AntigravityLoadCodeAssistResponse['paidTier']) => {
      if (!tier) return undefined;
      if (typeof tier === 'string' && tier.trim()) return tier.trim();
      if (typeof tier === 'object' && typeof tier.id === 'string' && tier.id.trim()) return tier.id.trim();
      return undefined;
    };

    return read(load.paidTier) || read(load.currentTier);
  }

  private extractPlanName(load?: AntigravityLoadCodeAssistResponse): string | undefined {
    if (!load) return undefined;

    const read = (tier: AntigravityLoadCodeAssistResponse['paidTier']) => {
      if (!tier) return undefined;
      if (typeof tier === 'string') return tier.trim() || undefined;
      if (typeof tier === 'object') {
        if (typeof tier.name === 'string' && tier.name.trim()) return tier.name.trim();
        if (typeof tier.id === 'string' && tier.id.trim()) return tier.id.trim();
      }
      return undefined;
    };

    return read(load.paidTier) || read(load.currentTier);
  }

  private async requestWithFallback<T>(
    context: CloudRequestContext,
    endpointPath: string,
    body: Record<string, unknown>,
  ): Promise<T> {
    const baseURLs = this.getBaseURLsInOrder();
    let lastError: Error | null = null;

    for (const baseURL of baseURLs) {
      try {
        const response = await fetch(`${baseURL}${endpointPath}`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${context.accessToken}`,
            'Content-Type': 'application/json',
            'User-Agent': 'antigravity',
          },
          body: JSON.stringify(body),
        });

        if (response.status === 401 || response.status === 403) {
          if (context.allowTokenRefresh && context.oauth.refreshToken) {
            const refreshed = await this.refreshAccessToken(
              context.oauth.refreshToken,
              context.oauth.clientId,
              context.oauth.clientSecret,
            );
            context.accessToken = refreshed.accessToken;
            context.oauth.accessToken = refreshed.accessToken;
            context.oauth.expiresAt = refreshed.expiresAt;
            context.oauth.clientId = context.oauth.clientId || refreshed.clientId;
            context.allowTokenRefresh = false;
            return this.requestWithFallback<T>(context, endpointPath, body);
          }
          throw new AuthError(`Antigravity auth failed with HTTP ${response.status}`);
        }

        if (this.shouldTryNextURL(response.status)) {
          lastError = new Error(`Antigravity request fallback: ${response.status}`);
          continue;
        }

        if (!response.ok) {
          const text = await response.text().catch(() => '');
          throw new Error(`Antigravity API error: HTTP ${response.status}${text ? ` - ${text}` : ''}`);
        }

        const payload = await response.json() as T;
        this.preferredBaseURL = baseURL;
        return payload;
      } catch (error) {
        if (error instanceof AuthError) {
          throw error;
        }

        lastError = error instanceof Error ? error : new Error(String(error));
      }
    }

    throw lastError || new Error('Antigravity request failed');
  }

  private shouldTryNextURL(status: number): boolean {
    return status === 404 || status === 408 || status === 429 || status >= 500;
  }

  private getBaseURLsInOrder(): string[] {
    if (!this.preferredBaseURL || !DEFAULT_BASE_URLS.includes(this.preferredBaseURL)) {
      return [...DEFAULT_BASE_URLS];
    }

    return [
      this.preferredBaseURL,
      ...DEFAULT_BASE_URLS.filter((url) => url !== this.preferredBaseURL),
    ];
  }

  private async refreshAccessToken(
    refreshToken: string,
    clientId?: string,
    clientSecret?: string,
  ): Promise<{ accessToken: string; expiresAt?: Date; clientId: string }> {
    const resolvedClientId = clientId || process.env.ANTIGRAVITY_OAUTH_CLIENT_ID || DEFAULT_CLIENT_ID;
    const resolvedClientSecret = clientSecret || DEFAULT_CLIENT_SECRET;

    if (!resolvedClientSecret) {
      throw new AuthError('Antigravity OAuth refresh requires ANTIGRAVITY_OAUTH_CLIENT_SECRET');
    }

    const body = new URLSearchParams({
      client_id: resolvedClientId,
      client_secret: resolvedClientSecret,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    });

    const response = await fetch(GOOGLE_OAUTH_TOKEN_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: body.toString(),
    });

    if (!response.ok) {
      const text = await response.text().catch(() => '');
      throw new AuthError(`Antigravity token refresh failed: HTTP ${response.status}${text ? ` - ${text}` : ''}`);
    }

    const payload = await response.json() as {
      access_token?: string;
      expires_in?: number;
    };

    if (!payload.access_token) {
      throw new AuthError('Antigravity token refresh missing access_token');
    }

    const expiresAt = typeof payload.expires_in === 'number' && Number.isFinite(payload.expires_in)
      ? new Date(Date.now() + payload.expires_in * 1000)
      : undefined;

    return {
      accessToken: payload.access_token,
      expiresAt,
      clientId: resolvedClientId,
    };
  }

  private toDate(value: unknown): Date | undefined {
    if (!value) return undefined;
    if (value instanceof Date) {
      return Number.isNaN(value.getTime()) ? undefined : value;
    }

    if (typeof value === 'number' && Number.isFinite(value)) {
      const timestamp = value > 1e12 ? value : value * 1000;
      const date = new Date(timestamp);
      return Number.isNaN(date.getTime()) ? undefined : date;
    }

    if (typeof value === 'string') {
      const trimmed = value.trim();
      if (!trimmed) return undefined;
      const numeric = Number(trimmed);
      if (!Number.isNaN(numeric)) {
        return this.toDate(numeric);
      }
      const parsed = new Date(trimmed);
      return Number.isNaN(parsed.getTime()) ? undefined : parsed;
    }

    return undefined;
  }
}

export const antigravityAdapter = new AntigravityAdapter();
