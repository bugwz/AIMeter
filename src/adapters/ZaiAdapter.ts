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
import { roundPercentage } from './utils.js';

type ZaiLimitType = 'TOKENS_LIMIT' | 'TIME_LIMIT';

interface ZaiUsageDetail {
  modelCode: string;
  usage: number;
}

interface ZaiLimitRaw {
  type?: string;
  name?: string;
  unit?: number | string;
  number?: number | string;
  usage?: number | string;
  currentValue?: number | string;
  remaining?: number | string;
  percentage?: number | string;
  usageDetails?: ZaiUsageDetail[];
  nextResetTime?: number | string;
}

interface ZaiQuotaContainer {
  limits?: ZaiLimitRaw[];
  planName?: string;
  plan?: string;
  planType?: string;
  packageName?: string;
}

interface ZaiQuotaResponse {
  code?: number;
  msg?: string;
  success?: boolean;
  data?: ZaiQuotaContainer;
  limits?: ZaiLimitRaw[];
}

interface ParsedLimit {
  type: ZaiLimitType;
  unit: number;
  number: number;
  usage?: number;
  currentValue?: number;
  remaining?: number;
  percentage?: number;
  nextResetTime?: Date;
  usageDetails: ZaiUsageDetail[];
}

const ZAI_META: ProviderMeta = {
  id: UsageProvider.ZAI,
  name: 'z.ai',
  logo: '/providers/zai.svg',
  color: '#111827',
  supportedAuthTypes: [AuthType.API_KEY],
  docsUrl: 'https://z.ai/manage-apikey/subscription',
};

export class ZaiAdapter implements IProviderAdapter {
  readonly id = UsageProvider.ZAI;
  readonly meta = ZAI_META;

  async validateCredentials(credentials: Credential, config?: ProviderConfig): Promise<ValidationResult> {
    try {
      const apiKey = this.extractApiKey(credentials);
      if (!apiKey) {
        return { valid: false, reason: 'No API key provided' };
      }

      const response = await fetch(this.resolveQuotaURL(config), {
        method: 'GET',
        headers: this.buildHeaders(apiKey),
      });

      if (response.status === 401 || response.status === 403) {
        return { valid: false, reason: 'Invalid API key' };
      }

      if (!response.ok) {
        return { valid: false, reason: `HTTP ${response.status}` };
      }

      const data = await response.json().catch(() => null) as ZaiQuotaResponse | null;
      if (!data) {
        return { valid: false, reason: 'Invalid JSON response' };
      }
      if ((data.success === false) || (typeof data.code === 'number' && data.code !== 200)) {
        return { valid: false, reason: data.msg || 'z.ai API returned an error' };
      }

      return { valid: true };
    } catch (error) {
      return { valid: false, reason: error instanceof Error ? error.message : 'Validation failed' };
    }
  }

  async fetchUsage(credentials: Credential, config?: ProviderConfig): Promise<UsageSnapshot> {
    const apiKey = this.extractApiKey(credentials);
    if (!apiKey) {
      throw new Error('No API key provided');
    }

    const quotaURL = this.resolveQuotaURL(config);
    const response = await fetch(quotaURL, {
      method: 'GET',
      headers: this.buildHeaders(apiKey),
    });

    if (!response.ok) {
      if (response.status === 401 || response.status === 403) {
        throw new Error('Invalid z.ai API key');
      }
      const body = await response.text().catch(() => '');
      throw new Error(`z.ai API error: ${response.status}${body ? ` - ${body}` : ''}`);
    }

    const rawBody = await response.text();
    if (!rawBody.trim()) {
      throw new Error('Empty response body (HTTP 200). Check z.ai region and API key.');
    }

    let payload: ZaiQuotaResponse;
    try {
      payload = JSON.parse(rawBody) as ZaiQuotaResponse;
    } catch {
      throw new Error('Invalid z.ai JSON response');
    }

    const parsed = this.parsePayload(payload);
    const progress = this.toProgressItems(parsed.limits);

    if (progress.length === 0) {
      throw new Error('No usage data returned by z.ai quota API');
    }

    return {
      provider: UsageProvider.ZAI,
      progress,
      identity: parsed.plan ? { plan: parsed.plan } : undefined,
      updatedAt: new Date(),
    };
  }

