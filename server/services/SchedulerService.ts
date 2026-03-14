import cron from 'node-cron';
import { storage } from '../storage.js';
import { fetchUsageForProvider } from './ProviderUsageService.js';
import { runtimeConfig } from '../runtime.js';

function parseIsoTime(value: unknown): number | null {
  if (typeof value !== 'string') return null;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : null;
}

function resolveIntervalMinutes(value: unknown): number {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 5;
  return Math.max(1, Math.floor(numeric));
}

async function patchFetchStateSafe(providerId: string, patch: Record<string, unknown>): Promise<void> {
  try {
    await storage.patchFetchState(providerId, patch);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.warn(`[scheduler] Failed to patch fetch_state for ${providerId}: ${message}`);
  }
}

class SchedulerService {
  private heartbeat: cron.ScheduledTask | null = null;
  private isRunning: boolean = false;

  start(): void {
    if (this.isRunning || runtimeConfig.runtimeMode === 'serverless') return;
    this.isRunning = true;

    // Tick every minute; each provider is refreshed according to its own refreshInterval
    this.heartbeat = cron.schedule('*/5 * * * *', () => {
      void this.tick();
    });

    console.log('[scheduler] Heartbeat started (tick every 5 minutes)');
  }

  stop(): void {
    this.heartbeat?.stop();
    this.heartbeat = null;
    this.isRunning = false;
  }

  private async tick(): Promise<void> {
    const providers = await storage.listProviders();

    for (const provider of providers) {
      const intervalMinutes = resolveIntervalMinutes(provider.refreshInterval);
      const intervalMs = intervalMinutes * 60 * 1000;
      const skipThresholdMs = Math.max(0, intervalMs - 20 * 1000);
      const fetchState = (provider.fetchState || {}) as Record<string, unknown>;
      const lastAttemptAtMs = parseIsoTime(fetchState.lastAttemptAt);

      if (lastAttemptAtMs && (Date.now() - lastAttemptAtMs) < skipThresholdMs) {
        continue;
      }

      await patchFetchStateSafe(provider.id, { lastAttemptAt: new Date().toISOString() });

      try {
        const snapshot = await fetchUsageForProvider(provider);
        await storage.recordUsage(provider.id, snapshot);
        await patchFetchStateSafe(provider.id, {
          lastSuccessAt: snapshot.updatedAt.toISOString(),
          lastFailedAt: null,
          lastFailureReason: null,
        });
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        await patchFetchStateSafe(provider.id, {
          lastFailedAt: new Date().toISOString(),
          lastFailureReason: errorMessage.substring(0, 200),
        });
        console.error(`[scheduler] Failed to refresh provider ${provider.id}: ${errorMessage}`);
      }
    }
  }

  async refreshProvider(providerId: string): Promise<void> {
    const config = await storage.getProvider(providerId);
    if (!config || config.refreshInterval <= 0) return;

    try {
      const snapshot = await fetchUsageForProvider(config);
      await storage.recordUsage(providerId, snapshot);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error(`[scheduler] Failed to refresh provider ${providerId}: ${errorMessage}`);
    }
  }

  async refreshAllProviders(): Promise<void> {
    const providers = await storage.listProviders();
    const active = providers.filter((p) => p.refreshInterval > 0);
    await Promise.all(active.map((p) => this.refreshProvider(p.id)));
  }
}

export const schedulerService = new SchedulerService();
