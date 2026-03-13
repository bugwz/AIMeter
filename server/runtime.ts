import { getAppConfig } from './config.js';

export type StorageMode = 'database';
export type RuntimeMode = 'node' | 'serverless';
export type HistoryMode = 'database';
const appConfig = getAppConfig();

function normalizeRuntimeMode(value?: string): RuntimeMode {
  if (value === 'serverless') return 'serverless';
  if (value === 'node') return 'node';
  return 'node';
}

const runtimeMode = normalizeRuntimeMode(appConfig.runtime.mode);

export const runtimeConfig = {
  storageMode: 'database' as const,
  mockEnabled: appConfig.runtime.mockEnabled,
  runtimeMode,
  historyMode: 'database' as const,
  isReadonlyConfig: false,
  isReadonlyAuth: false,
};

export function isMockMode(): boolean {
  return runtimeConfig.mockEnabled;
}

export function isDatabaseStorageMode(): boolean {
  return true;
}

export function isServerlessRuntime(): boolean {
  return runtimeConfig.runtimeMode === 'serverless';
}
