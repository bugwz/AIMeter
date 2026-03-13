import crypto from 'crypto';
import { Router, type Response } from 'express';
import { clearSessionCookie, initSessionSecret, isRequestAuthenticated, issueSessionToken, setSessionCookie, type AuthRole } from '../auth.js';
import { getAppConfig } from '../config.js';
import { initDatabase } from '../database.js';
import { runtimeConfig } from '../runtime.js';
import { storage, tryParseReadonlyError } from '../storage.js';
import {
  checkLoginRateLimit,
  checkEntryContextRateLimit,
  clearLoginFailures,
  recordLoginFailure,
} from '../security/loginRateLimit.js';

const router = Router();
const appConfig = getAppConfig();

function validatePasswordStrength(password: string | undefined): string | null {
  if (!password || password.length < 12) return 'Password must be at least 12 characters';
  if (!/[a-zA-Z]/.test(password)) return 'Password must contain at least one letter';
  if (!/[0-9]/.test(password)) return 'Password must contain at least one digit';
  return null;
}

router.use((_req, res, next) => {
  res.setHeader('Cache-Control', 'no-store');
  next();
});

function parseRole(raw: string): AuthRole | null {
  return raw === 'normal' || raw === 'admin' ? raw : null;
}

function getRoleOr404(roleParam: string, res: Response): AuthRole | null {
  const role = parseRole(roleParam);
  if (!role) {
    res.status(404).json({
      success: false,
      error: {
        code: 'NOT_FOUND',
        message: 'Unknown auth role',
      },
    });
    return null;
  }
  return role;
}

function safeEqual(a: string, b: string): boolean {
  const aBuffer = Buffer.from(a, 'utf8');
  const bBuffer = Buffer.from(b, 'utf8');
  if (aBuffer.length !== bBuffer.length) return false;
  return crypto.timingSafeEqual(aBuffer, bBuffer);
}

router.get('/:role/status', async (req, res) => {
  const role = getRoleOr404(req.params.role, res);
  if (!role) return;

  const passwordHash = await storage.getPasswordHash(role);
  const capabilities = await storage.getCapabilities(role);
  const authConfig = capabilities.auth[role];
  const bootstrapRequired = role === 'normal' && await storage.isInitialSetupRequired();

  res.json({
    success: true,
    data: {
      role,
      needsSetup: bootstrapRequired || authConfig.needsSetup,
      bootstrapRequired,
      authenticated: !!passwordHash && isRequestAuthenticated(req, role, passwordHash),
      authEnabled: authConfig.enabled,
      authMutable: authConfig.mutable,
    },
  });
});

