// Cursor provider adapter implementation
import { IProviderAdapter, ValidationResult } from './interface';
import { 
  UsageProvider, 
  AuthType, 
  Credential, 
  UsageSnapshot, 
  ProviderMeta,
  ProgressItem,
} from '../types';
import { roundPercentage } from './utils';

interface CursorUsageResponse {
  usage_summary?: {
    plan_usage?: {
      used?: number;
      limit?: number;
      remaining?: number;
      total_percent_used?: number;
    };
    on_demand_usage?: {
      used?: number;
      limit?: number | null;
      remaining?: number | null;
    };
    billing_cycle_end?: string;
  };
  membership_type?: string;
  billingCycleStart?: string;
  billingCycleEnd?: string;
  membershipType?: string;
  limitType?: string;
  isUnlimited?: boolean;
  autoModelSelectedDisplayMessage?: string;
  namedModelSelectedDisplayMessage?: string;
  individualUsage?: {
    plan?: {
      enabled?: boolean;
      used?: number;
      limit?: number;
      remaining?: number;
      totalPercentUsed?: number;
    };
    onDemand?: {
      enabled?: boolean;
      used?: number;
      limit?: number | null;
      remaining?: number | null;
    };
  };
  teamUsage?: {
    onDemand?: {
      enabled?: boolean;
      used?: number;
      limit?: number | null;
      remaining?: number | null;
    };
  };
}

interface CursorUserResponse {
  email?: string;
  name?: string;
  sub?: string;
}

interface CursorLegacyUsageResponse {
  'gpt-4'?: {
    numRequests?: number;
    numRequestsTotal?: number;
    maxRequestUsage?: number;
  };
}

const CURSOR_META: ProviderMeta = {
  id: UsageProvider.CURSOR,
  name: 'Cursor',
  logo: '/providers/cursor.svg',
  color: '#000000',
  supportedAuthTypes: [AuthType.COOKIE],
  docsUrl: 'https://cursor.com',
};

export class CursorAdapter implements IProviderAdapter {
  readonly id = UsageProvider.CURSOR;
  readonly meta = CURSOR_META;
  
  private readonly usageURL = 'https://cursor.com/api/usage-summary';
  private readonly userURL = 'https://cursor.com/api/auth/me';
  private readonly legacyUsageURL = 'https://cursor.com/api/usage';
  
