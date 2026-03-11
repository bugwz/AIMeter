// Copilot provider adapter implementation
import { IProviderAdapter, ValidationResult } from './interface.js';
import { 
  UsageProvider, 
  AuthType, 
  Credential, 
  UsageSnapshot, 
  ProviderMeta,
  ProgressItem,
} from '../types/index.js';
import { roundPercentage } from './utils.js';

interface CopilotUsageResponse {
  login?: string;
  access_type_sku?: string;
  quota_snapshots?: Record<string, CopilotQuotaSnapshot | undefined>;
  copilot_plan?: string;
  assigned_date?: string;
  quota_reset_date?: string;
  limited_user_quotas?: Record<string, number | undefined>;
  limited_user_reset_date?: string;
  monthly_quotas?: Record<string, number | undefined>;
  limited_user_subscribed_day?: number;
}

interface CopilotQuotaSnapshot {
  entitlement?: number;
  remaining?: number;
  percent_remaining?: number;
  quota_id?: string;
  used?: number;
  limit?: number;
}

const COPILOT_META: ProviderMeta = {
  id: UsageProvider.COPILOT,
  name: 'Copilot',
  logo: '/providers/copilot.svg',
  color: '#333333',
  supportedAuthTypes: [AuthType.OAUTH, AuthType.API_KEY],
  docsUrl: 'https://docs.github.com/en/copilot',
};

export class CopilotAdapter implements IProviderAdapter {
  readonly id = UsageProvider.COPILOT;
  readonly meta = COPILOT_META;
  
  private readonly baseURL = 'https://api.github.com';
  
  async validateCredentials(credentials: Credential): Promise<ValidationResult> {
    try {
      const token = this.extractToken(credentials);
      if (!token) {
        return { valid: false, reason: 'No token provided' };
      }
      
      const response = await fetch(`${this.baseURL}/copilot_internal/user`, {
        headers: this.buildHeaders(token),
      });
      
      if (response.status === 401 || response.status === 403) {
        return { valid: false, reason: 'Invalid GitHub token' };
      }
      
      if (!response.ok) {
        return { valid: false, reason: `HTTP ${response.status}` };
      }
      
      return { valid: true };
    } catch (error) {
      return { valid: false, reason: error instanceof Error ? error.message : 'Validation failed' };
    }
  }
  
  async fetchUsage(credentials: Credential): Promise<UsageSnapshot> {
    const token = this.extractToken(credentials);
    if (!token) {
      throw new Error('No token provided');
    }
    
    const response = await fetch(`${this.baseURL}/copilot_internal/user`, {
      headers: this.buildHeaders(token),
    });
    
    if (!response.ok) {
      if (response.status === 401 || response.status === 403) {
        throw new Error('Invalid or expired GitHub token');
      }
      throw new Error(`Copilot API error: ${response.status}`);
    }
    
    const data = await response.json() as CopilotUsageResponse;
    // Debug only: response may include account/usage details; keep commented in normal runs.
    // console.log('Copilot API response:', JSON.stringify(data));
    return this.parseUsage(data);
  }
  
  getErrorMessage(error: unknown): string {
    if (error instanceof Error) {
      if (error.message.includes('401') || error.message.includes('403')) {
        return 'GitHub token expired or invalid. Please re-authenticate.';
      }
      return error.message;
    }
    return 'Failed to fetch Copilot usage';
  }
  
  private extractToken(credentials: Credential): string | null {
    if (credentials.type === AuthType.OAUTH) {
      return credentials.accessToken;
    }
    if (credentials.type === AuthType.API_KEY) {
      return credentials.value;
    }
    return null;
  }
  
  private buildHeaders(token: string): Record<string, string> {
    return {
      'Authorization': `token ${token}`,
      'Accept': 'application/json',
      'Editor-Version': 'vscode/1.96.2',
      'Editor-Plugin-Version': 'copilot-chat/0.26.7',
      'User-Agent': 'GitHubCopilotChat/0.26.7',
      'X-Github-Api-Version': '2025-04-01',
    };
  }
  
