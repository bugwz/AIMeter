import crypto from 'crypto';

const CLIENT_ID = 'app_EMoamEEZ73f0CkXaXp7hrann';
const AUTHORIZE_URL = 'https://auth.openai.com/oauth/authorize';
const TOKEN_URL = 'https://auth.openai.com/oauth/token';
const REDIRECT_URI = 'http://localhost:1455/auth/callback';
const SCOPE = 'openid profile email offline_access';
const SESSION_TTL_MS = 30 * 60 * 1000;

interface OAuthSession {
  state: string;
  codeVerifier: string;
  createdAt: number;
}

export interface CodexOAuthTokenResult {
  accessToken: string;
  refreshToken?: string;
  expiresAt?: string;
  clientId: string;
}

class CodexOAuthService {
  private sessions = new Map<string, OAuthSession>();
  private cleanupTimer: ReturnType<typeof setInterval>;

  constructor() {
    this.cleanupTimer = setInterval(() => this.cleanupExpiredSessions(), 5 * 60 * 1000);
    if (this.cleanupTimer.unref) {
      this.cleanupTimer.unref();
    }
  }

  generateAuthUrl(): { authUrl: string; sessionId: string } {
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
      response_type: 'code',
      client_id: CLIENT_ID,
      redirect_uri: REDIRECT_URI,
      scope: SCOPE,
      state,
      code_challenge: codeChallenge,
      code_challenge_method: 'S256',
      id_token_add_organizations: 'true',
      codex_cli_simplified_flow: 'true',
    });

    return {
      authUrl: `${AUTHORIZE_URL}?${params.toString()}`,
      sessionId,
    };
  }

  async exchangeCode(sessionId: string, rawCode: string, rawState?: string): Promise<CodexOAuthTokenResult> {
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

    const body = new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: CLIENT_ID,
      code: parsed.code,
      redirect_uri: REDIRECT_URI,
      code_verifier: session.codeVerifier,
    });

    const response = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/json, text/plain, */*',
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
      expires_at?: string;
    };
    if (!data.access_token) {
      throw new Error('Token exchange response missing access_token');
    }

    this.sessions.delete(sessionId);

    let expiresAt: string | undefined;
    if (typeof data.expires_in === 'number' && Number.isFinite(data.expires_in)) {
      expiresAt = new Date(Date.now() + data.expires_in * 1000).toISOString();
    } else if (typeof data.expires_at === 'string' && data.expires_at.trim()) {
      expiresAt = data.expires_at;
    }

    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresAt,
      clientId: CLIENT_ID,
    };
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
  return crypto.randomBytes(64).toString('hex');
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

export const codexOAuthService = new CodexOAuthService();
