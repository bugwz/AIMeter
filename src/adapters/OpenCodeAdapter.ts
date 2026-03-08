import { IProviderAdapter, ValidationResult } from './interface';
import {
  UsageProvider,
  AuthType,
  Credential,
  UsageSnapshot,
  ProviderMeta,
  ProgressItem,
  ProviderConfig,
} from '../types';
import { roundPercentage } from './utils';

type JsonObject = Record<string, unknown>;

interface WindowData {
  usedPercent: number;
  resetInSec: number;
}

interface WindowCandidate extends WindowData {
  id: string;
  path: string;
}

const OPENCODE_META: ProviderMeta = {
  id: UsageProvider.OPENCODE,
  name: 'OpenCode',
  logo: '/providers/opencode.svg',
  color: '#000000',
  supportedAuthTypes: [AuthType.COOKIE],
  docsUrl: 'https://opencode.ai',
};

export class OpenCodeAdapter implements IProviderAdapter {
  readonly id = UsageProvider.OPENCODE;
  readonly meta = OPENCODE_META;

  private readonly baseURL = 'https://opencode.ai';
  private readonly serverURL = 'https://opencode.ai/_server';
  private readonly workspaceServerId = 'def39973159c7f0483d8793a822b8dbb10d067e12c65455fcb4608459ba0234f';
  private readonly subscriptionServerId = '7abeebee372f304e050aaaf92be863f4a86490e382f8c79db68fd94040d691b4';
  private readonly fallbackUsageServerId = 'bbb1284bc5442ffc92d7d2ef43d0bae818b6a859d848d631e9fa8d26cf77b56c';
  private readonly userAgent = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36';
  private readonly percentKeys = [
    'usagePercent',
    'usedPercent',
    'percentUsed',
    'percent',
    'usage_percent',
    'used_percent',
    'utilization',
    'utilizationPercent',
    'utilization_percent',
    'usage',
  ];
  private readonly resetInKeys = [
    'resetInSec',
    'resetInSeconds',
    'resetSeconds',
    'reset_sec',
    'reset_in_sec',
    'resetsInSec',
    'resetsInSeconds',
    'resetIn',
    'resetSec',
  ];
  private readonly resetAtKeys = [
    'resetAt',
    'resetsAt',
    'reset_at',
    'resets_at',
    'nextReset',
    'next_reset',
    'renewAt',
    'renew_at',
  ];

  async validateCredentials(credentials: Credential, config?: ProviderConfig): Promise<ValidationResult> {
    try {
      const cookie = this.extractCookie(credentials);
      if (!cookie) {
        return { valid: false, reason: 'No cookie provided' };
      }

      const workspaceId = await this.resolveWorkspaceId(cookie, config?.opencodeWorkspaceId);
      if (!workspaceId) {
        return { valid: false, reason: 'No OpenCode workspace found' };
      }

      await this.fetchSubscriptionText(cookie, workspaceId);
      return { valid: true };
    } catch (error) {
      return { valid: false, reason: this.getErrorMessage(error) };
    }
  }

  async fetchUsage(credentials: Credential, config?: ProviderConfig): Promise<UsageSnapshot> {
    const cookie = this.extractCookie(credentials);
    if (!cookie) {
      throw new Error('No cookie provided');
    }

    const workspaceId = await this.resolveWorkspaceId(cookie, config?.opencodeWorkspaceId);
    if (!workspaceId) {
      throw new Error('No OpenCode workspace found');
    }

    const subscriptionText = await this.fetchSubscriptionText(cookie, workspaceId);
    this.log('OpenCode usage response:', this.previewText(subscriptionText));
    const parsed = this.parseUsagePayload(subscriptionText);

    const now = new Date();
    const progress: ProgressItem[] = [
      {
        name: 'Primary',
        usedPercent: roundPercentage(parsed.rolling.usedPercent),
        remainingPercent: this.toRemainingPercent(parsed.rolling.usedPercent),
        windowMinutes: 5 * 60,
        resetsAt: new Date(now.getTime() + parsed.rolling.resetInSec * 1000),
      },
      {
        name: 'Secondary',
        usedPercent: roundPercentage(parsed.weekly.usedPercent),
        remainingPercent: this.toRemainingPercent(parsed.weekly.usedPercent),
        windowMinutes: 7 * 24 * 60,
        resetsAt: new Date(now.getTime() + parsed.weekly.resetInSec * 1000),
      },
    ];

    return {
      provider: UsageProvider.OPENCODE,
      progress,
      updatedAt: now,
    };
  }