  private parseUsage(data: CopilotUsageResponse): UsageSnapshot {
    const quotaSnapshots = data.quota_snapshots;
    const plan = data.copilot_plan;
    const resetsAt = this.resolveResetDate(data);
    
    const progress = this.extractProgress(quotaSnapshots, resetsAt, data);
    
    return {
      provider: UsageProvider.COPILOT,
      progress,
      identity: {
        plan: plan ? this.formatPlanName(plan) : undefined,
      },
      updatedAt: new Date(),
    };
  }

  private extractProgress(
    quotaSnapshots: Record<string, CopilotQuotaSnapshot | undefined> | undefined,
    resetsAt: Date | undefined,
    data: CopilotUsageResponse
  ): ProgressItem[] {
    const windowDesc = this.resolveWindowDesc(data, resetsAt);
    const progressFromSnapshots = this.extractProgressFromQuotaSnapshots(quotaSnapshots, resetsAt);
    if (progressFromSnapshots.length > 0) {
      return progressFromSnapshots.map((item) => ({
        ...item,
        desc: item.desc || windowDesc,
      }));
    }

    return this.extractProgressFromLimitedQuotas(data, resetsAt).map((item) => ({
      ...item,
      desc: item.desc || windowDesc,
    }));
  }

  private extractProgressFromQuotaSnapshots(
    quotaSnapshots: Record<string, CopilotQuotaSnapshot | undefined> | undefined,
    resetsAt: Date | undefined
  ): ProgressItem[] {
    if (!quotaSnapshots) return [];

    const entries = Object.entries(quotaSnapshots)
      .filter(([, snapshot]) => !!snapshot)
      .sort(([left], [right]) => this.rankQuotaKey(left) - this.rankQuotaKey(right));

    const progress: ProgressItem[] = [];

    for (const [key, snapshotValue] of entries) {
      const snapshot = snapshotValue!;
      const remainingPercent = this.resolveRemainingPercent(snapshot);
      const usedPercent = remainingPercent !== undefined
        ? roundPercentage(100 - remainingPercent)
        : this.resolveUsedPercent(snapshot);

      if (usedPercent === undefined) {
        continue;
      }

      const limit = this.resolveLimit(snapshot);
      const used = this.resolveUsed(snapshot, limit);

      progress.push({
        name: this.formatQuotaLabel(key),
        usedPercent,
        remainingPercent: remainingPercent !== undefined ? roundPercentage(remainingPercent) : undefined,
        used,
        limit,
        resetsAt,
        resetDescription: resetsAt ? 'Monthly reset' : undefined,
      });
    }

    return progress;
  }

  private extractProgressFromLimitedQuotas(
    data: CopilotUsageResponse,
    resetsAt: Date | undefined
  ): ProgressItem[] {
    const current = data.limited_user_quotas;
    const monthly = data.monthly_quotas;

    if (!current || !monthly) {
      return [];
    }

    const preferredOrder = ['chat', 'completions'];
    const keys = Array.from(new Set([
      ...preferredOrder.filter((key) => monthly[key] !== undefined || current[key] !== undefined),
      ...Object.keys(monthly),
      ...Object.keys(current),
    ]));

    const progress: ProgressItem[] = [];

    for (const key of keys) {
      const limit = monthly[key];
      const remaining = current[key];

      if (typeof limit !== 'number' || limit <= 0 || typeof remaining !== 'number') {
        continue;
      }

      const used = Math.max(0, limit - remaining);
      progress.push({
        name: this.formatQuotaLabel(key),
        usedPercent: roundPercentage((used / limit) * 100),
        remainingPercent: roundPercentage((remaining / limit) * 100),
        used,
        limit,
        resetsAt,
        resetDescription: resetsAt ? 'Monthly reset' : undefined,
      });
    }

    return progress;
  }

  private rankQuotaKey(key: string): number {
    const normalized = key.toLowerCase();
    if (normalized === 'premium_interactions') return 0;
    if (normalized === 'chat') return 1;
    return 10;
  }

