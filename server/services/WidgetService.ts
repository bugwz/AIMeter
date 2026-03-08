import { UsageProvider, UsageSnapshot } from '../../src/types/index.js';

interface WidgetOptions {
  providers: UsageProvider[];
  layout: 'row' | 'col' | 'grid';
  type: 'primary' | 'secondary' | 'tertiary' | 'cost';
  theme: 'dark' | 'light';
  size?: number;
  showLogo?: boolean;
}

const PROVIDER_LOGOS: Record<string, string> = {
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

export class WidgetService {
  /**
   * Generate widget SVG
   */
  public generateWidgetSvg(data: Map<UsageProvider, UsageSnapshot>, options: WidgetOptions): string {
    const { providers, layout, type, theme, size = 120, showLogo = true } = options;
    const gap = 16;
    const strokeWidth = size * 0.08;
    const radius = (size - strokeWidth * 2) / 2;
    const circumference = 2 * Math.PI * radius;
    
    // Color configuration (minimal monochrome style)
    const textColor = theme === 'dark' ? '#FFFFFF' : '#000000';
    const bgTrackColor = theme === 'dark' ? 'rgba(255, 255, 255, 0.15)' : 'rgba(0, 0, 0, 0.1)';
    const progressColor = theme === 'dark' ? '#FFFFFF' : '#000000';

    // Calculate total width and height
    let width = 0;
    let height = 0;
    let cols = 1;
    let rows = 1;

    if (layout === 'row') {
      cols = providers.length;
      rows = 1;
    } else if (layout === 'col') {
      cols = 1;
      rows = providers.length;
    } else if (layout === 'grid') {
      cols = Math.ceil(Math.sqrt(providers.length));
      rows = Math.ceil(providers.length / cols);
    }

    width = cols * size + (cols - 1) * gap;
    height = rows * size + (rows - 1) * gap;

    // Prevent rendering tiny or zero dimensions when no data is available
    if (width <= 0) width = size;
    if (height <= 0) height = size;

    let svgContent = '';

    providers.forEach((provider, index) => {
      const snapshot = data.get(provider);
      
      const col = index % cols;
      const row = Math.floor(index / cols);
      const x = col * (size + gap);
      const y = row * (size + gap);
      
      // Center coordinates (relative to the full SVG)
      const cx = x + size / 2;
      const cy = y + size / 2;

      // Resolve data to display
      let percent = 0;
      let label = provider.substring(0, 1).toUpperCase(); // Default to uppercase first letter
      let subLabel = 'N/A';

      if (snapshot) {
        const progressItems = snapshot.progress || [];
        
        if (type === 'cost' && snapshot.cost) {
          const c = snapshot.cost;
          percent = c.limit > 0 ? (c.used / c.limit) * 100 : 0;
          subLabel = `${c.used.toFixed(0)}/${c.limit.toFixed(0)}`;
        } else if (type === 'tertiary') {
          const tertiaryItem = progressItems[2];
          if (tertiaryItem) {
            percent = tertiaryItem.usedPercent;
            subLabel = `${Math.round(percent)}%`;
          }
        } else if (type === 'secondary') {
          const secondaryItem = progressItems[1];
          if (secondaryItem) {
            percent = secondaryItem.usedPercent;
            subLabel = `${Math.round(percent)}%`;
          }
        } else {
          const primaryItem = progressItems[0];
          if (primaryItem) {
            percent = primaryItem.usedPercent;
            subLabel = `${Math.round(percent)}%`;
          }
        }
      }

      // Clamp percentage to 0-100
      percent = Math.max(0, Math.min(100, percent));
      // Remaining percentage used to compute ring length
      const remainingPercent = 100 - percent;
      const strokeDashoffset = circumference - (remainingPercent / 100) * circumference;

      const logoPath = PROVIDER_LOGOS[provider.toLowerCase()];
      const logoSize = size * 0.45;
      const logoX = cx - logoSize / 2;
      const logoY = cy - logoSize / 2 - size * 0.08;

      let centerContent = '';
      if (showLogo && logoPath) {
        centerContent = `<image href="${logoPath}" x="${logoX}" y="${logoY}" width="${logoSize}" height="${logoSize}" preserveAspectRatio="xMidYMid meet"/>`;
      } else {
        centerContent = `
          <text 
            x="${cx}" 
            y="${cy - size * 0.05}" 
            fill="${textColor}" 
            font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif" 
            font-size="${size * 0.35}px" 
            font-weight="bold" 
            text-anchor="middle" 
            dominant-baseline="middle"
          >${label}</text>
        `;
      }

      // Render block for a single provider
      svgContent += `
        <g transform="translate(0, 0)">
          <!-- Background ring -->
          <circle 
            cx="${cx}" 
            cy="${cy}" 
            r="${radius}" 
            fill="none" 
            stroke="${bgTrackColor}" 
            stroke-width="${strokeWidth}" 
          />
          
          <!-- Progress ring (rotate -90deg to start at 12 o'clock) -->
          <circle 
            cx="${cx}" 
            cy="${cy}" 
            r="${radius}" 
            fill="none" 
            stroke="${progressColor}" 
            stroke-width="${strokeWidth}"
            stroke-linecap="round"
            stroke-dasharray="${circumference}"
            stroke-dashoffset="${strokeDashoffset}"
            transform="rotate(-90 ${cx} ${cy})"
          />
          
          <!-- Center content: logo or text -->
          ${centerContent}
          
          <!-- Bottom label: used percentage or amount -->
          <text 
            x="${cx}" 
            y="${cy + size * 0.22}" 
            fill="${textColor}" 
            font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif" 
            font-size="${size * 0.16}px" 
            font-weight="600" 
            text-anchor="middle" 
            dominant-baseline="middle"
            opacity="0.85"
          >${subLabel}</text>
        </g>
      `;
    });

    return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  ${svgContent}
</svg>`;
  }
}

export const widgetService = new WidgetService();
