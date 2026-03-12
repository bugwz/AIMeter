import crypto from 'crypto';

const CLIENT_ID = '9d1c250a-e61b-44d9-88ed-5944d1962f5e';
const AUTHORIZE_URL = 'https://claude.ai/oauth/authorize';
const TOKEN_URL = 'https://platform.claude.com/v1/oauth/token';
const REDIRECT_URI = 'https://platform.claude.com/oauth/code/callback';
const SCOPE = 'org:create_api_key user:profile user:inference user:sessions:claude_code user:mcp_servers';
const SESSION_TTL_MS = 30 * 60 * 1000;

interface OAuthSession {
  state: string;
  codeVerifier: string;
  createdAt: number;
}

export interface ClaudeOAuthTokenResult {
  accessToken: string;
  refreshToken?: string;
  expiresAt?: string;
  clientId: string;
}

class ClaudeOAuthService {
  private sessions = new Map<string, OAuthSession>();

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
      code: 'true',
      client_id: CLIENT_ID,
      response_type: 'code',
      redirect_uri: REDIRECT_URI,
      scope: SCOPE,
      state,
      code_challenge: codeChallenge,
      code_challenge_method: 'S256',
    });

    const authUrl = `${AUTHORIZE_URL}?${params.toString()}`;
    return { authUrl, sessionId };
  }

  async exchangeCode(sessionId: string, rawCode: string, rawState?: string): Promise<ClaudeOAuthTokenResult> {
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

    const response = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json, text/plain, */*',
        'User-Agent': 'axios/1.8.4',
      },
      body: JSON.stringify({
        code: parsed.code,
        grant_type: 'authorization_code',
        client_id: CLIENT_ID,
        redirect_uri: REDIRECT_URI,
        code_verifier: session.codeVerifier,
        ...(parsed.state ? { state: parsed.state } : {}),
      }),
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
    if (data.expires_in) {
      expiresAt = new Date(Date.now() + data.expires_in * 1000).toISOString();
    } else if (data.expires_at) {
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
  // PKCE requires 43-128 characters. 32 random bytes base64url-encoded yields 43 chars.
  return crypto.randomBytes(32).toString('base64url');
}

function generateCodeChallenge(codeVerifier: string): string {
  const hash = crypto.createHash('sha256').update(codeVerifier).digest();
  return hash.toString('base64url');
}

export const claudeOAuthService = new ClaudeOAuthService();

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