  getErrorMessage(error: unknown): string {
    if (error instanceof Error) {
      if (error.message.includes('401') || error.message.includes('403') || error.message.includes('Invalid z.ai API key')) {
        return 'z.ai API key is invalid or expired.';
      }
      if (error.message.includes('429')) {
        return 'z.ai API rate limit exceeded. Please try again later.';
      }
      return error.message;
    }
    return 'Failed to fetch z.ai usage';
  }

  private parsePayload(payload: ZaiQuotaResponse): { limits: ParsedLimit[]; plan?: string } {
    if ((payload.success === false) || (typeof payload.code === 'number' && payload.code !== 200)) {
      throw new Error(payload.msg || 'z.ai API returned an error');
    }

    const container = payload.data || payload;
    const limitsRaw = Array.isArray(container.limits)
      ? container.limits
      : (Array.isArray(payload.limits) ? payload.limits : []);

    const limits = limitsRaw
      .map((item) => this.parseLimit(item))
      .filter((item): item is ParsedLimit => Boolean(item));

    const plan = this.pickPlan(container);
    return { limits, plan };
  }

  private toProgressItems(limits: ParsedLimit[]): ProgressItem[] {
    const progress: ProgressItem[] = [];
    const tokenLimits = limits.filter((item) => item.type === 'TOKENS_LIMIT');
    const timeLimits = limits.filter((item) => item.type === 'TIME_LIMIT');

    tokenLimits
      .sort((a, b) => this.sortTokenLimit(a) - this.sortTokenLimit(b))
      .forEach((limit) => {
        progress.push({
          name: this.getTokenLimitLabel(limit),
          usedPercent: this.computeUsedPercent(limit),
          used: this.estimateUsed(limit),
          limit: this.estimateLimit(limit),
          remainingPercent: this.computeRemainingPercent(limit),
          windowMinutes: this.windowMinutes(limit),
          resetsAt: limit.nextResetTime,
        });
      });

    timeLimits.forEach((limit) => {
      progress.push({
        name: 'Web Searches',
        usedPercent: this.computeUsedPercent(limit),
        used: this.estimateUsed(limit),
        limit: this.estimateLimit(limit),
        remainingPercent: this.computeRemainingPercent(limit),
        windowMinutes: this.windowMinutes(limit),
        resetsAt: limit.nextResetTime,
      });
    });

    return progress;
  }

  private sortTokenLimit(limit: ParsedLimit): number {
    if (limit.unit === 3) return 0;
    if (limit.unit === 6) return 1;
    return 2;
  }

  private getTokenLimitLabel(limit: ParsedLimit): string {
    if (limit.unit === 3) return 'Session';
    if (limit.unit === 6) return 'Weekly';
    return 'Tokens';
  }

  private parseLimit(raw: ZaiLimitRaw): ParsedLimit | null {
    const typeRaw = (raw.type || raw.name || '').toUpperCase();
    if (typeRaw !== 'TOKENS_LIMIT' && typeRaw !== 'TIME_LIMIT') {
      return null;
    }

    return {
      type: typeRaw,
      unit: this.toNumber(raw.unit) ?? 0,
      number: this.toNumber(raw.number) ?? 0,
      usage: this.toNumber(raw.usage),
      currentValue: this.toNumber(raw.currentValue),
      remaining: this.toNumber(raw.remaining),
      percentage: this.toNumber(raw.percentage),
      nextResetTime: this.toDate(raw.nextResetTime),
      usageDetails: Array.isArray(raw.usageDetails) ? raw.usageDetails : [],
    };
  }

  private computeUsedPercent(limit: ParsedLimit): number {
    const limitValue = this.estimateLimit(limit);
    const usedValue = this.estimateUsed(limit);

    if (typeof limitValue === 'number' && limitValue > 0 && typeof usedValue === 'number') {
      return roundPercentage(Math.max(0, Math.min(100, (usedValue / limitValue) * 100)));
    }

    if (typeof limit.percentage === 'number' && Number.isFinite(limit.percentage)) {
      return roundPercentage(Math.max(0, Math.min(100, limit.percentage)));
    }

    return 0;
  }

  private estimateLimit(limit: ParsedLimit): number | undefined {
    if (typeof limit.usage === 'number' && limit.usage > 0) {
      return limit.usage;
    }
    return undefined;
  }

