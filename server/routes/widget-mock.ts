import { Router, Request, Response } from 'express';
import { MOCK_PROVIDER_CONFIGS } from '../mock/config.js';
import { UsageProvider } from '../../src/types/index.js';
import { Resvg } from '@resvg/resvg-js';

const router = Router();

const MOCK_PROVIDER_LOGOS: Record<string, string> = {
  claude: '/providers/claude.svg',
  codex: '/providers/codex.svg',
  kimi: '/providers/kimi.svg',
  minimax: '/providers/minimax.svg',
  copilot: '/providers/copilot.svg',
  openrouter: '/providers/openrouter.svg',
  ollama: '/providers/ollama.svg',
  opencode: '/providers/opencode.svg',
  cursor: '/providers/cursor.svg',
};

router.get('/image', (req: Request, res: Response) => {
  try {
    const providersParam = req.query.providers as string;
    const layout = (req.query.layout as string) || 'row';
    const type = (req.query.type as string) || 'primary';
    const theme = (req.query.theme as string) || 'dark';
    const showLogoParam = (req.query.showLogo as string) || 'true';
    const showLogo = showLogoParam !== 'false';

    if (!providersParam) {
      return res.status(400).send('Missing "providers" query parameter');
    }

    const providers = providersParam.split(',').filter(p => Object.values(UsageProvider).includes(p as UsageProvider)) as UsageProvider[];
    if (providers.length === 0) {
      return res.status(400).send('Invalid providers specified');
    }

    const size = 120;
    const gap = 16;
    const strokeWidth = size * 0.08;
    const radius = (size - strokeWidth * 2) / 2;
    const circumference = 2 * Math.PI * radius;

    const textColor = theme === 'dark' ? '#FFFFFF' : '#000000';
    const bgTrackColor = theme === 'dark' ? 'rgba(255, 255, 255, 0.15)' : 'rgba(0, 0, 0, 0.1)';
    const progressColor = theme === 'dark' ? '#FFFFFF' : '#000000';

    let cols = 1;
    if (layout === 'row') cols = providers.length;
    else if (layout === 'grid') cols = Math.ceil(Math.sqrt(providers.length));

    const width = cols * size + (cols - 1) * gap;
    const rows = Math.ceil(providers.length / cols);
    const height = rows * size + (rows - 1) * gap;

    let svgContent = '';
    providers.forEach((provider, index) => {
      const col = index % cols;
      const row = Math.floor(index / cols);
      const x = col * (size + gap);
      const y = row * (size + gap);
      const cx = x + size / 2;
      const cy = y + size / 2;

      const providerConfig = MOCK_PROVIDER_CONFIGS[provider];
      const percent = providerConfig ? Math.min(100, (providerConfig.initialUsage / providerConfig.limit) * 100) : 50;
      const remainingPercent = 100 - percent;
      const strokeDashoffset = circumference - (remainingPercent / 100) * circumference;
      const label = provider.substring(0, 1).toUpperCase();
      const subLabel = `${Math.round(percent)}%`;

      const logoPath = showLogo ? MOCK_PROVIDER_LOGOS[provider.toLowerCase()] : null;
      const logoSize = size * 0.45;
      const logoX = cx - logoSize / 2;
      const logoY = cy - logoSize / 2 - size * 0.08;

      let centerContent = '';
      if (showLogo && logoPath) {
        centerContent = `<image href="${logoPath}" x="${logoX}" y="${logoY}" width="${logoSize}" height="${logoSize}" preserveAspectRatio="xMidYMid meet"/>`;
      } else {
        centerContent = `<text x="${cx}" y="${cy - size * 0.05}" fill="${textColor}" font-family="-apple-system, BlinkMacSystemFont" font-size="${size * 0.35}px" font-weight="bold" text-anchor="middle" dominant-baseline="middle">${label}</text>`;
      }

      svgContent += `
        <g transform="translate(0, 0)">
          <circle cx="${cx}" cy="${cy}" r="${radius}" fill="none" stroke="${bgTrackColor}" stroke-width="${strokeWidth}"/>
          <circle cx="${cx}" cy="${cy}" r="${radius}" fill="none" stroke="${progressColor}" stroke-width="${strokeWidth}" stroke-linecap="round" stroke-dasharray="${circumference}" stroke-dashoffset="${strokeDashoffset}" transform="rotate(-90 ${cx} ${cy})"/>
          ${centerContent}
          <text x="${cx}" y="${cy + size * 0.22}" fill="${textColor}" font-family="-apple-system, BlinkMacSystemFont" font-size="${size * 0.16}px" font-weight="600" text-anchor="middle" dominant-baseline="middle" opacity="0.85">${subLabel}</text>
        </g>`;
    });

    const svgStr = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  ${svgContent}
</svg>`;

    if (req.query.format === 'svg') {
      res.setHeader('Content-Type', 'image/svg+xml');
      res.setHeader('Cache-Control', 'public, max-age=300');
      return res.send(svgStr);
    }

    const resvg = new Resvg(svgStr, { background: 'rgba(0,0,0,0)', fitTo: { mode: 'original' } });
    const pngData = resvg.render();
    const pngBuffer = pngData.asPng();

    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Cache-Control', 'public, max-age=300');
    res.send(pngBuffer);
  } catch (error) {
    console.error('Mock Widget generation error:', error);
    res.status(500).send('Internal Server Error');
  }
});

export default router;