  async validateCredentials(credentials: Credential): Promise<ValidationResult> {
    try {
      const cookie = this.extractCookie(credentials);
      if (!cookie) {
        return { valid: false, reason: 'No cookie provided' };
      }
      
      const response = await fetch(this.userURL, {
        headers: this.buildHeaders(cookie),
      });
      
      if (response.status === 401 || response.status === 403) {
        return { valid: false, reason: 'Invalid or expired session' };
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
    const cookie = this.extractCookie(credentials);
    if (!cookie) {
      throw new Error('No cookie provided');
    }
    
    const [usageRes, userRes] = await Promise.all([
      fetch(this.usageURL, {
        headers: this.buildHeaders(cookie),
      }),
      fetch(this.userURL, {
        headers: this.buildHeaders(cookie),
      }),
    ]);
    
    if (!usageRes.ok) {
      if (usageRes.status === 401 || usageRes.status === 403) {
        throw new Error('Invalid or expired Cursor session');
      }
      throw new Error(`Cursor API error: ${usageRes.status}`);
    }
    
    const usageData = await usageRes.json() as CursorUsageResponse;
    const userData = await userRes.json().catch(() => ({})) as CursorUserResponse;
    const legacyData = userData.sub
      ? await this.fetchLegacyUsage(userData.sub, cookie)
      : null;
    // Debug only: response may include account/usage details; keep commented in normal runs.
    // console.log('Cursor API response (usage-summary):', JSON.stringify(usageData));
    // console.log('Cursor API response (auth/me):', JSON.stringify(userData));
    // if (legacyData) {
    //   console.log('Cursor API response (legacy-usage):', JSON.stringify(legacyData));
    // }

    return this.parseUsage(usageData, userData, legacyData);
  }
  
  getErrorMessage(error: unknown): string {
    if (error instanceof Error) {
      if (error.message.includes('401') || error.message.includes('403')) {
        return 'Cursor session expired. Please re-authenticate.';
      }
      return error.message;
    }
    return 'Failed to fetch Cursor usage';
  }
  
  private extractCookie(credentials: Credential): string | null {
    if (credentials.type !== AuthType.COOKIE) {
      return null;
    }

    const raw = credentials.value
      .trim()
      .replace(/^"(.*)"$/, '$1')
      .replace(/^cookie:\s*/i, '');

    if (!raw) {
      return null;
    }

    // Already contains the target cookie key (single key or full Cookie header).
    if (/WorkosCursorSessionToken\s*=/.test(raw)) {
      return raw;
    }

    // Plain token value mode: auto-wrap to Cookie format.
    const tokenValue = raw.replace(/;+\s*$/, '').trim();
    if (!tokenValue || tokenValue.includes('=')) {
      return raw;
    }
    return `WorkosCursorSessionToken=${tokenValue};`;
  }
  
  private buildHeaders(cookie: string): Record<string, string> {
    return {
      'Cookie': cookie,
      'Accept': 'application/json',
    };
  }
  
  private async fetchLegacyUsage(userId: string, cookie: string): Promise<CursorLegacyUsageResponse | null> {
    try {
      const url = new URL(this.legacyUsageURL);
      url.searchParams.set('user', userId);
      const response = await fetch(url.toString(), {
        headers: this.buildHeaders(cookie),
      });

      if (!response.ok) {
        return null;
      }

      return await response.json() as CursorLegacyUsageResponse;
    } catch {
      return null;
    }
  }

  private parseUsage(
    data: CursorUsageResponse,
    userData: CursorUserResponse,
    legacyData: CursorLegacyUsageResponse | null
  ): UsageSnapshot {
    const summary = data.usage_summary;
    const planUsage = data.individualUsage?.plan ?? summary?.plan_usage;
    const onDemandUsage = data.individualUsage?.onDemand ?? summary?.on_demand_usage;
    const billingEnd = data.billingCycleEnd ?? summary?.billing_cycle_end;
    const billingStart = data.billingCycleStart;
    const membership = data.membershipType ?? data.membership_type;
    const requestUsage = legacyData?.['gpt-4'];
    const requestLimit = requestUsage?.maxRequestUsage;
    const requestUsed = requestUsage?.numRequestsTotal ?? requestUsage?.numRequests;
    const totalPercentUsedValue =
      data.individualUsage?.plan?.totalPercentUsed ?? summary?.plan_usage?.total_percent_used;
    
    const progress: ProgressItem[] = [];
    const billingDate = billingEnd ? new Date(billingEnd) : undefined;
    const planWindowDesc = this.buildPlanWindowDescription(billingStart, billingEnd);
    const onDemandWindowDesc = this.buildQuotaWindowDescription({
      scope: 'On-demand',
      billingCycleStart: billingStart,
      billingCycleEnd: billingEnd,
    });
    
    if (typeof requestLimit === 'number' && requestLimit > 0) {
      progress.push({
        name: 'Plan',
        desc: planWindowDesc,
        usedPercent: roundPercentage(((requestUsed ?? 0) / requestLimit) * 100),
        used: requestUsed ?? 0,
        limit: requestLimit,
        remainingPercent: roundPercentage(((requestLimit - (requestUsed ?? 0)) / requestLimit) * 100),
        resetsAt: billingDate,
      });
    } else {
      const planUsedRaw = this.toNumber(planUsage?.used);
      const planLimitRaw = this.toNumber(planUsage?.limit);
      const planRemainingRaw = this.toNumber(planUsage?.remaining);
      const totalPercentUsed = this.toNumber(totalPercentUsedValue);

      if (planLimitRaw > 0) {
        const planUsed = planUsedRaw / 100;
        const planLimit = planLimitRaw / 100;
        const planRemaining = planRemainingRaw / 100;
        progress.push({
          name: 'Plan',
          desc: planWindowDesc,
          usedPercent: roundPercentage((planUsedRaw / planLimitRaw) * 100),
          used: planUsed,
          limit: planLimit,
          remainingPercent: roundPercentage((planRemainingRaw / planLimitRaw) * 100),
          resetsAt: billingDate,
        });
      } else if (typeof totalPercentUsed === 'number' && Number.isFinite(totalPercentUsed)) {
        progress.push({
          name: 'Plan',
          desc: planWindowDesc,
          usedPercent: roundPercentage(totalPercentUsed <= 1 ? totalPercentUsed * 100 : totalPercentUsed),
          resetsAt: billingDate,
        });
      }
    }
    
    const onDemandUsedRaw = this.toNumber(onDemandUsage?.used);
    const onDemandLimitRaw = this.toOptionalNumber(onDemandUsage?.limit);
    const onDemandRemainingRaw = this.toOptionalNumber(onDemandUsage?.remaining);

    if (typeof onDemandLimitRaw === 'number' && onDemandLimitRaw > 0) {
      progress.push({
        name: 'Secondary',
        desc: onDemandWindowDesc,
        usedPercent: roundPercentage((onDemandUsedRaw / onDemandLimitRaw) * 100),
        used: onDemandUsedRaw / 100,
        limit: onDemandLimitRaw / 100,
        remainingPercent: roundPercentage(((onDemandRemainingRaw ?? 0) / onDemandLimitRaw) * 100),
        resetsAt: billingDate,
      });
    }
    
    return {
      provider: UsageProvider.CURSOR,
      progress,
      cost: typeof onDemandLimitRaw === 'number' && onDemandLimitRaw > 0
        ? {
            used: onDemandUsedRaw / 100,
            limit: onDemandLimitRaw / 100,
            remaining: (onDemandRemainingRaw ?? 0) / 100,
            currency: 'USD',
            period: 'monthly',
          }
        : undefined,
      identity: {
        plan: membership ? this.formatMembership(membership) : undefined,
      },
      updatedAt: new Date(),
    };
  }
  
  private formatMembership(type: string): string {
    const membershipMap: Record<string, string> = {
      enterprise: 'Enterprise',
      pro: 'Pro',
      hobby: 'Hobby',
      team: 'Team',
    };
    return membershipMap[type] || type;
  }

  private toNumber(value: unknown): number {
    return typeof value === 'number' && Number.isFinite(value) ? value : 0;
  }

  private toOptionalNumber(value: unknown): number | undefined {
    return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
  }

  private buildQuotaWindowDescription(options: {
    scope: 'Plan' | 'On-demand';
    billingCycleStart?: string;
    billingCycleEnd?: string;
  }): string {
    const short = this.formatBillingCycleShort(options.billingCycleStart, options.billingCycleEnd);
    return short ? `${short} window` : '';
  }

  private buildPlanWindowDescription(billingCycleStart?: string, billingCycleEnd?: string): string {
    const short = this.formatBillingCycleShort(billingCycleStart, billingCycleEnd);
    return short ? `${short} window` : '';
  }

  private formatBillingCycleShort(startRaw?: string, endRaw?: string): string {
    const start = startRaw ? new Date(startRaw) : undefined;
    const end = endRaw ? new Date(endRaw) : undefined;
    const validStart = start && !Number.isNaN(start.getTime()) ? start : undefined;
    const validEnd = end && !Number.isNaN(end.getTime()) ? end : undefined;

    if (validStart && validEnd) {
      const days = Math.max(1, Math.round((validEnd.getTime() - validStart.getTime()) / (24 * 60 * 60 * 1000)));
      return `${days} ${days === 1 ? 'day' : 'days'}`;
    }
    return '';
  }

}

export const cursorAdapter = new CursorAdapter();
