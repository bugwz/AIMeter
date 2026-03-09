import crypto from 'crypto';
import type { NextFunction, Request, Response } from 'express';
import { isRequestAuthenticated, type AuthRole } from '../auth.js';
import { storage } from '../storage.js';

function safeEqual(a: string, b: string): boolean {
  const aBuffer = Buffer.from(a, 'utf8');
  const bBuffer = Buffer.from(b, 'utf8');
  if (aBuffer.length !== bBuffer.length) return false;
  return crypto.timingSafeEqual(aBuffer, bBuffer);
}

declare global {
  namespace Express {
    interface Locals {
      authRole?: AuthRole;
    }
  }
}

async function resolveAuthenticatedRole(req: Request, allowedRoles: AuthRole[]): Promise<AuthRole | null> {
  const requestedRole = req.headers['x-aimeter-role'];
  if ((requestedRole === 'normal' || requestedRole === 'admin') && allowedRoles.includes(requestedRole)) {
    const passwordHash = await storage.getPasswordHash(requestedRole);
    if (passwordHash && isRequestAuthenticated(req, requestedRole, passwordHash)) {
      return requestedRole;
    }
  }

  for (const role of allowedRoles) {
    const passwordHash = await storage.getPasswordHash(role);
    if (passwordHash && isRequestAuthenticated(req, role, passwordHash)) {
      return role;
    }
  }
  return null;
}

export function requireApiAuth(allowedRoles: AuthRole[]) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const role = await resolveAuthenticatedRole(req, allowedRoles);
    if (!role) {
      return res.status(401).json({
        success: false,
        error: {
          code: 'UNAUTHORIZED',
          message: 'Authentication required',
        },
      });
    }

    res.locals.authRole = role;
    next();
  };
}

export function requireEndpointAuth(allowedRoles: AuthRole[]) {
  return async (req: Request, res: Response, next: NextFunction) => {
    // 1. Try session cookie (frontend use)
    const sessionRole = await resolveAuthenticatedRole(req, allowedRoles);
    if (sessionRole) {
      res.locals.authRole = sessionRole;
      return next();
    }

    // 2. Try endpoint secret (external scripts)
    const configuredSecret = await storage.getEndpointSecret();
    if (configuredSecret) {
      const headerSecret = req.header('x-aimeter-endpoint-secret')?.trim();
      if (headerSecret && safeEqual(headerSecret, configuredSecret)) {
        res.locals.authRole = 'normal' as AuthRole;
        return next();
      }
    }

    // 3. Neither matched → 401
    return res.status(401).json({
      success: false,
      error: {
        code: 'UNAUTHORIZED',
        message: 'Authentication required',
      },
    });
  };
}

export function requireWebAuth(role: AuthRole, loginPath: string) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const passwordHash = await storage.getPasswordHash(role);

    if (!passwordHash) {
      return res.redirect(loginPath);
    }

    if (!isRequestAuthenticated(req, role, passwordHash)) {
      return res.redirect(loginPath);
    }

    res.locals.authRole = role;
    next();
  };
}

export function requireAdminRole(req: Request, res: Response): boolean {
  if (res.locals.authRole === 'admin') {
    return true;
  }

  res.status(403).json({
    success: false,
    error: {
      code: 'FORBIDDEN',
      message: 'Administrator access required',
    },
  });
  return false;
}

export function getViewerRole(res: Response): AuthRole {
  return res.locals.authRole === 'admin' ? 'admin' : 'normal';
}
