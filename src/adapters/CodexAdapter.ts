// Codex provider adapter implementation
import { IProviderAdapter, ValidationResult } from './interface';
import { 
  UsageProvider, 
  AuthType, 
  Credential, 
  UsageSnapshot, 
  ProviderMeta,
  ProgressItem,
  ProviderCostSnapshot,
  Identity
} from '../types';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { roundPercentage } from './utils';

interface CodexAuthJson {
  tokens?: {
    access_token: string;
    refresh_token: string;
    id_token?: string;
    account_id?: string;
  };
  last_refresh?: string;
}

interface CodexRateLimitWindow {
  used_percent: number;
  reset_at: number;
  limit_window_seconds: number;
  reset_after_seconds?: number;
}

interface CodexRateLimit {
  allowed?: boolean;
  limit_reached?: boolean;
  primary_window?: CodexRateLimitWindow;
  secondary_window?: CodexRateLimitWindow | null;
}

interface CodexAdditionalRateLimit {
  limit_name?: string;
  metered_feature?: string;
  rate_limit?: CodexRateLimit;
}

interface CodexCredits {
  has_credits: boolean;
  unlimited: boolean;
  balance?: number | string | null;
  approx_local_messages?: number[];
  approx_cloud_messages?: number[];
}

interface CodexOAuthUsageResponse {
  user_id?: string;
  account_id?: string;
  email?: string;
  plan_type?: string;
  rate_limit?: CodexRateLimit;
  code_review_rate_limit?: CodexRateLimit;
  additional_rate_limits?: CodexAdditionalRateLimit[] | null;
  credits?: CodexCredits | null;
  promo?: unknown;
}

interface CodexWebUsageResponse {
  // Web API response shape
  data?: {
    rate_limit?: CodexRateLimit;
    credits?: CodexCredits;
    subscription?: {
      plan_type?: string;
      account_email?: string;
    };
  };
}

const CODEX_META: ProviderMeta = {
  id: UsageProvider.CODEX,
  name: 'Codex',
  logo: '/providers/codex.svg',
  color: '#10A37F',
  supportedAuthTypes: [AuthType.OAUTH],
  docsUrl: 'https://chatgpt.com/codex',
};

export class CodexAdapter implements IProviderAdapter {
  readonly id = UsageProvider.CODEX;
  readonly meta = CODEX_META;
  
  private readonly oauthUsageURL = 'https://chatgpt.com/backend-api/wham/usage';
  private readonly tokenRefreshURL = 'https://auth.openai.com/oauth/token';
  private readonly webAPIURL = 'https://chatgpt.com/api/organizations';
  private readonly webUsageURL = 'https://chatgpt.com/api/usage';

  private formatWindowDesc(limitWindowSeconds?: number): string {
    if (!Number.isFinite(limitWindowSeconds) || !limitWindowSeconds || limitWindowSeconds <= 0) return '';
    const seconds = Math.round(limitWindowSeconds);

    const units: Array<{ seconds: number; singular: string; plural: string }> = [
      { seconds: 7 * 24 * 60 * 60, singular: 'week', plural: 'weeks' },
      { seconds: 24 * 60 * 60, singular: 'day', plural: 'days' },
      { seconds: 60 * 60, singular: 'hour', plural: 'hours' },
      { seconds: 60, singular: 'minute', plural: 'minutes' },
    ];

    for (const unit of units) {
      if (seconds % unit.seconds === 0) {
        const value = seconds / unit.seconds;
        return `${value} ${value === 1 ? unit.singular : unit.plural}`;
      }
    }

    return `${seconds} seconds`;
  }

  private formatWindowDescription(limitWindowSeconds?: number): string {
    const duration = this.formatWindowDesc(limitWindowSeconds);
    if (!duration) return '';
    return `${duration} window`;
  }

