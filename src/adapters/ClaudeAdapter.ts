// Claude provider adapter implementation
import { IProviderAdapter, ValidationResult } from './interface.js';
import {
  UsageProvider,
  AuthType,
  Credential,
  UsageSnapshot,
  ProviderMeta,
  ProgressItem,
  ProviderCostSnapshot,
  ProviderConfig,
} from '../types/index.js';
import { fetchWithTimeout, roundPercentage } from './utils.js';

interface ClaudeOrganization {
  uuid: string;
  name: string;
  capabilities?: string[];
  rateLimitTier?: string;
  rate_limit_tier?: string;
  billingType?: string;
  billing_type?: string;
}

interface ClaudeMembership {
  organization: ClaudeOrganization;
}

interface ClaudeAccountResponse {
  emailAddress?: string;
  email_address?: string;
  memberships?: ClaudeMembership[];
}

interface ClaudeUsageResponse {
  five_hour?: {
    utilization?: number;
    used?: number;
    limit?: number;
    resets_at?: string;
  };
  seven_day?: {
    utilization?: number;
    used?: number;
    limit?: number;
    resets_at?: string;
  };
  seven_day_opus?: {
    utilization?: number;
    used?: number;
    limit?: number;
    resets_at?: string;
  };
  seven_day_sonnet?: {
    utilization?: number;
    used?: number;
    limit?: number;
    resets_at?: string;
  };
  limits?: {
    id: string;
    name: string;
    limit: number;
    used: number;
    reset_at: string;
  }[];
}

interface ClaudeOverageResponse {
  isEnabled?: boolean;
  is_enabled?: boolean;
  monthlyCreditLimit?: number;
  monthly_credit_limit?: number;
  usedCredits?: number;
  used_credits?: number;
  currency?: string;
}

interface OAuthUsageWindow {
  utilization?: number;
  resets_at?: string;
}

interface OAuthUsageResponse {
  five_hour?: OAuthUsageWindow;
  seven_day?: OAuthUsageWindow;
  seven_day_oauth_apps?: OAuthUsageWindow;
  seven_day_opus?: OAuthUsageWindow;
  seven_day_sonnet?: OAuthUsageWindow;
  extra_usage?: {
    is_enabled?: boolean;
    monthly_limit?: number;
    used_credits?: number;
    used?: number;
    limit?: number;
    currency?: string;
  };
}

interface OAuthRefreshResponse {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  scope?: string;
}

const CLAUDE_META: ProviderMeta = {
  id: UsageProvider.CLAUDE,
  name: 'Claude',
  logo: '/providers/claude.svg',
  color: '#D97757',
  supportedAuthTypes: [AuthType.COOKIE, AuthType.OAUTH],
  docsUrl: 'https://docs.anthropic.com/en/docs/claude-web',
};

export class ClaudeAdapter implements IProviderAdapter {
  readonly id = UsageProvider.CLAUDE;
  readonly meta = CLAUDE_META;

  private readonly baseURL = 'https://claude.ai/api';
  private readonly oauthUsageURL = 'https://api.anthropic.com/api/oauth/usage';
  private readonly oauthTokenRefreshURL = 'https://platform.claude.com/v1/oauth/token';
  private readonly oauthProfileURL = 'https://api.anthropic.com/api/oauth/profile';

  private buildClaudeWebHeaders(cookieHeader: string): Record<string, string> {
    return {
      Cookie: cookieHeader,
      Accept: 'application/json, text/plain, */*',
      'Accept-Language': 'en-US,en;q=0.9',
      Origin: 'https://claude.ai',
      Referer: 'https://claude.ai/',
      'User-Agent':
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    };
  }

