// Provider adapter registry implementation
import { IProviderAdapter, IProviderRegistry } from './interface.js';
import { UsageProvider, AuthType } from '../types/index.js';

// Adapter registry implementation
class ProviderRegistry implements IProviderRegistry {
  private adapters: Map<UsageProvider, IProviderAdapter> = new Map();
  
  registerAdapter(adapter: IProviderAdapter): void {
    this.adapters.set(adapter.id, adapter);
  }
  
  unregisterAdapter(providerId: UsageProvider): void {
    this.adapters.delete(providerId);
  }
  
  getAllProviders(): IProviderAdapter[] {
    return Array.from(this.adapters.values());
  }
  
  getProvider(id: UsageProvider): IProviderAdapter | undefined {
    return this.adapters.get(id);
  }
  
  requireProvider(id: UsageProvider): IProviderAdapter {
    const adapter = this.adapters.get(id);
    if (!adapter) {
      throw new Error(`Provider ${id} not registered`);
    }
    return adapter;
  }
  
  getProvidersByAuthType(authType: AuthType): IProviderAdapter[] {
    return this.getAllProviders().filter(p => 
      p.meta.supportedAuthTypes.includes(authType)
    );
  }
}

// Export singleton instance
export const providerRegistry = new ProviderRegistry();

// Export factory function
export function createAdapter(provider: UsageProvider): IProviderAdapter {
  return providerRegistry.requireProvider(provider);
}
