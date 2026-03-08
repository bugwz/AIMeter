import { Router, Request, Response } from 'express';
import { UsageProvider, UsageSnapshot, UsageError, UsageErrorCode, ProviderConfig, DashboardProviderData } from '../../src/types/index.js';
import { requireAdminRole } from '../middleware/auth.js';
import { storage } from '../storage.js';
import { fetchUsageForProvider, getAdapterForProvider } from '../services/ProviderUsageService.js';
import { runtimeConfig } from '../runtime.js';
import { enrichProgressTitles } from '../utils/progressTitles.js';

const router = Router();

function sanitizeViewerIdentity(identity: Record<string, unknown> | undefined): DashboardProviderData['identity'] | undefined {
  const plan = typeof identity?.plan === 'string' ? identity.plan.trim() : '';
  return plan ? { plan } : undefined;
}

function isMiniMaxCNRegion(region: string | undefined): boolean {
  if (!region) return false;
  const normalized = region.trim().toLowerCase();
  return normalized === 'cn' || normalized === 'china' || normalized === 'minimax_cn';
}

function calculateMiniMaxPlan(region: string | undefined, progressItems: Array<{ name: string; limit?: number }>): string | undefined {
  const promptItem = progressItems.find(item => item.name === 'Prompt' || item.name === 'Prompts');
  if (!promptItem || !promptItem.limit) return undefined;

  const limitValue = promptItem.limit;
  const isCN = isMiniMaxCNRegion(region);

  if (isCN) {
    if (limitValue === 40) return 'Starter';
    if (limitValue === 100) return 'Plus';
    if (limitValue === 300) return 'Max';
    if (limitValue === 2000) return 'Ultra-High-Speed';
  } else {
    if (limitValue === 100) return 'Starter';
    if (limitValue === 300) return 'Plus';
    if (limitValue === 1000) return 'Max';
    if (limitValue === 2000) return 'Ultra-High-Speed';
  }

  return undefined;
}

interface ProxyRequestBody {
  provider: UsageProvider;
  region?: string;
}

type ProgressLike = {
  name: string;
  desc?: string;
  usedPercent?: number;
  remainingPercent?: number | null;
  used?: number | null;
  limit?: number | null;
  windowMinutes?: number | null;
  resetsAt?: Date | string | number | null;
  resetDescription?: string;
};

type SerializedProgressItem = Omit<DashboardProviderData['progress'][number], 'resetsAt'> & {
  resetsAt: number | null;
};

type SerializedDashboardProviderData = Omit<DashboardProviderData, 'progress' | 'updatedAt' | 'cost'> & {
  progress: SerializedProgressItem[];
  updatedAt: number;
};

type SerializedUsageSnapshot = Omit<UsageSnapshot, 'progress' | 'updatedAt'> & {
  progress: SerializedProgressItem[];
  updatedAt: number;
};

type SerializedUsageError = Omit<UsageError, 'timestamp'> & {
  timestamp: number;
};

function toUnixSeconds(value: Date | string | number | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return Math.floor(value.getTime() / 1000);
  if (typeof value === 'number') return value > 1_000_000_000_000 ? Math.floor(value / 1000) : Math.floor(value);
  const numeric = Number(value);
  if (Number.isFinite(numeric)) {
    return numeric > 1_000_000_000_000 ? Math.floor(numeric / 1000) : Math.floor(numeric);
  }
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? Math.floor(parsed / 1000) : null;
}

function extractSnapshotItems(snapshot: UsageSnapshot): ProgressLike[] {
  if (snapshot.progress && snapshot.progress.length > 0) {
    return snapshot.progress;
  }
  const legacy = snapshot as UsageSnapshot & Record<string, unknown>;
  const items: ProgressLike[] = [];
  const primary = legacy.primary as Omit<ProgressLike, 'name'> | undefined;
  const secondary = legacy.secondary as Omit<ProgressLike, 'name'> | undefined;
  const tertiary = legacy.tertiary as Omit<ProgressLike, 'name'> | undefined;
  if (primary) items.push({ name: 'Primary', ...primary });
  if (secondary) items.push({ name: 'Secondary', ...secondary });
  if (tertiary) items.push({ name: 'Tertiary', ...tertiary });
  return items;
}

