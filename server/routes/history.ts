import { Router, Request, Response } from 'express';
import { storage } from '../storage.js';
import type { UsageRecordRow } from '../storage.js';

const router = Router();

type CompactHistoryRecord = {
  t: number;
  p?: Array<[number, number]>;
  c?: [number, number];
};

type CompactHistorySeries = {
  k: string[];
  d: CompactHistoryRecord[];
};

function resolveBucketMinutes(days: number, bucketMinutesParam?: string): number {
  const explicitBucket = Number(bucketMinutesParam);
  const minBucket = days >= 90 ? 20 : 1;
  if (Number.isFinite(explicitBucket) && explicitBucket >= 1) {
    return Math.max(Math.floor(explicitBucket), minBucket);
  }
  if (days <= 7) return 5;
  if (days <= 14) return 10;
  if (days <= 30) return 15;
  if (days <= 60) return 20;
  if (days <= 90) return 30;
  return 60;
}

function downsampleCompactRecords(records: CompactHistoryRecord[], bucketMinutes: number): CompactHistoryRecord[] {
  if (records.length <= 1) return records;
  const bucketSeconds = bucketMinutes * 60;
  if (!Number.isFinite(bucketSeconds) || bucketSeconds <= 0) return records;

  const byBucket = new Map<number, CompactHistoryRecord>();
  records.forEach((record) => {
    const key = Math.floor(record.t / bucketSeconds) * bucketSeconds;
    const existing = byBucket.get(key);
    if (!existing || record.t >= existing.t) {
      byBucket.set(key, record);
    }
  });

  return Array.from(byBucket.entries())
    .sort((a, b) => a[0] - b[0])
    .map(([, record]) => record);
}

function compactHistory(records: UsageRecordRow[], bucketMinutes: number): CompactHistorySeries {
  const progressNameToIndex = new Map<string, number>();
  const progressKeys: string[] = [];

  const ensureProgressKey = (name: string): number => {
    const existing = progressNameToIndex.get(name);
    if (existing !== undefined) return existing;
    const nextIndex = progressKeys.length;
    progressNameToIndex.set(name, nextIndex);
    progressKeys.push(name);
    return nextIndex;
  };

  const data: CompactHistoryRecord[] = records.map((record) => {
    const progressEntries = (record.progress?.items || [])
      .filter((item) => typeof item.name === 'string' && typeof item.usedPercent === 'number')
      .map((item) => [ensureProgressKey(item.name), item.usedPercent] as [number, number]);

    const cost = record.progress?.cost;
    return {
      t: Math.floor(record.createdAt.getTime() / 1000),
      ...(progressEntries.length > 0 ? { p: progressEntries } : {}),
      ...(cost && typeof cost.used === 'number' && typeof cost.limit === 'number'
        ? { c: [cost.used, cost.limit] as [number, number] }
        : {}),
    };
  });

  return { k: progressKeys, d: downsampleCompactRecords(data, bucketMinutes) };
}

router.get('/', async (req: Request, res: Response) => {
  try {
    const days = parseInt(req.query.days as string) || 30;
    const bucketMinutes = resolveBucketMinutes(days, req.query.bucketMinutes as string | undefined);
    const provider = req.query.provider as string;
    
    let data: Record<string, CompactHistorySeries>;
    if (provider) {
      const history = await storage.getUsageHistory(provider, days);
      data = { [provider]: compactHistory(history, bucketMinutes) };
    } else {
      const allHistory = await storage.getAllUsageHistory(days);
      data = Object.fromEntries(
        Object.entries(allHistory).map(([providerId, records]) => [providerId, compactHistory(records, bucketMinutes)])
      );
    }
    
    res.json({
      success: true,
      data,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
    });
  }
});

router.get('/providers', async (req: Request, res: Response) => {
  try {
    const days = parseInt(req.query.days as string) || 30;
    const history = await storage.getAllUsageHistory(days);
    
    const providers = Object.keys(history).map(providerId => ({
      id: providerId,
      recordCount: history[providerId]?.length || 0,
    }));
    
    res.json({
      success: true,
      data: providers,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
    });
  }
});

export default router;
