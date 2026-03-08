import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import { getAppConfig } from '../config.js';
import { storage } from '../storage.js';
import { fetchUsageForProvider } from '../services/ProviderUsageService.js';

const router = Router();

interface RefreshBody {
  providerIds?: string[];
}

function safeEqual(a: string, b: string): boolean {
  const aBuffer = Buffer.from(a, 'utf8');
  const bBuffer = Buffer.from(b, 'utf8');
  if (aBuffer.length !== bBuffer.length) return false;
  return crypto.timingSafeEqual(aBuffer, bBuffer);
}

function getCronSecret(): string | null {
  const value = getAppConfig().auth.cronSecret;
  if (!value) return null;
  const trimmed = value.trim();
  return trimmed || null;
}

function isAuthorized(req: Request): boolean {
  const configuredSecret = getCronSecret();
  if (!configuredSecret) return false;
  const headerSecret = req.header('x-aimeter-cron-secret')?.trim();
  if (!headerSecret) return false;
  return safeEqual(headerSecret, configuredSecret);
}

router.post('/refresh', async (req: Request, res: Response) => {
  const configuredSecret = getCronSecret();
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

  if (!isAuthorized(req)) {
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

  const results: Array<{
    id: string;
    provider: string;
    ok: boolean;
    updatedAt?: string;
    error?: string;
  }> = [];

  for (const provider of providers) {
    try {
      const snapshot = await fetchUsageForProvider(provider);
      await storage.recordUsage(provider.id, snapshot);
      results.push({
        id: provider.id,
        provider: provider.provider,
        ok: true,
        updatedAt: snapshot.updatedAt.toISOString(),
      });
    } catch (error) {
      results.push({
        id: provider.id,
        provider: provider.provider,
        ok: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  const successCount = results.filter((item) => item.ok).length;
  res.json({
    success: true,
    data: {
      total: results.length,
      success: successCount,
      failed: results.length - successCount,
      durationMs: Date.now() - start,
      results,
    },
  });
});

export default router;