function serializeProgressItems(provider: UsageProvider, items: ProgressLike[]): SerializedProgressItem[] {
  const normalized = enrichProgressTitles(provider, items);
  
  return normalized.map((item) => ({
    name: item.name,
    desc: item.desc,
    usedPercent: item.usedPercent ?? 0,
    remainingPercent: item.remainingPercent ?? null,
    used: item.used ?? null,
    limit: item.limit ?? null,
    windowMinutes: item.windowMinutes ?? null,
    resetsAt: toUnixSeconds(item.resetsAt) ?? null,
    resetDescription: item.resetDescription,
  }));
}

function serializeUsageSnapshot(snapshot: UsageSnapshot): SerializedUsageSnapshot {
  return {
    ...snapshot,
    progress: serializeProgressItems(snapshot.provider, extractSnapshotItems(snapshot)),
    updatedAt: toUnixSeconds(snapshot.updatedAt) ?? Math.floor(Date.now() / 1000),
  };
}

function serializeUsageError(error: UsageError): SerializedUsageError {
  return {
    ...error,
    timestamp: toUnixSeconds(error.timestamp) ?? Math.floor(Date.now() / 1000),
  };
}

async function getFirstProviderByType(provider: UsageProvider) {
  return (await storage.listProviders()).find((item) => item.provider === provider) || null;
}

router.post('/minimax', async (req: Request, res: Response) => {
  if (!requireAdminRole(req, res)) return;
  try {
    const { provider, region } = req.body as ProxyRequestBody;
    const config = await getFirstProviderByType(provider);
    
    if (!config) {
      res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Provider not found' },
      });
      return;
    }

    const adapter = getAdapterForProvider(provider);
    if (!adapter) {
      res.status(400).json({
        success: false,
        error: { code: 'ADAPTER_NOT_FOUND', message: 'Provider adapter not found' },
      });
      return;
    }

    const providerConfig: ProviderConfig = {
      ...config,
      region: region || config.region,
    };

    const snapshot = await fetchUsageForProvider(providerConfig);
    
    res.json({ success: true, data: serializeUsageSnapshot(snapshot) });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: {
        code: 'PROXY_ERROR',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
    });
  }
});

