import { Router, Request } from 'express';
import { getViewerRole, requireAdminRole } from '../middleware/auth.js';
import { storage, tryParseReadonlyError } from '../storage.js';
import { asyncHandler } from '../utils/async-handler.js';

const router = Router();

router.get('/capabilities', asyncHandler(async (_req, res) => {
  res.json({
    success: true,
    data: await storage.getCapabilities(getViewerRole(res)),
  });
}));

router.get('/secrets', asyncHandler(async (req: Request, res) => {
  if (!requireAdminRole(req, res)) return;
  const withTimeout = <T>(label: string, p: Promise<T>, ms = 8_000) =>
    Promise.race([p, new Promise<T>((_, r) => setTimeout(() => r(new Error(`${label} timed out after ${ms}ms`)), ms))]);
  const [cronSecret, endpointSecret] = await Promise.all([
    withTimeout('getCronSecret', storage.getCronSecret()),
    withTimeout('getEndpointSecret', storage.getEndpointSecret()),
  ]);
  res.json({ success: true, data: { cronSecret, endpointSecret } });
}));

router.post('/secrets/cron/reset', asyncHandler(async (req: Request, res) => {
  if (!requireAdminRole(req, res)) return;
  try {
    const cronSecret = await storage.resetCronSecret();
    res.json({ success: true, data: { cronSecret } });
  } catch (error) {
    const readonly = tryParseReadonlyError(error);
    if (readonly) {
      res.status(409).json({
        success: false,
        error: readonly,
      });
      return;
    }
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
    });
  }
}));

router.post('/secrets/endpoint/reset', asyncHandler(async (req: Request, res) => {
  if (!requireAdminRole(req, res)) return;
  try {
    const endpointSecret = await storage.resetEndpointSecret();
    res.json({ success: true, data: { endpointSecret } });
  } catch (error) {
    const readonly = tryParseReadonlyError(error);
    if (readonly) {
      res.status(409).json({
        success: false,
        error: readonly,
      });
      return;
    }
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
    });
  }
}));

export default router;
