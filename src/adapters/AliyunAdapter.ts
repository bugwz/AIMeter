import { IProviderAdapter, ValidationResult } from './interface.js';
import {
  AuthType,
  Credential,
  ProgressItem,
  ProviderConfig,
  ProviderMeta,
  UsageProvider,
  UsageSnapshot,
} from '../types/index.js';
import { fetchWithTimeout, roundPercentage } from './utils.js';

const ALIYUN_GATEWAY_URL = 'https://bailian-cs.console.aliyun.com/data/api.json?action=BroadScopeAspnGateway&product=sfm_bailian&api=zeldaEasy.broadscope-bailian.codingPlan.queryCodingPlanInstanceInfoV2&_v=undefined';
const ALIYUN_API = 'zeldaEasy.broadscope-bailian.codingPlan.queryCodingPlanInstanceInfoV2';

interface AliyunGatewayEnvelope {
  code?: string;
  data?: {
    success?: boolean;
    errorMsg?: string;
    errorCode?: string;
    DataV2?: {
      ret?: string[];
      data?: {
        data?: {
          codingPlanInstanceInfos?: AliyunCodingPlanInstance[];
          userId?: string;
        };
        success?: boolean;
        failed?: boolean;
      };
    };
  };
}

interface AliyunCodingPlanInstance {
  codingPlanQuotaInfo?: {
    perBillMonthUsedQuota?: number;
    perBillMonthTotalQuota?: number;
    perBillMonthQuotaNextRefreshTime?: number;
    per5HourUsedQuota?: number;
    per5HourTotalQuota?: number;
    per5HourQuotaNextRefreshTime?: number;
    perWeekUsedQuota?: number;
    perWeekTotalQuota?: number;
    perWeekQuotaNextRefreshTime?: number;
  };
  instanceId?: string;
  instanceName?: string;
  instanceType?: string;
  remainingDays?: number;
  status?: string;
  chargeType?: string;
  chargeAmount?: number;
  instanceStartTime?: number;
  instanceEndTime?: number;
  autoRenewFlag?: boolean;
}

interface PreparedRequest {
  cookie: string;
  referer: string;
  region: string;
  secToken: string;
  params: Record<string, unknown>;
}

const ALIYUN_META: ProviderMeta = {
  id: UsageProvider.ALIYUN,
  name: 'Aliyun',
  logo: '/providers/aliyun.svg',
  color: '#FF6A00',
  supportedAuthTypes: [AuthType.COOKIE],
  docsUrl: 'https://bailian.console.aliyun.com/',
};

export class AliyunAdapter implements IProviderAdapter {
  readonly id = UsageProvider.ALIYUN;
  readonly meta = ALIYUN_META;

  async validateCredentials(credentials: Credential, config?: ProviderConfig): Promise<ValidationResult> {
    try {
      const request = await this.buildRequest(credentials, config);
      const response = await this.fetchGateway(request);
      const { instance, errorMessage } = this.extractPrimaryInstance(response);
      if (!instance) {
        return { valid: false, reason: errorMessage || 'Aliyun response did not include Coding Plan quota data' };
      }
      return { valid: true };
    } catch (error) {
      return { valid: false, reason: this.getErrorMessage(error) };
    }
  }

  async fetchUsage(credentials: Credential, config?: ProviderConfig): Promise<UsageSnapshot> {
    const request = await this.buildRequest(credentials, config);
    const response = await this.fetchGateway(request);
    const { instance, errorMessage } = this.extractPrimaryInstance(response);
    // Debug only: response may include account/usage details; keep commented in normal runs.
    // console.log('Aliyun API response (gateway):', JSON.stringify(response));

    if (!instance || !instance.codingPlanQuotaInfo) {
      throw new Error(errorMessage || 'Aliyun response did not include Coding Plan quota data');
    }

    // Debug only: response may include account/usage details; keep commented in normal runs.
    // console.log('Aliyun API response (instance):', JSON.stringify({ instance }));

    return {
      provider: UsageProvider.ALIYUN,
      progress: this.buildProgress(instance.codingPlanQuotaInfo),
      identity: {
        plan: instance.instanceName || 'Coding Plan',
      },
      updatedAt: new Date(),
    };
  }

