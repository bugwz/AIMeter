import { getAppConfig } from './config.js';

export type StorageMode = 'database' | 'env';
export type RuntimeMode = 'node' | 'serverless';
export type HistoryMode = 'database' | 'disabled';
const appConfig = getAppConfig();

function normalizeStorageMode(databaseEnabled: boolean): StorageMode {
  return databaseEnabled ? 'database' : 'env';
}

function normalizeRuntimeMode(value?: string): RuntimeMode {
  if (value === 'serverless') return 'serverless';
  if (value === 'node') return 'node';
  return 'node';
}

function normalizeHistoryMode(storageMode: StorageMode): HistoryMode {
  return storageMode === 'database' ? 'database' : 'disabled';
}

const storageMode = normalizeStorageMode(appConfig.database.enabled);
const runtimeMode = normalizeRuntimeMode(appConfig.runtime.mode);
const historyMode = normalizeHistoryMode(storageMode);

export const runtimeConfig = {
  storageMode,
  mockEnabled: appConfig.runtime.mockEnabled,
  runtimeMode,
  historyMode,
  isReadonlyConfig: storageMode === 'env',
  isReadonlyAuth: storageMode === 'env',
};

export function isMockMode(): boolean {
  return runtimeConfig.mockEnabled;
}

export function isDatabaseStorageMode(): boolean {
  return runtimeConfig.storageMode === 'database';
}

export function isEnvStorageMode(): boolean {
  return runtimeConfig.storageMode === 'env';
}

export function isServerlessRuntime(): boolean {
  return runtimeConfig.runtimeMode === 'serverless';
}
