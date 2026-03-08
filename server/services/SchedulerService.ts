import cron from 'node-cron';
import { storage } from '../storage.js';
import { fetchUsageForProvider } from './ProviderUsageService.js';
import { runtimeConfig } from '../runtime.js';

class SchedulerService {
  private jobs: Map<string, cron.ScheduledTask> = new Map();
  private isRunning: boolean = false;

  start(): void {
    if (this.isRunning || runtimeConfig.runtimeMode === 'serverless') return;
    this.isRunning = true;
    void this.scheduleAllProviders();
  }

  stop(): void {
    this.jobs.forEach((job) => job.stop());
    this.jobs.clear();
    this.isRunning = false;
  }

  async scheduleAllProviders(): Promise<void> {
    const providers = await storage.listProviders();
    providers.forEach((config) => {
      if (config.refreshInterval > 0) {
        this.scheduleProvider(config.id, config.refreshInterval);
      }
    });
  }

  scheduleProvider(providerId: string, intervalMinutes: number): void {
    const jobKey = providerId;
    
    if (this.jobs.has(jobKey)) {
      this.jobs.get(jobKey)?.stop();
    }

    const cronExpression = `*/${intervalMinutes} * * * *`;
    
    const job = cron.schedule(cronExpression, async () => {
      await this.refreshProvider(providerId);
    });

    this.jobs.set(jobKey, job);
  }

  stopProvider(providerId: string): void {
    const job = this.jobs.get(providerId);
    if (job) {
      job.stop();
      this.jobs.delete(providerId);
    }
  }

  async updateProviderInterval(providerId: string, intervalMinutes: number): Promise<void> {
    const config = await storage.getProvider(providerId);
    if (config && config.refreshInterval > 0) {
      this.scheduleProvider(providerId, intervalMinutes);
    }
  }

  async refreshProvider(providerId: string): Promise<void> {
    const config = await storage.getProvider(providerId);
    if (!config) {
      return;
    }
    if (config.refreshInterval <= 0) {
      this.stopProvider(providerId);
      return;
    }

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
    const promises = providers
      .map((p) => this.refreshProvider(p.id));
    
    await Promise.all(promises);
  }
}

export const schedulerService = new SchedulerService();
