import { IProviderAdapter, ValidationResult } from './interface.js';
import {
  UsageProvider,
  AuthType,
  Credential,
  UsageSnapshot,
  ProviderMeta,
  ProgressItem,
  ProviderConfig,
} from '../types/index.js';
import { fetchWithTimeout, roundPercentage } from './utils.js';

/**
 * CommandCode usage adapter.
 *
 * CommandCode's `/alpha/*` routes require the CLI session key — the value the official
 * `command-code` CLI stores in `~/.commandcode/auth.json` -> `apiKey` — and NOT a provider
 * API key. The key looks like `user_…`.
 *
 * The routes accept a flat object or the same object wrapped once in `data`; the official
 * CLI transport unwraps it itself, so both shapes are handled here rather than guessed.
 *
 * Endpoints (all GET):
 *   /alpha/whoami?limits=1             -> user + org identity
 *   /alpha/billing/credits?orgId=…     -> windowLimits {fiveHour, weekly} + monthlyCredits
 *   /alpha/billing/subscriptions?orgId=… -> planId, currentPeriodEnd
 *   /alpha/usage/summary?orgId=…       -> totalCount, totalCredits (spend), tokens
 *
 * The monthly figure needs BOTH numbers to produce a percentage: `monthlyCredits` is what
 * is LEFT, `usage/summary.totalCredits` is what was SPENT in the period. Neither alone
 * yields a percentage, and inventing one from the nominal plan credits would be a
 * fabrication — so when the spend is unavailable the window is reported without a percent.
 */

interface CcWindow {
  used?: number | string;
  cap?: number | string;
  resetAt?: number | string;
}

interface CcCreditsRoot {
  monthlyCredits?: number | string;
  planId?: string;
  fiveHour?: CcWindow;
  weekly?: CcWindow;
  windowLimits?: { fiveHour?: CcWindow; weekly?: CcWindow };
}

interface CcSubscription {
  planId?: string;
  currentPeriodEnd?: number | string;
}

interface CcUsageSummary {
  totalCount?: number | string;
  totalCredits?: number | string;
  totalTokensIn?: number | string;
  totalTokensOut?: number | string;
  successRate?: number | string;
}

interface CcWhoami {
  user?: { name?: string; userName?: string; email?: string };
  org?: { id?: string; name?: string };
}

// planId -> display name. Kept in the adapter (not the type registry) because these are
// plan tiers, not providers, and they change independently of the provider list.
const CC_PLANS: Record<string, string> = {
  'individual-go': 'Go',
  'individual-goat': 'GOAT',
  'individual-pro': 'Pro',
  'individual-pro-v1': 'Pro',
  'individual-provider': 'Provider',
  'individual-max': 'Max',
  'individual-ultra': 'Ultra',
  'teams-pro': 'Teams Pro',
};

const CC_META: ProviderMeta = {
  id: UsageProvider.COMMANDCODE,
  name: 'CommandCode',
  logo: '/providers/commandcode.svg',
  color: '#111827',
  supportedAuthTypes: [AuthType.API_KEY],
  docsUrl: 'https://commandcode.ai',
};

export class CommandCodeAdapter implements IProviderAdapter {
  readonly id = UsageProvider.COMMANDCODE;
  readonly meta = CC_META;

  // The CLI version header is not decorative: the /alpha routes gate on it. Pinned rather
  // than user-supplied so a config cannot silently send a version the API rejects.
  private readonly cliVersion = '1.54.2';
  private readonly apiBase = 'https://api.commandcode.ai';

  async validateCredentials(credentials: Credential, _config?: ProviderConfig): Promise<ValidationResult> {
    try {
      const apiKey = this.extractApiKey(credentials);
      if (!apiKey) {
        return { valid: false, reason: 'No CLI session key provided' };
      }

      const response = await fetchWithTimeout(`${this.apiBase}/alpha/whoami?limits=1`, {
        method: 'GET',
        headers: this.buildHeaders(apiKey),
      });

      if (response.status === 401 || response.status === 403) {
        return { valid: false, reason: 'Invalid or revoked CommandCode session key' };
      }
      if (response.status === 404) {
        return { valid: false, reason: 'This CommandCode plan does not include API access' };
      }
      if (!response.ok) {
        return { valid: false, reason: `HTTP ${response.status}` };
      }
      return { valid: true };
    } catch (error) {
      return { valid: false, reason: error instanceof Error ? error.message : 'Validation failed' };
    }
  }

