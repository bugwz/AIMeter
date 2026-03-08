import { Router, Request, Response } from 'express';
import { getMockAuditLogs, getSetting, recordMockAuditLog, setSetting } from '../mock/database.js';
import { clearSessionCookie, isRequestAuthenticated, issueSessionToken, setSessionCookie } from '../auth.js';
import { checkLoginRateLimit, clearLoginFailures, recordLoginFailure } from '../security/loginRateLimit.js';

const router = Router();

router.get('/status', (req: Request, res: Response) => {
  const password = getSetting('password');
  res.json({
    success: true,
    data: {
      needsSetup: !password,
      authenticated: !!password && isRequestAuthenticated(req, password)
    }
  });
});

router.post('/verify', (req: Request, res: Response) => {
  const { password } = req.body;
  const limitCheck = checkLoginRateLimit(req);
  if (!limitCheck.allowed) {
    return res.status(429).json({
      success: false,
      error: {
        code: 'TOO_MANY_ATTEMPTS',
        message: `Too many failed login attempts. Retry in ${limitCheck.retryAfterSeconds || 60}s`
      }
    });
  }

  const storedPassword = getSetting('password');
  if (password && password === storedPassword) {
    clearLoginFailures(req);
    setSessionCookie(res, issueSessionToken(storedPassword));
    recordMockAuditLog({
      method: req.method,
      path: req.originalUrl,
      statusCode: 200,
      durationMs: 0,
      authenticated: true,
      eventType: 'login_success',
      details: { result: 'success' },
    });
    res.json({ success: true, data: { valid: true } });
  } else {
    recordLoginFailure(req);
    recordMockAuditLog({
      method: req.method,
      path: req.originalUrl,
      statusCode: 401,
      durationMs: 0,
      authenticated: false,
      eventType: 'login_failed',
      details: { result: 'invalid_password' },
    });
    res.json({ success: true, data: { valid: false } });
  }
});

router.post('/setup', (req: Request, res: Response) => {
  const { password } = req.body;
  const current = getSetting('password');

  if (current) {
    return res.status(400).json({
      success: false,
      error: {
        code: 'ALREADY_SETUP',
        message: 'Password is already configured'
      }
    });
  }

  if (!password || password.length < 4) {
    return res.status(400).json({
      success: false,
      error: {
        code: 'INVALID_PASSWORD',
        message: 'Password must be at least 4 characters'
      }
    });
  }

  setSetting('password', password);
  setSessionCookie(res, issueSessionToken(password));
  res.json({
    success: true,
    data: { message: 'Password set successfully' }
  });
});

router.post('/change-password', (req: Request, res: Response) => {
  const { oldPassword, newPassword } = req.body;
  const storedPassword = getSetting('password');

  if (!storedPassword || !isRequestAuthenticated(req, storedPassword)) {
    return res.status(401).json({
      success: false,
      error: {
        code: 'UNAUTHORIZED',
        message: 'Authentication required'
      }
    });
  }
  
  if (!oldPassword || !newPassword) {
    return res.status(400).json({
      success: false,
      error: {
        code: 'INVALID_REQUEST',
        message: 'Old password and new password are required'
      }
    });
  }
  
  if (oldPassword !== storedPassword) {
    return res.status(401).json({
      success: false,
      error: {
        code: 'INVALID_PASSWORD',
        message: 'Old password is incorrect'
      }
    });
  }
  
  if (newPassword.length < 4) {
    return res.status(400).json({
      success: false,
      error: {
        code: 'INVALID_PASSWORD',
        message: 'New password must be at least 4 characters'
      }
    });
  }
  
  setSetting('password', newPassword);
  setSessionCookie(res, issueSessionToken(newPassword));
  
  res.json({
    success: true,
    data: { message: 'Password changed successfully' }
  });
});

router.post('/logout', (_req: Request, res: Response) => {
  clearSessionCookie(res);
  res.json({
    success: true,
    data: { message: 'Logged out successfully' }
  });
});

router.get('/audit-logs', (req: Request, res: Response) => {
  const storedPassword = getSetting('password');
  if (!storedPassword || !isRequestAuthenticated(req, storedPassword)) {
    return res.status(401).json({
      success: false,
      error: {
        code: 'UNAUTHORIZED',
        message: 'Authentication required'
      }
    });
  }

  const limit = Number(req.query.limit) || 200;
  const data = getMockAuditLogs(limit);
  res.json({
    success: true,
    data,
  });
});

export default router;
