import type { Request } from 'express';
import { getAppConfig } from '../config.js';

const appConfig = getAppConfig();

interface AttemptState {
  count: number;
  windowStart: number;
  blockedUntil: number;
}

const RATE_LIMIT_WINDOW_MS = Math.max(appConfig.auth.rateLimit.windowMs || 60_000, 10_000);
const RATE_LIMIT_MAX_ATTEMPTS = Math.max(appConfig.auth.rateLimit.maxAttempts || 5, 1);
const RATE_LIMIT_BLOCK_MS = Math.max(appConfig.auth.rateLimit.blockMs || 300_000, 15_000);

// Entry-context path enumeration: tighter limits (30 req/min, 10 min block)
const ENTRY_CONTEXT_WINDOW_MS = 60_000;
const ENTRY_CONTEXT_MAX_ATTEMPTS = 30;
const ENTRY_CONTEXT_BLOCK_MS = 600_000;

const attemptStore = new Map<string, AttemptState>();
const entryContextStore = new Map<string, AttemptState>();

export function getClientIp(req: Request): string {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.length > 0) {
    return forwarded.split(',')[0].trim();
  }

  const realIp = req.headers['x-real-ip'];
  if (typeof realIp === 'string' && realIp.length > 0) {
    return realIp.trim();
  }

  return req.socket.remoteAddress || 'unknown';
}

function getKey(req: Request): string {
  return `login:${getClientIp(req)}`;
}

function getOrCreateState(store: Map<string, AttemptState>, key: string, now: number): AttemptState {
  const current = store.get(key);
  if (current) {
    return current;
  }

  const created: AttemptState = {
    count: 0,
    windowStart: now,
    blockedUntil: 0,
  };
  store.set(key, created);
  return created;
}

export function checkLoginRateLimit(req: Request): { allowed: boolean; retryAfterSeconds?: number } {
  const now = Date.now();
  const key = getKey(req);
  const state = getOrCreateState(attemptStore, key, now);

  if (state.blockedUntil > now) {
    return {
      allowed: false,
      retryAfterSeconds: Math.ceil((state.blockedUntil - now) / 1000),
    };
  }

  if (now - state.windowStart > RATE_LIMIT_WINDOW_MS) {
    state.count = 0;
    state.windowStart = now;
  }

  return { allowed: true };
}

export function recordLoginFailure(req: Request): void {
  const now = Date.now();
  const key = getKey(req);
  const state = getOrCreateState(attemptStore, key, now);

  if (now - state.windowStart > RATE_LIMIT_WINDOW_MS) {
    state.count = 0;
    state.windowStart = now;
  }

  state.count += 1;

  if (state.count >= RATE_LIMIT_MAX_ATTEMPTS) {
    state.blockedUntil = now + RATE_LIMIT_BLOCK_MS;
    state.count = 0;
    state.windowStart = now;
  }
}

export function clearLoginFailures(req: Request): void {
  const key = getKey(req);
  attemptStore.delete(key);
}

/**
 * Rate limit for public enumeration endpoints (e.g. /api/entry-context, /api/auth/bootstrap).
 * Uses a separate store with tighter limits than the login rate limiter.
 */
export function checkEntryContextRateLimit(req: Request): { allowed: boolean; retryAfterSeconds?: number } {
  const now = Date.now();
  const key = `entry:${getClientIp(req)}`;
  const state = getOrCreateState(entryContextStore, key, now);

  if (state.blockedUntil > now) {
    return {
      allowed: false,
      retryAfterSeconds: Math.ceil((state.blockedUntil - now) / 1000),
    };
  }

  if (now - state.windowStart > ENTRY_CONTEXT_WINDOW_MS) {
    state.count = 0;
    state.windowStart = now;
  }

  state.count += 1;

  if (state.count > ENTRY_CONTEXT_MAX_ATTEMPTS) {
    state.blockedUntil = now + ENTRY_CONTEXT_BLOCK_MS;
    state.count = 0;
    state.windowStart = now;
    return {
      allowed: false,
      retryAfterSeconds: Math.ceil(ENTRY_CONTEXT_BLOCK_MS / 1000),
    };
  }

  return { allowed: true };
}