  async fetchAccount(credentials: Credential): Promise<{ email?: string; organization?: string; plan?: string }> {
    const apiKey = this.extractApiKey(credentials);
    if (!apiKey) {
      throw new Error('No CLI session key provided');
    }

    const response = await fetchWithTimeout(`${this.apiBase}/alpha/whoami?limits=1`, {
      method: 'GET',
      headers: this.buildHeaders(apiKey),
    });
    if (!response.ok) {
      throw new Error(`CommandCode whoami error: HTTP ${response.status}`);
    }

    const payload = await response.json().catch(() => null) as CcWhoami | null;
    const user = this.unwrap<CcWhoami['user']>(payload, 'user') || {};
    const org = this.unwrap<CcWhoami['org']>(payload, 'org') || {};

    return {
      email: user.email || user.userName || user.name,
      organization: org.name || org.id,
    };
  }

  async fetchUsage(credentials: Credential, _config?: ProviderConfig): Promise<UsageSnapshot> {
    const apiKey = this.extractApiKey(credentials);
    if (!apiKey) {
      throw new Error('No CLI session key provided');
    }

    const headers = this.buildHeaders(apiKey);
    const whoami = await this.getJson<CcWhoami>(`${this.apiBase}/alpha/whoami?limits=1`, headers);
    const orgId = this.unwrap<CcWhoami['org']>(whoami, 'org')?.id;
    const query = orgId ? `?orgId=${encodeURIComponent(orgId)}` : '';

    const credits = await this.getJson<CcCreditsRoot>(`${this.apiBase}/alpha/billing/credits${query}`, headers)
      .catch(() => null);
    const subscription = await this.getJson<CcSubscription>(`${this.apiBase}/alpha/billing/subscriptions${query}`, headers)
      .catch(() => null);
    // The spend is the only source of a monthly denominator; its absence degrades the
    // monthly card to a countdown-only row rather than failing the whole provider.
    const usage = await this.getJson<CcUsageSummary>(`${this.apiBase}/alpha/usage/summary${query}`, headers)
      .catch(() => null);

    if (!credits && !subscription) {
      throw new Error('CommandCode returned no billing data');
    }

    const creditRoot = this.unwrap<CcCreditsRoot>(credits) || {};
    const creditData = this.unwrap<CcCreditsRoot>(credits, 'credits') || {};
    const windows = this.unwrap<NonNullable<CcCreditsRoot['windowLimits']>>(credits, 'windowLimits') || {};
    const subData = this.unwrap<CcSubscription>(subscription) || {};

    const progress: ProgressItem[] = [];

    for (const [name, window, minutes] of [
      ['5 h', windows.fiveHour || creditRoot.fiveHour, 5 * 60],
      ['Week', windows.weekly || creditRoot.weekly, 7 * 24 * 60],
    ] as Array<[string, CcWindow | undefined, number]>) {
      if (!window || typeof window !== 'object') {
        continue;
      }
      const used = this.toNumber(window.used);
      const cap = this.toNumber(window.cap);
      if (used === undefined && cap === undefined) {
        continue;
      }
      // ProgressItem.usedPercent is required, so a window with no computable cap is
      // skipped rather than emitted with a fabricated 0 — a 0 here reads as "nothing
      // used", which is the opposite of "unknown".
      if (used === undefined || !cap) {
        continue;
      }
      const usedPercent = Math.min(100, (used / cap) * 100);
      progress.push({
        name,
        usedPercent: roundPercentage(usedPercent),
        used,
        limit: cap,
        remainingPercent: this.toRemainingPercent(usedPercent),
        windowMinutes: minutes,
        resetsAt: this.toDate(window.resetAt),
      });
    }

    const remainingCredits = this.toNumber(creditData.monthlyCredits) ?? this.toNumber(creditRoot.monthlyCredits);
    const spent = this.toNumber(this.unwrap<CcUsageSummary>(usage)?.totalCredits);
    const periodEnd = this.toDate(subData.currentPeriodEnd);

    // The monthly percentage needs BOTH the spend and the remaining allowance. With only
    // one of them there is no denominator, and ProgressItem can express no percentage-free
    // row, so the monthly window is omitted instead of being shown as 0% used.
    if (remainingCredits !== undefined && spent !== undefined) {
      const cap = spent + remainingCredits;
      if (cap > 0) {
        const usedPercent = Math.min(100, (spent / cap) * 100);
        progress.push({
          name: 'Month',
          usedPercent: roundPercentage(usedPercent),
          used: spent,
          limit: cap,
          remainingPercent: this.toRemainingPercent(usedPercent),
          windowMinutes: 30 * 24 * 60,
          resetsAt: periodEnd,
        });
      }
    }

    if (progress.length === 0) {
      throw new Error('No usage data returned by CommandCode API');
    }

    const planId = subData.planId || creditData.planId || creditRoot.planId;
    const plan = planId ? (CC_PLANS[planId.toLowerCase().replace(/_/g, '-')] || planId) : undefined;

    const identity: { plan?: string } = {};
    if (plan) {
      identity.plan = plan;
    }

    return {
      provider: UsageProvider.COMMANDCODE,
      progress,
      identity: Object.keys(identity).length ? identity : undefined,
      updatedAt: new Date(),
    };
  }