  private estimateUsed(limit: ParsedLimit): number | undefined {
    const limitValue = this.estimateLimit(limit);

    if (typeof limitValue === 'number' && typeof limit.remaining === 'number') {
      const usedFromRemaining = limitValue - limit.remaining;
      if (typeof limit.currentValue === 'number') {
        return Math.max(0, Math.min(limitValue, Math.max(usedFromRemaining, limit.currentValue)));
      }
      return Math.max(0, Math.min(limitValue, usedFromRemaining));
    }

    if (typeof limit.currentValue === 'number') {
      if (typeof limitValue === 'number') {
        return Math.max(0, Math.min(limitValue, limit.currentValue));
      }
      return Math.max(0, limit.currentValue);
    }

    return undefined;
  }

  private computeRemainingPercent(limit: ParsedLimit): number | undefined {
    const usedPercent = this.computeUsedPercent(limit);
    return roundPercentage(Math.max(0, 100 - usedPercent));
  }

  private pickPlan(container: ZaiQuotaContainer): string | undefined {
    const candidates = [
      container.planName,
      container.plan,
      container.planType,
      container.packageName,
    ];
    for (const candidate of candidates) {
      if (typeof candidate === 'string' && candidate.trim()) {
        return candidate.trim();
      }
    }
    return undefined;
  }

  private windowMinutes(limit: ParsedLimit): number | undefined {
    if (limit.number <= 0) return undefined;
    switch (limit.unit) {
      case 1:
        return limit.number * 24 * 60;
      case 3:
        return limit.number * 60;
      case 5:
        return limit.number;
      case 6:
        return limit.number * 24 * 60;
      default:
        return undefined;
    }
  }

  private resolveQuotaURL(config?: ProviderConfig): string {
    const envQuotaURL = process.env.Z_AI_QUOTA_URL?.trim();
    if (envQuotaURL) return this.normalizeURL(envQuotaURL);

    const envHost = process.env.Z_AI_API_HOST?.trim();
    if (envHost) return this.normalizeURL(envHost, true);

    const region = this.normalizeRegion(config?.region);
    const base = region === 'bigmodel-cn' ? 'https://open.bigmodel.cn' : 'https://api.z.ai';
    return `${base}/api/monitor/usage/quota/limit`;
  }

  private normalizeURL(value: string, appendQuotaPath: boolean = false): string {
    const trimmed = value.trim().replace(/^['"]|['"]$/g, '');
    const hasScheme = /^https?:\/\//i.test(trimmed);
    const normalized = hasScheme ? trimmed : `https://${trimmed}`;
    if (!appendQuotaPath) return normalized;
    if (/\/api\/monitor\/usage\/quota\/limit\/?$/i.test(normalized)) {
      return normalized;
    }
    return normalized.replace(/\/+$/, '') + '/api/monitor/usage/quota/limit';
  }

  private normalizeRegion(region?: string): 'global' | 'bigmodel-cn' {
    const value = (region || '').trim().toLowerCase();
    if (value === 'cn' || value === 'china' || value === 'bigmodel-cn' || value === 'zai_bigmodel_cn') {
      return 'bigmodel-cn';
    }
    return 'global';
  }

  private extractApiKey(credentials: Credential): string | null {
    if (credentials.type === AuthType.API_KEY) {
      return credentials.value;
    }
    return null;
  }

  private buildHeaders(apiKey: string): Record<string, string> {
    return {
      Authorization: `Bearer ${apiKey}`,
      Accept: 'application/json',
    };
  }

  private safeURLForLogging(url: string): string {
    try {
      const parsed = new URL(url);
      return `${parsed.host}${parsed.pathname || '/'}`;
    } catch {
      return 'invalid-url';
    }
  }

  private toNumber(value: unknown): number | undefined {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'string' && value.trim()) {
      const parsed = Number(value);
      if (Number.isFinite(parsed)) return parsed;
    }
    return undefined;
  }

  private toDate(value: unknown): Date | undefined {
    const n = this.toNumber(value);
    if (typeof n !== 'number') return undefined;
    const timestamp = n > 1_000_000_000_000 ? n : n * 1000;
    const date = new Date(timestamp);
    return Number.isNaN(date.getTime()) ? undefined : date;
  }
}

export const zaiAdapter = new ZaiAdapter();
