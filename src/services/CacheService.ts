// Cache service implementation
interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

export class CacheService {
  private store: Map<string, CacheEntry<unknown>> = new Map();
  
  async get<T>(key: string): Promise<T | null> {
    const entry = this.store.get(key) as CacheEntry<T> | undefined;
    
    if (!entry) {
      return null;
    }
    
    if (Date.now() > entry.expiresAt) {
      this.store.delete(key);
      return null;
    }
    
    return entry.value;
  }
  
  async set<T>(key: string, value: T, options?: { ttl?: number }): Promise<void> {
    const ttl = options?.ttl ?? 5 * 60 * 1000;
    this.store.set(key, {
      value,
      expiresAt: Date.now() + ttl,
    });
  }
  
  async delete(key: string): Promise<void> {
    this.store.delete(key);
  }
  
  async clear(): Promise<void> {
    this.store.clear();
  }
  
  async has(key: string): Promise<boolean> {
    const entry = this.store.get(key);
    if (!entry) return false;
    if (Date.now() > entry.expiresAt) {
      this.store.delete(key);
      return false;
    }
    return true;
  }
}

export const cacheService = new CacheService();
