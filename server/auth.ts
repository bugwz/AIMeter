import crypto from 'crypto';
import type { Request, Response } from 'express';
import { getAppConfig } from './config.js';

export type AuthRole = 'normal' | 'admin';

const SESSION_COOKIE_NAMES: Record<AuthRole, string> = {
  normal: 'aimeter_normal_session',
  admin: 'aimeter_admin_session',
};

const appConfig = getAppConfig();
const SESSION_TTL_SECONDS = Math.max(appConfig.auth.sessionTtlSeconds || 12 * 60 * 60, 300);
let SESSION_SECRET = appConfig.auth.sessionSecret?.trim() || '';
const USE_SECURE_COOKIE = appConfig.server.protocol === 'https';

if (!appConfig.auth.sessionSecret && !appConfig.database.enabled) {
  console.warn('[SECURITY] AIMETER_AUTH_SESSION_SECRET is not set in env-only mode; sessions will be invalidated on restart.');
}

export function initSessionSecret(secret: string): void {
  SESSION_SECRET = secret;
}

function getSessionSecret(): string {
  if (!SESSION_SECRET) {
    SESSION_SECRET = crypto.randomBytes(32).toString('hex');
  }
  return SESSION_SECRET;
}

interface SessionPayload {
  iat: number;
  exp: number;
  nonce: string;
}

function base64UrlEncode(input: string): string {
  return Buffer.from(input, 'utf8').toString('base64url');
}

function base64UrlDecode(input: string): string {
  return Buffer.from(input, 'base64url').toString('utf8');
}

function parseCookies(req: Request): Record<string, string> {
  const cookieHeader = req.headers.cookie;
  if (!cookieHeader) return {};

  return cookieHeader.split(';').reduce<Record<string, string>>((acc, part) => {
    const [key, ...rest] = part.trim().split('=');
    if (!key) return acc;
    const rawValue = rest.join('=');
    try {
      acc[key] = decodeURIComponent(rawValue);
    } catch {
      acc[key] = rawValue;
    }
    return acc;
  }, {});
}

function createSignature(payloadB64: string, passwordHash: string): string {
  return crypto
    .createHmac('sha256', getSessionSecret())
    .update(`${payloadB64}.${passwordHash}`)
    .digest('base64url');
}

export function issueSessionToken(passwordHash: string): string {
  const now = Math.floor(Date.now() / 1000);
  const payload: SessionPayload = {
    iat: now,
    exp: now + SESSION_TTL_SECONDS,
    nonce: crypto.randomBytes(16).toString('hex'),
  };

  const payloadB64 = base64UrlEncode(JSON.stringify(payload));
  const signature = createSignature(payloadB64, passwordHash);
  return `${payloadB64}.${signature}`;
}

function safeEqual(a: string, b: string): boolean {
  const aBuffer = Buffer.from(a, 'utf8');
  const bBuffer = Buffer.from(b, 'utf8');
  if (aBuffer.length !== bBuffer.length) return false;
  return crypto.timingSafeEqual(aBuffer, bBuffer);
}

export function verifySessionToken(token: string, passwordHash: string): boolean {
  const parts = token.split('.');
  if (parts.length !== 2) return false;

  const [payloadB64, signature] = parts;
  const expectedSignature = createSignature(payloadB64, passwordHash);

  if (!safeEqual(signature, expectedSignature)) {
    return false;
  }

  try {
    const payload = JSON.parse(base64UrlDecode(payloadB64)) as SessionPayload;
    const now = Math.floor(Date.now() / 1000);
    return Number.isFinite(payload.exp) && payload.exp > now;
  } catch {
    return false;
  }
}

export function setSessionCookie(role: AuthRole, res: Response, token: string): void {
  const cookieParts = [
    `${SESSION_COOKIE_NAMES[role]}=${encodeURIComponent(token)}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Strict',
    `Max-Age=${SESSION_TTL_SECONDS}`,
  ];

  if (USE_SECURE_COOKIE) {
    cookieParts.push('Secure');
  }

  res.setHeader('Set-Cookie', cookieParts.join('; '));
  res.setHeader('Cache-Control', 'no-store');
}

export function clearSessionCookie(role: AuthRole, res: Response): void {
  const cookieParts = [
    `${SESSION_COOKIE_NAMES[role]}=`,
    'Path=/',
    'HttpOnly',
    'SameSite=Strict',
    'Max-Age=0',
  ];

  if (USE_SECURE_COOKIE) {
    cookieParts.push('Secure');
  }

  res.setHeader('Set-Cookie', cookieParts.join('; '));
}

export function isRequestAuthenticated(req: Request, role: AuthRole, passwordHash: string | null): boolean {
  if (!passwordHash) return false;
  const cookies = parseCookies(req);
  const token = cookies[SESSION_COOKIE_NAMES[role]];
  if (!token) return false;

  return verifySessionToken(token, passwordHash);
}

export function getSessionCookieName(role: AuthRole): string {
  return SESSION_COOKIE_NAMES[role];
}