  private toNumber(value: unknown): number | undefined {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'string' && value.trim()) {
      const parsed = Number(value);
      if (Number.isFinite(parsed)) return parsed;
    }
    return undefined;
  }

  private normalizeWindow(window: CodexRateLimitWindow | null | undefined): {
    usedPercent: number;
    windowMinutes?: number;
    resetsAt?: Date;
    desc?: string;
  } | null {
    if (!window) return null;

    const usedPercentRaw = this.toNumber(window.used_percent);
    if (usedPercentRaw === undefined) return null;
    const usedPercent = roundPercentage(Math.max(0, usedPercentRaw));

    const windowSeconds = this.toNumber(window.limit_window_seconds);
    const windowMinutes = windowSeconds && windowSeconds > 0
      ? Math.max(1, Math.round(windowSeconds / 60))
      : undefined;

    let resetsAt: Date | undefined;
    const resetAtSeconds = this.toNumber(window.reset_at);
    if (resetAtSeconds && resetAtSeconds > 0) {
      const resetAtMs = resetAtSeconds > 1_000_000_000_000 ? resetAtSeconds : resetAtSeconds * 1000;
      const fromResetAt = new Date(resetAtMs);
      if (!Number.isNaN(fromResetAt.getTime())) {
        resetsAt = fromResetAt;
      }
    }

    if (!resetsAt) {
      const resetAfterSeconds = this.toNumber(window.reset_after_seconds);
      if (resetAfterSeconds !== undefined) {
        const fromResetAfter = new Date(Date.now() + Math.max(0, resetAfterSeconds) * 1000);
        if (!Number.isNaN(fromResetAfter.getTime())) {
          resetsAt = fromResetAfter;
        }
      }
    }

    return {
      usedPercent,
      windowMinutes,
      resetsAt,
      desc: windowSeconds ? this.formatWindowDescription(windowSeconds) : undefined,
    };
  }

  private classifyWindowType(windowSeconds?: number): 'session' | 'weekly' | 'other' {
    if (!windowSeconds || windowSeconds <= 0) return 'other';
    if (windowSeconds <= 6 * 60 * 60) return 'session';
    if (windowSeconds >= 6 * 24 * 60 * 60) return 'weekly';
    return 'other';
  }

  private pushWindowProgress(
    progress: ProgressItem[],
    name: string,
    window: CodexRateLimitWindow | null | undefined,
    extraDesc?: string,
  ): void {
    const normalized = this.normalizeWindow(window);
    if (!normalized) return;
    const desc = [normalized.desc, extraDesc].filter(Boolean).join(' for ');
    progress.push({
      name,
      desc: desc || undefined,
      usedPercent: normalized.usedPercent,
      remainingPercent: roundPercentage(Math.max(0, 100 - normalized.usedPercent)),
      windowMinutes: normalized.windowMinutes,
      resetsAt: normalized.resetsAt,
    });
  }

  private pushRateLimitWindows(
    progress: ProgressItem[],
    rateLimit: CodexRateLimit | null | undefined,
    labels: { session: string; weekly: string; fallbackPrimary?: string; fallbackSecondary?: string },
    extraDesc?: string,
  ): void {
    if (!rateLimit) return;

    const primaryWindow = rateLimit.primary_window;
    const secondaryWindow = rateLimit.secondary_window || undefined;
    const primarySeconds = this.toNumber(primaryWindow?.limit_window_seconds);
    const secondarySeconds = this.toNumber(secondaryWindow?.limit_window_seconds);
    const primaryType = this.classifyWindowType(primarySeconds);
    const secondaryType = this.classifyWindowType(secondarySeconds);

    if (primaryType === 'session') {
      this.pushWindowProgress(progress, labels.session, primaryWindow, extraDesc);
    } else if (primaryType === 'weekly') {
      this.pushWindowProgress(progress, labels.weekly, primaryWindow, extraDesc);
    } else if (labels.fallbackPrimary) {
      this.pushWindowProgress(progress, labels.fallbackPrimary, primaryWindow, extraDesc);
    }

    if (secondaryType === 'session') {
      this.pushWindowProgress(progress, labels.session, secondaryWindow, extraDesc);
    } else if (secondaryType === 'weekly') {
      this.pushWindowProgress(progress, labels.weekly, secondaryWindow, extraDesc);
    } else if (labels.fallbackSecondary) {
      this.pushWindowProgress(progress, labels.fallbackSecondary, secondaryWindow, extraDesc);
    }
  }

  private sortProgressItems(progress: ProgressItem[]): ProgressItem[] {
    const orderWeight = (name: string): number => {
      const normalized = name.trim().toLowerCase();
      if (normalized === 'session') return 1;
      if (normalized === 'weekly') return 2;
      if (normalized === 'additional session') return 3;
      if (normalized === 'additional weekly') return 4;
      if (normalized === 'code review') return 5;
      return 10;
    };

    return [...progress].sort((a, b) => {
      const diff = orderWeight(a.name) - orderWeight(b.name);
      if (diff !== 0) return diff;
      return a.name.localeCompare(b.name);
    });
  }
  
  async validateCredentials(credentials: Credential): Promise<ValidationResult> {
    try {
      if (credentials.type === AuthType.OAUTH) {
        return this.validateOAuthCredentials(credentials.accessToken);
      }
      
      if (credentials.type === AuthType.COOKIE) {
        return this.validateCookieCredentials(credentials.value);
      }

      return { valid: false, reason: 'Unsupported credential type' };
    } catch (error) {
      return { valid: false, reason: error instanceof Error ? error.message : 'Validation failed' };
    }
  }

  private async validateOAuthCredentials(accessToken: string): Promise<ValidationResult> {
    const response = await fetch(this.oauthUsageURL, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'User-Agent': 'AIMeter',
        'Accept': 'application/json'
      }
    });
    
    if (response.status === 401) return { valid: false, reason: 'Invalid or expired OAuth token' };
    if (response.status === 403) return { valid: false, reason: 'Access denied' };
    if (!response.ok) return { valid: false, reason: `HTTP ${response.status}` };
    
    return { valid: true };
  }

  private async validateCookieCredentials(cookie: string): Promise<ValidationResult> {
    const cookieHeader = this.buildCodexCookieHeader(cookie);
    const response = await fetch(this.webAPIURL, {
      headers: {
        'Cookie': cookieHeader,
        'Accept': 'application/json'
      }
    });
    
    if (response.status === 401 || response.status === 403) {
      return { valid: false, reason: 'Invalid or expired cookie' };
    }
    if (!response.ok) return { valid: false, reason: `HTTP ${response.status}` };
    
    const data = await response.json() as any[];
    if (!data || data.length === 0) return { valid: false, reason: 'No organizations found' };
    
    return { valid: true };
  }

  async fetchAccount(credentials: Credential): Promise<{ email?: string; organization?: string; plan?: string }> {
    if (credentials.type === AuthType.OAUTH) {
      return this.fetchOAuthAccount(credentials.accessToken);
    }
    
    if (credentials.type === AuthType.COOKIE) {
      return this.fetchCookieAccount(credentials.value);
    }

    return {};
  }

  private async fetchOAuthAccount(accessToken: string): Promise<{ email?: string; plan?: string }> {
    try {
      const response = await fetch(this.oauthUsageURL, {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'User-Agent': 'AIMeter',
          'Accept': 'application/json'
        }
      });
      
      if (!response.ok) return {};
      
      const data = await response.json() as CodexOAuthUsageResponse;
      return {
        plan: data.plan_type
      };
    } catch {
      return {};
    }
  }

  private async fetchCookieAccount(cookie: string): Promise<{ email?: string; plan?: string }> {
    try {
      const cookieHeader = this.buildCodexCookieHeader(cookie);
      const response = await fetch(this.webAPIURL, {
        headers: {
          'Cookie': cookieHeader,
          'Accept': 'application/json'
        }
      });
      
      if (!response.ok) return {};
      
      return {};
    } catch {
      return {};
    }
  }

  async fetchUsage(credentials: Credential): Promise<UsageSnapshot> {
    if (credentials.type === AuthType.OAUTH) {
      return this.fetchOAuthUsage(credentials.accessToken);
    }
    
    if (credentials.type === AuthType.COOKIE) {
      return this.fetchCookieUsage(credentials.value);
    }

    throw new Error('Unsupported credential type');
  }

  private async fetchOAuthUsage(accessToken: string): Promise<UsageSnapshot> {
    const response = await fetch(this.oauthUsageURL, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'User-Agent': 'AIMeter',
        'Accept': 'application/json'
      }
    });

    if (response.status === 401) throw new Error('Codex OAuth token expired');
    if (!response.ok) throw new Error(`Codex API error: ${response.status}`);

    const data = await response.json() as CodexOAuthUsageResponse;
    // Debug only: response may include account/usage details; keep commented in normal runs.
    // console.log('Codex API response:', JSON.stringify(data));
    return this.parseOAuthUsage(data);
  }

  private parseOAuthUsage(data: CodexOAuthUsageResponse): UsageSnapshot {
    const progress: ProgressItem[] = [];

    this.pushRateLimitWindows(progress, data.rate_limit, {
      session: 'Session',
      weekly: 'Weekly',
      fallbackPrimary: 'Primary',
      fallbackSecondary: 'Secondary',
    });

    // Additional Session / Weekly (extra model quota)
    if (data.additional_rate_limits && data.additional_rate_limits.length > 0) {
      for (const additional of data.additional_rate_limits) {
        const rawLimitName = typeof additional.limit_name === 'string' ? additional.limit_name.trim() : '';
        const limitName = rawLimitName || (typeof additional.metered_feature === 'string' ? additional.metered_feature.trim() : '');

        this.pushRateLimitWindows(progress, additional.rate_limit, {
          session: 'Additional Session',
          weekly: 'Additional Weekly',
          fallbackPrimary: 'Additional Primary',
          fallbackSecondary: 'Additional Secondary',
        }, limitName || undefined);
      }
    }

    this.pushRateLimitWindows(progress, data.code_review_rate_limit, {
      session: 'Code Review',
      weekly: 'Code Review',
      fallbackPrimary: 'Code Review',
      fallbackSecondary: 'Code Review Secondary',
    });

    // Parse credits (hide when has_credits is false or credits is null)
    let cost: ProviderCostSnapshot | undefined;
    if (data.credits && data.credits.has_credits && !data.credits.unlimited && data.credits.balance !== null && data.credits.balance !== undefined) {
      // Handle balance when it is returned as a string
      const balanceValue = typeof data.credits.balance === 'string' 
        ? parseFloat(data.credits.balance) 
        : data.credits.balance;
      
      if (!isNaN(balanceValue)) {
        cost = {
          used: 0,
          limit: 0,
          remaining: balanceValue,
          currency: 'USD'
        };
      }
    }

    // Parse account identity information
    let identity: Identity | undefined;
    if (data.plan_type) {
      identity = {
        plan: data.plan_type
      };
    }

    return {
      provider: UsageProvider.CODEX,
      progress: this.sortProgressItems(progress),
      cost,
      identity,
      updatedAt: new Date()
    };
  }

  private async fetchCookieUsage(cookie: string): Promise<UsageSnapshot> {
    const cookieHeader = this.buildCodexCookieHeader(cookie);
    // Fetch organization information first
    const orgsResponse = await fetch(this.webAPIURL, {
      headers: {
        'Cookie': cookieHeader,
        'Accept': 'application/json'
      }
    });
    
    if (!orgsResponse.ok) {
      throw new Error(`Failed to fetch organizations: ${orgsResponse.status}`);
    }
    
    const orgs = await orgsResponse.json() as any[];
    if (!orgs || orgs.length === 0) {
      throw new Error('No Codex organizations found');
    }
    
    const orgId = orgs[0].id;

    // Fetch usage data
    const usageURL = `${this.webUsageURL}?organization_id=${orgId}`;
    const usageResponse = await fetch(usageURL, {
      headers: {
        'Cookie': cookieHeader,
        'Accept': 'application/json'
      }
    });

    if (!usageResponse.ok) {
      throw new Error(`Failed to fetch usage: ${usageResponse.status}`);
    }

    const data = await usageResponse.json() as CodexWebUsageResponse;
    // Debug only: response may include account/usage details; keep commented in normal runs.
    // console.log('Codex API response:', JSON.stringify(data));
    return this.parseWebUsage(data, cookieHeader);
  }

  private parseWebUsage(data: CodexWebUsageResponse, cookie: string): UsageSnapshot {
    const progress: ProgressItem[] = [];
    const rateLimit = data?.data?.rate_limit;

    this.pushRateLimitWindows(progress, rateLimit, {
      session: 'Session',
      weekly: 'Weekly',
      fallbackPrimary: 'Primary',
      fallbackSecondary: 'Secondary',
    });

    let cost: ProviderCostSnapshot | undefined;
    if (data?.data?.credits && data.data.credits.has_credits && !data.data.credits.unlimited && data.data.credits.balance !== null && data.data.credits.balance !== undefined) {
      const balanceValue = typeof data.data.credits.balance === 'string' 
        ? parseFloat(data.data.credits.balance) 
        : data.data.credits.balance;
      
      if (!isNaN(balanceValue)) {
        cost = {
          used: 0,
          limit: 0,
          remaining: balanceValue,
          currency: 'USD'
        };
      }
    }

    let identity: Identity | undefined;
    if (data?.data?.subscription?.plan_type) {
      identity = {
        plan: data.data.subscription.plan_type
      };
    }

    return {
      provider: UsageProvider.CODEX,
      progress: this.sortProgressItems(progress),
      cost,
      identity,
      updatedAt: new Date()
    };
  }

  async refreshCredentials(credentials: Credential): Promise<Credential> {
    if (credentials.type !== AuthType.OAUTH || !credentials.refreshToken) {
      throw new Error('Cannot refresh: invalid credential type or missing refresh token');
    }

    const newTokens = await this.refreshToken(credentials.refreshToken, credentials.clientId);
    
    return {
      type: AuthType.OAUTH,
      accessToken: newTokens.accessToken,
      refreshToken: newTokens.refreshToken,
      expiresAt: newTokens.expiresAt,
      scope: credentials.scope
    };
  }

  private async refreshToken(refreshToken: string, clientId?: string): Promise<{
    accessToken: string;
    refreshToken: string;
    expiresAt?: Date;
  }> {
    const resolvedClientId = clientId || 'app_EMoamEEZ73f0CkXaXp7hrann';
    const response = await fetch(this.tokenRefreshURL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id: resolvedClientId,
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
        scope: 'openid profile email'
      })
    });
    
    if (!response.ok) {
      throw new Error('Failed to refresh Codex token');
    }
    
    const data = await response.json();
    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token || refreshToken,
      expiresAt: data.expires_in ? new Date(Date.now() + data.expires_in * 1000) : undefined
    };
  }

  getErrorMessage(error: unknown): string {
    if (error instanceof Response) {
      switch (error.status) {
        case 401: return 'Codex session expired. Please re-authenticate.';
        case 403: return 'Access denied. Please check your Codex subscription.';
        case 429: return 'Too many requests. Please wait and try again.';
        default: return `Codex API error: ${error.status}`;
      }
    }
    if (error instanceof Error) return error.message;
    return 'Failed to fetch Codex usage';
  }

  private buildCodexCookieHeader(raw: string): string {
    const pairs = this.parseCodexCookiePairs(raw);
    if (pairs.length === 0) {
      throw new Error('Invalid cookie format. Paste the full Cookie header from a logged-in chatgpt.com request.');
    }

    const deduped = new Map<string, string>();
    for (const [key, value] of pairs) {
      if (!key || !value) continue;
      deduped.set(key, value);
    }

    return Array.from(deduped.entries()).map(([k, v]) => `${k}=${v}`).join('; ');
  }

  private parseCodexCookiePairs(raw: string): Array<[string, string]> {
    const text = raw.trim().replace(/^"(.*)"$/, '$1').replace(/^cookie:\s*/i, '');
    if (!text) return [];

    const attributeNames = new Set([
      'path',
      'expires',
      'max-age',
      'domain',
      'samesite',
      'secure',
      'httponly',
      'priority',
      'partitioned',
    ]);

    const parts = text.split(';').map(p => p.trim()).filter(Boolean);
    const pairs: Array<[string, string]> = [];
    for (const part of parts) {
      const idx = part.indexOf('=');
      if (idx <= 0) continue;
      const key = part.slice(0, idx).trim();
      const value = part.slice(idx + 1).trim().replace(/^"(.*)"$/, '$1');
      if (!key || !value) continue;
      if (attributeNames.has(key.toLowerCase())) continue;
      pairs.push([key, value]);
    }
    return pairs;
  }
}

export const codexAdapter = new CodexAdapter();