  getErrorMessage(error: unknown): string {
    if (!(error instanceof Error)) {
      return 'Failed to fetch OpenCode usage';
    }

    if (error.message.includes('Invalid or expired OpenCode session')) {
      return 'OpenCode session expired. Please re-authenticate.';
    }
    if (error.message.includes('No OpenCode workspace found')) {
      return 'No OpenCode workspace found. Provide a valid workspace ID.';
    }
    if (error.message.includes('OpenCode usage payload changed')) {
      return 'OpenCode response format changed. Usage data could not be parsed.';
    }
    return error.message;
  }

  private extractCookie(credentials: Credential): string | null {
    if (credentials.type !== AuthType.COOKIE) {
      return null;
    }

    return this.normalizeCookieHeader(credentials.value);
  }

  private normalizeCookieHeader(value: string): string {
    const trimmed = value.trim();
    if (!trimmed) {
      return trimmed;
    }

    if (this.isCookieHeader(trimmed)) {
      return trimmed;
    }

    return `auth=${trimmed}`;
  }

  private isCookieHeader(value: string): boolean {
    if (value.includes(';')) {
      return true;
    }

    return /^(?:auth|__Host-auth)=/i.test(value);
  }

  private async resolveWorkspaceId(cookie: string, workspaceOverride?: string): Promise<string> {
    const normalizedOverride = this.normalizeWorkspaceId(workspaceOverride);
    if (normalizedOverride) {
      this.log('OpenCode using configured workspace ID:', normalizedOverride);
      return normalizedOverride;
    }

    const initialText = await this.fetchServerText({
      serverId: this.workspaceServerId,
      method: 'GET',
      referer: this.baseURL,
      cookie,
    });

    let workspaceId = this.extractWorkspaceId(initialText);
    if (workspaceId) {
      this.log('OpenCode workspace resolved via GET:', workspaceId);
      return workspaceId;
    }

    const fallbackText = await this.fetchServerText({
      serverId: this.workspaceServerId,
      method: 'POST',
      args: [],
      referer: this.baseURL,
      cookie,
    });

    workspaceId = this.extractWorkspaceId(fallbackText);
    if (!workspaceId) {
      throw new Error('No OpenCode workspace found');
    }

    this.log('OpenCode workspace resolved via POST fallback:', workspaceId);
    return workspaceId;
  }

  private async fetchSubscriptionText(cookie: string, workspaceId: string): Promise<string> {
    const referer = `${this.baseURL}/workspace/${workspaceId}/billing`;
    try {
      const initialText = await this.fetchServerText({
        serverId: this.subscriptionServerId,
        method: 'GET',
        args: [workspaceId],
        referer,
        cookie,
      });

      if (this.hasUsagePayload(initialText)) {
        this.log('OpenCode subscription GET payload accepted for workspace:', workspaceId);
        return initialText;
      }

      const postText = await this.fetchServerText({
        serverId: this.subscriptionServerId,
        method: 'POST',
        args: [workspaceId],
        referer,
        cookie,
      });
      this.log('OpenCode subscription POST payload accepted:', String(this.hasUsagePayload(postText)));
      return postText;
    } catch (error) {
      this.log('OpenCode subscription request failed, trying fallback endpoint:', error instanceof Error ? error.message : String(error));
      const fallbackText = await this.fetchFallbackUsageText(cookie, workspaceId, referer);
      if (this.hasUsagePayload(fallbackText)) {
        this.log('OpenCode fallback usage payload accepted for workspace:', workspaceId);
        return fallbackText;
      }
      this.log('OpenCode fallback usage payload rejected:', this.previewText(fallbackText));
      throw error;
    }
  }