  getErrorMessage(error: unknown): string {
    if (!(error instanceof Error)) {
      return 'Failed to fetch CommandCode usage';
    }
    if (error.message.includes('401') || error.message.includes('403')) {
      return 'CommandCode session key is invalid or revoked. Copy the apiKey from ~/.commandcode/auth.json.';
    }
    if (error.message.includes('404')) {
      return 'This CommandCode plan does not include API access.';
    }
    return error.message;
  }

  private buildHeaders(apiKey: string): Record<string, string> {
    return {
      Authorization: `Bearer ${apiKey}`,
      Accept: 'application/json',
      'User-Agent': 'AIMeter',
      'x-command-code-version': this.cliVersion,
      'x-cli-environment': 'production',
    };
  }

  private extractApiKey(credentials: Credential): string | null {
    if (credentials.type !== AuthType.API_KEY) {
      return null;
    }
    const value = credentials.value?.trim();
    return value || null;
  }

  private async getJson<T>(url: string, headers: Record<string, string>): Promise<T | null> {
    const response = await fetchWithTimeout(url, { method: 'GET', headers });
    if (!response.ok) {
      throw new Error(`CommandCode API error: HTTP ${response.status}`);
    }
    const body = await response.text();
    if (!body.trim()) {
      return null;
    }
    try {
      return JSON.parse(body) as T;
    } catch {
      throw new Error('Invalid CommandCode JSON response');
    }
  }

  /**
   * The /alpha routes answer either flat or wrapped once in `data`. An envelope that is
   * present but empty must not shadow a real top-level value, so `data` is only consulted
   * when the direct key is absent.
   *
   * With no key this must still descend into `data`: `usage/summary` answers with the
   * payload fully enveloped (`{"data":{...}}`), and returning the raw record there yields
   * `undefined` for every field — which silently drops the monthly window.
   */
  private unwrap<T>(payload: unknown, key?: string): T | undefined {
    if (!payload || typeof payload !== 'object') {
      return undefined;
    }
    const record = payload as Record<string, unknown>;

    if (key) {
      const direct = record[key];
      if (direct !== undefined && direct !== null) {
        return direct as T;
      }
      const data = record.data;
      if (data && typeof data === 'object') {
        const nested = (data as Record<string, unknown>)[key];
        if (nested !== undefined && nested !== null) {
          return nested as T;
        }
      }
      return undefined;
    }

    // No key: a pure envelope returns its `data`, anything flatter returns itself.
    const data = record.data;
    if (data && typeof data === 'object' && !Array.isArray(data)) {
      return data as T;
    }
    return record as T;
  }

  private toNumber(value: number | string | undefined | null): number | undefined {
    if (value === undefined || value === null || value === '') {
      return undefined;
    }
    const parsed = typeof value === 'number' ? value : Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }

  /** Accepts ISO-8601, epoch seconds and epoch milliseconds; 0 or negative means none. */
  private toDate(value: number | string | undefined | null): Date | undefined {
    if (value === undefined || value === null || value === '') {
      return undefined;
    }
    if (typeof value === 'string') {
      const trimmed = value.trim();
      if (trimmed.includes('T') || trimmed.endsWith('Z')) {
        const parsed = new Date(trimmed);
        return Number.isNaN(parsed.getTime()) ? undefined : parsed;
      }
    }
    const numeric = this.toNumber(value);
    if (numeric === undefined || numeric <= 0) {
      return undefined;
    }
    const millis = numeric > 1e12 ? numeric : numeric * 1000;
    return new Date(millis);
  }

  private toRemainingPercent(usedPercent: number): number {
    return roundPercentage(Math.max(0, 100 - usedPercent));
  }
}

export const commandCodeAdapter = new CommandCodeAdapter();
