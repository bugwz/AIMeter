// OpenRouter provider adapter implementation
import { IProviderAdapter, ValidationResult } from './interface.js';
import { 
  UsageProvider, 
  AuthType, 
  Credential, 
  UsageSnapshot, 
  ProviderMeta,
  ProgressItem,
  ProviderSpecificData,
} from '../types/index.js';
import { roundPercentage } from './utils.js';

interface OpenRouterCreditsResponse {
  data: {
    total_credits: number;
    total_usage: number;
  };
}

interface OpenRouterKeyResponse {
  data: {
    label: string;
    is_free_tier: boolean;
    limit: number | null;
    limit_reset: string | null;
    limit_remaining: number | null;
    usage: number;
    usage_daily: number;
    usage_weekly: number;
    usage_monthly: number;
    rate_limit?: { requests: number; interval: string };
  };
}

const OPENROUTER_META: ProviderMeta = {
  id: UsageProvider.OPENROUTER,
  name: 'OpenRouter',
  logo: '/providers/openrouter.svg',
  color: '#635BFF',
  supportedAuthTypes: [AuthType.API_KEY],
  docsUrl: 'https://openrouter.ai/docs',
};

export class OpenRouterAdapter implements IProviderAdapter {
  readonly id = UsageProvider.OPENROUTER;
  readonly meta = OPENROUTER_META;
  
  private readonly baseURL = 'https://openrouter.ai/api/v1';
  
