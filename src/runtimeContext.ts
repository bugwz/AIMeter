export type ViewerRole = 'normal' | 'admin';
export interface RuntimeEntry {
  role: ViewerRole;
  basePath: string;
  invalidAdminPath: boolean;
}

declare global {
  interface Window {
    __AIMETER_ENTRY__?: Partial<RuntimeEntry>;
  }
}

let resolvedRuntimeEntry: RuntimeEntry | null = null;
const RUNTIME_ENTRY_CACHE_KEY = 'aimeter_runtime_entry_cache';

function normalizeEntry(entry?: Partial<RuntimeEntry>): RuntimeEntry {
  const role = entry?.role === 'admin' || window.__AIMETER_ENTRY__?.role === 'admin' ? 'admin' : 'normal';
  const basePath = entry?.basePath || window.__AIMETER_ENTRY__?.basePath || '/';
  const invalidAdminPath = entry?.invalidAdminPath === true || window.__AIMETER_ENTRY__?.invalidAdminPath === true;
  return { role, basePath, invalidAdminPath };
}

function persistRuntimeEntry(entry: RuntimeEntry): void {
  try {
    localStorage.setItem(RUNTIME_ENTRY_CACHE_KEY, JSON.stringify({
      pathname: window.location.pathname,
      entry,
    }));
  } catch {
    // Ignore storage failures in private mode or restricted environments.
  }
}

function readCachedRuntimeEntry(): RuntimeEntry | null {
  try {
    const raw = localStorage.getItem(RUNTIME_ENTRY_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as {
      pathname?: string;
      entry?: Partial<RuntimeEntry>;
    };
    const pathname = window.location.pathname;
    const cachedPathname = typeof parsed.pathname === 'string' ? parsed.pathname : '';
    const cachedEntry = normalizeEntry(parsed.entry);
    const isExactPathMatch = cachedPathname === pathname;
    const isAdminBaseMatch = cachedEntry.basePath !== '/'
      && (pathname === cachedEntry.basePath || pathname.startsWith(`${cachedEntry.basePath}/`));
    if (isExactPathMatch || isAdminBaseMatch) {
      return cachedEntry;
    }
    return null;
  } catch {
    return null;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

export async function resolveRuntimeEntry(): Promise<RuntimeEntry> {
  if (resolvedRuntimeEntry) {
    return resolvedRuntimeEntry;
  }

  if (window.__AIMETER_ENTRY__) {
    resolvedRuntimeEntry = normalizeEntry(window.__AIMETER_ENTRY__);
    persistRuntimeEntry(resolvedRuntimeEntry);
    return resolvedRuntimeEntry;
  }

  const retryDelays = [0, 300, 700];
  for (let i = 0; i < retryDelays.length; i += 1) {
    if (retryDelays[i] > 0) {
      await sleep(retryDelays[i]);
    }
    try {
      const response = await fetch(
        `/api/entry-context?path=${encodeURIComponent(window.location.pathname)}&t=${Date.now()}`,
        {
        credentials: 'same-origin',
          cache: 'no-store',
        },
      );
      if (!response.ok) {
        continue;
      }
      const payload = await response.json();
      resolvedRuntimeEntry = normalizeEntry(payload?.data);
      persistRuntimeEntry(resolvedRuntimeEntry);
      return resolvedRuntimeEntry;
    } catch {
      // Retry on transient startup/network errors.
    }
  }

  resolvedRuntimeEntry = readCachedRuntimeEntry() || { role: 'normal', basePath: '/', invalidAdminPath: false };
  return resolvedRuntimeEntry;
}

export function getRuntimeEntry(): RuntimeEntry {
  return resolvedRuntimeEntry || normalizeEntry(window.__AIMETER_ENTRY__);
}

export function isAdminViewer(): boolean {
  return getRuntimeEntry().role === 'admin';
}