  getErrorMessage(error: unknown): string {
    if (error instanceof Error) {
      if (/401|403/.test(error.message)) {
        return 'Aliyun cookie is expired. Please update browser cookie.';
      }
      return error.message;
    }
    return 'Failed to fetch Aliyun usage';
  }

  private async buildRequest(credentials: Credential, config?: ProviderConfig): Promise<PreparedRequest> {
    const cookie = this.normalizeCookieCredential(credentials);
    const region = this.resolveRegion(config?.region, cookie);
    const referer = `https://bailian.console.aliyun.com/${region}/?tab=coding-plan`;
    const secToken = await this.resolveSecToken(cookie, referer);
    return {
      cookie,
      referer,
      region,
      secToken,
      params: this.buildParams(region, cookie),
    };
  }

  private normalizeCookieCredential(credentials: Credential): string {
    if (credentials.type !== AuthType.COOKIE) {
      throw new Error('Aliyun requires browser cookie authentication');
    }

    let value = credentials.value.trim();
    if (!value) {
      throw new Error('Cookie is required');
    }

    value = value.replace(/^cookie:\s*/i, '').replace(/^"(.*)"$/, '$1').trim();

    if (/^curl\s+/i.test(value)) {
      throw new Error('Please paste Cookie only, not cURL');
    }
    if (!value.includes('=')) {
      throw new Error('Invalid cookie format');
    }

    return value;
  }

