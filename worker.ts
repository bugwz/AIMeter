import { createServer, type Server } from 'node:http';
import { httpServerHandler } from 'cloudflare:node';
import { createApp } from './server/app.js';

type AssetsBinding = {
  fetch(request: Request): Promise<Response>;
};

type WorkerEnv = {
  ASSETS: AssetsBinding;
};

let serverPromise: Promise<Server> | null = null;

async function getServer(): Promise<Server> {
  if (!serverPromise) {
    serverPromise = createApp().then((app) => createServer(app));
  }
  return serverPromise;
}

export default {
  async fetch(request: Request, env: WorkerEnv): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname.startsWith('/api/')) {
      const server = await getServer();
      return httpServerHandler(server, request);
    }

    return env.ASSETS.fetch(request);
  },
};