router.post('/latest', async (req: Request, res: Response) => {
  try {
    const allProviders = await storage.listProviders();
    const results: Array<SerializedDashboardProviderData | SerializedUsageError> = [];
    const isMockEnvMode = runtimeConfig.mockEnabled && runtimeConfig.storageMode === 'env';
    const isMockDatabaseMode = runtimeConfig.mockEnabled && runtimeConfig.storageMode === 'database';
    
    for (const provider of allProviders) {
      if (isMockEnvMode) {
        try {
          const liveSnapshot = await fetchUsageForProvider(provider);
          await storage.recordUsage(provider.id, liveSnapshot);
          results.push({
            id: provider.id,
            provider: provider.provider,
            name: provider.name || null,
            region: provider.region || undefined,
            identity: sanitizeViewerIdentity(liveSnapshot.identity as Record<string, unknown> | undefined),
            progress: serializeProgressItems(provider.provider, extractSnapshotItems(liveSnapshot)),
            updatedAt: toUnixSeconds(liveSnapshot.updatedAt) ?? Math.floor(Date.now() / 1000),
          });
        } catch (error) {
          results.push(serializeUsageError({
            id: provider.id,
            provider: provider.provider,
            code: UsageErrorCode.UNKNOWN,
            message: error instanceof Error ? error.message : 'No data available',
            timestamp: new Date(),
          }));
        }
        continue;
      }

      const latestRecord = await storage.getLatestUsage(provider.id);
      
      if (latestRecord && latestRecord.progress) {
        const identity = latestRecord.identityData as Record<string, unknown> | undefined;
        
        const progressItems = latestRecord.progress.items || [];
        
        const calculatedPlan = provider.provider === UsageProvider.MINIMAX 
          ? calculateMiniMaxPlan(provider.region, progressItems)
          : undefined;

        const finalIdentity = sanitizeViewerIdentity(calculatedPlan ? { ...identity, plan: calculatedPlan } : identity);

        const snapshot: SerializedDashboardProviderData = {
          id: provider.id,
          provider: provider.provider,
          name: provider.name || null,
          region: provider.region || undefined,
          identity: finalIdentity || undefined,
          progress: serializeProgressItems(provider.provider, progressItems),
          updatedAt: toUnixSeconds(latestRecord.createdAt) ?? Math.floor(Date.now() / 1000),
        };
        results.push(snapshot);
      } else if (isMockDatabaseMode) {
        results.push(serializeUsageError({
          id: provider.id,
          provider: provider.provider,
          code: UsageErrorCode.UNKNOWN,
          message: 'No data available',
          timestamp: new Date(),
        }));
      } else {
        try {
          const liveSnapshot = await fetchUsageForProvider(provider);
          await storage.recordUsage(provider.id, liveSnapshot);

          results.push({
            id: provider.id,
            provider: provider.provider,
            name: provider.name || null,
            region: provider.region || undefined,
            identity: sanitizeViewerIdentity(liveSnapshot.identity as Record<string, unknown> | undefined),
            progress: serializeProgressItems(provider.provider, extractSnapshotItems(liveSnapshot)),
            updatedAt: toUnixSeconds(liveSnapshot.updatedAt) ?? Math.floor(Date.now() / 1000),
          });
        } catch (error) {
          results.push(serializeUsageError({
            id: provider.id,
            provider: provider.provider,
            code: UsageErrorCode.UNKNOWN,
            message: error instanceof Error ? error.message : 'No data available',
            timestamp: new Date(),
          }));
        }
      }
    }
    
    res.json({
      success: true,
      data: results,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: {
        code: 'LATEST_ERROR',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
    });
  }
});

router.post('/refresh', async (req: Request, res: Response) => {
  if (!requireAdminRole(req, res)) return;
  try {
    const allProviders = await storage.listProviders();
    const results: Array<SerializedDashboardProviderData | SerializedUsageError> = [];
    
    for (const provider of allProviders) {
      const adapter = getAdapterForProvider(provider.provider);
      
      if (!adapter) {
        results.push(serializeUsageError({
          id: provider.id,
          provider: provider.provider,
          code: UsageErrorCode.UNKNOWN,
          message: 'Provider adapter not found',
          timestamp: new Date(),
        }));
        continue;
      }
      
      try {
        const providerConfig: ProviderConfig = {
          ...provider,
          region: provider.region || provider.region,
        };
        
        const snapshot = await fetchUsageForProvider(providerConfig);
        await storage.recordUsage(provider.id, snapshot);
        
        const items = extractSnapshotItems(snapshot);
        
        const dashboardData: SerializedDashboardProviderData = {
          id: provider.id,
          provider: provider.provider,
          name: provider.name || null,
          region: provider.region || undefined,
          identity: sanitizeViewerIdentity(snapshot.identity as Record<string, unknown> | undefined),
          progress: serializeProgressItems(provider.provider, items),
          updatedAt: toUnixSeconds(snapshot.updatedAt) ?? Math.floor(Date.now() / 1000),
        };
        results.push(dashboardData);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        results.push(serializeUsageError({
          id: provider.id,
          provider: provider.provider,
          code: UsageErrorCode.API_ERROR,
          message: errorMessage,
          timestamp: new Date(),
        }));
      }
    }
    
    res.json({
      success: true,
      data: results,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: {
        code: 'REFRESH_ERROR',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
    });
  }
});

router.post('/kimi', async (req: Request, res: Response) => {
  try {
    const { provider, region } = req.body as ProxyRequestBody;
    const config = await getFirstProviderByType(provider);
    
    if (!config) {
      res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Provider not found' },
      });
      return;
    }

    const adapter = getAdapterForProvider(provider);
    if (!adapter) {
      res.status(400).json({
        success: false,
        error: { code: 'ADAPTER_NOT_FOUND', message: 'Provider adapter not found' },
      });
      return;
    }

    const providerConfig: ProviderConfig = {
      ...config,
      region: region || config.region,
    };

    const snapshot = await fetchUsageForProvider(providerConfig);
    
    res.json({ success: true, data: serializeUsageSnapshot(snapshot) });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: {
        code: 'PROXY_ERROR',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
    });
  }
});

router.post('/claude', async (req: Request, res: Response) => {
  try {
    const { provider, region } = req.body as ProxyRequestBody;
    const config = await getFirstProviderByType(provider);
    
    if (!config) {
      res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Provider not found' },
      });
      return;
    }

    const adapter = getAdapterForProvider(provider);
    if (!adapter) {
      res.status(400).json({
        success: false,
        error: { code: 'ADAPTER_NOT_FOUND', message: 'Provider adapter not found' },
      });
      return;
    }

    const providerConfig: ProviderConfig = {
      ...config,
      region: region || config.region,
    };

    const snapshot = await fetchUsageForProvider(providerConfig);
    
    res.json({ success: true, data: serializeUsageSnapshot(snapshot) });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: {
        code: 'PROXY_ERROR',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
    });
  }
});

