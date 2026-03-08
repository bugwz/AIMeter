// Ollama provider adapter implementation
import { IProviderAdapter, ValidationResult } from './interface';
import { 
  UsageProvider, 
  AuthType, 
  Credential, 
  UsageSnapshot, 
  ProviderMeta,
  ProgressItem,
} from '../types';
import { roundPercentage } from './utils';

const OLLAMA_META: ProviderMeta = {
  id: UsageProvider.OLLAMA,
  name: 'Ollama',
  logo: '/providers/ollama.svg',
  color: '#000000',
  supportedAuthTypes: [AuthType.COOKIE],
  docsUrl: 'https://ollama.com',
};

export class OllamaAdapter implements IProviderAdapter {
  readonly id = UsageProvider.OLLAMA;
  readonly meta = OLLAMA_META;
  
  private readonly settingsURL = 'https://ollama.com/settings';
  private readonly primaryUsageLabels = ['Session usage', 'Hourly usage'];
  
  async validateCredentials(credentials: Credential): Promise<ValidationResult> {
    try {
      const cookie = this.extractCookie(credentials);
      if (!cookie) {
        return { valid: false, reason: 'No cookie provided' };
      }
      
      const response = await fetch(this.settingsURL, {
        headers: this.buildHeaders(cookie),
      });
      
      if (response.status === 401 || response.status === 403) {
        return { valid: false, reason: 'Invalid or expired session' };
      }

      if (!response.ok) {
        return { valid: false, reason: `Ollama responded with HTTP ${response.status}` };
      }

      const html = await response.text();
      if (this.looksSignedOut(html)) {
        return { valid: false, reason: 'Ollama session expired or sign-in required' };
      }

      const parsed = this.parseHTML(html);
      if (parsed.progress.length === 0) {
        return { valid: false, reason: 'Could not parse Ollama usage data' };
      }
      
      return { valid: true };
    } catch (error) {
      return { valid: false, reason: error instanceof Error ? error.message : 'Validation failed' };
    }
  }
  
  async fetchUsage(credentials: Credential): Promise<UsageSnapshot> {
    const cookie = this.extractCookie(credentials);
    if (!cookie) {
      throw new Error('No cookie provided');
    }
    
    const response = await fetch(this.settingsURL, {
      headers: this.buildHeaders(cookie),
    });
    
    if (!response.ok) {
      if (response.status === 401 || response.status === 403) {
        throw new Error('Invalid or expired Ollama session');
      }
      throw new Error(`Ollama API error: ${response.status}`);
    }
    
    const html = await response.text();
    if (this.looksSignedOut(html)) {
      throw new Error('Invalid or expired Ollama session');
    }
    // Debug only: response may include account/usage details; keep commented in normal runs.
    // console.log('Ollama API response (usage):', this.compactHtml(html));

    const snapshot = this.parseHTML(html);
    // if (!snapshot.identity?.plan) {
    //   console.log('Ollama API response (cloud-context):', JSON.stringify({
    //     cloudUsageContext: this.extractCloudUsageContext(html),
    //   }));
    // }
    // console.log('Ollama API response (usage-parsed):', JSON.stringify(snapshot));
    return snapshot;
  }
  
  getErrorMessage(error: unknown): string {
    if (error instanceof Error) {
      if (error.message.includes('401') || error.message.includes('403')) {
        return 'Ollama session expired. Please re-authenticate.';
      }
      return error.message;
    }
    return 'Failed to fetch Ollama usage';
  }
  
  private extractCookie(credentials: Credential): string | null {
    if (credentials.type === AuthType.COOKIE) {
      return credentials.value;
    }
    return null;
  }
  
  private buildHeaders(cookie: string): Record<string, string> {
    return {
      'Cookie': cookie,
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.9',
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36',
      'Origin': 'https://ollama.com',
      'Referer': this.settingsURL,
    };
  }
  