  async validateCredentials(credentials: Credential): Promise<ValidationResult> {
    try {
      if (credentials.type === AuthType.OAUTH) {
        await this.fetchOAuthUsageWithRefresh(credentials);
        return { valid: true };
      }

      if (credentials.type === AuthType.COOKIE) {
        const cookieHeader = this.buildClaudeCookieHeader(credentials.value);
        const response = await fetchWithTimeout(`${this.baseURL}/organizations`, {
          headers: this.buildClaudeWebHeaders(cookieHeader),
        });
        if (response.status === 401 || response.status === 403) {
          return {
            valid: false,
            reason: `Invalid or expired cookie (HTTP ${response.status}). Please re-copy claude.ai sessionKey.`,
          };
        }
        if (!response.ok) return { valid: false, reason: `HTTP ${response.status}` };

        const orgs = (await response.json()) as Array<{ uuid?: string }>;
        if (!orgs || orgs.length === 0) return { valid: false, reason: 'No organizations found' };
        return { valid: true };
      }

      return { valid: false, reason: 'Unsupported credential type' };
    } catch (error) {
      return { valid: false, reason: error instanceof Error ? error.message : 'Validation failed' };
    }
  }

  async fetchAccount(credentials: Credential): Promise<{ plan?: string }> {
    if (credentials.type === AuthType.COOKIE) {
      try {
        const cookieHeader = this.buildClaudeCookieHeader(credentials.value);
        const account = await this.fetchWebAccountInfo(cookieHeader);
        return {
          plan: account.memberships?.[0] ? this.inferPlan(account.memberships[0].organization) : undefined,
        };
      } catch {
        return {};
      }
    }
    if (credentials.type === AuthType.OAUTH && credentials.accessToken) {
      try {
        const profile = await this.fetchOAuthProfile(credentials.accessToken);
        return { plan: profile.accountType };
      } catch {
        return {};
      }
    }
    return {};
  }

  async fetchUsage(credentials: Credential, config?: ProviderConfig): Promise<UsageSnapshot> {
    const mode = config?.provider === UsageProvider.CLAUDE ? config.claudeAuthMode : undefined;

    if (mode === 'oauth') {
      const oauth = this.requireOAuthCredential(credentials);
      return this.fetchOAuthUsageWithRefresh(oauth, config);
    }

    if (mode === 'cookie') {
      if (credentials.type !== AuthType.COOKIE) {
        throw new Error('Claude auth mode is Cookie, but stored credential type is not Cookie');
      }
      return this.fetchCookieUsage(credentials.value);
    }

    if (credentials.type === AuthType.OAUTH) {
      return this.fetchOAuthUsageWithRefresh(credentials, config);
    }
    if (credentials.type === AuthType.COOKIE) {
      return this.fetchCookieUsage(credentials.value);
    }

    throw new Error('Unsupported credential type');
  }

  private requireOAuthCredential(credentials: Credential): Extract<Credential, { type: AuthType.OAUTH }> {
    if (credentials.type !== AuthType.OAUTH) {
      throw new Error('Claude auth mode is OAuth, but stored credential type is not OAuth');
    }
    if (!credentials.accessToken?.trim()) {
      throw new Error('Claude OAuth access token is missing');
    }
    return credentials;
  }

  private async fetchOAuthUsageWithRefresh(
    credentials: Extract<Credential, { type: AuthType.OAUTH }>,
    config?: ProviderConfig
  ): Promise<UsageSnapshot> {
    // Proactively refresh token if expiring soon (< max(refreshInterval, 5) minutes)
    if (this.isTokenExpiringSoon(credentials, config?.refreshInterval) && this.hasRefreshBundle(credentials)) {
      try {
        const refreshed = await this.refreshOAuthAccessToken(credentials);
        credentials.accessToken = refreshed.accessToken;
        credentials.refreshToken = refreshed.refreshToken;
        credentials.expiresAt = refreshed.expiresAt;
      } catch {
        // Proactive refresh failed, continue with existing token
      }
    }

    try {
      const data = await this.fetchOAuthUsage(credentials.accessToken);
      return this.parseOAuthUsage(data, config?.attrs?.plan as string | undefined);
    } catch (error) {
      if (!this.isOAuthAuthError(error)) {
        throw error;
      }

      if (!this.hasRefreshBundle(credentials)) {
        throw new Error(
          'Claude OAuth token is invalid/expired and refresh credentials are missing (refreshToken, clientId)',
        );
      }

      const refreshed = await this.refreshOAuthAccessToken(credentials);
      credentials.accessToken = refreshed.accessToken;
      credentials.refreshToken = refreshed.refreshToken;
      credentials.expiresAt = refreshed.expiresAt;

      const retryData = await this.fetchOAuthUsage(credentials.accessToken);
      return this.parseOAuthUsage(retryData, config?.attrs?.plan as string | undefined);
    }
  }

