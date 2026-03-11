import { Router, Request } from 'express';
import { getViewerRole, requireAdminRole } from '../middleware/auth.js';
import { storage, tryParseReadonlyError } from '../storage.js';

const router = Router();

router.get('/capabilities', async (_req, res) => {
  res.json({
    success: true,
    data: await storage.getCapabilities(getViewerRole(res)),
  });
});

router.get('/secrets', async (req: Request, res) => {
  if (!requireAdminRole(req, res)) return;
  const [cronSecret, endpointSecret] = await Promise.all([
    storage.getCronSecret(),
    storage.getEndpointSecret(),
  ]);
  res.json({ success: true, data: { cronSecret, endpointSecret } });
});

router.post('/secrets/cron/reset', async (req: Request, res) => {
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
});

router.post('/secrets/endpoint/reset', async (req: Request, res) => {
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
});

export default router;
