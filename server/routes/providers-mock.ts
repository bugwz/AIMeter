import { Router, Request, Response } from 'express';
import { 
  getAllMockProviders, 
  getMockProvider,
  saveMockProvider, 
  deleteMockProvider,
  recordMockUsage 
} from '../mock/database.js';
import { UsageProvider, ProviderConfig, Credential, AuthType, UsageSnapshot } from '../../src/types/index.js';
import { createMockProvider } from '../mock/providers/base.js';

const router = Router();

type SerializedProgressItem = Omit<UsageSnapshot['progress'][number], 'resetsAt'> & {
  resetsAt: number | null;
};

type SerializedUsageSnapshot = Omit<UsageSnapshot, 'progress' | 'updatedAt'> & {
  progress: SerializedProgressItem[];
  updatedAt: number;
};

function toUnixSeconds(value: Date | string | number | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return Math.floor(value.getTime() / 1000);
  if (typeof value === 'number') return value > 1_000_000_000_000 ? Math.floor(value / 1000) : Math.floor(value);
  const numeric = Number(value);
  if (Number.isFinite(numeric)) {
    return numeric > 1_000_000_000_000 ? Math.floor(numeric / 1000) : Math.floor(numeric);
  }
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? Math.floor(parsed / 1000) : null;
}

function serializeUsageSnapshot(snapshot: UsageSnapshot): SerializedUsageSnapshot {
  const payload: SerializedUsageSnapshot = {
    ...snapshot,
    progress: (snapshot.progress || []).map((item) => ({
      ...item,
      resetsAt: toUnixSeconds(item.resetsAt) ?? null,
    })),
    updatedAt: toUnixSeconds(snapshot.updatedAt) ?? Math.floor(Date.now() / 1000),
  };
  delete (payload as Partial<UsageSnapshot>).cost;
  return payload;
}

function createCredential(provider: UsageProvider, type: string, value: string): Credential {
  switch (type) {
    case 'api_key':
      return { type: AuthType.API_KEY, value, keyPrefix: value.substring(0, 8) };
    case 'cookie':
      return { type: AuthType.COOKIE, value, source: 'manual' };
    case 'oauth':
      if (provider === UsageProvider.CLAUDE || provider === UsageProvider.ANTIGRAVITY) {
        const trimmed = value.trim();
        if (trimmed.startsWith('{')) {
          try {
            const parsed = JSON.parse(trimmed) as Record<string, unknown>;
            const accessToken = typeof parsed.accessToken === 'string'
              ? parsed.accessToken
              : (typeof parsed.access_token === 'string' ? parsed.access_token : '');
            if (!accessToken) {
              throw new Error('Claude OAuth JSON is missing access_token');
            }
            return {
              type: AuthType.OAUTH,
              accessToken,
              refreshToken: typeof parsed.refreshToken === 'string'
                ? parsed.refreshToken
                : (typeof parsed.refresh_token === 'string' ? parsed.refresh_token : undefined),
              clientId: typeof parsed.clientId === 'string'
                ? parsed.clientId
                : (typeof parsed.client_id === 'string' ? parsed.client_id : undefined),
              clientSecret: typeof parsed.clientSecret === 'string'
                ? parsed.clientSecret
                : (typeof parsed.client_secret === 'string' ? parsed.client_secret : undefined),
              expiresAt: typeof parsed.expiresAt === 'string'
                ? parsed.expiresAt
                : (typeof parsed.expiry_date === 'string' ? parsed.expiry_date : undefined),
              projectId: typeof parsed.projectId === 'string'
                ? parsed.projectId
                : (typeof parsed.project_id === 'string' ? parsed.project_id : undefined),
            };
          } catch (error) {
            throw new Error(error instanceof Error ? error.message : 'Invalid OAuth JSON');
          }
        }
      }
      return { type: AuthType.OAUTH, accessToken: value };
    case 'jwt':
      if (provider === UsageProvider.KIMI) {
        throw new Error('Kimi only supports Browser Cookie authentication');
      }
      return { type: AuthType.JWT, value };
    default:
      return { type: AuthType.COOKIE, value, source: 'manual' };
  }
}

function sanitizeCredential(credential: Credential): Credential {
  if (credential.type === AuthType.API_KEY) {
    return { ...credential, value: credential.value.substring(0, 4) + '****' + credential.value.substring(credential.value.length - 4) };
  }
  if (credential.type === AuthType.COOKIE) {
    return { ...credential, value: '[COOKIE]' };
  }
  if (credential.type === AuthType.OAUTH) {
    return { ...credential, accessToken: '[TOKEN]' };
  }
  if (credential.type === AuthType.JWT) {
    return { ...credential, value: '[JWT]' };
  }
  return credential;
}

