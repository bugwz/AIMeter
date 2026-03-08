import { UsageSnapshot, UsageError } from '../../src/types/usage';

export function roundPercentage(value: number): number {
  return Math.round(value);
}

export function transformToDashboardSnapshot(
  raw: UsageSnapshot
): UsageSnapshot {
  return raw;
}

export function transformResults(
  rawResults: Record<string, UsageSnapshot | UsageError>
): Record<string, UsageSnapshot | UsageError> {
  return rawResults as Record<string, UsageSnapshot | UsageError>;
}