  private async fetchServerText(input: {
    serverId: string;
    method: 'GET' | 'POST';
    args?: unknown[];
    body?: unknown;
    accept?: string;
    serverInstance?: string;
    referer: string;
    cookie: string;
  }): Promise<string> {
    const url = this.buildServerUrl(input.serverId, input.method, input.args);
    this.log(
      'OpenCode request:',
      JSON.stringify({
        serverId: input.serverId,
        method: input.method,
        url,
        referer: input.referer,
        hasArgs: Array.isArray(input.args) ? input.args.length : 0,
        hasBody: input.body !== undefined,
        serverInstance: input.serverInstance ?? 'generated',
      })
    );
    const headers: Record<string, string> = {
      Cookie: input.cookie,
      'X-Server-Id': input.serverId,
      'X-Server-Instance': input.serverInstance ?? `server-fn:${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`,
      Accept: input.accept ?? 'text/javascript, application/json;q=0.9, */*;q=0.8',
      'User-Agent': this.userAgent,
      Origin: this.baseURL,
      Referer: input.referer,
    };

    const init: RequestInit = {
      method: input.method,
      headers,
    };

    if (input.method === 'POST') {
      headers['Content-Type'] = 'application/json';
      init.body = JSON.stringify(input.body ?? input.args ?? []);
    }

    const response = await fetch(url, init);
    const text = await response.text();
    this.log(
      'OpenCode response:',
      JSON.stringify({
        serverId: input.serverId,
        method: input.method,
        status: response.status,
        ok: response.ok,
        contentType: response.headers.get('content-type'),
        bodyPreview: this.previewText(text),
      })
    );

    if (!response.ok) {
      if (response.status === 401 || response.status === 403 || this.looksSignedOut(text)) {
        throw new Error('Invalid or expired OpenCode session');
      }

      const errorMessage = this.extractServerErrorMessage(text);
      throw new Error(errorMessage
        ? `OpenCode API error: HTTP ${response.status}: ${errorMessage}`
        : `OpenCode API error: HTTP ${response.status}`);
    }

    if (this.looksSignedOut(text)) {
      throw new Error('Invalid or expired OpenCode session');
    }

    return text;
  }

  private buildServerUrl(serverId: string, method: 'GET' | 'POST', args?: unknown[]): string {
    if (method !== 'GET') {
      return this.serverURL;
    }

    const url = new URL(this.serverURL);
    url.searchParams.set('id', serverId);
    if (args && args.length > 0) {
      url.searchParams.set('args', JSON.stringify(args));
    }
    return url.toString();
  }

  private async fetchFallbackUsageText(cookie: string, workspaceId: string, referer: string): Promise<string> {
    const now = new Date();
    const body = {
      t: {
        t: 9,
        i: 0,
        l: 3,
        a: [
          { t: 1, s: workspaceId },
          { t: 0, s: now.getFullYear() },
          { t: 0, s: now.getMonth() },
        ],
        o: 0,
      },
      f: 31,
      m: [],
    };

    this.log('OpenCode fallback request body:', JSON.stringify(body));

    return this.fetchServerText({
      serverId: this.fallbackUsageServerId,
      method: 'POST',
      body,
      accept: '*/*',
      serverInstance: 'server-fn:0',
      referer,
      cookie,
    });
  }

