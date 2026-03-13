import type { IncomingMessage, ServerResponse } from 'http';
import type { Application } from 'express';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { storage } from '../server/storage.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
type WaitUntilFn = (promise: Promise<unknown>) => void;

let appPromise: Promise<Application> | null = null;
let waitUntilPromise: Promise<WaitUntilFn | null> | null = null;

function getApp(): Promise<Application> {
  if (!appPromise) {
    appPromise = import('../server/app.js').then(({ createApp }) => createApp());
  }
  return appPromise;
}

async function getVercelWaitUntil(): Promise<WaitUntilFn | null> {
  if (!waitUntilPromise) {
    waitUntilPromise = (new Function('m', 'return import(m)') as (m: string) => Promise<unknown>)('@vercel/functions')
      .then((mod) => {
        const candidate = mod as { waitUntil?: unknown };
        return typeof candidate.waitUntil === 'function' ? candidate.waitUntil as WaitUntilFn : null;
      })
      .catch(() => null);
  }
  return waitUntilPromise;
}

let cachedTemplate: string | null = null;

function getHtmlTemplate(): string {
  if (cachedTemplate) return cachedTemplate;
  const htmlPath = path.join(__dirname, '..', 'dist', 'index.html');
  if (fs.existsSync(htmlPath)) {
    cachedTemplate = fs.readFileSync(htmlPath, 'utf8');
    return cachedTemplate;
  }
  cachedTemplate = `<!doctype html><html><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><title>AIMeter</title></head><body><div id="root"></div></body></html>`;
  return cachedTemplate;
}

function renderAppPage(role: 'normal' | 'admin', basePath: string): string {
  const template = getHtmlTemplate();
  const payload = JSON.stringify({ role, basePath, invalidAdminPath: false });
  const bootstrap = `<script>window.__AIMETER_ENTRY__=${payload};</script>`;
  return template.includes('</head>')
    ? template.replace('</head>', `${bootstrap}</head>`)
    : `${bootstrap}${template}`;
}

export default async function handler(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const url = req.url || '/';

  // API routes: handled by Express
  if (url.startsWith('/api/')) {
    const app = await getApp();
    const waitUntil = await getVercelWaitUntil();
    if (waitUntil) {
      (req as IncomingMessage & { waitUntil?: WaitUntilFn }).waitUntil = waitUntil;
    }
    app(req, res);
    return;
  }

  // Page routes: serve HTML with injected context (mirrors server/index.ts behavior)
  await getApp(); // Ensure DB is initialized before querying storage
  const urlPath = url.split('?')[0] || '/';

  let adminBasePath: string | null = null;
  try {
    const secret = await storage.getAdminRoutePath();
    adminBasePath = secret ? `/${secret}` : null;
  } catch {
    // Fall back to normal page on DB error
  }

  const isAdmin = Boolean(
    adminBasePath && (urlPath === adminBasePath || urlPath.startsWith(`${adminBasePath}/`))
  );

  res.writeHead(200, {
    'Content-Type': 'text/html; charset=utf-8',
    'Cache-Control': 'no-store',
  });
  res.end(isAdmin ? renderAppPage('admin', adminBasePath!) : renderAppPage('normal', '/'));
}