  async validateCredentials(credentials: Credential): Promise<ValidationResult> {
    try {
      const apiKey = this.extractAPIKey(credentials);
      if (!apiKey) {
        return { valid: false, reason: 'No API key provided' };
      }
      
      const response = await fetch(`${this.baseURL}/credits`, {
        headers: { 'Authorization': `Bearer ${apiKey}` },
      });
      
      if (response.status === 401 || response.status === 403) {
        return { valid: false, reason: 'Invalid API key' };
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
    const apiKey = this.extractAPIKey(credentials);
    if (!apiKey) {
      throw new Error('No API key provided');
    }
    
    const [creditsRes, keyRes] = await Promise.all([
      fetch(`${this.baseURL}/credits`, {
        headers: { 
          'Authorization': `Bearer ${apiKey}`,
          'Accept': 'application/json',
        },
      }),
      fetch(`${this.baseURL}/key`, {
        headers: { 
          'Authorization': `Bearer ${apiKey}`,
          'Accept': 'application/json',
        },
      }).catch(() => null as Response | null),
    ]);
    
    if (!creditsRes.ok) {
      throw new Error(`OpenRouter API error: ${creditsRes.status}`);
    }
    
    const credits = await creditsRes.json() as OpenRouterCreditsResponse;
    const key = keyRes ? await keyRes.json().catch(() => null) as OpenRouterKeyResponse | null : null;
    // Debug only: response may include account/usage details; keep commented in normal runs.
    // console.log('OpenRouter API response (credits):', JSON.stringify(credits));
    // if (key) {
    //   console.log('OpenRouter API response (key):', JSON.stringify(key));
    // }
    
    const { progress } = this.parseUsage(credits, key);
    
    return {
      provider: UsageProvider.OPENROUTER,
      progress,
      identity: {
        plan: 'Pay as you go',
      },
      updatedAt: new Date(),
    };
  }
  
  getErrorMessage(error: unknown): string {
    if (error instanceof Error) {
      if (error.message.includes('401')) {
        return 'OpenRouter API key invalid. Please check your key.';
      }
      if (error.message.includes('429')) {
        return 'Rate limit exceeded. Please wait and try again.';
      }
      return error.message;
    }
    return 'Failed to fetch OpenRouter usage';
  }
  
  private extractAPIKey(credentials: Credential): string | null {
    if (credentials.type === AuthType.API_KEY) {
      return credentials.value;
    }
    return null;
  }
  
  private getResetLabel(limitReset: string | null): string {
    switch (limitReset) {
      case 'daily':
        return 'Daily Credits';
      case 'weekly':
        return 'Weekly Credits';
      case 'monthly':
        return 'Monthly Credits';
      default:
        return 'Credits';
    }
  }

  private getResetWindowDescription(limitReset: string | null): string {
    switch (limitReset) {
      case 'daily':
        return '1 day window';
      case 'weekly':
        return '7 days window';
      case 'monthly':
        return '30 days window';
      default:
        return 'total window';
    }
  }

  private getTotalCreditsDescription(): string {
    return 'total window';
  }

  private calculateResetTime(limitReset: string | null): Date | undefined {
    if (!limitReset) return undefined;

    const now = new Date();
    const utcNow = new Date(Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth(),
      now.getUTCDate(),
      now.getUTCHours(),
      now.getUTCMinutes(),
      now.getUTCSeconds()
    ));

    let resetDate: Date;

    switch (limitReset) {
      case 'daily':
        resetDate = new Date(Date.UTC(
          utcNow.getUTCFullYear(),
          utcNow.getUTCMonth(),
          utcNow.getUTCDate() + 1,
          0, 0, 0
        ));
        break;
      case 'weekly':
        const dayOfWeek = utcNow.getUTCDay();
        const daysUntilMonday = dayOfWeek === 0 ? 1 : (8 - dayOfWeek);
        resetDate = new Date(Date.UTC(
          utcNow.getUTCFullYear(),
          utcNow.getUTCMonth(),
          utcNow.getUTCDate() + daysUntilMonday,
          0, 0, 0
        ));
        break;
      case 'monthly':
        resetDate = new Date(Date.UTC(
          utcNow.getUTCMonth() === 11 ? utcNow.getUTCFullYear() + 1 : utcNow.getUTCFullYear(),
          utcNow.getUTCMonth() === 11 ? 0 : utcNow.getUTCMonth() + 1,
          1,
          0, 0, 0
        ));
        break;
      default:
        return undefined;
    }

    return resetDate;
  }
  
  private parseUsage(
    credits: OpenRouterCreditsResponse,
    key: OpenRouterKeyResponse | null
  ): { 
    progress: ProgressItem[];
    providerData: ProviderSpecificData;
  } {
    const totalCredits = credits.data.total_credits;
    const totalUsage = credits.data.total_usage;
    const balance = totalCredits - totalUsage;
    
    const progress: ProgressItem[] = [];
    
    const formatCurrency = (value: number): number => {
      return Math.round(value * 100) / 100;
    };
    
    if (key?.data?.limit !== null && key?.data?.limit !== undefined && key?.data?.usage !== undefined) {
      const keyUsed = formatCurrency(key.data.usage);
      const limitTotal = formatCurrency(key.data.limit - key.data.usage);
      const resetLabel = this.getResetLabel(key.data.limit_reset);
      const resetsAt = this.calculateResetTime(key.data.limit_reset);
      
      progress.push({
        name: resetLabel,
        desc: this.getResetWindowDescription(key.data.limit_reset),
        usedPercent: roundPercentage(limitTotal > 0 ? (keyUsed / limitTotal) * 100 : 0),
        used: keyUsed,
        limit: limitTotal,
        remainingPercent: roundPercentage(limitTotal > 0 ? ((limitTotal - keyUsed) / limitTotal) * 100 : 0) || undefined,
        resetsAt,
      });
    }
    
    // Progress item 2: Credits (from /credits)
    const creditsUsed = formatCurrency(totalUsage);
    const creditsLimit = formatCurrency(totalCredits);
    const creditsBalance = formatCurrency(balance);
    
    progress.push({
      name: 'Total Credits',
      desc: this.getTotalCreditsDescription(),
      usedPercent: roundPercentage(creditsLimit > 0 ? (creditsUsed / creditsLimit) * 100 : 0),
      used: creditsUsed,
      limit: creditsLimit,
      remainingPercent: roundPercentage(creditsLimit > 0 ? (creditsBalance / creditsLimit) * 100 : 0) || undefined,
    });

    const providerData: ProviderSpecificData = {
      totalCredits: creditsLimit,
      totalUsage: creditsUsed,
      balance: creditsBalance,
    };
    
    if (key?.data) {
      providerData.keyLimit = key.data.limit ?? undefined;
      providerData.keyUsage = key.data.usage;
      providerData.rateLimit = key.data.rate_limit;
      providerData.limitReset = key.data.limit_reset ?? undefined;
    }
    
    return { progress, providerData };
  }
}

export const openRouterAdapter = new OpenRouterAdapter();
