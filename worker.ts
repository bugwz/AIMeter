import { EventEmitter } from 'node:events';
import { createApp } from './server/app.js';
import type { Application } from 'express';

type AssetsBinding = { fetch(request: Request): Promise<Response> };
type WorkerEnv = { ASSETS: AssetsBinding };

let appPromise: Promise<Application> | null = null;

async function getApp(): Promise<Application> {
  if (!appPromise) {
    appPromise = createApp().catch((err: unknown) => {
      appPromise = null; // Reset so next request retries
      throw err;
    });
  }
  return appPromise;
}

/**
 * Bridge a Fetch API Request to an Express Application and return a Fetch API Response.
 *
 * `httpServerHandler` from `cloudflare:node` does not properly capture async Express
 * responses (where res.end() is called after an await). This manual bridge resolves only
 * when res.end() is explicitly called, making it safe for async route handlers.
 */
async function fetchToExpress(app: Application, request: Request): Promise<Response> {
  const url = new URL(request.url);
  const reqHeaders: Record<string, string> = {};
  request.headers.forEach((v, k) => { reqHeaders[k] = v; });

  let bodyBuffer: Buffer | null = null;
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    const ab = await request.arrayBuffer();
    if (ab.byteLength > 0) bodyBuffer = Buffer.from(ab);
  }

  return new Promise<Response>((resolve, reject) => {
    const clientIp =
      (reqHeaders['x-forwarded-for'] ?? '').split(',')[0].trim() ||
      reqHeaders['x-real-ip'] ||
      '127.0.0.1';

    // --- Request mock ---
    // Built on EventEmitter so Express can attach stream-like listeners.
    const req: any = new EventEmitter();
    req.method = request.method;
    req.url = url.pathname + url.search;
    req.headers = reqHeaders;
    req.rawHeaders = Object.entries(reqHeaders).flatMap(([k, v]) => [k, v]);
    req.httpVersion = '1.1';
    req.httpVersionMajor = 1;
    req.httpVersionMinor = 1;
    req.socket = { remoteAddress: clientIp, encrypted: true, destroy: () => {} };
    req.connection = { remoteAddress: clientIp, encrypted: true };
    req.readable = true;
    req.readableEnded = false;
    req.complete = false;
    req.trailers = {};
    req.rawTrailers = [];
    req.read = () => {};
    req.resume = () => req;
    req.pause = () => req;
    req.pipe = (dest: unknown) => dest;
    req.unpipe = () => req;
    req.setTimeout = (_ms: number, cb?: () => void) => { cb?.(); return req; };
    req.destroy = () => {};

    // Emit body data after the current tick so Express middleware can attach
    // 'data'/'end' listeners before data arrives.
    Promise.resolve().then(() => {
      if (bodyBuffer) req.emit('data', bodyBuffer);
      req.readableEnded = true;
      req.complete = true;
      req.emit('end');
    });

    // --- Response mock ---
    const resHeaders = new Map<string, string | string[]>();
    const chunks: Buffer[] = [];
    let finished = false;

    const res: any = new EventEmitter();
    res.statusCode = 200;
    res.headersSent = false;
    res.finished = false;
    res.writableEnded = false;
    res.writable = true;

    res.setHeader = (name: string, value: string | string[]) => {
      resHeaders.set(name.toLowerCase(), value);
      return res;
    };
    res.getHeader = (name: string) => resHeaders.get(name.toLowerCase());
    res.removeHeader = (name: string) => { resHeaders.delete(name.toLowerCase()); };
    res.hasHeader = (name: string) => resHeaders.has(name.toLowerCase());
    res.getHeaders = () => Object.fromEntries(resHeaders);
    res.getHeaderNames = () => [...resHeaders.keys()];

    res.writeHead = (
      code: number,
      arg2?: string | Record<string, string | string[]>,
      arg3?: Record<string, string | string[]>,
    ) => {
      res.statusCode = code;
      const hdrs = typeof arg2 === 'object' ? arg2 : arg3;
      if (hdrs) for (const [k, v] of Object.entries(hdrs)) resHeaders.set(k.toLowerCase(), v);
      res.headersSent = true;
      return res;
    };
    res.flushHeaders = () => { res.headersSent = true; };
    res.writeContinue = () => {};

    res.write = (
      chunk: Buffer | string,
      encoding?: string | (() => void),
      cb?: () => void,
    ) => {
      if (finished) return false;
      const enc = typeof encoding === 'string' ? (encoding as BufferEncoding) : 'utf8';
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as string, enc));
      if (typeof encoding === 'function') encoding();
      else cb?.();
      return true;
    };

    res.end = (
      chunk?: Buffer | string | (() => void),
      encoding?: string | (() => void),
      cb?: () => void,
    ) => {
      if (finished) return res;
      finished = true;
      res.finished = true;
      res.writableEnded = true;
      res.writable = false;
      res.headersSent = true;

      if (typeof chunk === 'function') {
        chunk();
      } else if (chunk != null) {
        const enc = typeof encoding === 'string' ? (encoding as BufferEncoding) : 'utf8';
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as string, enc));
        if (typeof encoding === 'function') encoding();
        else cb?.();
      }

      const outHeaders = new Headers();
      for (const [k, v] of resHeaders) {
        if (Array.isArray(v)) for (const s of v) outHeaders.append(k, s);
        else outHeaders.set(k, v);
      }

      const body = chunks.length ? Buffer.concat(chunks) : null;
      resolve(new Response(body, { status: res.statusCode || 200, headers: outHeaders }));
      res.emit('finish');
      return res;
    };

    res.destroy = () => {};

    try {
      app(req, res);
    } catch (err) {
      if (!finished) {
        reject(err instanceof Error ? err : new Error(String(err)));
      }
    }
  });
}

export default {
  async fetch(request: Request, env: WorkerEnv): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname.startsWith('/api/')) {
      try {
        const app = await getApp();
        return await fetchToExpress(app, request);
      } catch {
        return new Response(
          JSON.stringify({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Internal Server Error' } }),
          { status: 500, headers: { 'Content-Type': 'application/json' } },
        );
      }
    }

    return env.ASSETS.fetch(request);
  },
};
