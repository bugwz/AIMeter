import { Router, Request, Response } from 'express';
import { getAllMockProviders, getMockLatestUsage, recordMockUsage, getMockProvider, getDefaultPeriodDates } from '../mock/database.js';
import { UsageProvider, UsageSnapshot, UsageError, UsageErrorCode, AuthType, ProviderConfig, DashboardProviderData } from '../../src/types/index.js';
import { createMockProvider } from '../mock/providers/base.js';
import { transformToDashboardSnapshot } from '../utils/usageTransformer.js';
import { MOCK_PROVIDER_CONFIGS } from '../mock/config.js';
import { enrichProgressTitles } from '../utils/progressTitles.js';

const router = Router();

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

type AntigravityDisplayMode = 'pool' | 'models';

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

function resolveAntigravitySettings(provider: ProviderConfig): {
  displayMode: AntigravityDisplayMode;
  poolConfig?: Record<string, string[]>;
} {
  const attrs = provider.attrs && typeof provider.attrs === 'object' ? provider.attrs : undefined;
  const antigravity = attrs && typeof attrs.antigravity === 'object' && attrs.antigravity !== null
    ? attrs.antigravity as Record<string, unknown>
    : undefined;
  const displayMode: AntigravityDisplayMode = antigravity?.displayMode === 'models' ? 'models' : 'pool';
  const rawPoolConfig = antigravity?.poolConfig;
  if (!rawPoolConfig || typeof rawPoolConfig !== 'object' || Array.isArray(rawPoolConfig)) {
    return { displayMode };
  }

  const poolConfig: Record<string, string[]> = {};
  Object.entries(rawPoolConfig).forEach(([key, value]) => {
    if (!Array.isArray(value)) return;
    const patterns = value
      .map((item) => (typeof item === 'string' ? item.trim().toLowerCase() : ''))
      .filter(Boolean);
    if (patterns.length > 0) poolConfig[key] = patterns;
  });

  return { displayMode, ...(Object.keys(poolConfig).length > 0 ? { poolConfig } : {}) };
}

function toPoolName(name: string, poolConfig?: Record<string, string[]>): string {
  const normalized = name.trim().toLowerCase();
  if (poolConfig) {
    for (const [poolName, patterns] of Object.entries(poolConfig)) {
      if (patterns.some((pattern) => normalized.includes(pattern))) return poolName;
    }
  }
  if (normalized.includes('gemini') && normalized.includes('pro')) return 'Gemini Pro';
  if (normalized.includes('gemini') && normalized.includes('flash')) return 'Gemini Flash';
  return 'Claude';
}

function aggregateAntigravityPools(items: ProgressLike[], poolConfig?: Record<string, string[]>): ProgressLike[] {
  const pools = new Map<string, ProgressLike>();
  items.forEach((item) => {
    const poolName = toPoolName(item.name, poolConfig);
    const usedPercent = typeof item.usedPercent === 'number' ? item.usedPercent : 0;
    const existing = pools.get(poolName);
    if (!existing || usedPercent > (existing.usedPercent || 0)) {
      pools.set(poolName, {
        ...item,
        name: poolName,
        usedPercent,
        remainingPercent: typeof item.remainingPercent === 'number'
          ? item.remainingPercent
          : Math.max(0, 100 - usedPercent),
        used: usedPercent,
        limit: 100,
      });
    }
  });

  const order = ['Claude', 'Gemini Pro', 'Gemini Flash'];
  return Array.from(pools.values()).sort((a, b) => {
    const ai = order.indexOf(a.name);
    const bi = order.indexOf(b.name);
    const aw = ai === -1 ? 99 : ai;
    const bw = bi === -1 ? 99 : bi;
    if (aw !== bw) return aw - bw;
    return a.name.localeCompare(b.name);
  });
}

