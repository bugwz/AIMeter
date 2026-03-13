import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import { storage } from '../storage.js';
import { fetchUsageForProvider } from '../services/ProviderUsageService.js';

const router = Router();

interface RefreshBody {
  providerIds?: string[];
}

type RefreshResult = {
  id: string;
  provider: string;
  status: 'executed' | 'skipped';
  ok?: boolean;
  updatedAt?: string;
  error?: string;
  reason?: string;
  nextDueAt?: string;
};

function safeEqual(a: string, b: string): boolean {
  const aBuffer = Buffer.from(a, 'utf8');
  const bBuffer = Buffer.from(b, 'utf8');
  if (aBuffer.length !== bBuffer.length) return false;
  return crypto.timingSafeEqual(aBuffer, bBuffer);
}

function parseIsoTime(value: unknown): number | null {
  if (typeof value !== 'string') return null;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : null;
}

function resolveIntervalMinutes(value: unknown): number {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 5;
  return Math.max(5, Math.floor(numeric));
}

async function isAuthorized(req: Request): Promise<boolean> {
  const configuredSecret = await storage.getCronSecret();
  if (!configuredSecret) return false;
  const headerSecret = req.header('x-aimeter-cron-secret')?.trim();
  if (!headerSecret) return false;
  return safeEqual(headerSecret, configuredSecret);
}

async function patchFetchStateSafe(providerId: string, patch: Record<string, unknown>): Promise<void> {
  try {
    await storage.patchFetchState(providerId, patch);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.warn(`[cron] Failed to patch fetch_state for ${providerId}: ${message}`);
  }
}

router.post('/refresh', async (req: Request, res: Response) => {
  const configuredSecret = await storage.getCronSecret();
  if (!configuredSecret) {
    res.status(503).json({
      success: false,
      error: {
        code: 'CRON_SECRET_NOT_CONFIGURED',
        message: 'Cron secret is not configured',
      },
    });
    return;
  }

  if (!await isAuthorized(req)) {
    res.status(401).json({
      success: false,
      error: {
        code: 'UNAUTHORIZED',
        message: 'Invalid cron secret',
      },
    });
    return;
  }

  const start = Date.now();
  const body = (req.body || {}) as RefreshBody;
  const filterIds = Array.isArray(body.providerIds)
    ? new Set(body.providerIds.map((id) => String(id).trim()).filter(Boolean))
    : null;

  const providers = (await storage.listProviders()).filter((provider) => {
    if (!filterIds) return true;
    return filterIds.has(provider.id);
  });

  const results: RefreshResult[] = [];

  for (const provider of providers) {
    const intervalMinutes = resolveIntervalMinutes(provider.refreshInterval);
    const intervalMs = intervalMinutes * 60 * 1000;
    const fetchState = (provider.fetchState || {}) as Record<string, unknown>;
    const lastAttemptAtMs = parseIsoTime(fetchState.lastAttemptAt);

    if (lastAttemptAtMs && (Date.now() - lastAttemptAtMs) < intervalMs) {
      results.push({
        id: provider.id,
        provider: provider.provider,
        status: 'skipped',
        reason: 'NOT_DUE',
        nextDueAt: new Date(lastAttemptAtMs + intervalMs).toISOString(),
      });
      continue;
    }

    const attemptAt = new Date().toISOString();
    await patchFetchStateSafe(provider.id, { lastAttemptAt: attemptAt });

    try {
      const snapshot = await fetchUsageForProvider(provider);
      await storage.recordUsage(provider.id, snapshot);
      await patchFetchStateSafe(provider.id, {
        lastSuccessAt: snapshot.updatedAt.toISOString(),
        lastFailedAt: null,
        lastFailureReason: null,
      });
      results.push({
        id: provider.id,
        provider: provider.provider,
        status: 'executed',
        ok: true,
        updatedAt: snapshot.updatedAt.toISOString(),
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      await patchFetchStateSafe(provider.id, {
        lastFailedAt: new Date().toISOString(),
        lastFailureReason: errorMessage.substring(0, 200),
      });
      results.push({
        id: provider.id,
        provider: provider.provider,
        status: 'executed',
        ok: false,
        error: errorMessage,
      });
    }
  }

  const executed = results.filter((item) => item.status === 'executed').length;
  const skipped = results.filter((item) => item.status === 'skipped').length;
  const successCount = results.filter((item) => item.status === 'executed' && item.ok).length;
  const failedCount = results.filter((item) => item.status === 'executed' && item.ok === false).length;
  res.json({
    success: true,
    data: {
      total: results.length,
      executed,
      skipped,
      success: successCount,
      failed: failedCount,
      durationMs: Date.now() - start,
      results,
    },
  });
});

export default router;