  private formatQuotaLabel(key: string): string {
    const normalized = key.toLowerCase();
    if (normalized === 'premium_interactions') return 'Premium';
    if (normalized === 'chat') return 'Chat';

    return key
      .split(/[_\s-]+/)
      .filter(Boolean)
      .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1).toLowerCase())
      .join(' ');
  }

  private resolveRemainingPercent(snapshot: CopilotQuotaSnapshot): number | undefined {
    return typeof snapshot.percent_remaining === 'number'
      ? roundPercentage(snapshot.percent_remaining)
      : undefined;
  }

  private resolveUsedPercent(snapshot: CopilotQuotaSnapshot): number | undefined {
    if (typeof snapshot.used === 'number' && typeof snapshot.limit === 'number' && snapshot.limit > 0) {
      return roundPercentage((snapshot.used / snapshot.limit) * 100);
    }

    if (
      typeof snapshot.entitlement === 'number'
      && typeof snapshot.remaining === 'number'
      && snapshot.entitlement > 0
    ) {
      return roundPercentage(((snapshot.entitlement - snapshot.remaining) / snapshot.entitlement) * 100);
    }

    return undefined;
  }

  private resolveLimit(snapshot: CopilotQuotaSnapshot): number | undefined {
    if (typeof snapshot.entitlement === 'number') return snapshot.entitlement;
    if (typeof snapshot.limit === 'number') return snapshot.limit;
    return undefined;
  }

  private resolveUsed(snapshot: CopilotQuotaSnapshot, limit: number | undefined): number | undefined {
    if (typeof snapshot.used === 'number') return snapshot.used;
    if (typeof limit === 'number' && typeof snapshot.remaining === 'number') {
      return Math.max(0, limit - snapshot.remaining);
    }
    return undefined;
  }

  private resolveResetDate(data: CopilotUsageResponse): Date | undefined {
    const rawValue = data.quota_reset_date || data.limited_user_reset_date;
    if (!rawValue) return undefined;

    const parsed = new Date(rawValue);
    return Number.isNaN(parsed.getTime()) ? undefined : parsed;
  }

  private resolveWindowDesc(data: CopilotUsageResponse, resetsAt: Date | undefined): string | undefined {
    if (!resetsAt) return undefined;
    const windowDays = this.estimateMonthlyWindowDays(data, resetsAt);
    if (!windowDays) return undefined;
    return `${windowDays} ${windowDays === 1 ? 'day' : 'days'} window`;
  }

  private estimateMonthlyWindowDays(data: CopilotUsageResponse, resetsAt: Date): number | undefined {
    const year = resetsAt.getUTCFullYear();
    const month = resetsAt.getUTCMonth(); // 0-11
    const resetDay = resetsAt.getUTCDate();

    const subscribedDay = Number.isFinite(data.limited_user_subscribed_day)
      ? Math.max(1, Math.min(31, Number(data.limited_user_subscribed_day)))
      : resetDay;

    const prevMonth = month === 0 ? 11 : month - 1;
    const prevYear = month === 0 ? year - 1 : year;
    const prevMonthDays = this.daysInMonthUTC(prevYear, prevMonth);
    const prevDay = Math.min(subscribedDay, prevMonthDays);

    const previousReset = new Date(Date.UTC(prevYear, prevMonth, prevDay, 0, 0, 0, 0));
    if (Number.isNaN(previousReset.getTime())) return undefined;

    const diffMs = resetsAt.getTime() - previousReset.getTime();
    const days = Math.round(diffMs / (24 * 60 * 60 * 1000));
    return days > 0 ? days : undefined;
  }

  private daysInMonthUTC(year: number, month: number): number {
    return new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  }

  private formatPlanName(plan: string): string {
    // Convert plan to a human-readable format
    return plan.charAt(0).toUpperCase() + plan.slice(1).toLowerCase();
  }
}

export const copilotAdapter = new CopilotAdapter();
