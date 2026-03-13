import { spawnSync } from 'node:child_process';
import { existsSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const buildId =
  process.env.VERCEL_DEPLOYMENT_ID ||
  process.env.VERCEL_GIT_COMMIT_SHA ||
  process.env.VERCEL_URL ||
  'local';

const markerFile = join(tmpdir(), `aimeter-vercel-build-${buildId}.done`);

if (existsSync(markerFile)) {
  console.log('AIMeter vercel-build already ran in this environment, skipping duplicate build.');
  process.exit(0);
}

const viteBin = join(process.cwd(), 'node_modules', 'vite', 'bin', 'vite.js');
const result = spawnSync(process.execPath, [viteBin, 'build'], { stdio: 'inherit' });

if (result.error) {
  throw result.error;
}

if (result.status === 0) {
  writeFileSync(markerFile, new Date().toISOString(), 'utf8');
}

process.exit(result.status ?? 1);
