import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { initDatabase } from './database.js';
import { schedulerService } from './services/SchedulerService.js';
import { initMock, ensureMockRuntimeProvidersSeeded } from './mock/init.js';
import { requireApiAuth, requireEndpointAuth } from './middleware/auth.js';
import { createApiAuditMiddleware } from './middleware/audit.js';
import { runtimeConfig } from './runtime.js';
import { storage } from './storage.js';
import { getAppConfig } from './config.js';
import { checkEntryContextRateLimit } from './security/loginRateLimit.js';
import type { AuthRole } from './auth.js';

await import('../src/adapters/index.js');

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const appConfig = getAppConfig();
const PORT = appConfig.server.backendPort || 3001;
const isMockMode = runtimeConfig.mockEnabled;
const allowedOrigins = appConfig.server.corsOrigins || [];
const app = express();
app.set('trust proxy', appConfig.server.trustProxy);

app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
  res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self'; font-src 'self'; frame-ancestors 'none'");
  if (appConfig.runtime.isProduction) {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');
  }
  next();
});

if (allowedOrigins.length > 0) {
  app.use(cors({
    origin: allowedOrigins,
    credentials: true,
  }));
}

app.use(express.json({ limit: '1mb' }));
app.use('/api', createApiAuditMiddleware(isMockMode));

if (isMockMode) {
  if (runtimeConfig.storageMode === 'env') {
    console.log('Starting with MOCK fetch mode (env storage)');
    initMock();
  } else {
    console.log('Starting with MOCK fetch mode (database storage)');
  }
}

if (runtimeConfig.storageMode === 'database') {
  console.log('Starting with DATABASE storage');
  await initDatabase();
  console.log('Database initialized');
  if (isMockMode) {
    await ensureMockRuntimeProvidersSeeded();
  }
} else {
  console.log('Starting with ENV storage');
}

function getHtmlTemplate(): string {
  const htmlPath = path.join(__dirname, '../dist/index.html');
  if (fs.existsSync(htmlPath)) {
    return fs.readFileSync(htmlPath, 'utf8');
  }
  return `<!doctype html><html><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width,initial-scale=1" /><title>AIMeter</title></head><body><div id="root"></div></body></html>`;
}

function renderAppPage(role: AuthRole, basePath: string, options?: { invalidAdminPath?: boolean }): string {
  const template = getHtmlTemplate();
  const payload = JSON.stringify({ role, basePath, invalidAdminPath: options?.invalidAdminPath === true });
  const bootstrap = `<script>window.__AIMETER_ENTRY__=${payload};</script>`;
  if (template.includes('</head>')) {
    return template.replace('</head>', `${bootstrap}</head>`);
  }
  return `${bootstrap}${template}`;
}

const { default: authRouter } = await import('./routes/auth.js');
const { default: providersRouter } = await import('./routes/providers.js');
const { default: historyRouter } = await import('./routes/history.js');
const { default: proxyRouter } = await import('./routes/proxy.js');
const { default: widgetRouter } = await import('./routes/widget.js');
const { default: endpointRouter } = await import('./routes/endpoint.js');
const { default: systemRouter } = await import('./routes/system.js');
const { default: jobsRouter } = await import('./routes/jobs.js');

app.use('/api/auth', authRouter);
app.use('/api/system/jobs', jobsRouter);
app.use('/api/system', requireApiAuth(['normal', 'admin']), systemRouter);
app.use('/api/providers', requireApiAuth(['normal', 'admin']), providersRouter);
app.use('/api/history', requireApiAuth(['normal', 'admin']), historyRouter);
app.use('/api/proxy', requireApiAuth(['normal', 'admin']), proxyRouter);
app.use('/api/widget', requireApiAuth(['normal', 'admin']), widgetRouter);
app.use('/api/endpoint', requireEndpointAuth(['normal', 'admin']), endpointRouter);

app.get('/api/health', (_req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
  });
});

app.use(express.static(path.join(__dirname, '../public'), { index: false }));
app.use(express.static(path.join(__dirname, '../dist'), { index: false }));

async function getAdminBasePath(): Promise<string | null> {
  const secret = await storage.getAdminRouteSecret();
  return secret ? `/${secret}` : null;
}

app.get('/api/entry-context', async (req, res) => {
  const limit = checkEntryContextRateLimit(req);
  if (!limit.allowed) {
    res.status(429).json({
      success: false,
      error: {
        code: 'RATE_LIMITED',
        message: `Too many requests. Try again in ${limit.retryAfterSeconds ?? 60} seconds.`,
      },
    });
    return;
  }

  const pathValue = typeof req.query.path === 'string' ? req.query.path : '/';
  const normalizedPath = pathValue.startsWith('/') ? pathValue : `/${pathValue}`;
  const adminBasePath = await getAdminBasePath();
  const isAdminPath = Boolean(adminBasePath && (normalizedPath === adminBasePath || normalizedPath.startsWith(`${adminBasePath}/`)));

  res.json({
    success: true,
    data: {
      role: isAdminPath ? 'admin' : 'normal',
      basePath: isAdminPath ? adminBasePath : '/',
      invalidAdminPath: false,
    },
  });
});

app.get('*', async (req, res) => {
  const adminBasePath = await getAdminBasePath();
  if (adminBasePath && (req.path === adminBasePath || req.path.startsWith(`${adminBasePath}/`))) {
    res.setHeader('Cache-Control', 'no-store');
    res.type('html').send(renderAppPage('admin', adminBasePath));
    return;
  }

  res.setHeader('Cache-Control', 'no-store');
  res.type('html').send(renderAppPage('normal', '/'));
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on http://0.0.0.0:${PORT}`);

  if (runtimeConfig.runtimeMode !== 'serverless') {
    schedulerService.start();
    console.log('Scheduler started');
  }
});