  private isTokenExpiringSoon(credentials: Extract<Credential, { type: AuthType.OAUTH }>, refreshIntervalMinutes: number = 5): boolean {
    if (!credentials.expiresAt) return false;
    const thresholdMs = Math.max(refreshIntervalMinutes, 5) * 60 * 1000;
    const expiresAtMs = credentials.expiresAt instanceof Date
      ? credentials.expiresAt.getTime()
      : new Date(credentials.expiresAt as string).getTime();
    if (Number.isNaN(expiresAtMs)) return false;
    return (expiresAtMs - Date.now()) < thresholdMs;
  }

  private async fetchOAuthUsage(accessToken: string): Promise<OAuthUsageResponse> {
    const response = await fetchWithTimeout(this.oauthUsageURL, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: 'application/json',
        'anthropic-beta': 'oauth-2025-04-20',
        'User-Agent': 'AIMeter',
      },
    });

    if (response.status === 401) throw new Error('Claude OAuth token expired');
    if (response.status === 403) {
      const body = await response.text();
      if (body.toLowerCase().includes('user:profile')) {
        throw new Error('Claude OAuth token missing user:profile scope');
      }
      throw new Error('Claude OAuth access denied');
    }
    if (!response.ok) throw new Error(`Claude OAuth error: ${response.status}`);

    const data = (await response.json()) as OAuthUsageResponse;
    // Debug only: response may include account/usage details; keep commented in normal runs.
    // console.log('Claude API response (oauth-usage):', JSON.stringify(data));
    return data;
  }

  private parseOAuthUsage(data: OAuthUsageResponse, plan?: string): UsageSnapshot {
    const progress: ProgressItem[] = [];
    const accountType = (plan || '').toLowerCase();
    const isMax = accountType.includes('max') || accountType.includes('enterprise');

    const pushWindow = (
      name: string,
      sourceKey: 'five_hour' | 'seven_day' | 'seven_day_oauth_apps' | 'seven_day_sonnet',
      window: OAuthUsageWindow | undefined,
      minutes: number
    ) => {
      if (typeof window?.utilization !== 'number') return;
      const windowDesc = sourceKey === 'five_hour' ? '5 hours window' : '7 days window';
      progress.push({
        name,
        desc: windowDesc,
        usedPercent: this.normalizePercent(this.utilizationToPercent(window.utilization)),
        windowMinutes: minutes,
        resetsAt: this.parseDate(window.resets_at),
      });
    };

    pushWindow('Session', 'five_hour', data.five_hour, 300);
    if (data.seven_day) {
      pushWindow('Weekly', 'seven_day', data.seven_day, 10080);
    } else {
      pushWindow('Weekly', 'seven_day_oauth_apps', data.seven_day_oauth_apps ?? undefined, 10080);
    }

    // For Max/Enterprise accounts, also show Sonnet/Opus dedicated window
    if (isMax && data.seven_day_sonnet) {
      pushWindow('Weekly Sonnet', 'seven_day_sonnet', data.seven_day_sonnet, 10080);
    } else if (!isMax && !plan && data.seven_day_sonnet) {
      // Unknown account type: show all available windows
      pushWindow('Weekly Sonnet', 'seven_day_sonnet', data.seven_day_sonnet, 10080);
    }

    let cost: ProviderCostSnapshot | undefined;
    const oauthExtraUsed = data.extra_usage?.used_credits ?? data.extra_usage?.used;
    const oauthExtraLimit = data.extra_usage?.monthly_limit ?? data.extra_usage?.limit;
    if (data.extra_usage?.is_enabled && typeof oauthExtraUsed === 'number' && typeof oauthExtraLimit === 'number') {
      cost = this.normalizeCostFromMinorUnits({
        usedMinor: oauthExtraUsed,
        limitMinor: oauthExtraLimit,
        currency: data.extra_usage.currency,
      });
    }

    return {
      provider: UsageProvider.CLAUDE,
      progress,
      cost,
      updatedAt: new Date(),
    };
  }

  private async refreshOAuthAccessToken(
    credentials: Extract<Credential, { type: AuthType.OAUTH }>,
  ): Promise<{ accessToken: string; refreshToken?: string; expiresAt?: Date }> {
    const response = await fetchWithTimeout(this.oauthTokenRefreshURL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/json',
      },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: credentials.refreshToken || '',
        client_id: credentials.clientId || '',
      }).toString(),
    });

    if (!response.ok) {
      const body = await response.text().catch(() => '');
      if (response.status === 400 || response.status === 401) {
        let parsed: Record<string, unknown> = {};
        try { parsed = JSON.parse(body) as Record<string, unknown>; } catch { /* ignore */ }
        const errCode = typeof parsed.error === 'string' ? parsed.error : '';
        if (errCode === 'invalid_client' || errCode === 'invalid_grant' || errCode === 'unauthorized_client') {
          throw new Error(`Claude OAuth auth invalid: ${errCode}`);
        }
      }
      throw new Error(`Claude OAuth refresh failed: ${response.status}`);
    }

    const payload = (await response.json()) as OAuthRefreshResponse;
    if (!payload.access_token) {
      throw new Error('Claude OAuth refresh response did not include access_token');
    }

    return {
      accessToken: payload.access_token,
      refreshToken: payload.refresh_token || credentials.refreshToken,
      expiresAt: typeof payload.expires_in === 'number'
        ? new Date(Date.now() + payload.expires_in * 1000)
        : undefined,
    };
  }

  private hasRefreshBundle(credentials: Extract<Credential, { type: AuthType.OAUTH }>): boolean {
    return Boolean(credentials.refreshToken && credentials.clientId);
  }

  private isOAuthAuthError(error: unknown): boolean {
    if (!(error instanceof Error)) return false;
    const lower = error.message.toLowerCase();
    return lower.includes('token expired') || lower.includes('access denied') || lower.includes('oauth error: 401');
  }

  private async fetchCookieUsage(cookie: string): Promise<UsageSnapshot> {
    const cookieHeader = this.buildClaudeCookieHeader(cookie);
    const orgsResponse = await fetchWithTimeout(`${this.baseURL}/organizations`, {
      headers: this.buildClaudeWebHeaders(cookieHeader),
    });

    if (!orgsResponse.ok) throw new Error(`Failed to fetch orgs: ${orgsResponse.status}`);
    const orgs = (await orgsResponse.json()) as ClaudeOrganization[];
    if (!orgs.length) throw new Error('No Claude organizations found');

    const org = this.selectOrganization(orgs);
    const orgId = org.uuid;

    const [accountData, usageData, overageData] = await Promise.all([
      this.fetchWebAccountInfo(cookieHeader).catch(() => null),
      this.fetchWebUsageData(cookieHeader, orgId),
      this.fetchWebOverageData(cookieHeader, orgId).catch(() => null),
    ]);

    const progress = this.parseWebUsage(usageData);

    const inferredPlan = accountData?.memberships?.[0]
      ? this.inferPlan(accountData.memberships[0].organization)
      : this.inferPlan(org);

    const cost = overageData ? this.parseOverageAmount(overageData, inferredPlan) : undefined;

    let identity;
    if (accountData) {
      identity = {
        plan: inferredPlan,
      };
    }

    return {
      provider: UsageProvider.CLAUDE,
      progress,
      cost,
      identity,
      updatedAt: new Date(),
    };
  }

  private selectOrganization(orgs: ClaudeOrganization[]): ClaudeOrganization {
    const hasChat = orgs.find((org) => Array.isArray(org.capabilities) && org.capabilities.includes('chat'));
    if (hasChat) return hasChat;
    return orgs[0];
  }

  private async fetchWebAccountInfo(cookie: string): Promise<ClaudeAccountResponse> {
    const response = await fetchWithTimeout(`${this.baseURL}/account`, {
      headers: this.buildClaudeWebHeaders(cookie),
    });
    if (!response.ok) throw new Error('Failed to fetch account info');
    return response.json();
  }

  private async fetchWebUsageData(cookie: string, orgId: string): Promise<ClaudeUsageResponse> {
    const response = await fetchWithTimeout(`${this.baseURL}/organizations/${orgId}/usage`, {
      headers: this.buildClaudeWebHeaders(cookie),
    });
    if (!response.ok) throw new Error('Failed to fetch usage data');
    const data = (await response.json()) as ClaudeUsageResponse;
    // Debug only: response may include account/usage details; keep commented in normal runs.
    // console.log('Claude API response (web-usage):', JSON.stringify(data));
    return data;
  }

  private async fetchWebOverageData(cookie: string, orgId: string): Promise<ClaudeOverageResponse> {
    const response = await fetchWithTimeout(`${this.baseURL}/organizations/${orgId}/overage_spend_limit`, {
      headers: this.buildClaudeWebHeaders(cookie),
    });
    if (!response.ok) throw new Error('Failed to fetch overage data');
    return response.json();
  }

  private parseWebUsage(data: ClaudeUsageResponse): ProgressItem[] {
    const limits = data.limits || [];
    if (limits.length > 0) {
      const sessionLimit = limits.find((l) => l.id === 'chat_usage_limit' || l.id === 'session_limit');
      const weeklyLimit = limits.find((l) => l.id === 'weekly_usage_limit');
      const progress: ProgressItem[] = [];

      if (sessionLimit && sessionLimit.limit > 0) {
        progress.push({
          name: 'Session',
          usedPercent: this.normalizePercent((sessionLimit.used / sessionLimit.limit) * 100),
          used: sessionLimit.used,
          limit: sessionLimit.limit,
          windowMinutes: 300,
          resetsAt: this.parseDate(sessionLimit.reset_at),
        });
      }

      if (weeklyLimit && weeklyLimit.limit > 0) {
        progress.push({
          name: 'Weekly',
          usedPercent: this.normalizePercent((weeklyLimit.used / weeklyLimit.limit) * 100),
          used: weeklyLimit.used,
          limit: weeklyLimit.limit,
          windowMinutes: 10080,
          resetsAt: this.parseDate(weeklyLimit.reset_at),
        });
      }

      return progress;
    }

    const progress: ProgressItem[] = [];

    const makePercent = (window?: { utilization?: number; used?: number; limit?: number }): number | null => {
      if (!window) return null;
      if (typeof window.utilization === 'number') return this.normalizePercent(this.utilizationToPercent(window.utilization));
      if (typeof window.used === 'number' && typeof window.limit === 'number' && window.limit > 0) {
        return this.normalizePercent((window.used / window.limit) * 100);
      }
      return null;
    };

    const sessionPercent = makePercent(data.five_hour);
    if (sessionPercent !== null) {
      progress.push({
        name: 'Session',
        usedPercent: sessionPercent,
        used: data.five_hour?.used,
        limit: data.five_hour?.limit,
        windowMinutes: 300,
        resetsAt: this.parseDate(data.five_hour?.resets_at),
      });
    }

    const weekData = data.seven_day;
    const weeklyPercent = makePercent(weekData);
    if (weeklyPercent !== null) {
      progress.push({
        name: 'Weekly',
        usedPercent: weeklyPercent,
        used: weekData?.used,
        limit: weekData?.limit,
        windowMinutes: 10080,
        resetsAt: this.parseDate(weekData?.resets_at),
      });
    }

    return progress;
  }

  private inferPlan(org: ClaudeOrganization): string | undefined {
    const tier = (org.rateLimitTier || org.rate_limit_tier || '').toLowerCase();
    const billing = (org.billingType || org.billing_type || '').toLowerCase();
    if (tier.includes('max')) return 'Claude Max';
    if (tier.includes('pro')) return 'Claude Pro';
    if (tier.includes('team')) return 'Claude Team';
    if (tier.includes('enterprise')) return 'Claude Enterprise';
    if (billing.includes('stripe') && tier.includes('claude')) return 'Claude Pro';
    return undefined;
  }

  private parseOverageAmount(overageData: ClaudeOverageResponse, plan?: string): ProviderCostSnapshot | undefined {
    const enabled = overageData.isEnabled ?? overageData.is_enabled;
    const usedCredits = overageData.usedCredits ?? overageData.used_credits;
    const monthlyLimit = overageData.monthlyCreditLimit ?? overageData.monthly_credit_limit;
    if (!enabled || usedCredits === undefined || monthlyLimit === undefined) {
      return undefined;
    }

    return this.normalizeCostFromMinorUnits({
      usedMinor: usedCredits,
      limitMinor: monthlyLimit,
      currency: overageData.currency,
      plan,
    });
  }

  private normalizeCostFromMinorUnits(input: {
    usedMinor: number;
    limitMinor: number;
    currency?: string;
    plan?: string;
  }): ProviderCostSnapshot {
    let used = input.usedMinor / 100;
    let limit = input.limitMinor / 100;
    const normalizedPlan = (input.plan || '').toLowerCase();
    const shouldRescale = !normalizedPlan.includes('enterprise') && limit >= 1000;
    if (shouldRescale) {
      used /= 100;
      limit /= 100;
    }

    return {
      used,
      limit,
      remaining: limit - used,
      currency: input.currency || 'USD',
      period: 'Monthly',
    };
  }

  private async fetchOAuthProfile(accessToken: string): Promise<{ accountType?: string }> {
    const response = await fetchWithTimeout(this.oauthProfileURL, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: 'application/json',
        'anthropic-beta': 'oauth-2025-04-20',
        'User-Agent': 'AIMeter',
      },
    });
    if (!response.ok) return {};
    const data = (await response.json()) as Record<string, unknown>;
    // Profile response may have account_type or subscription fields
    const accountType = typeof data.account_type === 'string'
      ? data.account_type
      : (typeof data.subscription_type === 'string' ? data.subscription_type : undefined);
    return { accountType };
  }

  private normalizePercent(value: number): number {
    return roundPercentage(Math.max(0, value));
  }

  private utilizationToPercent(utilization: number): number {
    // Claude upstream may return utilization as either ratio (0-1) or percentage (0-100).
    return utilization <= 1 ? utilization * 100 : utilization;
  }

  private parseDate(value?: string): Date | undefined {
    if (!value) return undefined;
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? undefined : date;
  }

  private buildClaudeCookieHeader(raw: string): string {
    const pairs = this.parseClaudeCookiePairs(raw);
    const sessionKey = this.extractClaudeSessionKeyFromPairs(pairs);
    if (!sessionKey) {
      throw new Error('Invalid Claude cookie format. Please paste sessionKey or sk-ant-* token.');
    }
    const deduped = new Map<string, string>();
    deduped.set('sessionKey', sessionKey);
    for (const [key, value] of pairs) {
      if (!key || !value) continue;
      if (key.toLowerCase() === 'sessionkey') continue;
      deduped.set(key, value);
    }
    return Array.from(deduped.entries())
      .map(([k, v]) => `${k}=${v}`)
      .join('; ');
  }

  private parseClaudeCookiePairs(raw: string): Array<[string, string]> {
    const text = raw.trim().replace(/^"(.*)"$/, '$1').replace(/^cookie:\s*/i, '');
    if (!text) return [];

    if (text.startsWith('sk-ant-')) {
      return [['sessionKey', text]];
    }

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

    const parts = text
      .split(';')
      .map((p) => p.trim())
      .filter(Boolean);
    const pairs: Array<[string, string]> = [];
    for (const part of parts) {
      const idx = part.indexOf('=');
      if (idx <= 0) continue;
      const key = part.slice(0, idx).trim();
      const value = part.slice(idx + 1).trim().replace(/^"(.*)"$/, '$1');
      if (!value) continue;
      if (attributeNames.has(key.toLowerCase())) continue;
      pairs.push([key, value]);
    }

    return pairs;
  }

  private extractClaudeSessionKeyFromPairs(pairs: Array<[string, string]>): string | null {
    for (const [key, value] of pairs) {
      if (key.toLowerCase() === 'sessionkey' && value.startsWith('sk-ant-')) {
        return value;
      }
    }
    return null;
  }

  getErrorMessage(error: unknown): string {
    if (error instanceof Response) {
      switch (error.status) {
        case 401:
          return 'Claude session expired. Please re-authenticate.';
        case 403:
          return 'Access denied. Please check your Claude subscription.';
        case 429:
          return 'Too many requests. Please wait and try again.';
        default:
          return `Claude API error: ${error.status}`;
      }
    }
    if (error instanceof Error) return error.message;
    return 'Failed to fetch Claude usage';
  }
}

export const claudeAdapter = new ClaudeAdapter();
