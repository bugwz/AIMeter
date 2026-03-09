import 'dotenv/config';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import express from 'express';
import { createApp } from './app.js';
import { schedulerService } from './services/SchedulerService.js';
import { storage } from './storage.js';
import { getAppConfig } from './config.js';
import { runtimeConfig } from './runtime.js';
import type { AuthRole } from './auth.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const appConfig = getAppConfig();
const PORT = appConfig.server.backendPort || 3001;

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

const app = await createApp();

app.use(express.static(path.join(__dirname, '../public'), { index: false }));
app.use(express.static(path.join(__dirname, '../dist'), { index: false }));

app.get('*', async (req, res) => {
  const secret = await storage.getAdminRouteSecret();
  const adminBasePath = secret ? `/${secret}` : null;

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
