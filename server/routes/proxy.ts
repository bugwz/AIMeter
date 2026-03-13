import { Router, Request, Response } from 'express';
import { UsageProvider, UsageSnapshot, UsageError, UsageErrorCode, ProviderConfig, DashboardProviderData } from '../../src/types/index.js';
import { requireAdminRole } from '../middleware/auth.js';
import { storage } from '../storage.js';
import { fetchUsageForProvider, getAdapterForProvider } from '../services/ProviderUsageService.js';
import { runtimeConfig } from '../runtime.js';
import { enrichProgressTitles } from '../utils/progressTitles.js';
import { resolveMockDisplayNameForResponse } from '../mock/displayName.js';

const router = Router();

function sanitizeViewerIdentity(identity: Record<string, unknown> | undefined): DashboardProviderData['identity'] | undefined {
  const plan = typeof identity?.plan === 'string' ? identity.plan.trim() : '';
  return plan ? { plan } : undefined;
}

function withPlanFallback(
  identity: Record<string, unknown> | undefined,
  fallbackPlan: string | undefined,
  overridePlan?: string,
): DashboardProviderData['identity'] | undefined {
  const normalizedFallback = typeof fallbackPlan === 'string' ? fallbackPlan.trim() : '';
  const mergedIdentity: Record<string, unknown> = {
    ...(identity || {}),
  };

  if (overridePlan) {
    mergedIdentity.plan = overridePlan;
  } else if (
    (typeof mergedIdentity.plan !== 'string' || !mergedIdentity.plan.trim())
    && normalizedFallback
  ) {
    mergedIdentity.plan = normalizedFallback;
  }

  return sanitizeViewerIdentity(mergedIdentity);
}

function isMiniMaxCNRegion(region: string | undefined): boolean {
  if (!region) return false;
  const normalized = region.trim().toLowerCase();
  return normalized === 'cn' || normalized === 'china' || normalized === 'minimax_cn';
}

function calculateMiniMaxPlan(
  region: string | undefined,
  progressItems: Array<{ name: string; limit?: number | null }>,
): string | undefined {
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

type ProgressLike = {
  name: string;
  desc?: string;
  usedPercent?: number;
  remainingPercent?: number | null;
  used?: number | null;
  limit?: number | null;
  windowMinutes?: number | null;
  resetsAt?: Date | string | number | null;
  resetDescription?: string | null;
};

type AntigravityDisplayMode = 'pool' | 'models';

type SerializedProgressItem = Omit<DashboardProviderData['progress'][number], 'resetsAt'> & {
  resetsAt: number | null;
};

type SerializedDashboardProviderData = Omit<DashboardProviderData, 'progress' | 'updatedAt' | 'cost'> & {
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
    remainingPercent: item.remainingPercent ?? undefined,
    used: item.used ?? undefined,
    limit: item.limit ?? undefined,
    windowMinutes: item.windowMinutes ?? undefined,
    resetsAt: toUnixSeconds(item.resetsAt),
    resetDescription: item.resetDescription ?? undefined,
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
    if (patterns.length > 0) {
      poolConfig[key] = patterns;
    }
  });

  return { displayMode, ...(Object.keys(poolConfig).length > 0 ? { poolConfig } : {}) };
}

function toPoolName(name: string, poolConfig?: Record<string, string[]>): string {
  const normalized = name.trim().toLowerCase();
  if (poolConfig) {
    for (const [poolName, patterns] of Object.entries(poolConfig)) {
      if (patterns.some((pattern) => normalized.includes(pattern))) {
        return poolName;
      }
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
  return Array.from(pools.values()).sort((left, right) => {
    const leftIndex = order.indexOf(left.name);
    const rightIndex = order.indexOf(right.name);
    const a = leftIndex === -1 ? 99 : leftIndex;
    const b = rightIndex === -1 ? 99 : rightIndex;
    if (a !== b) return a - b;
    return left.name.localeCompare(right.name);
  });
}

function applyProviderDisplayMode(provider: ProviderConfig, items: ProgressLike[]): ProgressLike[] {
  if (provider.provider !== UsageProvider.ANTIGRAVITY) return items;
  const settings = resolveAntigravitySettings(provider);
  if (settings.displayMode === 'models') return items;
  return aggregateAntigravityPools(items, settings.poolConfig);
}

function serializeUsageError(error: UsageError): SerializedUsageError {
  return {
    ...error,
    timestamp: toUnixSeconds(error.timestamp) ?? Math.floor(Date.now() / 1000),
  };
}

router.post('/latest', async (req: Request, res: Response) => {
  try {
    const allProviders = await storage.listProviders();
    const results: Array<SerializedDashboardProviderData | SerializedUsageError> = [];
    const isMockMode = runtimeConfig.mockEnabled;
    
    for (const provider of allProviders) {
      const latestRecord = await storage.getLatestUsage(provider.id);
      
      if (latestRecord && latestRecord.progress) {
        const identity = latestRecord.identityData as Record<string, unknown> | undefined;
        
        const progressItems = latestRecord.progress.items || [];
        
        const calculatedPlan = provider.provider === UsageProvider.MINIMAX 
          ? calculateMiniMaxPlan(provider.region, progressItems)
          : undefined;

        const finalIdentity = withPlanFallback(
          identity,
          provider.plan,
          calculatedPlan,
        );

        const snapshot: SerializedDashboardProviderData = {
          id: provider.id,
          provider: provider.provider,
          name: resolveMockDisplayNameForResponse(provider) ?? undefined,
          region: provider.region || undefined,
          refreshInterval: provider.refreshInterval,
          identity: finalIdentity || undefined,
          progress: serializeProgressItems(provider.provider, applyProviderDisplayMode(provider, progressItems)),
          updatedAt: toUnixSeconds(latestRecord.createdAt) ?? Math.floor(Date.now() / 1000),
        };
        results.push(snapshot);
      } else if (isMockMode) {
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
          const items = extractSnapshotItems(liveSnapshot);
          const calculatedPlan = provider.provider === UsageProvider.MINIMAX
            ? calculateMiniMaxPlan(provider.region, items)
            : undefined;

          results.push({
            id: provider.id,
            provider: provider.provider,
            name: resolveMockDisplayNameForResponse(provider) ?? undefined,
            region: provider.region || undefined,
            refreshInterval: provider.refreshInterval,
            identity: withPlanFallback(
              liveSnapshot.identity as Record<string, unknown> | undefined,
              provider.plan,
              calculatedPlan,
            ),
            progress: serializeProgressItems(provider.provider, applyProviderDisplayMode(provider, items)),
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
        const calculatedPlan = provider.provider === UsageProvider.MINIMAX
          ? calculateMiniMaxPlan(provider.region, items)
          : undefined;
        
        const dashboardData: SerializedDashboardProviderData = {
          id: provider.id,
          provider: provider.provider,
          name: resolveMockDisplayNameForResponse(provider) ?? undefined,
          region: provider.region || undefined,
          refreshInterval: provider.refreshInterval,
          identity: withPlanFallback(
            snapshot.identity as Record<string, unknown> | undefined,
            provider.plan,
            calculatedPlan,
          ),
          progress: serializeProgressItems(provider.provider, applyProviderDisplayMode(provider, items)),
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


export default router;
