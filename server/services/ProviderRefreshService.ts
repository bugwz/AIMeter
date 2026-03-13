import { UsageProvider, UsageSnapshot } from '../../src/types/index.js';
import { storage, type ProviderInstance, type UsageRecordRow } from '../storage.js';
import { fetchUsageForProvider } from './ProviderUsageService.js';

const CACHE_TTL_MS = 3 * 60 * 1000;
const FAILURE_COOLDOWN_MS = 60 * 1000;

export type ProviderRefreshSuccess = {
  ok: true;
  snapshot: UsageSnapshot;
  fromCache?: boolean;
  stale?: boolean;
  staleAt?: number;
  fetchError?: string;
  authRequired?: boolean;
};

export type ProviderRefreshFailure = {
  ok: false;
  statusCode: number;
  code: 'TEMPORARILY_UNAVAILABLE' | 'FETCH_ERROR';
  message: string;
  authRequired?: boolean;
};

export type ProviderRefreshResult = ProviderRefreshSuccess | ProviderRefreshFailure;

export function isProviderRefreshFailure(result: ProviderRefreshResult): result is ProviderRefreshFailure {
  return result.ok === false;
}

function buildSnapshotFromRecord(provider: ProviderInstance, record: UsageRecordRow): UsageSnapshot {
  const items = (record.progress?.items || []) as UsageSnapshot['progress'];
  return {
    provider: provider.provider,
    progress: items,
    cost: record.progress?.cost,
    identity: record.identityData as { plan?: string } | undefined,
    updatedAt: record.createdAt,
  };
}

function toSafeErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Unknown error';
}

function parseFailedAtMs(value: unknown): number | null {
  if (typeof value !== 'string') return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function isOAuthAuthError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const lower = error.message.toLowerCase();
  return (
    lower.includes('token expired')
    || lower.includes('access denied')
    || lower.includes('oauth error: 401')
    || lower.includes('auth invalid')
    || lower.includes('oauth token expired')
    || lower.includes('antigravity auth')
    || lower.includes('authentication failed')
    || lower.includes('invalid_client')
    || lower.includes('invalid_grant')
  );
}

function isProviderAuthError(provider: UsageProvider, error: unknown): boolean {
  if (
    provider !== UsageProvider.CLAUDE
    && provider !== UsageProvider.CODEX
    && provider !== UsageProvider.ANTIGRAVITY
  ) {
    return false;
  }
  return isOAuthAuthError(error);
}

async function patchFetchStateSafe(providerId: string, patch: Record<string, unknown>): Promise<void> {
  try {
    await storage.patchFetchState(providerId, patch);
  } catch (error) {
    console.warn(`[refresh] Failed to patch fetch_state for ${providerId}: ${toSafeErrorMessage(error)}`);
  }
}

export async function refreshProviderWithProtection(provider: ProviderInstance): Promise<ProviderRefreshResult> {
  const now = Date.now();
  const attemptAt = new Date(now).toISOString();

  // Keep attempt timestamp consistent across single and global refreshes.
  await storage.patchFetchState(provider.id, { lastAttemptAt: attemptAt });

  const latestRecord = await storage.getLatestUsage(provider.id);
  if (latestRecord) {
    const ageMs = now - latestRecord.createdAt.getTime();
    if (ageMs < CACHE_TTL_MS) {
      return {
        ok: true,
        snapshot: buildSnapshotFromRecord(provider, latestRecord),
        fromCache: true,
      };
    }
  }

  const fetchState = provider.fetchState || {};
  const lastFailedAt = parseFailedAtMs(fetchState.lastFailedAt);
  if (lastFailedAt && (now - lastFailedAt) < FAILURE_COOLDOWN_MS) {
    if (latestRecord) {
      return {
        ok: true,
        snapshot: buildSnapshotFromRecord(provider, latestRecord),
        stale: true,
        staleAt: Math.floor(now / 1000),
      };
    }
    return {
      ok: false,
      statusCode: 503,
      code: 'TEMPORARILY_UNAVAILABLE',
      message: 'Data temporarily unavailable due to a recent failure',
    };
  }

  try {
    const snapshot = await fetchUsageForProvider(provider);
    await storage.recordUsage(provider.id, snapshot);
    await patchFetchStateSafe(provider.id, {
      lastFailedAt: null,
      lastFailureReason: null,
      authRequired: null,
    });
    return { ok: true, snapshot };
  } catch (error) {
    const message = toSafeErrorMessage(error);
    const authRequired = isProviderAuthError(provider.provider, error);
    await patchFetchStateSafe(provider.id, {
      lastFailedAt: new Date(now).toISOString(),
      lastFailureReason: message.substring(0, 200),
      ...(authRequired ? { authRequired: true } : {}),
    });

    if (latestRecord) {
      return {
        ok: true,
        snapshot: buildSnapshotFromRecord(provider, latestRecord),
        stale: true,
        staleAt: Math.floor(now / 1000),
        fetchError: message,
        ...(authRequired ? { authRequired: true } : {}),
      };
    }

    return {
      ok: false,
      statusCode: 400,
      code: 'FETCH_ERROR',
      message,
      ...(authRequired ? { authRequired: true } : {}),
    };
  }
}
