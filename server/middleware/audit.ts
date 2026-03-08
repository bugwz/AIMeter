import type { Request, Response, NextFunction } from 'express';
import { isRequestAuthenticated } from '../auth.js';
import { storage } from '../storage.js';

function getClientIp(req: Request): string {
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

/**
 * Strip query parameters from paths that may contain sensitive values (e.g. admin path guesses
 * on /api/entry-context). For all other paths, the full URL is preserved.
 */
function sanitizeLoggedPath(req: Request): string {
  if (req.path === '/api/entry-context') {
    return req.path;
  }
  return req.originalUrl;
}

export function createApiAuditMiddleware(isMockMode: boolean) {
  return (req: Request, res: Response, next: NextFunction) => {
    const start = Date.now();

    res.on('finish', () => {
      (async () => {
        try {
        const normalHash = await storage.getPasswordHash('normal');
        const adminHash = await storage.getPasswordHash('admin');
        const authenticated = (normalHash ? isRequestAuthenticated(req, 'normal', normalHash) : false)
          || (adminHash ? isRequestAuthenticated(req, 'admin', adminHash) : false);
        const payload = {
          ip: getClientIp(req),
          method: req.method,
          path: sanitizeLoggedPath(req),
          statusCode: res.statusCode,
          durationMs: Math.max(Date.now() - start, 0),
          userAgent: typeof req.headers['user-agent'] === 'string' ? req.headers['user-agent'] : null,
          authenticated,
          eventType: 'api_access',
          details: {
            route: req.path,
          },
        };

        await storage.recordAuditLog(payload);
        } catch (error) {
          console.error('Failed to write audit log:', error);
        }
      })().catch((error) => {
        console.error('Failed to write audit log:', error);
      });
    });

    next();
  };
}
