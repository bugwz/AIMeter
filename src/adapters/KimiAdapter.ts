// Kimi provider adapter implementation
import { IProviderAdapter, ValidationResult } from './interface.js';
import {
  UsageProvider, 
  AuthType, 
  Credential, 
  UsageSnapshot, 
  ProviderMeta,
  ProgressItem,
  Identity,
} from '../types/index.js';
import { fetchWithTimeout, formatWindowDurationFromMinutes, roundPercentage } from './utils.js';

interface KimiJWTPayload {
  device_id?: string;
  ssid?: string;
  sub?: string;
  exp?: number;
}

interface KimiUsageResponse {
  usages?: {
    scope: string;
    detail: {
      used: number | string;
      limit: number | string;
      remaining: number | string;
      resetTime?: string;
    };
    limits?: {
      scope: string;
      window?: {
        duration?: number;
        timeUnit?: string;
      };
      detail: {
        used: number | string;
        limit: number | string;
        remaining: number | string;
        resetTime?: string;
      };
    }[];
  }[];
}

interface KimiSubscriptionResponse {
  subscription?: {
    goods?: {
      title?: string;
    };
    status?: string;
  };
  subscribed?: boolean;
  purchaseSubscription?: {
    goods?: {
      title?: string;
    };
    status?: string;
  };
}

const KIMI_META: ProviderMeta = {
  id: UsageProvider.KIMI,
  name: 'Kimi',
  logo: '/providers/kimi.svg',
  color: '#5B5FE3',
  supportedAuthTypes: [AuthType.COOKIE],
  docsUrl: 'https://kimi.moonshot.cn',
};

export class KimiAdapter implements IProviderAdapter {
  readonly id = UsageProvider.KIMI;
  readonly meta = KIMI_META;
  
  private readonly usageURL = 'https://www.kimi.com/apiv2/kimi.gateway.billing.v1.BillingService/GetUsages';
  private readonly subscriptionURL = 'https://www.kimi.com/apiv2/kimi.gateway.order.v1.SubscriptionService/GetSubscription';
  
  async validateCredentials(credentials: Credential): Promise<ValidationResult> {
    try {
      const token = this.extractToken(credentials);
      if (!token) {
        return { valid: false, reason: 'No token provided' };
      }
      
      const payload = this.decodeJWT(token);
      if (!payload) {
        return { valid: false, reason: 'Invalid JWT format' };
      }
      
      if (payload.exp && payload.exp * 1000 < Date.now()) {
        return { valid: false, reason: 'JWT expired', expiresAt: new Date(payload.exp * 1000) };
      }
      
      return { valid: true, expiresAt: payload.exp ? new Date(payload.exp * 1000) : undefined };
    } catch (error) {
      return { valid: false, reason: error instanceof Error ? error.message : 'Validation failed' };
    }
  }
  
  async fetchUsage(credentials: Credential): Promise<UsageSnapshot> {
    const token = this.extractToken(credentials);
    if (!token) {
      throw new Error('No token provided');
    }
    
    const sessionInfo = this.decodeJWT(token);
    
    const headers = {
      'Authorization': `Bearer ${token}`,
      'Cookie': `kimi-auth=${token}`,
      'Content-Type': 'application/json',
      'Origin': 'https://www.kimi.com',
      'Referer': 'https://www.kimi.com/code/console',
      'x-msh-platform': 'web',
      'x-language': 'en-US',
      'x-msh-device-id': sessionInfo?.device_id || '',
      'x-msh-session-id': sessionInfo?.ssid || '',
      'x-traffic-id': sessionInfo?.sub || '',
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    };

    const [usageData, subscriptionResponse] = await Promise.all([
      this.fetchUsageData(headers),
      fetchWithTimeout(this.subscriptionURL, {
        method: 'POST',
        headers,
        body: JSON.stringify({}),
      }),
    ]);
    
    let identity: Identity | undefined;
    if (subscriptionResponse.ok) {
      const subscriptionData = await subscriptionResponse.json() as KimiSubscriptionResponse;
      // Debug only: response may include account/usage details; keep commented in normal runs.
      // console.log('Kimi API response (subscription):', JSON.stringify(subscriptionData));
      const planName = subscriptionData.subscription?.goods?.title 
        || subscriptionData.purchaseSubscription?.goods?.title;
      if (planName) {
        identity = { plan: planName };
      }
    }
    
    return this.parseUsage(usageData, identity);
  }
  
  getErrorMessage(error: unknown): string {
    if (error instanceof Error) {
      if (error.message.includes('401') || error.message.includes('403')) {
        return 'Kimi token expired. Please re-authenticate.';
      }
      return error.message;
    }
    return 'Failed to fetch Kimi usage';
  }
  
