import type { IncomingMessage, ServerResponse } from 'http';
import type { Application } from 'express';

let appPromise: Promise<Application> | null = null;

function getApp(): Promise<Application> {
  if (!appPromise) {
    appPromise = import('../server/app.js').then(({ createApp }) => createApp());
  }
  return appPromise;
}

export default async function handler(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const app = await getApp();
  app(req, res);
}