function applyProviderDisplayMode(provider: ProviderConfig, items: ProgressLike[]): ProgressLike[] {
  if (provider.provider !== UsageProvider.ANTIGRAVITY) return items;
  const settings = resolveAntigravitySettings(provider);
  if (settings.displayMode === 'models') return items;
  return aggregateAntigravityPools(items, settings.poolConfig);
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

function sanitizeIdentity(identity: Record<string, unknown> | undefined): DashboardProviderData['identity'] | undefined {
  const plan = typeof identity?.plan === 'string' ? identity.plan.trim() : '';
  return plan ? { plan } : undefined;
}

function withPlanFallback(
  identity: Record<string, unknown> | undefined,
  fallbackPlan: string | undefined,
): DashboardProviderData['identity'] | undefined {
  const normalizedFallback = typeof fallbackPlan === 'string' ? fallbackPlan.trim() : '';
  const mergedIdentity: Record<string, unknown> = {
    ...(identity || {}),
  };

  if ((typeof mergedIdentity.plan !== 'string' || !mergedIdentity.plan.trim()) && normalizedFallback) {
    mergedIdentity.plan = normalizedFallback;
  }

  return sanitizeIdentity(mergedIdentity);
}

router.post('/latest', async (req: Request, res: Response) => {
  await new Promise(resolve => setTimeout(resolve, 500));
  try {
    const allProviders = getAllMockProviders();
    const results: Array<SerializedDashboardProviderData | SerializedUsageError> = [];
    
    for (const provider of allProviders) {
      const latestRecord = getMockLatestUsage(provider.id);
      const mockProviderState = getMockProvider(provider.id);
      const mockConfig = MOCK_PROVIDER_CONFIGS[provider.provider];
      
      let windowMinutes: number | undefined;
      let resetsAt: Date | undefined;
      
      if (mockProviderState) {
        windowMinutes = Math.floor((mockProviderState.periodEnd.getTime() - mockProviderState.periodStart.getTime()) / (1000 * 60));
        resetsAt = mockProviderState.periodEnd;
      } else if (mockConfig) {
        const dates = getDefaultPeriodDates(mockConfig.periodType, mockConfig.resetDay);
        windowMinutes = Math.floor((dates.end.getTime() - dates.start.getTime()) / (1000 * 60));
        resetsAt = dates.end;
      }
      
      if (latestRecord && latestRecord.progress) {
        const progressItems: Array<{
          name: string;
          usedPercent?: number;
          remainingPercent?: number;
          used?: number;
          limit?: number;
          windowMinutes?: number;
          resetsAt?: string;
          resetDescription?: string;
        }> = latestRecord.progress.items || [];
        const identity = latestRecord.identityData as Record<string, unknown> | undefined;
        
        const fallbackPlan = provider.plan || mockConfig?.name || 'Standard';
        const finalIdentity = withPlanFallback(identity, fallbackPlan);
        
        const snapshot: SerializedDashboardProviderData = {
          id: provider.id,
          provider: provider.provider,
          name: provider.name || null,
          refreshInterval: provider.refreshInterval,
          identity: finalIdentity || undefined,
          progress: serializeProgressItems(provider.provider, applyProviderDisplayMode(provider, progressItems.map((item) => ({
            ...item,
            windowMinutes: item.windowMinutes ?? windowMinutes ?? null,
            resetsAt: item.resetsAt ?? resetsAt ?? null,
          }))),
          updatedAt: toUnixSeconds(latestRecord.createdAt) ?? Math.floor(Date.now() / 1000),
        };
        results.push(snapshot);
      } else {
        results.push(serializeUsageError({
          id: provider.id,
          provider: provider.provider,
          code: UsageErrorCode.UNKNOWN,
          message: 'No data available',
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
        code: 'LATEST_ERROR',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
    });
  }
});

router.post('/refresh', async (req: Request, res: Response) => {
  await new Promise(resolve => setTimeout(resolve, 2000));
  try {
    const allProviders = getAllMockProviders();
    const results: Array<SerializedDashboardProviderData | SerializedUsageError> = [];
    
    for (const provider of allProviders) {
      const mockProvider = createMockProvider(provider.provider);
      
      if (!mockProvider) {
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
        
        const snapshot = await mockProvider.fetchUsage(provider.credentials, provider.region);
        recordMockUsage(provider.id, snapshot);
        
        const mockProviderState = getMockProvider(provider.id);
        const mockConfig = MOCK_PROVIDER_CONFIGS[provider.provider];
        
        let windowMinutes: number | undefined;
        let resetsAt: Date | undefined;
        
        if (mockProviderState) {
          windowMinutes = Math.floor((mockProviderState.periodEnd.getTime() - mockProviderState.periodStart.getTime()) / (1000 * 60));
          resetsAt = mockProviderState.periodEnd;
        } else if (mockConfig) {
          const dates = getDefaultPeriodDates(mockConfig.periodType, mockConfig.resetDay);
          windowMinutes = Math.floor((dates.end.getTime() - dates.start.getTime()) / (1000 * 60));
          resetsAt = dates.end;
        }
        
        const fallbackPlan = provider.plan || mockConfig?.name || 'Standard';
        
        const items = extractSnapshotItems(snapshot);
        
        const finalIdentity = withPlanFallback(
          snapshot.identity as Record<string, unknown> | undefined,
          fallbackPlan,
        );
        
        const dashboardData: SerializedDashboardProviderData = {
          id: provider.id,
          provider: provider.provider,
          name: provider.name || null,
          refreshInterval: provider.refreshInterval,
          identity: finalIdentity || undefined,
          progress: serializeProgressItems(provider.provider, applyProviderDisplayMode(providerConfig, items.map((item) => ({
            ...item,
            windowMinutes: item.windowMinutes ?? windowMinutes ?? null,
            resetsAt: item.resetsAt ?? resetsAt ?? null,
          }))),
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

router.post('/:provider', async (req: Request, res: Response) => {
  const { provider } = req.params;
  
  const mockProvider = createMockProvider(provider as UsageProvider);
  if (!mockProvider) {
    res.status(400).json({
      success: false,
      error: { code: 'MOCK_PROVIDER_NOT_FOUND', message: 'Provider not found' },
    });
    return;
  }

  const providers = getAllMockProviders();
  const providerConfig = providers.find(p => p.provider === provider);
  
  try {
    const snapshot = await mockProvider.fetchUsage(providerConfig?.credentials || { type: AuthType.API_KEY, value: 'mock-key' });
    if (providerConfig) {
      recordMockUsage(providerConfig.id, snapshot);
    }
    res.json({ success: true, data: serializeUsageSnapshot(snapshot) });
  } catch (error) {
    res.status(400).json({
      success: false,
      error: { code: 'FETCH_ERROR', message: error instanceof Error ? error.message : 'Unknown error' },
    });
  }
});

export default router;
