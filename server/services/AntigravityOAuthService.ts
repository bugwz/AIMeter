import crypto from 'crypto';

const CLIENT_ID = process.env.ANTIGRAVITY_OAUTH_CLIENT_ID || '1071006060591-tmhssin2h21lcre235vtolojh4g403ep.apps.googleusercontent.com';
const CLIENT_SECRET = process.env.ANTIGRAVITY_OAUTH_CLIENT_SECRET || '';
const AUTHORIZE_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const REDIRECT_URI = 'http://localhost:8085/callback';
const SCOPE = [
  'https://www.googleapis.com/auth/cloud-platform',
  'https://www.googleapis.com/auth/userinfo.email',
  'https://www.googleapis.com/auth/userinfo.profile',
  'https://www.googleapis.com/auth/cclog',
  'https://www.googleapis.com/auth/experimentsandconfigs',
].join(' ');
const SESSION_TTL_MS = 30 * 60 * 1000;

interface OAuthSession {
  state: string;
  codeVerifier: string;
  createdAt: number;
}

export interface AntigravityOAuthTokenResult {
  accessToken: string;
  refreshToken?: string;
  expiresAt?: string;
  clientId: string;
  projectId?: string;
}

interface LoadCodeAssistResponse {
  cloudaicompanionProject?: string | { id?: string };
  paidTier?: string | { id?: string };
  currentTier?: string | { id?: string };
}

interface OnboardResponse {
  done?: boolean;
  response?: {
    cloudaicompanionProject?: string | { id?: string };
  };
}

class AntigravityOAuthService {
  private sessions = new Map<string, OAuthSession>();

  private readonly baseURLs = [
    'https://daily-cloudcode-pa.googleapis.com',
    'https://cloudcode-pa.googleapis.com',
  ];

  generateAuthUrl(): { authUrl: string; sessionId: string } {
    this.cleanupExpiredSessions();

    const sessionId = crypto.randomUUID();
    const state = crypto.randomBytes(16).toString('hex');
    const codeVerifier = generateCodeVerifier();
    const codeChallenge = generateCodeChallenge(codeVerifier);

    this.sessions.set(sessionId, {
      state,
      codeVerifier,
      createdAt: Date.now(),
    });

    const params = new URLSearchParams({
      client_id: CLIENT_ID,
      redirect_uri: REDIRECT_URI,
      response_type: 'code',
      scope: SCOPE,
      access_type: 'offline',
      prompt: 'consent',
      state,
      code_challenge: codeChallenge,
      code_challenge_method: 'S256',
    });

    return {
      authUrl: `${AUTHORIZE_URL}?${params.toString()}`,
      sessionId,
    };
  }

  async exchangeCode(sessionId: string, rawCode: string, rawState?: string): Promise<AntigravityOAuthTokenResult> {
    this.cleanupExpiredSessions();

    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error('Authorization session not found or expired. Please generate a new authorization link.');
    }

    if (Date.now() - session.createdAt > SESSION_TTL_MS) {
      this.sessions.delete(sessionId);
      throw new Error('Authorization session expired. Please generate a new authorization link.');
    }

    const parsed = parseCodeInput(rawCode, rawState);
    if (!parsed.code) {
      throw new Error('Authorization code is required');
    }

    if (parsed.state && parsed.state !== session.state) {
      throw new Error('OAuth state mismatch. Please regenerate the authorization link and try again.');
    }

    if (!CLIENT_SECRET) {
      throw new Error('ANTIGRAVITY_OAUTH_CLIENT_SECRET is required for code exchange');
    }

    const body = new URLSearchParams({
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      code: parsed.code,
      grant_type: 'authorization_code',
      redirect_uri: REDIRECT_URI,
      code_verifier: session.codeVerifier,
    });

