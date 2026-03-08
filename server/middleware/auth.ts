import type { NextFunction, Request, Response } from 'express';
import { isRequestAuthenticated, type AuthRole } from '../auth.js';
import { storage } from '../storage.js';

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

function parseBasicAuthHeader(req: Request): { username: string; password: string } | null {
  const header = req.headers.authorization;
  if (typeof header !== 'string' || !header.startsWith('Basic ')) {
    return null;
  }

  const encoded = header.slice('Basic '.length).trim();
  if (!encoded) return null;

  try {
    const decoded = Buffer.from(encoded, 'base64').toString('utf8');
    const separatorIndex = decoded.indexOf(':');
    if (separatorIndex < 0) return null;

    const username = decoded.slice(0, separatorIndex).trim();
    const password = decoded.slice(separatorIndex + 1);
    if (!username || !password) return null;
    return { username, password };
  } catch {
    return null;
  }
}

async function resolveBasicAuthenticatedRole(req: Request, allowedRoles: AuthRole[]): Promise<AuthRole | null> {
  const credentials = parseBasicAuthHeader(req);
  if (!credentials) return null;

  const requestedRole = credentials.username;
  // Endpoint Basic Auth is intentionally limited to normal role only.
  if (requestedRole !== 'normal' || !allowedRoles.includes('normal')) {
    return null;
  }

  const valid = await storage.verifyPassword('normal', credentials.password);
  return valid ? 'normal' : null;
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
    const basicRole = await resolveBasicAuthenticatedRole(req, allowedRoles);
    const sessionRole = basicRole ? null : await resolveAuthenticatedRole(req, allowedRoles);
    const role = basicRole || sessionRole;

    if (!role) {
      res.setHeader('WWW-Authenticate', 'Basic realm="AIMeter Endpoint"');
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