  private extractToken(credentials: Credential): string | null {
    if (credentials.type === AuthType.JWT) {
      return credentials.value;
    }
    if (credentials.type === AuthType.COOKIE) {
      const match = credentials.value.match(/kimi-auth=([^;]+)/);
      return match ? match[1] : credentials.value;
    }
    if (credentials.type === AuthType.API_KEY) {
      return credentials.value;
    }
    return null;
  }
  
  private decodeJWT(token: string): KimiJWTPayload | null {
    try {
      const parts = token.split('.');
      if (parts.length !== 3) return null;
      
      let payload = parts[1]
        .replace(/-/g, '+')
        .replace(/_/g, '/');
      
      while (payload.length % 4 !== 0) {
        payload += '=';
      }
      
      const decoded = atob(payload);
      return JSON.parse(decoded);
    } catch {
      return null;
    }
  }
  
  private parseUsage(data: KimiUsageResponse, identity?: Identity): UsageSnapshot {
    const codingUsage = data.usages?.find(u => u.scope === 'FEATURE_CODING') || data.usages?.[0];
    if (!codingUsage) {
      return {
        provider: UsageProvider.KIMI,
        progress: [],
        identity,
        updatedAt: new Date(),
      };
    }
    
    const detail = codingUsage.detail;
    const used = Number(detail.used);
    const limit = Number(detail.limit);
    const remaining = Number(detail.remaining);
    const progress: ProgressItem[] = [];
    
    if (limit > 0) {
      progress.push({
        name: 'Weekly',
        desc: '7 days window',
        usedPercent: roundPercentage((used / limit) * 100),
        used,
        limit,
        remainingPercent: roundPercentage((remaining / limit) * 100),
        windowMinutes: 10080,
        resetsAt: detail.resetTime ? new Date(detail.resetTime) : undefined,
      });
    }
    
    const limitDetail = codingUsage.limits?.[0]?.detail;
    if (limitDetail) {
      const limitUsed = Number(limitDetail.used);
      const limitLimit = Number(limitDetail.limit);
      const limitRemaining = Number(limitDetail.remaining);
      const rateWindowMinutes = this.windowToMinutes(codingUsage.limits?.[0]?.window);
      const rateWindow = rateWindowMinutes
        ? `${formatWindowDurationFromMinutes(rateWindowMinutes)} window`
        : '';
      progress.push({
        name: 'Rate Limit',
        desc: rateWindow || '5 hours window',
        usedPercent: roundPercentage((limitUsed / limitLimit) * 100),
        used: limitUsed,
        limit: limitLimit,
        remainingPercent: roundPercentage((limitRemaining / limitLimit) * 100),
        windowMinutes: rateWindowMinutes,
        resetsAt: limitDetail.resetTime ? new Date(limitDetail.resetTime) : undefined,
      });
    }
    
    return {
      provider: UsageProvider.KIMI,
      progress,
      identity,
      updatedAt: new Date(),
    };
  }

  private windowToMinutes(
    window?: { duration?: number; timeUnit?: string }
  ): number | undefined {
    if (!window || typeof window.duration !== 'number' || window.duration <= 0) return undefined;
    const unit = (window.timeUnit || '').toUpperCase();
    const duration = window.duration;

    if (unit.includes('MINUTE')) {
      return Math.max(1, Math.round(duration));
    }
    if (unit.includes('HOUR')) {
      return Math.max(1, Math.round(duration * 60));
    }
    if (unit.includes('DAY')) {
      return Math.max(1, Math.round(duration * 24 * 60));
    }
    if (unit.includes('WEEK')) {
      return Math.max(1, Math.round(duration * 7 * 24 * 60));
    }
    if (unit.includes('MONTH')) {
      return Math.max(1, Math.round(duration * 30 * 24 * 60));
    }
    return undefined;
  }

  private hasUsages(data: KimiUsageResponse): boolean {
    return Array.isArray(data.usages) && data.usages.length > 0;
  }

  private async fetchUsageData(headers: Record<string, string>): Promise<KimiUsageResponse> {
    const payloads: Array<Record<string, unknown>> = [
      { scope: ['FEATURE_CODING'] },
      { scope: 'FEATURE_CODING' },
      {},
    ];

    let lastData: KimiUsageResponse = {};

    for (const payload of payloads) {
      const response = await fetchWithTimeout(this.usageURL, {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        if (response.status === 401 || response.status === 403) {
          throw new Error('Invalid or expired Kimi token');
        }
        throw new Error(`Kimi API error: ${response.status}`);
      }

      const data = await response.json().catch(() => ({})) as KimiUsageResponse;
      // Debug only: response may include account/usage details; keep commented in normal runs.
      // console.log(`Kimi API response (usage, payload=${JSON.stringify(payload)}):`, JSON.stringify(data));
      lastData = data;

      if (this.hasUsages(data)) {
        return data;
      }
    }

    return lastData;
  }
}

export const kimiAdapter = new KimiAdapter();