router.post('/bootstrap', async (req, res) => {
  try {
    if (!await storage.isInitialSetupRequired()) {
      return res.status(410).json({
        success: false,
        error: {
          code: 'BOOTSTRAP_DISABLED',
          message: 'Initial setup endpoint is disabled after setup completion',
        },
      });
    }

    const limitCheck = checkEntryContextRateLimit(req);
    if (!limitCheck.allowed) {
      return res.status(429).json({
        success: false,
        error: {
          code: 'RATE_LIMITED',
          message: `Too many requests. Try again in ${limitCheck.retryAfterSeconds ?? 60} seconds.`,
        },
      });
    }

    const { normalPassword, adminPassword, adminRoutePath } = req.body as {
      normalPassword?: string;
      adminPassword?: string;
      adminRoutePath?: string;
    };
    if (typeof normalPassword !== 'string' || typeof adminPassword !== 'string') {
      return res.status(400).json({
        success: false,
        error: { code: 'INVALID_PASSWORD', message: 'Both normal and admin passwords are required' },
      });
    }

    const passwordError = validatePasswordStrength(normalPassword) || validatePasswordStrength(adminPassword);
    if (passwordError) {
      return res.status(400).json({
        success: false,
        error: { code: 'INVALID_PASSWORD', message: passwordError },
      });
    }
    if (normalPassword === adminPassword) {
      return res.status(400).json({
        success: false,
        error: { code: 'INVALID_PASSWORD', message: 'Normal and admin passwords must be different' },
      });
    }

    const normalizedSecret = typeof adminRoutePath === 'string' ? adminRoutePath.trim() : '';
    if (normalizedSecret.length !== 32) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_ADMIN_ROUTE_PATH',
          message: 'Admin route path must be exactly 32 characters',
        },
      });
    }
    if (!/^[a-zA-Z0-9]+$/.test(normalizedSecret)) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_ADMIN_ROUTE_PATH',
          message: 'Admin route path must contain only letters and digits (no special characters)',
        },
      });
    }

    await initDatabase();
    const dbSessionSecret = await storage.getSetting('session_secret');
    if (dbSessionSecret) {
      initSessionSecret(dbSessionSecret);
    }

    if (!await storage.getPasswordHash('normal')) {
      await storage.setPassword('normal', normalPassword);
    }
    if (!await storage.getPasswordHash('admin')) {
      await storage.setPassword('admin', adminPassword);
    }
    if (!await storage.getAdminRoutePath()) {
      await storage.setAdminRoutePath(normalizedSecret);
    }

    const hash = await storage.getPasswordHash('normal');
    if (hash) {
      setSessionCookie('normal', res, issueSessionToken(hash));
    }

    res.json({
      success: true,
      data: {
        adminBasePath: `/${await storage.getAdminRoutePath()}`,
        message: 'Initial setup completed successfully',
      },
    });
  } catch (error) {
    const readonly = tryParseReadonlyError(error);
    if (readonly) {
      return res.status(409).json({
        success: false,
        error: readonly,
      });
    }
    return res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
    });
  }
});

router.post('/:role/setup', async (req, res) => {
  const role = getRoleOr404(req.params.role, res);
  if (!role) return;

  if (runtimeConfig.storageMode === 'database' && await storage.isInitialSetupRequired()) {
    return res.status(409).json({
      success: false,
      error: {
        code: 'BOOTSTRAP_REQUIRED',
        message: 'Database initialization is required; use /api/auth/bootstrap first',
      },
    });
  }

  const limitCheck = checkLoginRateLimit(req);
  if (!limitCheck.allowed) {
    return res.status(429).json({
      success: false,
      error: {
        code: 'RATE_LIMITED',
        message: `Too many attempts. Try again in ${limitCheck.retryAfterSeconds ?? 60} seconds.`,
      },
    });
  }

  const { password } = req.body;
  const passwordError = validatePasswordStrength(password);
  if (passwordError) {
    return res.status(400).json({
      success: false,
      error: {
        code: 'INVALID_PASSWORD',
        message: passwordError,
      },
    });
  }

  const currentHash = await storage.getPasswordHash(role);
  if (currentHash) {
    recordLoginFailure(req);
    return res.status(400).json({
      success: false,
      error: {
        code: 'ALREADY_SETUP',
        message: 'Password is already configured',
      },
    });
  }

  try {
    await storage.setPassword(role, password);
  } catch (error) {
    recordLoginFailure(req);
    const readonly = tryParseReadonlyError(error);
    if (readonly) {
      return res.status(409).json({
        success: false,
        error: readonly,
      });
    }
    return res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
    });
  }

  clearLoginFailures(req);
  const hash = await storage.getPasswordHash(role);
  if (hash) {
    setSessionCookie(role, res, issueSessionToken(hash));
  }

  res.json({
    success: true,
    data: { message: 'Password set successfully' },
  });
});