    const response = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: body.toString(),
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => '');
      throw new Error(`Token exchange failed: HTTP ${response.status}${errorText ? ` - ${errorText}` : ''}`);
    }

    const data = await response.json() as {
      access_token?: string;
      refresh_token?: string;
      expires_in?: number;
    };

    if (!data.access_token) {
      throw new Error('Token exchange response missing access_token');
    }

    this.sessions.delete(sessionId);

    const projectId = await this.resolveProjectId(data.access_token).catch(() => undefined);

    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresAt: typeof data.expires_in === 'number'
        ? new Date(Date.now() + data.expires_in * 1000).toISOString()
        : undefined,
      clientId: CLIENT_ID,
      projectId,
    };
  }

  private async resolveProjectId(accessToken: string): Promise<string | undefined> {
    const load = await this.callWithFallback<LoadCodeAssistResponse>('/v1internal:loadCodeAssist', accessToken, {
      metadata: {
        ideType: 'ANTIGRAVITY',
      },
    });

    const project = this.extractProjectId(load);
    if (project) return project;

    const tierId = this.extractTierId(load);
    if (!tierId) return undefined;

    const onboard = await this.callWithFallback<OnboardResponse>('/v1internal:onboardUser', accessToken, {
      tierId,
      metadata: {
        ideType: 'ANTIGRAVITY',
        platform: 'PLATFORM_UNSPECIFIED',
        pluginType: 'GEMINI',
      },
    });

    const onboardProject = this.extractProjectIdFromOnboard(onboard);
    if (onboardProject) return onboardProject;

    const reloaded = await this.callWithFallback<LoadCodeAssistResponse>('/v1internal:loadCodeAssist', accessToken, {
      metadata: {
        ideType: 'ANTIGRAVITY',
      },
    });
    return this.extractProjectId(reloaded);
  }

  private async callWithFallback<T>(endpointPath: string, accessToken: string, body: Record<string, unknown>): Promise<T> {
    let lastError: Error | null = null;

    for (const baseURL of this.baseURLs) {
      try {
        const response = await fetch(`${baseURL}${endpointPath}`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
            'User-Agent': 'antigravity',
          },
          body: JSON.stringify(body),
        });

        if (response.status === 401 || response.status === 403) {
          throw new Error('Authentication failed while fetching Antigravity project');
        }

        if (response.status === 404 || response.status === 408 || response.status === 429 || response.status >= 500) {
          lastError = new Error(`Fallback status ${response.status}`);
          continue;
        }

        if (!response.ok) {
          const text = await response.text().catch(() => '');
          throw new Error(`HTTP ${response.status}${text ? ` - ${text}` : ''}`);
        }

        return await response.json() as T;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
      }
    }

    throw lastError || new Error('Antigravity request failed');
  }

  private extractProjectId(payload: LoadCodeAssistResponse): string | undefined {
    const project = payload.cloudaicompanionProject;
    if (typeof project === 'string' && project.trim()) return project.trim();
    if (project && typeof project === 'object' && typeof project.id === 'string' && project.id.trim()) {
      return project.id.trim();
    }
    return undefined;
  }

  private extractProjectIdFromOnboard(payload: OnboardResponse): string | undefined {
    const project = payload.response?.cloudaicompanionProject;
    if (typeof project === 'string' && project.trim()) return project.trim();
    if (project && typeof project === 'object' && typeof project.id === 'string' && project.id.trim()) {
      return project.id.trim();
    }
    return undefined;
  }

  private extractTierId(payload: LoadCodeAssistResponse): string | undefined {
    const extract = (tier: LoadCodeAssistResponse['paidTier']) => {
      if (!tier) return undefined;
      if (typeof tier === 'string' && tier.trim()) return tier.trim();
      if (typeof tier === 'object' && typeof tier.id === 'string' && tier.id.trim()) return tier.id.trim();
      return undefined;
    };

    return extract(payload.paidTier) || extract(payload.currentTier);
  }

  private cleanupExpiredSessions(): void {
    const now = Date.now();
    for (const [id, session] of this.sessions.entries()) {
      if (now - session.createdAt > SESSION_TTL_MS) {
        this.sessions.delete(id);
      }
    }
  }
}

function generateCodeVerifier(): string {
  return crypto.randomBytes(32).toString('base64url');
}

function generateCodeChallenge(codeVerifier: string): string {
  const hash = crypto.createHash('sha256').update(codeVerifier).digest();
  return hash.toString('base64url');
}

function parseCodeInput(rawCode: string, rawState?: string): { code: string; state?: string } {
  const directCode = rawCode.trim();
  const directState = rawState?.trim();
  if (!directCode) {
    return { code: '' };
  }

  if (directCode.startsWith('http://') || directCode.startsWith('https://')) {
    try {
      const callbackURL = new URL(directCode);
      const code = callbackURL.searchParams.get('code')?.trim() || '';
      const state = callbackURL.searchParams.get('state')?.trim() || directState;
      return { code, ...(state ? { state } : {}) };
    } catch {
      return { code: directCode, ...(directState ? { state: directState } : {}) };
    }
  }

  const hashIndex = directCode.indexOf('#');
  if (hashIndex >= 0) {
    const code = directCode.slice(0, hashIndex).trim();
    const stateFromCode = directCode.slice(hashIndex + 1).trim();
    const state = stateFromCode || directState;
    return { code, ...(state ? { state } : {}) };
  }

  return { code: directCode, ...(directState ? { state: directState } : {}) };
}

export const antigravityOAuthService = new AntigravityOAuthService();