  private parseHTML(html: string): UsageSnapshot {
    const plan = this.parsePlanName(html);
    const email = this.parseAccountEmail(html);
    const session = this.parseUsageBlock(this.primaryUsageLabels, html);
    const weekly = this.parseUsageBlock(['Weekly usage'], html);
    
    const progress: ProgressItem[] = [];
    
    if (session) {
      const usedPercent = roundPercentage(session.usedPercent);
      progress.push({
        name: 'Session',
        desc: '',
        usedPercent,
        remainingPercent: roundPercentage(100 - usedPercent),
        resetsAt: session.resetsAt,
      });
    }
    
    if (weekly) {
      const usedPercent = roundPercentage(weekly.usedPercent);
      progress.push({
        name: 'Weekly',
        desc: '',
        usedPercent,
        remainingPercent: roundPercentage(100 - usedPercent),
        resetsAt: weekly.resetsAt,
      });
    }

    if (progress.length === 0) {
      throw new Error('Could not parse Ollama usage data');
    }
    
    return {
      provider: UsageProvider.OLLAMA,
      progress,
      identity: {
        plan,
      },
      updatedAt: new Date(),
    };
  }

  private parsePlanName(html: string): string | undefined {
    // Prefer strict nearby badge capture first, then fall back to same-heading parsing.
    const raw =
      this.firstCapture(
        html,
        /Cloud(?:\s|&nbsp;)+Usage\s*<\/span\s*>\s*<span[^>]*>\s*([^<]+?)\s*<\/span\s*>/is
      ) ??
      this.firstCapture(
        html,
        /<h2[^>]*>[\s\S]*?<span[^>]*>\s*Cloud(?:\s|&nbsp;)+Usage\s*<\/span\s*>[\s\S]*?<span[^>]*>\s*([^<]+?)\s*<\/span\s*>[\s\S]*?<\/h2>/is
      ) ??
      this.firstCapture(
        html,
        /<h2[^>]*>[\s\S]*?Cloud(?:\s|&nbsp;)+Usage[\s\S]*?<span[^>]*class=["'][^"']*(?:rounded-full|capitalize|bg-neutral-100)[^"']*["'][^>]*>\s*([^<]+?)\s*<\/span\s*>[\s\S]*?<\/h2>/is
      ) ??
      this.firstCapture(
        html,
        /Cloud(?:\s|&nbsp;)+Usage[\s\S]{0,350}?<span[^>]*class=["'][^"']*(?:rounded-full|capitalize|bg-neutral-100)[^"']*["'][^>]*>\s*([^<]+?)\s*<\/span\s*>/is
      );

    if (raw) {
      return this.normalizePlanName(raw);
    }

    // Fallback: constrain parsing to the same <h2> block containing "Cloud Usage"
    // so that lower sections like "Session usage" are never treated as plan names.
    const labelRegex = /Cloud(?:\s|&nbsp;)+Usage/i;
    const labelMatch = labelRegex.exec(html);
    if (!labelMatch || labelMatch.index === undefined) return undefined;

    const labelIndex = labelMatch.index;
    const h2Start = html.lastIndexOf('<h2', labelIndex);
    if (h2Start === -1) return undefined;

    const h2End = html.indexOf('</h2>', labelIndex);
    if (h2End === -1) return undefined;

    const h2Block = html.slice(h2Start, h2End + 5);
    const localSpans = [...h2Block.matchAll(/<span[^>]*>\s*([^<]+?)\s*<\/span>/gi)];
    for (const match of localSpans) {
      const value = (match[1] || '').trim();
      if (!value) continue;
      if (/^cloud(?:\s|&nbsp;)+usage$/i.test(value)) continue;
      if (/^resets?\s+in/i.test(value)) continue;
      if (/%\s*used$/i.test(value)) continue;
      return this.normalizePlanName(value);
    }

    return undefined;
  }

  private normalizePlanName(value: string): string {
    const normalized = value.trim().toLowerCase();
    if (!normalized) return value;
    if (/usage|resets?\s+in|%\s*used/i.test(normalized)) return value.trim();
    return normalized.charAt(0).toUpperCase() + normalized.slice(1);
  }

  private extractCloudUsageContext(html: string): string {
    const match = html.match(/Cloud(?:\s|&nbsp;)+Usage/i);
    if (!match || typeof match.index !== 'number') {
      return '[Cloud Usage label not found]';
    }
    const start = Math.max(0, match.index - 120);
    const end = Math.min(html.length, match.index + 520);
    return html
      .slice(start, end)
      .replace(/\s+/g, ' ')
      .trim();
  }

  private compactHtml(html: string): string {
    return html.replace(/\s+/g, ' ').trim();
  }

  private parseAccountEmail(html: string): string | undefined {
    const raw = this.firstCapture(
      html,
      /id=["']header-email["'][^>]*>([^<]+)</is
    );

    if (!raw || !raw.includes('@')) {
      return undefined;
    }

    return raw;
  }

  private parseUsageBlock(
    labels: string[],
    html: string
  ): { usedPercent: number; resetsAt?: Date } | null {
    for (const label of labels) {
      const parsed = this.parseUsageBlockByLabel(label, html);
      if (parsed) {
        return parsed;
      }
    }

    return null;
  }

  private parseUsageBlockByLabel(
    label: string,
    html: string
  ): { usedPercent: number; resetsAt?: Date } | null {
    const startIndex = html.indexOf(label);
    if (startIndex === -1) {
      return null;
    }

    const blockStart = startIndex + label.length;
    const window = html.slice(blockStart, blockStart + 800);
    const usedPercent = this.parsePercent(window);
    if (usedPercent === null) {
      return null;
    }

    return {
      usedPercent,
      resetsAt: this.parseISODate(window) || undefined,
    };
  }


  private parsePercent(text: string): number | null {
    const explicit = this.firstCapture(text, /([0-9]+(?:\.[0-9]+)?)\s*%\s*used/i);
    if (explicit) {
      const parsed = Number.parseFloat(explicit);
      return Number.isFinite(parsed) ? parsed : null;
    }

    const width = this.firstCapture(text, /width:\s*([0-9]+(?:\.[0-9]+)?)%/i);
    if (width) {
      const parsed = Number.parseFloat(width);
      return Number.isFinite(parsed) ? parsed : null;
    }

    return null;
  }

  private parseISODate(text: string): Date | null {
    const raw = this.firstCapture(text, /data-time=["']([^"']+)["']/i);
    if (!raw) {
      return null;
    }

    const date = new Date(raw);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  private firstCapture(text: string, pattern: RegExp): string | null {
    const match = text.match(pattern);
    const value = match?.[1]?.trim();
    return value ? value : null;
  }

  private looksSignedOut(html: string): boolean {
    const lower = html.toLowerCase();
    const hasSignInHeading = lower.includes('sign in to ollama') || lower.includes('log in to ollama');
    const hasAuthRoute =
      lower.includes('/api/auth/signin') ||
      lower.includes('/auth/signin') ||
      lower.includes('action="/login"') ||
      lower.includes("action='/login'") ||
      lower.includes('href="/login"') ||
      lower.includes("href='/login'") ||
      lower.includes('action="/signin"') ||
      lower.includes("action='/signin'") ||
      lower.includes('href="/signin"') ||
      lower.includes("href='/signin'");
    const hasPasswordField =
      lower.includes('type="password"') ||
      lower.includes("type='password'") ||
      lower.includes('name="password"') ||
      lower.includes("name='password'");
    const hasEmailField =
      lower.includes('type="email"') ||
      lower.includes("type='email'") ||
      lower.includes('name="email"') ||
      lower.includes("name='email'");
    const hasAuthForm = lower.includes('<form');

    if (hasSignInHeading && hasAuthForm && (hasEmailField || hasPasswordField || hasAuthRoute)) {
      return true;
    }
    if (hasAuthForm && hasAuthRoute) {
      return true;
    }
    if (hasAuthForm && hasPasswordField && hasEmailField) {
      return true;
    }

    return false;
  }
}

export const ollamaAdapter = new OllamaAdapter();