router.post('/openrouter', async (req: Request, res: Response) => {
  try {
    const { provider, region } = req.body as ProxyRequestBody;
    const config = await getFirstProviderByType(provider);
    
    if (!config) {
      res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Provider not found' },
      });
      return;
    }

    const adapter = getAdapterForProvider(provider);
    if (!adapter) {
      res.status(400).json({
        success: false,
        error: { code: 'ADAPTER_NOT_FOUND', message: 'Provider adapter not found' },
      });
      return;
    }

    const providerConfig: ProviderConfig = {
      ...config,
      region: region || config.region,
    };

    const snapshot = await fetchUsageForProvider(providerConfig);
    
    res.json({ success: true, data: serializeUsageSnapshot(snapshot) });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: {
        code: 'PROXY_ERROR',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
    });
  }
});

router.post('/copilot', async (req: Request, res: Response) => {
  try {
    const { provider, region } = req.body as ProxyRequestBody;
    const config = await getFirstProviderByType(provider);
    
    if (!config) {
      res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Provider not found' },
      });
      return;
    }

    const adapter = getAdapterForProvider(provider);
    if (!adapter) {
      res.status(400).json({
        success: false,
        error: { code: 'ADAPTER_NOT_FOUND', message: 'Provider adapter not found' },
      });
      return;
    }

    const providerConfig: ProviderConfig = {
      ...config,
      region: region || config.region,
    };

    const snapshot = await fetchUsageForProvider(providerConfig);
    
    res.json({ success: true, data: serializeUsageSnapshot(snapshot) });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: {
        code: 'PROXY_ERROR',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
    });
  }
});

router.post('/ollama', async (req: Request, res: Response) => {
  try {
    const { provider, region } = req.body as ProxyRequestBody;
    const config = await getFirstProviderByType(provider);
    
    if (!config) {
      res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Provider not found' },
      });
      return;
    }

    const adapter = getAdapterForProvider(provider);
    if (!adapter) {
      res.status(400).json({
        success: false,
        error: { code: 'ADAPTER_NOT_FOUND', message: 'Provider adapter not found' },
      });
      return;
    }

    const providerConfig: ProviderConfig = {
      ...config,
      region: region || config.region,
    };

    const snapshot = await fetchUsageForProvider(providerConfig);
    
    res.json({ success: true, data: serializeUsageSnapshot(snapshot) });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: {
        code: 'PROXY_ERROR',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
    });
  }
});

router.post('/cursor', async (req: Request, res: Response) => {
  try {
    const { provider, region } = req.body as ProxyRequestBody;
    const config = await getFirstProviderByType(provider);
    
    if (!config) {
      res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Provider not found' },
      });
      return;
    }

    const adapter = getAdapterForProvider(provider);
    if (!adapter) {
      res.status(400).json({
        success: false,
        error: { code: 'ADAPTER_NOT_FOUND', message: 'Provider adapter not found' },
      });
      return;
    }

    const providerConfig: ProviderConfig = {
      ...config,
      region: region || config.region,
    };

    const snapshot = await fetchUsageForProvider(providerConfig);
    
    res.json({ success: true, data: serializeUsageSnapshot(snapshot) });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: {
        code: 'PROXY_ERROR',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
    });
  }
});

router.post('/opencode', async (req: Request, res: Response) => {
  try {
    const { provider, region } = req.body as ProxyRequestBody;
    const config = await getFirstProviderByType(provider);
    
    if (!config) {
      res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Provider not found' },
      });
      return;
    }

    const adapter = getAdapterForProvider(provider);
    if (!adapter) {
      res.status(400).json({
        success: false,
        error: { code: 'ADAPTER_NOT_FOUND', message: 'Provider adapter not found' },
      });
      return;
    }

    const providerConfig: ProviderConfig = {
      ...config,
      region: region || config.region,
    };

    const snapshot = await fetchUsageForProvider(providerConfig);
    
    res.json({ success: true, data: serializeUsageSnapshot(snapshot) });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: {
        code: 'PROXY_ERROR',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
    });
  }
});

export default router;
