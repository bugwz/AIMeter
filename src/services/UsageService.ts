// Usage query service
import { providerRegistry } from '../adapters';
import { 
  UsageProvider, 
  Credential, 
  UsageSnapshot, 
  UsageError,
  UsageErrorCode,
  BatchUsageResult,
  ProviderConfig,
} from '../types';
import { CacheService } from './CacheService';

export class UsageService {
  private cache: CacheService;
  
  constructor() {
    this.cache = new CacheService();
  }
  
  async fetchUsage(
    provider: UsageProvider, 
    credentials: Credential,
    useCache: boolean = true,
    config?: ProviderConfig
  ): Promise<UsageSnapshot> {
    const cacheKey = `usage:${provider}`;
    
    if (useCache) {
      const cached = await this.cache.get<UsageSnapshot>(cacheKey);
      if (cached && this.isCacheValid(cached)) {
        return cached;
      }
    }
    
    const adapter = providerRegistry.requireProvider(provider);
    
    try {
      const usage = await adapter.fetchUsage(credentials, config);
      await this.cache.set(cacheKey, usage, { ttl: 5 * 60 * 1000 });
      return usage;
    } catch (error) {
      throw this.wrapError(provider, error);
    }
  }
  
  async fetchAllUsage(
    configs: ProviderConfig[],
    onProgress?: (provider: UsageProvider, status: 'pending' | 'success' | 'error') => void
  ): Promise<BatchUsageResult> {
    const results = new Map<UsageProvider, UsageSnapshot | UsageError>();
    const startTime = Date.now();
    
    const promises = configs.map(async (config) => {
      onProgress?.(config.provider, 'pending');
      
      try {
        const usage = await this.fetchUsage(
          config.provider, 
          config.credentials,
          config.refreshInterval > 0,
          config
        );
        results.set(config.provider, usage);
        onProgress?.(config.provider, 'success');
      } catch (error) {
        const err = this.wrapError(config.provider, error);
        results.set(config.provider, err);
        onProgress?.(config.provider, 'error');
      }
    });
    
    await Promise.all(promises);
    
    return {
      results,
      timestamp: new Date(),
      duration: Date.now() - startTime,
    };
  }
  
  async validateCredentials(
    provider: UsageProvider,
    credentials: Credential,
    config?: ProviderConfig
  ): Promise<{ valid: boolean; reason?: string }> {
    const adapter = providerRegistry.getProvider(provider);
    if (!adapter) {
      return { valid: false, reason: `Provider ${provider} not found` };
    }
    
    return adapter.validateCredentials(credentials, config);
  }
  
  clearCache(provider?: UsageProvider): void {
    if (provider) {
      this.cache.delete(`usage:${provider}`);
    } else {
      this.cache.clear();
    }
  }
  
  private isCacheValid(usage: UsageSnapshot): boolean {
    const maxAge = 5 * 60 * 1000;
    return Date.now() - usage.updatedAt.getTime() < maxAge;
  }
  
  private wrapError(provider: UsageProvider, error: unknown): UsageError {
    const adapter = providerRegistry.getProvider(provider);
    const message = adapter?.getErrorMessage?.(error) 
      ?? (error instanceof Error ? error.message : 'Unknown error');
    
    let code = UsageErrorCode.UNKNOWN;
    if (error instanceof Response) {
      if (error.status === 401 || error.status === 403) {
        code = UsageErrorCode.INVALID_CREDENTIALS;
      } else if (error.status === 429) {
        code = UsageErrorCode.RATE_LIMIT_EXCEEDED;
      }
    }
    
    return {
      provider,
      code,
      message,
      statusCode: error instanceof Response ? error.status : undefined,
      timestamp: new Date(),
    };
  }
}

export const usageService = new UsageService();
