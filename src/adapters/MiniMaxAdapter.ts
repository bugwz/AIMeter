// MiniMax provider adapter implementation
import { IProviderAdapter, ValidationResult } from './interface';
import { 
  UsageProvider, 
  AuthType, 
  Credential, 
  UsageSnapshot, 
  ProviderMeta,
  ProgressItem,
  ProviderConfig,
} from '../types';
import { formatWindowDurationFromMinutes, roundPercentage } from './utils';

interface MiniMaxUsageResponse {
  model_remains?: {
    model_name?: string;
    current_interval_total_count: number;
    current_interval_usage_count: number;
    remains_time: number;
    start_time: number;
    end_time: number;
  }[];
  base_resp?: {
    status_code: number;
    status_msg: string;
  };
  data?: {
    current_subscribe_title?: string;
    plan_name?: string;
    combo_title?: string;
    current_plan_title?: string;
    current_combo_card?: {
      title?: string;
    };
  };
}

interface MiniMaxUserInfoResponse {
  base_resp?: {
    status_code: number;
    status_msg: string;
  };
  data?: {
    email?: string;
    phone?: string;
    nickname?: string;
    is_vip?: boolean;
    vip_type?: number;
  };
}

const MINIMAX_META: ProviderMeta = {
  id: UsageProvider.MINIMAX,
  name: 'MiniMax',
  logo: '/providers/minimax.svg',
  color: '#2A2A2A',
  supportedAuthTypes: [AuthType.COOKIE, AuthType.API_KEY],
  docsUrl: 'https://platform.minimax.io',
};

export class MiniMaxAdapter implements IProviderAdapter {
  readonly id = UsageProvider.MINIMAX;
  readonly meta = MINIMAX_META;
  
  private normalizeRegion(region?: string): string | undefined {
    if (region === 'minimax_cn' || region === 'cn') return 'cn';
    if (region === 'minimax_global' || region === 'global') return 'global';
    return undefined;
  }

  private getUserInfoURL(region?: string): string {
    const normalizedRegion = this.normalizeRegion(region);
    const isCN = normalizedRegion === 'cn';
    
    if (isCN) {
      return 'https://platform.minimaxi.com/v1/api/openplatform/user/info';
    }
    return 'https://platform.minimax.io/v1/api/openplatform/user/info';
  }

  private getAPIURL(credentials: Credential, region?: string): string {
    const normalizedRegion = this.normalizeRegion(region);
    const isCN = normalizedRegion === 'cn';
    
    // Choose API endpoint by credential type
    // API key uses api.minimax.io / api.minimaxi.com
    // Cookie uses platform.minimax.io / platform.minimaxi.com
    if (credentials.type === AuthType.API_KEY) {
      if (isCN) {
        return 'https://api.minimaxi.com/v1/api/openplatform/coding_plan/remains';
      }
      return 'https://api.minimax.io/v1/api/openplatform/coding_plan/remains';
    }
    
    // Cookie authentication
    if (isCN) {
      return 'https://platform.minimaxi.com/v1/api/openplatform/coding_plan/remains';
    }
    return 'https://platform.minimax.io/v1/api/openplatform/coding_plan/remains';
  }
  
  private getHTMLURL(region?: string): string {
    const normalizedRegion = this.normalizeRegion(region);
    
    if (normalizedRegion === 'cn') {
      return 'https://platform.minimaxi.com/user-center/payment/coding-plan?cycle_type=3';
    }
    return 'https://platform.minimax.io/user-center/payment/coding-plan?cycle_type=3';
  }

