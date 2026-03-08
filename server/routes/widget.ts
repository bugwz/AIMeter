import { Router, Request, Response } from 'express';
import { UsageProvider, UsageSnapshot } from '../../src/types/index.js';
import { widgetService } from '../services/WidgetService.js';
import { Resvg } from '@resvg/resvg-js';
import { storage } from '../storage.js';
import { fetchUsageForProvider } from '../services/ProviderUsageService.js';

const router = Router();

router.get('/image', async (req: Request, res: Response) => {
  try {
    const providersParam = req.query.providers as string;
    const layoutParam = (req.query.layout as string) || 'row';
    const typeParam = (req.query.type as string) || 'primary';
    const themeParam = (req.query.theme as string) || 'dark';
    const showLogoParam = (req.query.showLogo as string) || 'true';
    const showLogo = showLogoParam !== 'false';

    if (!providersParam) {
      return res.status(400).send('Missing "providers" query parameter');
    }

    const providers = providersParam.split(',').filter(p => Object.values(UsageProvider).includes(p as UsageProvider)) as UsageProvider[];
    
    if (providers.length === 0) {
      return res.status(400).send('Invalid providers specified');
    }

    const usageData = new Map<UsageProvider, UsageSnapshot>();

    // Try local latest cache first; if stale or missing, fetch fresh data based on strategy
    // Note: lock screen widgets require very fast response, so prefer latest historical record
    for (const provider of providers) {
      const pConfig = (await storage.listProviders()).find((item) => item.provider === provider);
      // Fallback: skip if provider config does not exist
      if (!pConfig) continue;

      const latestRecord = await storage.getLatestUsage(pConfig.id);
      
      // If a local record exists, convert it to UsageSnapshot
      if (latestRecord && latestRecord.progress) {
        const progressItems = latestRecord.progress.items || [];
        
        usageData.set(provider, {
          provider,
          progress: progressItems.map(item => ({
            name: item.name,
            usedPercent: item.usedPercent ?? 0,
            remainingPercent: item.remainingPercent,
            used: item.used,
            limit: item.limit,
            windowMinutes: item.windowMinutes,
            resetsAt: item.resetsAt,
            resetDescription: item.resetDescription,
          })),
          cost: latestRecord.progress.cost,
          updatedAt: latestRecord.createdAt
        });
      } else {
        // If no history exists, do a real-time sync (may be slow, but required on first run)
        try {
          const snapshot = await fetchUsageForProvider(pConfig);
          usageData.set(provider, snapshot);
          await storage.recordUsage(pConfig.id, snapshot);
        } catch (e) {
          console.error(`Failed to fetch real-time data for widget: ${provider}`, e);
        }
      }
    }

    // Generate SVG source
    const svgStr = widgetService.generateWidgetSvg(usageData, {
      providers,
      layout: layoutParam as 'row' | 'col' | 'grid',
      type: typeParam as 'primary' | 'secondary' | 'tertiary' | 'cost',
      theme: themeParam as 'dark' | 'light',
      size: 120,
      showLogo
    });

    // If the client explicitly requests SVG format
    if (req.query.format === 'svg') {
      res.setHeader('Content-Type', 'image/svg+xml');
      res.setHeader('Cache-Control', 'public, max-age=300'); // Cache for 5 minutes
      return res.send(svgStr);
    }

    // Convert to PNG by default
    const resvg = new Resvg(svgStr, {
      background: 'rgba(0,0,0,0)', // Transparent background
      fitTo: { mode: 'original' }
    });
    const pngData = resvg.render();
    const pngBuffer = pngData.asPng();

    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Cache-Control', 'public, max-age=300'); // Recommended widget cache: 5 minutes
    res.send(pngBuffer);

  } catch (error) {
    console.error('Widget generation error:', error);
    res.status(500).send('Internal Server Error');
  }
});

export default router;