router.get('/', (_req: Request, res: Response) => {
  try {
    const providers = getAllMockProviders();
    const sanitized = providers.map(p => ({
      id: p.id,
      provider: p.provider,
      credentials: sanitizeCredential(p.credentials),
      name: p.name || null,
      refreshInterval: p.refreshInterval,
      region: p.region,
    }));
    
    res.json({
      success: true,
      data: sanitized,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
    });
  }
});

router.get('/credentials', (_req: Request, res: Response) => {
  try {
    const providers = getAllMockProviders();
    const credentialsList = providers.map(p => ({
      id: p.id,
      provider: p.provider,
      credentials: p.credentials,
      name: p.name || null,
      refreshInterval: p.refreshInterval,
      region: p.region,
    }));
    
    res.json({
      success: true,
      data: credentialsList,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
    });
  }
});

router.post('/', async (req: Request, res: Response) => {
  try {
    const { provider, credentials, authType, refreshInterval, region, name } = req.body;
    
    if (!provider || !credentials) {
      res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_REQUEST',
          message: 'Provider and credentials are required',
        },
      });
      return;
    }

    const credential: Credential = createCredential(provider as UsageProvider, authType || 'cookie', credentials);
    
    const config: ProviderConfig = {
      provider: provider as UsageProvider,
      credentials: credential,
      refreshInterval: refreshInterval || 5,
      region,
      name,
    };

    const id = saveMockProvider(provider as UsageProvider, config);
    
    res.json({
      success: true,
      data: {
        id,
        provider,
        refreshInterval: config.refreshInterval,
        region: config.region,
        name: config.name,
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
    });
  }
});

router.put('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { refreshInterval, region, name } = req.body;
    const providerId = Number(id);

    if (Number.isNaN(providerId)) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_PROVIDER_ID',
          message: 'Provider id must be numeric',
        },
      });
    }
    
    const providers = getAllMockProviders();
    const providerConfig = providers.find(p => p.id === providerId);
    
    if (!providerConfig) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'Provider not found',
        },
      });
    }
    
    const updated: ProviderConfig = {
      ...providerConfig,
      refreshInterval: refreshInterval ?? providerConfig.refreshInterval,
      region: region !== undefined ? region : providerConfig.region,
      name: name !== undefined ? name : providerConfig.name,
    };

    const savedId = saveMockProvider(providerConfig.provider, updated);
    
    res.json({
      success: true,
      data: {
        ...updated,
        id: savedId,
      },
    });
  } catch (error) {
    console.error('PUT provider error:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
    });
  }
});

router.delete('/:id', (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const providerId = Number(id);
    if (Number.isNaN(providerId)) {
      res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_PROVIDER_ID',
          message: 'Provider id must be numeric',
        },
      });
      return;
    }

    deleteMockProvider(providerId);
    
    res.json({
      success: true,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
    });
  }
});

router.post('/:id/refresh', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const providerId = Number(id);
    if (Number.isNaN(providerId)) {
      res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_PROVIDER_ID',
          message: 'Provider id must be numeric',
        },
      });
      return;
    }

    const provider = getMockProvider(providerId);
    
    if (!provider) {
      res.status(404).json({
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'Provider not found',
        },
      });
      return;
    }

    const providers = getAllMockProviders();
    const providerConfig = providers.find(p => p.id === providerId);
    const mockProvider = providerConfig ? createMockProvider(providerConfig.provider) : null;
    if (!mockProvider) {
      res.status(400).json({
        success: false,
        error: {
          code: 'MOCK_PROVIDER_NOT_FOUND',
          message: 'Mock provider implementation not found',
        },
      });
      return;
    }

    let snapshot: UsageSnapshot;
    try {
      snapshot = await mockProvider.fetchUsage(providerConfig?.credentials || { type: AuthType.API_KEY, value: 'mock-key' });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      res.status(400).json({
        success: false,
        error: {
          code: 'FETCH_ERROR',
          message: errorMessage,
        },
      });
      return;
    }

    recordMockUsage(providerConfig.id, snapshot);
    
    res.json({
      success: true,
      data: serializeUsageSnapshot(snapshot),
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
    });
  }
});

export default router;