router.post('/:role/verify', async (req, res) => {
  const role = getRoleOr404(req.params.role, res);
  if (!role) return;

  const { password } = req.body;
  const limitCheck = checkLoginRateLimit(req);

  if (!limitCheck.allowed) {
    return res.status(429).json({
      success: false,
      error: {
        code: 'TOO_MANY_ATTEMPTS',
        message: `Too many failed login attempts. Retry in ${limitCheck.retryAfterSeconds || 60}s`,
      },
    });
  }

  if (!password) {
    return res.status(400).json({
      success: false,
      error: {
        code: 'INVALID_REQUEST',
        message: 'Password is required',
      },
    });
  }

  const storedHash = await storage.getPasswordHash(role);
  if (!storedHash) {
    return res.json({
      success: true,
      data: { valid: false },
    });
  }

  if (await storage.verifyPassword(role, password)) {
    clearLoginFailures(req);
    const activeHash = await storage.getPasswordHash(role);
    if (activeHash) {
      setSessionCookie(role, res, issueSessionToken(activeHash));
    }
    await storage.recordAuditLog({
      method: req.method,
      path: req.originalUrl,
      statusCode: 200,
      durationMs: 0,
      authenticated: true,
      eventType: `${role}_login_success`,
      details: { result: 'success', role },
    });
    return res.json({
      success: true,
      data: { valid: true },
    });
  }

  recordLoginFailure(req);
  await storage.recordAuditLog({
    method: req.method,
    path: req.originalUrl,
    statusCode: 401,
    durationMs: 0,
    authenticated: false,
    eventType: `${role}_login_failed`,
    details: { result: 'invalid_password', role },
  });
  res.json({
    success: true,
    data: { valid: false },
  });
});

router.post('/:role/logout', (req, res) => {
  const role = getRoleOr404(req.params.role, res);
  if (!role) return;

  clearSessionCookie(role, res);
  res.json({
    success: true,
    data: { message: 'Logged out successfully' },
  });
});

router.post('/admin/change-password', async (req, res) => {
  const adminHash = await storage.getPasswordHash('admin');
  if (!adminHash || !isRequestAuthenticated(req, 'admin', adminHash)) {
    return res.status(401).json({
      success: false,
      error: {
        code: 'UNAUTHORIZED',
        message: 'Authentication required',
      },
    });
  }

  const { targetRole, oldPassword, newPassword } = req.body as {
    targetRole?: AuthRole;
    oldPassword?: string;
    newPassword?: string;
  };
  const role = parseRole(targetRole || '');
  if (!role || !oldPassword || !newPassword) {
    return res.status(400).json({
      success: false,
      error: {
        code: 'INVALID_REQUEST',
        message: 'targetRole, oldPassword and newPassword are required',
      },
    });
  }

  const newPasswordError = validatePasswordStrength(newPassword);
  if (newPasswordError) {
    return res.status(400).json({
      success: false,
      error: {
        code: 'INVALID_PASSWORD',
        message: newPasswordError,
      },
    });
  }

  if (!await storage.verifyPassword(role, oldPassword)) {
    return res.status(400).json({
      success: false,
      error: {
        code: 'INVALID_PASSWORD',
        message: 'Current password is incorrect',
      },
    });
  }

  try {
    await storage.setPassword(role, newPassword);
  } catch (error) {
    const readonly = tryParseReadonlyError(error);
    if (readonly) {
      return res.status(409).json({
        success: false,
        error: readonly,
      });
    }
    return res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
    });
  }

  // Invalidate the session for the role whose password changed.
  // The client must re-authenticate with the new password.
  clearSessionCookie(role, res);

  res.json({
    success: true,
    data: { message: 'Password changed successfully' },
  });
});

router.get('/admin/audit-logs', async (req, res) => {
  const storedHash = await storage.getPasswordHash('admin');
  if (!storedHash || !isRequestAuthenticated(req, 'admin', storedHash)) {
    return res.status(401).json({
      success: false,
      error: {
        code: 'UNAUTHORIZED',
        message: 'Authentication required',
      },
    });
  }

  const limit = Math.min(Number(req.query.limit) || 200, 1000);
  const data = await storage.getAuditLogs(limit);
  res.json({
    success: true,
    data,
  });
});

export default router;