  private normalizeWorkspaceId(raw?: string): string | undefined {
    if (!raw) return undefined;
    const trimmed = raw.trim();
    if (!trimmed) return undefined;

    if (trimmed.startsWith('wrk_')) {
      return trimmed;
    }

    const match = trimmed.match(/wrk_[A-Za-z0-9]+/);
    return match?.[0];
  }

  private extractWorkspaceId(text: string): string | undefined {
    const directMatch = text.match(/id\s*:\s*"?(wrk_[A-Za-z0-9]+)"?/);
    if (directMatch?.[1]) {
      return directMatch[1];
    }

    const parsed = this.tryParseJson(text);
    if (!parsed) {
      return undefined;
    }

    const found = new Set<string>();
    this.collectWorkspaceIds(parsed, found);
    return [...found][0];
  }

  private collectWorkspaceIds(value: unknown, results: Set<string>): void {
    if (typeof value === 'string') {
      const match = value.match(/^wrk_[A-Za-z0-9]+$/);
      if (match) {
        results.add(value);
      }
      return;
    }

    if (Array.isArray(value)) {
      for (const item of value) {
        this.collectWorkspaceIds(item, results);
      }
      return;
    }

    if (value && typeof value === 'object') {
      for (const nested of Object.values(value as JsonObject)) {
        this.collectWorkspaceIds(nested, results);
      }
    }
  }

