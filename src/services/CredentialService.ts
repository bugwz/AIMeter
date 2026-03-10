import { UsageProvider, Credential, ProviderConfig, AuthType } from '../types';
import { apiService } from './ApiService';

export interface ProviderCredentialInfo {
  type: AuthType;
  maskedValue: string;
}

export class CredentialService {
  async saveConfig(provider: UsageProvider, config: ProviderConfig): Promise<string> {
    const authType = config.credentials.type.toString();
    const credentialValue = this.serializeCredential(provider, config.credentials);

    const result = await apiService.addProvider(
      provider,
      credentialValue,
      authType,
      {
        refreshInterval: config.refreshInterval,
        region: config.region,
        name: config.name,
        claudeAuthMode: config.claudeAuthMode,
        plan: config.plan,
        opencodeWorkspaceId: config.opencodeWorkspaceId,
        defaultProgressItem: config.defaultProgressItem,
      }
    );
    
    return result.id;
  }

  private serializeCredential(provider: UsageProvider, credential: Credential): string {
    if (credential.type === AuthType.COOKIE) {
      return credential.value;
    }

    if (credential.type === AuthType.API_KEY) {
      return credential.value;
    }

    if (credential.type === AuthType.OAUTH) {
      if (provider === UsageProvider.CLAUDE) {
        const hasBundleFields = Boolean(
          credential.refreshToken
            || credential.clientId
            || credential.clientSecret
            || credential.expiresAt
            || credential.idToken,
        );
        if (hasBundleFields) {
          return JSON.stringify({
            accessToken: credential.accessToken,
            refreshToken: credential.refreshToken,
            idToken: credential.idToken,
            expiresAt: credential.expiresAt instanceof Date
              ? credential.expiresAt.toISOString()
              : credential.expiresAt,
            clientId: credential.clientId,
            clientSecret: credential.clientSecret,
            projectId: credential.projectId,
          });
        }
      }

      return credential.accessToken;
    }

    return credential.value;
  }

  async updateConfig(id: string, config: ProviderConfig): Promise<void> {
    const authType = config.credentials.type.toString();
    const credentialValue = this.serializeCredential(config.provider, config.credentials);

    await apiService.updateProvider(id, {
      authType,
      credentials: credentialValue,
      refreshInterval: config.refreshInterval,
      region: config.region,
      name: config.name,
      claudeAuthMode: config.claudeAuthMode,
      plan: config.plan,
      opencodeWorkspaceId: config.opencodeWorkspaceId,
      defaultProgressItem: config.defaultProgressItem,
    });
  }
  
  async getAllConfigs(): Promise<(ProviderConfig & { id: string })[]> {
    try {
      const providers = await apiService.getProviders();
      
      return providers.map(p => ({
        id: p.id,
        provider: p.provider,
        credentials: { type: AuthType.COOKIE, value: '' } as Credential,
        refreshInterval: p.refreshInterval,
        displayOrder: p.displayOrder,
        region: p.region,
        name: p.name || undefined,
        claudeAuthMode: p.claudeAuthMode,
        plan: p.plan,
        opencodeWorkspaceId: p.opencodeWorkspaceId,
        defaultProgressItem: p.defaultProgressItem || undefined,
      }));
    } catch {
      return [];
    }
  }

  async getAllConfigsWithCredentials(): Promise<(ProviderConfig & { id: string })[]> {
    try {
      const providers = await apiService.getCredentials();
      
      return providers.map(p => ({
        id: p.id,
        provider: p.provider,
        credentials: p.credentials as Credential,
        refreshInterval: p.refreshInterval,
        displayOrder: p.displayOrder,
        region: p.region,
        name: p.name || undefined,
        claudeAuthMode: p.claudeAuthMode,
        plan: p.plan,
        opencodeWorkspaceId: p.opencodeWorkspaceId,
        defaultProgressItem: p.defaultProgressItem || undefined,
      }));
    } catch {
      return [];
    }
  }
  
  async getConfig(id: string): Promise<(ProviderConfig & { id: string }) | null> {
    const configs = await this.getAllConfigs();
    return configs.find(c => c.id === id) || null;
  }

  async getConfigWithCredentials(id: string): Promise<(ProviderConfig & { id: string }) | null> {
    try {
      const provider = await apiService.getProvider(id);
      return {
        id: provider.id,
        provider: provider.provider,
        credentials: provider.credentials,
        refreshInterval: provider.refreshInterval,
        displayOrder: provider.displayOrder,
        region: provider.region,
        name: provider.name || undefined,
        claudeAuthMode: provider.claudeAuthMode,
        plan: provider.plan,
        opencodeWorkspaceId: provider.opencodeWorkspaceId,
        defaultProgressItem: provider.defaultProgressItem || undefined,
      };
    } catch {
      return null;
    }
  }
  
  async deleteConfig(id: string): Promise<void> {
    await apiService.deleteProvider(id);
  }
  
  createCredential(type: AuthType, value: string): Credential {
    if (type === AuthType.API_KEY) {
      return { type, value, keyPrefix: value.substring(0, 8) };
    }
    if (type === AuthType.COOKIE) {
      return { type, value, source: 'manual' };
    }
    if (type === AuthType.OAUTH) {
      return { type, accessToken: value };
    }
    return { type, value };
  }
  
  sanitizeCredential(credential: Credential): Credential {
    if (credential.type === AuthType.API_KEY) {
      return {
        ...credential,
        value: this.maskKey(credential.value),
      };
    }
    if (credential.type === AuthType.COOKIE) {
      return {
        ...credential,
        value: '[COOKIE]',
      };
    }
    if (credential.type === AuthType.OAUTH) {
      return {
        ...credential,
        accessToken: '[TOKEN]',
        refreshToken: credential.refreshToken ? '[TOKEN]' : undefined,
        idToken: credential.idToken ? '[TOKEN]' : undefined,
        clientSecret: credential.clientSecret ? '[SECRET]' : undefined,
      };
    }
    if (credential.type === AuthType.JWT) {
      return {
        ...credential,
        value: '[JWT]',
      };
    }
    return credential;
  }
  
  private maskKey(key: string): string {
    if (key.length <= 8) return '****';
    return key.substring(0, 4) + '****' + key.substring(key.length - 4);
  }
}

export const credentialService = new CredentialService();