  private async fetchPlanNameFromHTML(credentials: Credential, region?: string): Promise<string | undefined> {
    try {
      const htmlURL = this.getHTMLURL(region);
      const { headers } = this.buildRequest(credentials, region);
      
      headers['accept'] = 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8';
      headers['x-requested-with'] = 'XMLHttpRequest';
      
      const response = await fetch(htmlURL, {
        method: 'GET',
        headers,
      });
      
      if (!response.ok) return undefined;
      
      const html = await response.text();
      
      const nextDataMatch = html.match(/<script[^>]*id="__NEXT_DATA__"[^>]*>([^<]+)<\/script>/);
      if (nextDataMatch) {
        const nextData = JSON.parse(nextDataMatch[1]);
        const planName = this.extractPlanFromNextData(nextData);
        if (planName) return planName;
      }
      
      const planPatterns = [
        /"planName"\s*:\s*"([^"]+)"/,
        /"plan"\s*:\s*"([^"]+)"/,
        /"packageName"\s*:\s*"([^"]+)"/,
        /Coding\s*Plan\s*([A-Za-z0-9][A-Za-z0-9\s._-]{0,32})/i,
      ];
      
      for (const pattern of planPatterns) {
        const match = html.match(pattern);
        if (match && match[1]) {
          return match[1].trim();
        }
      }
      
      return undefined;
    } catch {
      return undefined;
    }
  }
  
  private extractPlanFromNextData(obj: any): string | undefined {
    if (!obj || typeof obj !== 'object') return undefined;
    
    if (obj.props?.pageProps) {
      const pageProps = obj.props.pageProps;
      const candidates = [
        pageProps.currentSubscribeTitle,
        pageProps.planName,
        pageProps.comboTitle,
        pageProps.currentPlanTitle,
        pageProps.currentComboCard?.title,
        pageProps.userInfo?.vipType,
      ];
      
      for (const candidate of candidates) {
        if (candidate && typeof candidate === 'string' && candidate.trim()) {
          return candidate.trim();
        }
      }
    }
    
    for (const value of Object.values(obj)) {
      const result = this.extractPlanFromNextData(value);
      if (result) return result;
    }
    
    return undefined;
  }
  
  async validateCredentials(credentials: Credential, config?: ProviderConfig): Promise<ValidationResult> {
    try {
      const region = config?.region;
      const response = await this.fetchWithCredentials(credentials, region);
      if (response.status === 401 || response.status === 403) {
        return { valid: false, reason: 'Invalid credentials' };
      }
      if (!response.ok) {
        return { valid: false, reason: `HTTP ${response.status}` };
      }
      const payload = await response.json() as MiniMaxUsageResponse;
      const apiError = this.getApiError(payload);
      if (apiError) {
        return { valid: false, reason: apiError };
      }
      return { valid: true };
    } catch (error) {
      return { valid: false, reason: error instanceof Error ? error.message : 'Validation failed' };
    }
  }
  
  async fetchUsage(credentials: Credential, config?: ProviderConfig): Promise<UsageSnapshot> {
    const region = config?.region;
    const [usageResponse, userInfo, planNameFromHTML] = await Promise.all([
      this.fetchWithCredentials(credentials, region),
      this.fetchUserInfo(credentials, region).catch(() => null),
      this.fetchPlanNameFromHTML(credentials, region).catch(() => undefined),
    ]);
    
    if (!usageResponse.ok) {
      const errorText = await usageResponse.text();
      console.error('MiniMax API error:', usageResponse.status, errorText);
      if (usageResponse.status === 401 || usageResponse.status === 403) {
        throw new Error('Invalid or expired MiniMax credentials');
      }
      throw new Error(`MiniMax API error: ${usageResponse.status} - ${errorText}`);
    }
    
    const data = await usageResponse.json() as MiniMaxUsageResponse;
    // Debug only: response may include account/usage details; keep commented in normal runs.
    // console.log('MiniMax API response:', JSON.stringify(data));
    
    // Check API-level error response
    if (data && data.base_resp) {
      const apiError = this.getApiError(data);
      if (apiError) {
        throw new Error(apiError);
      }
    }
    
    return this.parseUsage(data, userInfo, planNameFromHTML, region);
  }

  private async fetchUserInfo(credentials: Credential, region?: string): Promise<MiniMaxUserInfoResponse | null> {
    try {
      const userInfoURL = this.getUserInfoURL(region);
      const { headers } = this.buildRequest(credentials, region);
      
      const response = await fetch(userInfoURL, {
        method: 'GET',
        headers,
      });
      
      if (!response.ok) return null;
      return await response.json() as MiniMaxUserInfoResponse;
    } catch {
      return null;
    }
  }
  
  // Backward compatibility: allow calls without config
  async fetchUsageWithConfig(credentials: Credential, config: ProviderConfig): Promise<UsageSnapshot> {
    return this.fetchUsage(credentials, config);
  }
  
  getErrorMessage(error: unknown): string {
    if (error instanceof Error) {
      if (error.message.includes('401') || error.message.includes('403')) {
        return 'MiniMax credentials expired. Please re-authenticate.';
      }
      if (error.message.includes('empty body')) {
        return 'Empty response. Check region setting (Global vs China).';
      }
      return error.message;
    }
    return 'Failed to fetch MiniMax usage';
  }
  
  private async fetchWithCredentials(credentials: Credential, region?: string): Promise<Response> {
    const { headers, url } = this.buildRequest(credentials, region);
    
    return fetch(url, {
      method: 'GET',
      headers,
    });
  }
  
  private buildRequest(credentials: Credential, region?: string): { headers: Record<string, string>; url: string } {
    const normalizedRegion = this.normalizeRegion(region);
    
    const headers: Record<string, string> = {
      'Accept': 'application/json, text/plain, */*',
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept-Language': 'en-US,en;q=0.9',
    };
    
    const htmlURL = this.getHTMLURL(region);
    
    if (credentials.type === AuthType.COOKIE) {
      headers['Cookie'] = credentials.value;
      headers['Origin'] = normalizedRegion === 'cn' ? 'https://platform.minimaxi.com' : 'https://platform.minimax.io';
      headers['Referer'] = htmlURL;
    } else if (credentials.type === AuthType.API_KEY) {
      headers['Authorization'] = `Bearer ${credentials.value}`;
    }
    
    return { headers, url: this.getAPIURL(credentials, region) };
  }

  private getApiError(data: MiniMaxUsageResponse): string | null {
    const baseResp = data?.base_resp;
    if (!baseResp || baseResp.status_code === 0) return null;
    if (baseResp.status_code === 1004) {
      return 'MiniMax cookie is missing or expired. Please log in again and update your Cookie.';
    }
    return `MiniMax API error: ${baseResp.status_msg || 'Unknown error'} (code: ${baseResp.status_code})`;
  }
  
  private parseUsage(data: MiniMaxUsageResponse, userInfo?: MiniMaxUserInfoResponse | null, planNameFromHTML?: string, region?: string): UsageSnapshot {
    const modelRemains = data.model_remains || [];
    
    if (modelRemains.length === 0) {
      throw new Error('No usage data found');
    }
    
    const progress: ProgressItem[] = [];
    
    const primaryModel = modelRemains[0];
    const totalCount = primaryModel.current_interval_total_count;
    const remainingCount = primaryModel.current_interval_usage_count;
    const usedCount = totalCount - remainingCount;
    
    const endTime = primaryModel.end_time;
    const remainsSeconds = primaryModel.remains_time;
    
    const resetsAtDate = new Date(this.toTimestampMs(endTime));
    
    const limitValue = Math.round(totalCount / 15);
    const modelName = primaryModel.model_name?.toLowerCase() || '';
    const isHighSpeed = modelName.includes('highspeed') || modelName.includes('high-speed');
    
    const planName = this.getPlanNameFromUsage(data, planNameFromHTML, region, limitValue, isHighSpeed);
    const windowMinutes = this.calculateWindowMinutes(primaryModel.start_time, primaryModel.end_time);
    const modelNames = this.collectModelNames(modelRemains);
    
    progress.push({
      name: 'Prompt',
      desc: this.buildSharedModelsWindowDescription(windowMinutes, modelNames),
      usedPercent: roundPercentage(totalCount > 0 ? (usedCount / 15 / (totalCount / 15)) * 100 : 0),
      used: Math.round(usedCount / 15),
      limit: limitValue,
      remainingPercent: roundPercentage(totalCount > 0 ? (remainingCount / 15 / (totalCount / 15)) * 100 : 0) || undefined,
      windowMinutes,
      resetsAt: remainsSeconds > 0 ? resetsAtDate : undefined,
    });

    const identity = planName ? { plan: planName } : undefined;
    
    return {
      provider: UsageProvider.MINIMAX,
      progress,
      identity,
      updatedAt: new Date(),
    };
  }
  
  private getPlanNameFromUsage(data: MiniMaxUsageResponse, planNameFromHTML: string | undefined, region: string | undefined, limitValue: number, isHighSpeed: boolean): string | undefined {
    const normalizedRegion = this.normalizeRegion(region);
    const isCN = normalizedRegion === 'cn';
    
    let calculatedPlan: string | undefined;
    
    if (isCN) {
      if (limitValue === 40) calculatedPlan = 'Starter';
      else if (limitValue === 100) calculatedPlan = isHighSpeed ? 'Plus-Highspeed' : 'Plus';
      else if (limitValue === 300) calculatedPlan = isHighSpeed ? 'Max-High-Speed' : 'Max';
      else if (limitValue === 2000) calculatedPlan = 'Ultra-High-Speed';
    } else {
      if (limitValue === 100) calculatedPlan = 'Starter';
      else if (limitValue === 300) calculatedPlan = isHighSpeed ? 'Plus-High-Speed' : 'Plus';
      else if (limitValue === 1000) calculatedPlan = isHighSpeed ? 'Max-High-Speed' : 'Max';
      else if (limitValue === 2000) calculatedPlan = 'Ultra-High-Speed';
    }
    
    if (calculatedPlan) {
      return calculatedPlan;
    }
    
    if (planNameFromHTML) {
      return planNameFromHTML;
    }
    
    const apiPlanName = data.data?.current_subscribe_title 
      || data.data?.plan_name 
      || data.data?.combo_title 
      || data.data?.current_plan_title 
      || data.data?.current_combo_card?.title;
    
    if (apiPlanName) {
      return apiPlanName.trim();
    }
    
    return undefined;
  }
  
  private calculateWindowMinutes(startTime: number, endTime: number): number {
    const startMs = this.toTimestampMs(startTime);
    const endMs = this.toTimestampMs(endTime);
    if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) {
      return 0;
    }
    const windowMs = endMs - startMs;
    return Math.floor(windowMs / (1000 * 60));
  }

  private toTimestampMs(value: number): number {
    if (!Number.isFinite(value)) return NaN;
    // MiniMax may return unix seconds or milliseconds; normalize to ms.
    return value >= 1_000_000_000_000 ? value : value * 1000;
  }

  private collectModelNames(items: NonNullable<MiniMaxUsageResponse['model_remains']>): string[] {
    const models: string[] = [];
    const seen = new Set<string>();
    for (const item of items) {
      const name = typeof item.model_name === 'string' ? item.model_name.trim() : '';
      if (!name) continue;
      const key = name.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      models.push(name);
    }
    return models;
  }

  private buildSharedModelsWindowDescription(windowMinutes: number, modelNames: string[]): string {
    const duration = formatWindowDurationFromMinutes(windowMinutes);
    const base = duration ? `${duration} window` : 'window';
    if (!modelNames.length) return base;
    return `${base} for models: ${modelNames.join(', ')}`;
  }
}

export const miniMaxAdapter = new MiniMaxAdapter();