  private hasUsagePayload(text: string): boolean {
    const parsed = this.tryParseJson(text);
    if (parsed) {
      return !!this.extractWindowsFromJson(parsed);
    }

    return /rollingUsage[^}]*usagePercent/i.test(text) || /weeklyUsage[^}]*usagePercent/i.test(text);
  }

  private parseUsagePayload(text: string): { rolling: WindowData; weekly: WindowData } {
    const parsed = this.tryParseJson(text);
    if (parsed) {
      const jsonWindows = this.extractWindowsFromJson(parsed);
      if (jsonWindows) {
        return jsonWindows;
      }
    }

    const rollingPercent = this.extractNumber(text, /rollingUsage[^}]*?usagePercent\s*:\s*([0-9]+(?:\.[0-9]+)?)/i);
    const rollingReset = this.extractNumber(text, /rollingUsage[^}]*?resetInSec\s*:\s*([0-9]+)/i);
    const weeklyPercent = this.extractNumber(text, /weeklyUsage[^}]*?usagePercent\s*:\s*([0-9]+(?:\.[0-9]+)?)/i);
    const weeklyReset = this.extractNumber(text, /weeklyUsage[^}]*?resetInSec\s*:\s*([0-9]+)/i);

    if (
      rollingPercent === undefined ||
      rollingReset === undefined ||
      weeklyPercent === undefined ||
      weeklyReset === undefined
    ) {
      throw new Error('OpenCode usage payload changed');
    }

    return {
      rolling: { usedPercent: this.normalizePercent(rollingPercent), resetInSec: Math.max(0, Math.round(rollingReset)) },
      weekly: { usedPercent: this.normalizePercent(weeklyPercent), resetInSec: Math.max(0, Math.round(weeklyReset)) },
    };
  }

  private extractWindowsFromJson(value: unknown, nowMs: number = Date.now()): { rolling: WindowData; weekly: WindowData } | undefined {
    const direct = this.parseUsageNode(value, nowMs);
    if (direct) {
      return direct;
    }

    const candidates = this.collectWindowCandidates(value, [], nowMs);
    if (!candidates.length) {
      return undefined;
    }

    const rolling = this.pickWindowCandidate(
      candidates.filter(candidate => /rolling|hour|5h|5-hour/.test(candidate.path)),
      candidates,
      true
    );
    const weekly = this.pickWindowCandidate(
      candidates.filter(candidate => /weekly|week/.test(candidate.path)),
      candidates,
      false,
      rolling?.id
    );

    if (!rolling || !weekly) {
      return undefined;
    }

    return { rolling, weekly };
  }

  private parseUsageNode(value: unknown, nowMs: number): { rolling: WindowData; weekly: WindowData } | undefined {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      return undefined;
    }

    const dict = value as JsonObject;
    const nestedUsage = this.asObject(dict.usage);
    if (nestedUsage) {
      const nested = this.parseUsageNode(nestedUsage, nowMs);
      if (nested) {
        return nested;
      }
    }

    const rolling = this.pickFirstObject(dict, ['rollingUsage', 'rolling', 'rolling_usage', 'rollingWindow', 'rolling_window']);
    const weekly = this.pickFirstObject(dict, ['weeklyUsage', 'weekly', 'weekly_usage', 'weeklyWindow', 'weekly_window']);

    if (rolling && weekly) {
      const rollingWindow = this.parseWindow(rolling, nowMs);
      const weeklyWindow = this.parseWindow(weekly, nowMs);
      if (rollingWindow && weeklyWindow) {
        return { rolling: rollingWindow, weekly: weeklyWindow };
      }
    }

    for (const key of ['data', 'result', 'usage', 'billing', 'payload']) {
      const nested = this.asObject(dict[key]);
      if (!nested) continue;
      const parsed = this.parseUsageNode(nested, nowMs);
      if (parsed) {
        return parsed;
      }
    }

    for (const nested of Object.values(dict)) {
      const parsed = this.parseUsageNode(nested, nowMs);
      if (parsed) {
        return parsed;
      }
    }

    return undefined;
  }

  private collectWindowCandidates(value: unknown, path: string[] = [], nowMs: number = Date.now()): WindowCandidate[] {
    const results: WindowCandidate[] = [];

    if (Array.isArray(value)) {
      value.forEach((item, index) => {
        results.push(...this.collectWindowCandidates(item, [...path, `[${index}]`], nowMs));
      });
      return results;
    }

    if (!value || typeof value !== 'object') {
      return results;
    }

    const dict = value as JsonObject;
    const window = this.parseWindow(dict, nowMs);
    if (window) {
      results.push({
        id: path.join('.') || 'root',
        path: path.join('.').toLowerCase(),
        ...window,
      });
    }

    for (const [key, nested] of Object.entries(dict)) {
      results.push(...this.collectWindowCandidates(nested, [...path, key], nowMs));
    }

    return results;
  }

  private pickWindowCandidate(
    preferred: WindowCandidate[],
    fallback: WindowCandidate[],
    pickShorter: boolean,
    excludedId?: string
  ): WindowCandidate | undefined {
    const usablePreferred = preferred.filter(candidate => candidate.id !== excludedId);
    const usableFallback = fallback.filter(candidate => candidate.id !== excludedId);
    return this.sortCandidates(usablePreferred, pickShorter)[0] ?? this.sortCandidates(usableFallback, pickShorter)[0];
  }

  private sortCandidates(candidates: WindowCandidate[], pickShorter: boolean): WindowCandidate[] {
    return [...candidates].sort((a, b) => {
      if (a.resetInSec === b.resetInSec) {
        return b.usedPercent - a.usedPercent;
      }
      return pickShorter ? a.resetInSec - b.resetInSec : b.resetInSec - a.resetInSec;
    });
  }

  private parseWindow(dict: JsonObject, nowMs: number): WindowData | undefined {
    let percent = this.pickNumber(dict, this.percentKeys);

    if (percent === undefined) {
      const used = this.pickNumber(dict, ['used', 'usage', 'consumed', 'count', 'usedTokens']);
      const limit = this.pickNumber(dict, ['limit', 'total', 'quota', 'max', 'cap', 'tokenLimit']);
      if (used !== undefined && limit !== undefined && limit > 0) {
        percent = (used / limit) * 100;
      }
    }

    if (percent === undefined) {
      return undefined;
    }

    let resetInSec = this.pickNumber(dict, this.resetInKeys);
    if (resetInSec === undefined) {
      const resetAtValue = this.pickFirstValue(dict, this.resetAtKeys);
      const resetAt = this.parseDateValue(resetAtValue);
      if (resetAt) {
        resetInSec = Math.max(0, Math.round((resetAt.getTime() - nowMs) / 1000));
      }
    }

    return {
      usedPercent: this.normalizePercent(percent),
      resetInSec: Math.max(0, Math.round(resetInSec ?? 0)),
    };
  }

  private pickFirstObject(dict: JsonObject, keys: string[]): JsonObject | undefined {
    for (const key of keys) {
      const value = this.asObject(dict[key]);
      if (value) {
        return value;
      }
    }
    return undefined;
  }

  private pickNumber(dict: JsonObject, keys: string[]): number | undefined {
    for (const key of keys) {
      const value = this.toNumber(dict[key]);
      if (value !== undefined) {
        return value;
      }
    }
    return undefined;
  }

  private pickFirstValue(dict: JsonObject, keys: string[]): unknown {
    for (const key of keys) {
      if (key in dict) {
        return dict[key];
      }
    }
    return undefined;
  }

  private parseDateValue(value: unknown): Date | undefined {
    const asNumber = this.toNumber(value);
    if (asNumber !== undefined) {
      if (asNumber > 1_000_000_000_000) {
        return new Date(asNumber);
      }
      if (asNumber > 1_000_000_000) {
        return new Date(asNumber * 1000);
      }
    }

    if (typeof value !== 'string') {
      return undefined;
    }

    const numeric = Number(value.trim());
    if (!Number.isNaN(numeric)) {
      return this.parseDateValue(numeric);
    }

    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) {
      return undefined;
    }
    return parsed;
  }

  private normalizePercent(value: number): number {
    const raw = value >= 0 && value <= 1 ? value * 100 : value;
    return Math.max(0, Math.min(100, raw));
  }

  private toRemainingPercent(usedPercent: number): number | undefined {
    const remaining = roundPercentage(Math.max(0, 100 - usedPercent));
    return remaining;
  }

  private tryParseJson(text: string): unknown {
    try {
      return JSON.parse(text);
    } catch {
      return undefined;
    }
  }

  private looksSignedOut(text: string): boolean {
    const lower = text.toLowerCase();
    return lower.includes('sign in') || lower.includes('login') || lower.includes('auth/authorize');
  }

  private extractServerErrorMessage(text: string): string | undefined {
    const parsed = this.tryParseJson(text);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      const dict = parsed as JsonObject;
      for (const key of ['message', 'error', 'detail']) {
        const value = dict[key];
        if (typeof value === 'string' && value.trim()) {
          return value.trim();
        }
      }
    }

    const titleMatch = text.match(/<title>([^<]+)<\/title>/i);
    return titleMatch?.[1]?.trim();
  }

  private extractNumber(text: string, pattern: RegExp): number | undefined {
    const match = text.match(pattern);
    if (!match?.[1]) {
      return undefined;
    }
    const value = Number(match[1]);
    return Number.isFinite(value) ? value : undefined;
  }

  private toNumber(value: unknown): number | undefined {
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value;
    }
    if (typeof value === 'string') {
      const parsed = Number(value.trim());
      if (Number.isFinite(parsed)) {
        return parsed;
      }
    }
    return undefined;
  }

  private asObject(value: unknown): JsonObject | undefined {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return undefined;
    }
    return value as JsonObject;
  }

  private log(message: string, detail?: string): void {
    // Debug only: keep log statements commented to avoid noisy/sensitive output by default.
    if (detail === undefined) {
      // console.log(message);
      return;
    }
    // console.log(message, detail);
  }

  private previewText(text: string, limit: number = 400): string {
    const compact = text.replace(/\s+/g, ' ').trim();
    if (compact.length <= limit) {
      return compact;
    }
    return `${compact.slice(0, limit)}...`;
  }
}

export const openCodeAdapter = new OpenCodeAdapter();
