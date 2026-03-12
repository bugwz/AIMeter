declare module 'cloudflare:node' {
  import type { Server } from 'node:http';

  export function httpServerHandler(server: Server, request: Request): Promise<Response>;
}
