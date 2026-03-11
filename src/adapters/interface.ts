// Provider adapter interface definitions
import { UsageProvider, Credential, ProviderMeta, AuthType, ProviderConfig } from '../types/index.js';

/**
 * Provider adapter interface
 * Each LLM provider implements this interface to expose unified usage quota queries
 */
export interface IProviderAdapter {
  /** Unique identifier */
  readonly id: UsageProvider;
  
  /** Provider metadata */
  readonly meta: ProviderMeta;
  
  /**
   * Validate whether credentials are valid
   *  credentials Credentials to validate
   *  config Optional configuration including region and related settings
   *  Validation result
   */
  validateCredentials(credentials: Credential, config?: ProviderConfig): Promise<ValidationResult>;
  
  /**
   * Fetch account information
   *  credentials Credentials
   *  Account information
   */
  fetchAccount?(credentials: Credential): Promise<{ email?: string; organization?: string; plan?: string }>;
  
  /**
   * Fetch usage quota
   *  credentials Credentials
   *  config Optional configuration including region and related settings
   *  Usage snapshot
   */
  fetchUsage(credentials: Credential, config?: ProviderConfig): Promise<import('../types').UsageSnapshot>;
  
  /**
   * Refresh credentials (for OAuth)
   *  credentials Current credentials
   *  New credentials
   */
  refreshCredentials?(credentials: Credential): Promise<Credential>;
  
  /**
   * Get provider-specific error message
   *  error Original error
   *  User-friendly error message
   */
  getErrorMessage?(error: unknown): string;
}

/**
 * Credential validation result
 */
export interface ValidationResult {
  valid: boolean;
  reason?: string;
  expiresAt?: Date;
}

/**
 * Adapter registry
 */
export interface IProviderRegistry {
  /** Get all registered providers */
  getAllProviders(): IProviderAdapter[];
  
  /** Get provider by ID */
  getProvider(id: UsageProvider): IProviderAdapter | undefined;
  
  /** Get provider by ID; throw if missing */
  requireProvider(id: UsageProvider): IProviderAdapter;
  
  /** Get providers supporting a specific auth type */
  getProvidersByAuthType(authType: AuthType): IProviderAdapter[];
}

/**
 * Adapter factory
 */
export interface IAdapterFactory {
  createAdapter(provider: UsageProvider): IProviderAdapter;
  registerAdapter(adapter: IProviderAdapter): void;
  unregisterAdapter(providerId: UsageProvider): void;
}