  private async resolveSecToken(cookie: string, referer: string): Promise<string> {
    const direct = this.readCookieValue(cookie, ['sec_token', 'secToken']);
    if (direct) return direct;

    const response = await fetchWithTimeout(referer, {
      method: 'GET',
      headers: {
        accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        cookie,
      },
    });

    if (!response.ok) {
      if (response.status === 401 || response.status === 403) {
        throw new Error(`Aliyun page unauthorized (${response.status})`);
      }
      throw new Error(`Failed to load Aliyun console page (${response.status})`);
    }

    const html = await response.text();
    const patterns = [
      /[?&]sec_token=([A-Za-z0-9_-]+)/i,
      /"sec_token"\s*:\s*"([^"]+)"/i,
      /sec_token['"]?\s*[:=]\s*['"]([^'"]+)['"]/i,
      /secToken['"]?\s*[:=]\s*['"]([^'"]+)['"]/i,
    ];

    for (const pattern of patterns) {
      const match = html.match(pattern);
      if (match?.[1]) return decodeURIComponent(match[1]);
    }

    throw new Error('Unable to extract sec_token from Aliyun page. Refresh login and retry.');
  }

  private resolveRegion(region: string | undefined, cookie: string): string {
    const normalized = region?.trim();
    if (normalized) return normalized;
    return this.readCookieValue(cookie, ['currentRegionId']) || 'cn-beijing';
  }

  private readCookieValue(cookie: string, keys: string[]): string | undefined {
    const pairs = cookie.split(';').map(item => item.trim()).filter(Boolean);
    for (const pair of pairs) {
      const separator = pair.indexOf('=');
      if (separator <= 0) continue;
      const key = pair.slice(0, separator).trim();
      if (!keys.includes(key)) continue;
      const rawValue = pair.slice(separator + 1).trim();
      if (!rawValue) continue;
      try {
        return decodeURIComponent(rawValue);
      } catch {
        return rawValue;
      }
    }
    return undefined;
  }

  private buildParams(region: string, cookie: string): Record<string, unknown> {
    const anonymousId = this.readCookieValue(cookie, ['cna']) || '';
    return {
      Api: ALIYUN_API,
      V: '1.0',
      Data: {
        queryCodingPlanInstanceInfoRequest: {
          commodityCode: 'sfm_codingplan_public_cn',
          onlyLatestOne: true,
        },
        cornerstoneParam: {
          feTraceId: this.generateTraceId(),
          feURL: `https://bailian.console.aliyun.com/${region}/?tab=coding-plan#/efm/detail`,
          protocol: 'V2',
          console: 'ONE_CONSOLE',
          productCode: 'p_efm',
          domain: 'bailian.console.aliyun.com',
          consoleSite: 'BAILIAN_ALIYUN',
          userNickName: '',
          userPrincipalName: '',
          xsp_lang: 'zh-CN',
          'X-Anonymous-Id': anonymousId,
        },
      },
    };
  }

  private async fetchGateway(request: PreparedRequest): Promise<AliyunGatewayEnvelope> {
    const body = new URLSearchParams({
      params: JSON.stringify(request.params),
      region: request.region,
      sec_token: request.secToken,
    });

    const response = await fetchWithTimeout(ALIYUN_GATEWAY_URL, {
      method: 'POST',
      headers: {
        accept: '*/*',
        'content-type': 'application/x-www-form-urlencoded',
        origin: 'https://bailian.console.aliyun.com',
        referer: request.referer,
        cookie: request.cookie,
      },
      body,
    });

    if (response.status === 401 || response.status === 403) {
      throw new Error(`Aliyun request unauthorized (${response.status})`);
    }
    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Aliyun request failed with HTTP ${response.status}: ${text}`);
    }

    return await response.json() as AliyunGatewayEnvelope;
  }

  private extractPrimaryInstance(response: AliyunGatewayEnvelope): {
    instance?: AliyunCodingPlanInstance;
    userId?: string;
    errorMessage?: string;
  } {
    const gatewayError = response.data?.errorMsg || response.data?.errorCode;
    const ret = response.data?.DataV2?.ret || [];
    const successRet = ret.some(item => item.startsWith('SUCCESS'));
    const nested = response.data?.DataV2?.data;
    const instances = nested?.data?.codingPlanInstanceInfos || [];
    const instance = instances[0];

    if (response.code !== '200' || response.data?.success !== true || nested?.failed || !successRet) {
      return { errorMessage: gatewayError || ret[0] || 'Aliyun gateway returned an unsuccessful response' };
    }

    if (!instance) {
      return {
        userId: nested?.data?.userId,
        errorMessage: 'No Coding Plan instance found in Aliyun response',
      };
    }

    return { instance, userId: nested?.data?.userId };
  }

  private buildProgress(quota: NonNullable<AliyunCodingPlanInstance['codingPlanQuotaInfo']>): ProgressItem[] {
    return [
      this.createProgressItem('Session', quota.per5HourUsedQuota, quota.per5HourTotalQuota, quota.per5HourQuotaNextRefreshTime, 300, '5 hours window'),
      this.createProgressItem('Weekly', quota.perWeekUsedQuota, quota.perWeekTotalQuota, quota.perWeekQuotaNextRefreshTime, 10080, '7 days window'),
      this.createProgressItem('Monthly', quota.perBillMonthUsedQuota, quota.perBillMonthTotalQuota, quota.perBillMonthQuotaNextRefreshTime, 43200, '30 days window'),
    ].filter((item): item is ProgressItem => Boolean(item));
  }

  private createProgressItem(
    name: string,
    usedValue: number | undefined,
    limitValue: number | undefined,
    resetTimestamp: number | undefined,
    windowMinutes: number,
    desc?: string,
  ): ProgressItem | null {
    const used = Number(usedValue ?? 0);
    const limit = Number(limitValue ?? 0);
    if (!Number.isFinite(limit) || limit <= 0) return null;
    const remaining = Math.max(limit - used, 0);

    return {
      name,
      desc: desc || '',
      usedPercent: roundPercentage((used / limit) * 100),
      remainingPercent: roundPercentage((remaining / limit) * 100),
      used,
      limit,
      windowMinutes,
      resetsAt: resetTimestamp ? new Date(resetTimestamp) : undefined,
    };
  }

  private generateTraceId(): string {
    if (typeof globalThis.crypto?.randomUUID === 'function') {
      return globalThis.crypto.randomUUID();
    }
    return `aliyun-${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;
  }
}

export const aliyunAdapter = new AliyunAdapter();
