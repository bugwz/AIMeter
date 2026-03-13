import { getAppConfig } from '../config.js';

export interface RuntimeTableNames {
  providers: string;
  usageRecords: string;
  settings: string;
  auditLogs: string;
  usageProviderCreatedIndex: string;
  auditLogsTimestampIndex: string;
  auditLogsPathIndex: string;
}

function prefixed(mockEnabled: boolean, name: string): string {
  return mockEnabled ? `mock_${name}` : name;
}

export function getRuntimeTableNames(mockEnabled: boolean): RuntimeTableNames {
  return {
    providers: prefixed(mockEnabled, 'providers'),
    usageRecords: prefixed(mockEnabled, 'usage_records'),
    settings: prefixed(mockEnabled, 'settings'),
    auditLogs: prefixed(mockEnabled, 'audit_logs'),
    usageProviderCreatedIndex: prefixed(mockEnabled, 'idx_usage_provider_created'),
    auditLogsTimestampIndex: prefixed(mockEnabled, 'idx_audit_logs_timestamp'),
    auditLogsPathIndex: prefixed(mockEnabled, 'idx_audit_logs_path'),
  };
}

export function getCurrentRuntimeTableNames(): RuntimeTableNames {
  return getRuntimeTableNames(getAppConfig().runtime.mockEnabled);
}
