import { Router } from 'express';
import { getViewerRole } from '../middleware/auth.js';
import { storage } from '../storage.js';

const router = Router();

router.get('/capabilities', async (_req, res) => {
  res.json({
    success: true,
    data: await storage.getCapabilities(getViewerRole(res)),
  });
});

export default router;
