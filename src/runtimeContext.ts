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

function normalizeEntry(entry?: Partial<RuntimeEntry>): RuntimeEntry {
  const role = entry?.role === 'admin' || window.__AIMETER_ENTRY__?.role === 'admin' ? 'admin' : 'normal';
  const basePath = entry?.basePath || window.__AIMETER_ENTRY__?.basePath || '/';
  const invalidAdminPath = entry?.invalidAdminPath === true || window.__AIMETER_ENTRY__?.invalidAdminPath === true;
  return { role, basePath, invalidAdminPath };
}

export async function resolveRuntimeEntry(): Promise<RuntimeEntry> {
  if (resolvedRuntimeEntry) {
    return resolvedRuntimeEntry;
  }

  if (window.__AIMETER_ENTRY__) {
    resolvedRuntimeEntry = normalizeEntry(window.__AIMETER_ENTRY__);
    return resolvedRuntimeEntry;
  }

  try {
    const response = await fetch(`/api/entry-context?path=${encodeURIComponent(window.location.pathname)}`, {
      credentials: 'same-origin',
    });
    const payload = await response.json();
    resolvedRuntimeEntry = normalizeEntry(payload?.data);
    return resolvedRuntimeEntry;
  } catch {
    resolvedRuntimeEntry = { role: 'normal', basePath: '/', invalidAdminPath: false };
    return resolvedRuntimeEntry;
  }
}

export function getRuntimeEntry(): RuntimeEntry {
  return resolvedRuntimeEntry || normalizeEntry(window.__AIMETER_ENTRY__);
}

export function isAdminViewer(): boolean {
  return getRuntimeEntry().role === 'admin';
}
