import { Router, Request, Response } from 'express';
import { UsageProvider, ProviderConfig, UsageSnapshot, Credential, AuthType } from '../../src/types/index.js';
import { getViewerRole, requireAdminRole } from '../middleware/auth.js';
import { copilotDeviceFlowService, FlowNotFoundError } from '../services/CopilotDeviceFlowService.js';
import { claudeOAuthService } from '../services/ClaudeOAuthService.js';
import { storage, tryParseReadonlyError } from '../storage.js';
import type { ProviderInstance, UsageRecordRow } from '../storage.js';
import { fetchUsageForProvider, getAdapterForProvider } from '../services/ProviderUsageService.js';
import { isMockMode } from '../runtime.js';
import { enrichProgressTitles } from '../utils/progressTitles.js';

const router = Router();

interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
  };
}

interface CopilotCompleteBody {
  tempCredentialId: string;
  name: string;
  refreshInterval?: number;
}

interface ProviderOrderBody {
  ids?: string[];
}

type SerializedProgressItem = Omit<UsageSnapshot['progress'][number], 'resetsAt'> & {
  resetsAt: number | null;
};

type SerializedUsageSnapshot = Omit<UsageSnapshot, 'progress' | 'updatedAt'> & {
  progress: SerializedProgressItem[];
  updatedAt: number;
};

type ProviderValidationContext = {
  route: 'create' | 'update' | 'copilot-complete';
  provider: UsageProvider;
  providerUid?: string;
  authType?: string;
  region?: string;
};

function summarizeCredentialForLog(credential: Credential): Record<string, unknown> {
  if (credential.type === AuthType.COOKIE) {
    const value = String(credential.value || '');
    return {
      type: credential.type,
      length: value.length,
      hasSessionToken: /(?:^|;)\s*(session|sessionkey|auth|token)=/i.test(value),
    };
  }

  if (credential.type === AuthType.API_KEY) {
    const value = String(credential.value || '');
    return {
      type: credential.type,
      length: value.length,
      prefix: value.slice(0, 4),
    };
  }

  if (credential.type === AuthType.JWT) {
    const value = String(credential.value || '');
    return {
      type: credential.type,
      length: value.length,
      segmentCount: value.split('.').length,
    };
  }

  if (credential.type === AuthType.OAUTH) {
    return {
      type: credential.type,
      hasAccessToken: Boolean(credential.accessToken),
      hasRefreshToken: Boolean(credential.refreshToken),
      expiresAt: credential.expiresAt || null,
    };
  }

  // Keep a safe fallback for potential future auth types.
  return { type: 'unknown' };
}

function logValidationEvent(
  level: 'info' | 'warn' | 'error',
  stage: 'start' | 'success' | 'failed' | 'thrown',
  context: ProviderValidationContext,
  details?: Record<string, unknown>,
): void {
  const payload = {
    stage,
    route: context.route,
    provider: context.provider,
    providerUid: context.providerUid || null,
    authType: context.authType || null,
    region: context.region || null,
    ...details,
  };
  const message = `[providers][validation] ${JSON.stringify(payload)}`;
  if (level === 'error') {
    console.error(message);
    return;
  }
  if (level === 'warn') {
    console.warn(message);
    return;
  }
  console.log(message);
}

function toUnixSeconds(value: Date | number | string | null | undefined): number | null {
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

function resolveSnapshotIdentityWithPlan(
  identity: UsageSnapshot['identity'] | undefined,
  fallbackPlan?: string,
): UsageSnapshot['identity'] | undefined {
  const currentPlan = typeof identity?.plan === 'string' ? identity.plan.trim() : '';
  if (currentPlan) {
    return { plan: currentPlan };
  }
  const normalizedFallback = typeof fallbackPlan === 'string' ? fallbackPlan.trim() : '';
  if (!normalizedFallback) {
    return undefined;
  }
  return { plan: normalizedFallback };
}

function serializeUsageSnapshot(
  snapshot: UsageSnapshot,
  options?: { excludeCost?: boolean; fallbackPlan?: string },
): SerializedUsageSnapshot {
  const payload: SerializedUsageSnapshot = {
    ...snapshot,
    identity: resolveSnapshotIdentityWithPlan(snapshot.identity, options?.fallbackPlan),
    progress: enrichProgressTitles(snapshot.provider, snapshot.progress || []).map((item) => ({
      ...item,
      resetsAt: toUnixSeconds(item.resetsAt) ?? null,
    })),
    updatedAt: toUnixSeconds(snapshot.updatedAt) ?? Math.floor(Date.now() / 1000),
  };

  if (options?.excludeCost) {
    delete (payload as unknown as Partial<UsageSnapshot>).cost;
  }

  return payload;
}

function serializeProvider(provider: ProviderInstance) {
  return {
    id: provider.id,
    provider: provider.provider,
    name: provider.name || null,
    refreshInterval: provider.refreshInterval,
    displayOrder: provider.displayOrder,
    region: provider.region,
    claudeAuthMode: provider.claudeAuthMode,
    plan: provider.plan,
    opencodeWorkspaceId: provider.opencodeWorkspaceId,
    defaultProgressItem: provider.defaultProgressItem || null,
  };
}

function buildSnapshotFromRecord(provider: ProviderInstance, record: UsageRecordRow): UsageSnapshot {
  const items = (record.progress?.items || []) as UsageSnapshot['progress'];
  return {
    provider: provider.provider,
    progress: items,
    cost: record.progress?.cost,
    identity: record.identityData as { plan?: string } | undefined,
    updatedAt: record.createdAt,
  };
}

function isClaudeOAuthAuthError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const lower = error.message.toLowerCase();
  return (
    lower.includes('token expired') ||
    lower.includes('access denied') ||
    lower.includes('oauth error: 401') ||
    lower.includes('auth invalid') ||
    lower.includes('invalid_client') ||
    lower.includes('invalid_grant')
  );
}

function serializeProviderForViewer(provider: ProviderInstance, role: 'normal' | 'admin') {
  if (role === 'admin') {
    return {
      ...serializeProvider(provider),
      credentials: sanitizeCredential(provider.credentials),
    };
  }
  return serializeProvider(provider);
}

router.get('/', async (_req: Request, res: Response) => {
  try {
    const role = getViewerRole(res);
    const providers = await storage.listProviders();
    const sanitized = providers.map((provider) => serializeProviderForViewer(provider, role));
    
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

router.get('/credentials', async (_req: Request, res: Response) => {
  if (!requireAdminRole(_req, res)) return;
  try {
    const providers = await storage.listProviders();
    const credentialsList = providers.map((provider) => serializeProviderForViewer(provider, 'admin'));
    
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

router.get('/:id', async (req: Request, res: Response) => {
  if (!requireAdminRole(req, res)) return;
  try {
    const { id } = req.params;
    const provider = await storage.getProvider(id);

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

    res.json({
      success: true,
      data: {
        id: provider.id,
        provider: provider.provider,
        credentials: provider.credentials,
        name: provider.name || null,
        refreshInterval: provider.refreshInterval,
        displayOrder: provider.displayOrder,
        region: provider.region,
        claudeAuthMode: provider.claudeAuthMode,
        plan: provider.plan,
        opencodeWorkspaceId: provider.opencodeWorkspaceId,
        defaultProgressItem: provider.defaultProgressItem || null,
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

router.post('/copilot/auth/start', async (_req: Request, res: Response) => {
  if (!requireAdminRole(_req, res)) return;
  try {
    const flow = await copilotDeviceFlowService.start();
    res.json({
      success: true,
      data: flow,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: {
        code: 'COPILOT_AUTH_START_FAILED',
        message: error instanceof Error ? error.message : 'Failed to start Copilot sign-in',
      },
    });
  }
});

router.get('/copilot/auth/status/:flowId', async (req: Request, res: Response) => {
  if (!requireAdminRole(req, res)) return;
  try {
    const { flowId } = req.params;
    const status = await copilotDeviceFlowService.getStatus(flowId);
    res.json({
      success: true,
      data: status,
    });
  } catch (error) {
    if (error instanceof FlowNotFoundError) {
      res.status(404).json({
        success: false,
        error: {
          code: error.code,
          message: error.message,
        },
      });
      return;
    }

    res.status(500).json({
      success: false,
      error: {
        code: 'COPILOT_AUTH_STATUS_FAILED',
        message: error instanceof Error ? error.message : 'Failed to check Copilot sign-in status',
      },
    });
  }
});

router.post('/copilot/auth/complete', async (req: Request, res: Response) => {
  if (!requireAdminRole(req, res)) return;
  try {
    const { tempCredentialId, name, refreshInterval } = req.body as CopilotCompleteBody;

    if (!tempCredentialId || !name?.trim()) {
      res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_REQUEST',
          message: 'Authorization and display name are required',
        },
      });
      return;
    }

    const existing = await storage.getProviderByName(UsageProvider.COPILOT, name.trim());
    if (existing) {
      res.status(400).json({
        success: false,
        error: {
          code: 'DUPLICATE_NAME',
          message: 'A provider with this name already exists',
        },
      });
      return;
    }

    const token = copilotDeviceFlowService.consumeTempCredential(tempCredentialId);
    const credential: Credential = {
      type: AuthType.OAUTH,
      accessToken: token,
    };

    const config: ProviderConfig = {
      provider: UsageProvider.COPILOT,
      credentials: credential,
      refreshInterval: refreshInterval || 5,
      name: name.trim(),
    };

    const adapter = getAdapterForProvider(UsageProvider.COPILOT);
    if (!adapter) {
      res.status(400).json({
        success: false,
        error: {
          code: 'ADAPTER_NOT_FOUND',
          message: 'Provider adapter not found',
        },
      });
      return;
    }

    if (!isMockMode() && typeof adapter.validateCredentials === 'function') {
      const validationContext: ProviderValidationContext = {
        route: 'copilot-complete',
        provider: UsageProvider.COPILOT,
        authType: credential.type,
        region: config.region,
      };
      const validationStartedAt = Date.now();
      logValidationEvent('info', 'start', validationContext, {
        credential: summarizeCredentialForLog(credential),
      });
      let validation;
      try {
        validation = await adapter.validateCredentials(credential, config);
      } catch (error) {
        logValidationEvent('error', 'thrown', validationContext, {
          durationMs: Date.now() - validationStartedAt,
          errorMessage: error instanceof Error ? error.message : String(error),
        });
        throw error;
      }

      if (!validation.valid) {
        logValidationEvent('warn', 'failed', validationContext, {
          durationMs: Date.now() - validationStartedAt,
          reason: validation.reason || null,
          expiresAt: validation.expiresAt || null,
        });
        res.status(400).json({
          success: false,
          error: {
            code: 'VALIDATION_FAILED',
            message: validation.reason || 'Invalid credentials',
          },
        });
        return;
      }
      logValidationEvent('info', 'success', validationContext, {
        durationMs: Date.now() - validationStartedAt,
        expiresAt: validation.expiresAt || null,
      });
    }

    const created = await storage.createProvider(UsageProvider.COPILOT, config);

    try {
      const snapshot = await fetchUsageForProvider(config);
      await storage.recordUsage(created.id, snapshot);
    } catch (error) {
      console.warn('Initial Copilot fetch failed after auth completion:', error);
    }

    res.json({
      success: true,
      data: {
        id: created.id,
        provider: UsageProvider.COPILOT,
        refreshInterval: config.refreshInterval,
        displayOrder: created.displayOrder,
        name: config.name,
      },
    });
  } catch (error) {
    const readonly = tryParseReadonlyError(error);
    if (readonly) {
      res.status(409).json({
        success: false,
        error: readonly,
      });
      return;
    }
    res.status(400).json({
      success: false,
      error: {
        code: 'COPILOT_AUTH_COMPLETE_FAILED',
        message: error instanceof Error ? error.message : 'Failed to complete Copilot sign-in',
      },
    });
  }
});

router.post('/claude/oauth/generate-auth-url', (req: Request, res: Response) => {
  if (!requireAdminRole(req, res)) return;
  try {
    const result = claudeOAuthService.generateAuthUrl();
    res.json({ success: true, data: result });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: {
        code: 'CLAUDE_OAUTH_GENERATE_FAILED',
        message: error instanceof Error ? error.message : 'Failed to generate authorization URL',
      },
    });
  }
});

router.post('/claude/oauth/exchange-code', async (req: Request, res: Response) => {
  if (!requireAdminRole(req, res)) return;
  try {
    const { sessionId, code, state } = req.body as { sessionId?: string; code?: string; state?: string };
    if (!sessionId || !code) {
      res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_REQUEST',
          message: 'sessionId and code are required',
        },
      });
      return;
    }
    const tokenInfo = await claudeOAuthService.exchangeCode(sessionId, code, state);
    res.json({ success: true, data: tokenInfo });
  } catch (error) {
    res.status(400).json({
      success: false,
      error: {
        code: 'CLAUDE_OAUTH_EXCHANGE_FAILED',
        message: error instanceof Error ? error.message : 'Failed to exchange authorization code',
      },
    });
  }
});

router.post('/', async (req: Request, res: Response) => {
  if (!requireAdminRole(req, res)) return;
  try {
    const { provider, credentials, authType, refreshInterval, region, name, claudeAuthMode, plan, opencodeWorkspaceId, defaultProgressItem } = req.body;
    
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

    if (name) {
      const existing = await storage.getProviderByName(provider as UsageProvider, name);
      if (existing) {
        res.status(400).json({
          success: false,
          error: {
            code: 'DUPLICATE_NAME',
            message: 'A provider with this name already exists',
          },
        });
        return;
      }
    }
    
    let credential: Credential;
    try {
      credential = createCredential(provider as UsageProvider, authType || 'cookie', credentials);
    } catch (error) {
      res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_CREDENTIALS',
          message: error instanceof Error ? error.message : 'Invalid credentials payload',
        },
      });
      return;
    }
    
    const config: ProviderConfig = {
      provider: provider as UsageProvider,
      credentials: credential,
      refreshInterval: refreshInterval || 5,
      region,
      name,
      claudeAuthMode: provider === UsageProvider.CLAUDE
        ? (claudeAuthMode || (authType === 'oauth' ? 'oauth' : 'cookie'))
        : undefined,
      plan: provider === UsageProvider.CLAUDE && typeof plan === 'string' && plan.trim()
        ? plan.trim()
        : undefined,
      opencodeWorkspaceId: provider === UsageProvider.OPENCODE
        ? normalizeOpenCodeWorkspaceId(opencodeWorkspaceId)
        : undefined,
      defaultProgressItem: defaultProgressItem || undefined,
    };

    const providerId = provider as UsageProvider;
    const adapter = getAdapterForProvider(providerId);
    const shouldSkipLiveValidation = providerId === UsageProvider.OPENCODE || isMockMode();

    if (adapter && !shouldSkipLiveValidation) {
      const validationContext: ProviderValidationContext = {
        route: 'create',
        provider: providerId,
        authType: credential.type,
        region: config.region,
      };
      const validationStartedAt = Date.now();
      logValidationEvent('info', 'start', validationContext, {
        credential: summarizeCredentialForLog(credential),
      });
      let validation;
      try {
        validation = await adapter.validateCredentials(credential, config);
      } catch (error) {
        logValidationEvent('error', 'thrown', validationContext, {
          durationMs: Date.now() - validationStartedAt,
          errorMessage: error instanceof Error ? error.message : String(error),
        });
        throw error;
      }

      if (!validation.valid) {
        logValidationEvent('warn', 'failed', validationContext, {
          durationMs: Date.now() - validationStartedAt,
          reason: validation.reason || null,
          expiresAt: validation.expiresAt || null,
        });
        res.status(400).json({
          success: false,
          error: {
            code: 'VALIDATION_FAILED',
            message: validation.reason || 'Invalid credentials',
          },
        });
        return;
      }
      logValidationEvent('info', 'success', validationContext, {
        durationMs: Date.now() - validationStartedAt,
        expiresAt: validation.expiresAt || null,
      });
    }

    const created = await storage.createProvider(providerId, config);

    if (adapter && !shouldSkipLiveValidation) {
      try {
        const snapshot = await fetchUsageForProvider(config);
        await storage.recordUsage(created.id, snapshot);
      } catch (error) {
        console.warn(`Initial fetch failed for provider ${provider}:`, error);
      }

      if (provider === UsageProvider.CLAUDE && credential.type === AuthType.OAUTH && !config.plan) {
        try {
          const account = await adapter.fetchAccount(credential);
          if (account.plan) {
            await storage.patchProviderAttrs(created.id, { plan: account.plan });
          }
        } catch (error) {
          console.warn(`Failed to fetch Claude account type for ${created.id}:`, error);
        }
      }
    }

    res.json({
      success: true,
      data: {
        id: created.id,
        provider,
        refreshInterval: config.refreshInterval,
        displayOrder: created.displayOrder,
        region: config.region,
        name: config.name,
        claudeAuthMode: config.claudeAuthMode,
        plan: config.plan,
        opencodeWorkspaceId: config.opencodeWorkspaceId,
      },
    });
  } catch (error) {
    const readonly = tryParseReadonlyError(error);
    if (readonly) {
      res.status(409).json({
        success: false,
        error: readonly,
      });
      return;
    }
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
    });
  }
});

router.put('/order', async (req: Request, res: Response) => {
  if (!requireAdminRole(req, res)) return;
  try {
    const { ids } = req.body as ProviderOrderBody;

    if (!Array.isArray(ids) || ids.length === 0 || ids.some((id) => typeof id !== 'string' || !id.trim())) {
      res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_REQUEST',
          message: 'ids must be a non-empty string array',
        },
      });
      return;
    }

    const updated = await storage.updateProviderOrder(ids);

    res.json({
      success: true,
      data: updated.map(serializeProvider),
    });
  } catch (error) {
    const readonly = tryParseReadonlyError(error);
    if (readonly) {
      res.status(409).json({
        success: false,
        error: readonly,
      });
      return;
    }

    res.status(400).json({
      success: false,
      error: {
        code: 'INVALID_ORDER',
        message: error instanceof Error ? error.message : 'Failed to update provider order',
      },
    });
  }
});

router.put('/:id', async (req: Request, res: Response) => {
  if (!requireAdminRole(req, res)) return;
  try {
    const { id } = req.params;
    const {
      refreshInterval,
      region,
      name,
      claudeAuthMode,
      plan,
      opencodeWorkspaceId,
      defaultProgressItem,
      authType,
      credentials,
    } = req.body;
    
    const existing = await storage.getProvider(id);
    if (!existing) {
      res.status(404).json({
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'Provider not found',
        },
      });
      return;
    }

    const hasAuthType = authType !== undefined;
    const hasCredentials = credentials !== undefined;
    if (hasAuthType !== hasCredentials) {
      res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_REQUEST',
          message: 'authType and credentials must be provided together',
        },
      });
      return;
    }

    if (name && name !== existing.name) {
      const duplicate = await storage.getProviderByName(existing.provider, name);
      if (duplicate && duplicate.id !== id) {
        res.status(400).json({
          success: false,
          error: {
            code: 'DUPLICATE_NAME',
            message: 'A provider with this name already exists',
          },
        });
        return;
      }
    }

    let nextCredentials = existing.credentials;
    if (hasAuthType && hasCredentials) {
      try {
        nextCredentials = createCredential(existing.provider, String(authType), String(credentials));
      } catch (error) {
        res.status(400).json({
          success: false,
          error: {
            code: 'INVALID_CREDENTIALS',
            message: error instanceof Error ? error.message : 'Invalid credentials payload',
          },
        });
        return;
      }
    }

    const nextClaudeAuthMode = existing.provider === UsageProvider.CLAUDE
      ? (hasAuthType
        ? (String(authType) === AuthType.OAUTH ? 'oauth' : 'cookie')
        : (claudeAuthMode !== undefined ? claudeAuthMode : existing.claudeAuthMode))
      : existing.claudeAuthMode;

    const nextConfig: ProviderConfig = {
      provider: existing.provider,
      credentials: nextCredentials,
      refreshInterval: refreshInterval !== undefined ? refreshInterval : existing.refreshInterval,
      region: region !== undefined ? region : existing.region,
      name: name !== undefined ? name : existing.name,
      claudeAuthMode: nextClaudeAuthMode,
      plan: existing.provider === UsageProvider.CLAUDE
        ? (plan !== undefined
          ? (typeof plan === 'string' && plan.trim() ? plan.trim() : undefined)
          : existing.plan)
        : existing.plan,
      opencodeWorkspaceId: existing.provider === UsageProvider.OPENCODE
        ? (opencodeWorkspaceId !== undefined
          ? normalizeOpenCodeWorkspaceId(opencodeWorkspaceId)
          : existing.opencodeWorkspaceId)
        : existing.opencodeWorkspaceId,
      defaultProgressItem: defaultProgressItem !== undefined
        ? (defaultProgressItem || undefined)
        : existing.defaultProgressItem,
    };

    const adapter = getAdapterForProvider(existing.provider);
    const shouldSkipLiveValidation = existing.provider === UsageProvider.OPENCODE || isMockMode();

    if (adapter && !shouldSkipLiveValidation) {
      const validationContext: ProviderValidationContext = {
        route: 'update',
        provider: existing.provider,
        providerUid: id,
        authType: nextCredentials.type,
        region: nextConfig.region,
      };
      const validationStartedAt = Date.now();
      logValidationEvent('info', 'start', validationContext, {
        credential: summarizeCredentialForLog(nextCredentials),
      });
      let validation;
      try {
        validation = await adapter.validateCredentials(nextCredentials, nextConfig);
      } catch (error) {
        logValidationEvent('error', 'thrown', validationContext, {
          durationMs: Date.now() - validationStartedAt,
          errorMessage: error instanceof Error ? error.message : String(error),
        });
        throw error;
      }

      if (!validation.valid) {
        logValidationEvent('warn', 'failed', validationContext, {
          durationMs: Date.now() - validationStartedAt,
          reason: validation.reason || null,
          expiresAt: validation.expiresAt || null,
        });
        res.status(400).json({
          success: false,
          error: {
            code: 'VALIDATION_FAILED',
            message: validation.reason || 'Invalid credentials',
          },
        });
        return;
      }
      logValidationEvent('info', 'success', validationContext, {
        durationMs: Date.now() - validationStartedAt,
        expiresAt: validation.expiresAt || null,
      });
    }
    
    const updated = await storage.updateProvider(id, {
      credentials: hasAuthType ? nextCredentials : undefined,
      refreshInterval: nextConfig.refreshInterval,
      region: nextConfig.region,
      name: nextConfig.name,
      claudeAuthMode: nextConfig.claudeAuthMode,
      plan: nextConfig.plan,
      opencodeWorkspaceId: nextConfig.opencodeWorkspaceId,
      defaultProgressItem: nextConfig.defaultProgressItem,
    });

    if (adapter && !shouldSkipLiveValidation) {
      try {
        const snapshot = await fetchUsageForProvider(updated);
        await storage.recordUsage(updated.id, snapshot);
      } catch (error) {
        console.warn(`Refresh after update failed for provider ${updated.provider}:`, error);
      }
    }
    
    res.json({
      success: true,
      data: {
        ...updated,
        displayOrder: updated.displayOrder,
      },
    });
  } catch (error) {
    const readonly = tryParseReadonlyError(error);
    if (readonly) {
      res.status(409).json({
        success: false,
        error: readonly,
      });
      return;
    }
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

router.delete('/:id', async (req: Request, res: Response) => {
  if (!requireAdminRole(req, res)) return;
  try {
    const { id } = req.params;
    await storage.deleteProvider(id);
    
    res.json({
      success: true,
    });
  } catch (error) {
    const readonly = tryParseReadonlyError(error);
    if (readonly) {
      res.status(409).json({
        success: false,
        error: readonly,
      });
      return;
    }
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
  if (!requireAdminRole(req, res)) return;
  try {
    const { id } = req.params;
    const provider = await storage.getProvider(id);

    if (!provider) {
      res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Provider not found' },
      });
      return;
    }

    const adapter = getAdapterForProvider(provider.provider);
    if (!adapter) {
      res.status(400).json({
        success: false,
        error: { code: 'ADAPTER_NOT_FOUND', message: 'Provider adapter not found' },
      });
      return;
    }

    const now = Date.now();
    const CACHE_TTL_MS = 3 * 60 * 1000;
    const FAILURE_COOLDOWN_MS = 60 * 1000;
    const LOCK_TIMEOUT_MS = 30 * 1000;

    const latestRecord = await storage.getLatestUsage(id);
    const fetchState = provider.fetchState || {};

    // 1. Check recent cache
    if (latestRecord) {
      const ageMs = now - latestRecord.createdAt.getTime();
      if (ageMs < CACHE_TTL_MS) {
        const snapshot = buildSnapshotFromRecord(provider, latestRecord);
        res.json({
          success: true,
          data: {
            ...serializeUsageSnapshot(snapshot, { excludeCost: isMockMode(), fallbackPlan: provider.plan }),
            fromCache: true,
            cachedAt: Math.floor(latestRecord.createdAt.getTime() / 1000),
            refreshInterval: provider.refreshInterval,
          },
        });
        return;
      }
    }

    // 2. Check failure cooldown
    const lastFailedAt = typeof fetchState.lastFailedAt === 'string' ? new Date(fetchState.lastFailedAt).getTime() : null;
    if (lastFailedAt && (now - lastFailedAt) < FAILURE_COOLDOWN_MS) {
      if (latestRecord) {
        const snapshot = buildSnapshotFromRecord(provider, latestRecord);
        res.json({
          success: true,
          data: {
            ...serializeUsageSnapshot(snapshot, { excludeCost: isMockMode(), fallbackPlan: provider.plan }),
            stale: true,
            staleAt: Math.floor(Date.now() / 1000),
            refreshInterval: provider.refreshInterval,
          },
        });
      } else {
        res.status(503).json({
          success: false,
          error: { code: 'TEMPORARILY_UNAVAILABLE', message: 'Data temporarily unavailable due to a recent failure' },
        });
      }
      return;
    }

    // 3. Check concurrent lock
    const fetchInProgressSince = typeof fetchState.fetchInProgressSince === 'string' ? new Date(fetchState.fetchInProgressSince).getTime() : null;
    if (fetchInProgressSince && (now - fetchInProgressSince) < LOCK_TIMEOUT_MS) {
      if (latestRecord) {
        const snapshot = buildSnapshotFromRecord(provider, latestRecord);
        res.json({
          success: true,
          data: {
            ...serializeUsageSnapshot(snapshot, { excludeCost: isMockMode(), fallbackPlan: provider.plan }),
            stale: true,
            staleAt: Math.floor(Date.now() / 1000),
            refreshing: true,
            refreshInterval: provider.refreshInterval,
          },
        });
      } else {
        res.json({ success: true, data: null, refreshing: true, refreshInterval: provider.refreshInterval });
      }
      return;
    }

    // 4. Set lock
    await storage.patchFetchState(id, { fetchInProgressSince: new Date(now).toISOString() });

    let snapshot: UsageSnapshot;
    try {
      snapshot = await fetchUsageForProvider(provider);
      await storage.recordUsage(id, snapshot);
      await storage.patchFetchState(id, {
        fetchInProgressSince: null,
        lastFailedAt: null,
        lastFailureReason: null,
        authRequired: null,
      });
      res.json({
        success: true,
        data: {
          ...serializeUsageSnapshot(snapshot, { excludeCost: isMockMode(), fallbackPlan: provider.plan }),
          refreshInterval: provider.refreshInterval,
        },
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      const isAuthErr = isClaudeOAuthAuthError(error);
      await storage.patchFetchState(id, {
        fetchInProgressSince: null,
        lastFailedAt: new Date().toISOString(),
        lastFailureReason: errorMessage.substring(0, 200),
        ...(isAuthErr ? { authRequired: true } : {}),
      });

      if (latestRecord) {
        const fallbackSnapshot = buildSnapshotFromRecord(provider, latestRecord);
        res.json({
          success: true,
          data: {
            ...serializeUsageSnapshot(fallbackSnapshot, { excludeCost: isMockMode(), fallbackPlan: provider.plan }),
            stale: true,
            staleAt: Math.floor(Date.now() / 1000),
            fetchError: errorMessage,
            refreshInterval: provider.refreshInterval,
            ...(isAuthErr ? { authRequired: true } : {}),
          },
        });
      } else {
        res.status(400).json({
          success: false,
          error: { code: 'FETCH_ERROR', message: errorMessage },
        });
      }
    }
  } catch (error) {
    res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: error instanceof Error ? error.message : 'Unknown error' },
    });
  }
});

router.get('/:id/history', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const days = Math.min(Math.max(parseInt(req.query.days as string) || 30, 1), 365);
    
    const history = await storage.getUsageHistory(id, days);
    
    res.json({
      success: true,
      data: history,
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

function createCredential(provider: UsageProvider, type: string, value: string): Credential {
  switch (type) {
    case 'api_key':
      return { type: AuthType.API_KEY, value, keyPrefix: value.substring(0, 8) };
    case 'cookie':
      if (provider === UsageProvider.CODEX) {
        throw new Error('Codex only supports OAuth token authentication');
      }
      return {
        type: AuthType.COOKIE,
        value: normalizeCookieValue(provider, value),
        source: 'manual',
      };
    case 'oauth':
      if (provider === UsageProvider.CLAUDE) {
        return createClaudeOAuthCredential(value);
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

function createClaudeOAuthCredential(value: string): Credential {
  const raw = value.trim();
  if (!raw) {
    throw new Error('Claude OAuth token is required');
  }

  if (!raw.startsWith('{')) {
    return { type: AuthType.OAUTH, accessToken: raw };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error('Claude OAuth JSON must be a valid JSON object');
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('Claude OAuth JSON must be a JSON object');
  }

  const data = parsed as Record<string, unknown>;
  const accessToken = getString(data, ['accessToken', 'access_token']);
  if (!accessToken) {
    throw new Error('Claude OAuth JSON is missing access_token');
  }

  const rawExpiresAt = data.expiresAt ?? data.expiry_date;
  const expiresAt = parseCredentialDate(rawExpiresAt);
  if (rawExpiresAt !== undefined && rawExpiresAt !== null && rawExpiresAt !== '' && !expiresAt) {
    throw new Error('Claude OAuth expiry_date/expiresAt is invalid');
  }

  return {
    type: AuthType.OAUTH,
    accessToken,
    refreshToken: getString(data, ['refreshToken', 'refresh_token']),
    idToken: getString(data, ['idToken', 'id_token']),
    clientId: getString(data, ['clientId', 'client_id']),
    clientSecret: getString(data, ['clientSecret', 'client_secret']),
    projectId: getString(data, ['projectId', 'project_id', 'project']),
    expiresAt,
  };
}

function getString(data: Record<string, unknown>, keys: string[]): string | undefined {
  for (const key of keys) {
    const value = data[key];
    if (typeof value === 'string') {
      const trimmed = value.trim();
      if (trimmed) {
        return trimmed;
      }
    }
  }

  return undefined;
}

function parseCredentialDate(value: unknown): Date | undefined {
  if (value === undefined || value === null || value === '') {
    return undefined;
  }

  if (typeof value === 'number' && Number.isFinite(value)) {
    const timestamp = value > 1e12 ? value : value * 1000;
    const date = new Date(timestamp);
    return Number.isNaN(date.getTime()) ? undefined : date;
  }

  if (typeof value === 'string') {
    const numeric = Number(value);
    if (!Number.isNaN(numeric)) {
      return parseCredentialDate(numeric);
    }

    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? undefined : date;
  }

  return undefined;
}

function normalizeOpenCodeWorkspaceId(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed || undefined;
}

function normalizeCookieValue(provider: UsageProvider, value: string): string {
  const trimmed = value.trim();
  if (provider !== UsageProvider.OPENCODE || !trimmed) {
    return trimmed;
  }

  if (isOpenCodeCookieHeader(trimmed)) {
    return trimmed;
  }

  return `auth=${trimmed}`;
}

function isOpenCodeCookieHeader(value: string): boolean {
  if (value.includes(';')) {
    return true;
  }

  return /^(?:auth|__Host-auth)=/i.test(value);
}

function sanitizeCredential(credential: Credential): Credential {
  if (credential.type === AuthType.API_KEY) {
    return { ...credential, value: credential.value.substring(0, 4) + '****' + credential.value.substring(credential.value.length - 4) };
  }
  if (credential.type === AuthType.COOKIE) {
    return { ...credential, value: '[COOKIE]' };
  }
  if (credential.type === AuthType.OAUTH) {
    return {
      ...credential,
      accessToken: '[TOKEN]',
      refreshToken: credential.refreshToken ? '[TOKEN]' : undefined,
      idToken: credential.idToken ? '[TOKEN]' : undefined,
      clientSecret: credential.clientSecret ? '[SECRET]' : undefined,
    };
  }
  if (credential.type === AuthType.JWT) {
    return { ...credential, value: '[JWT]' };
  }
  return credential;
}

export default router;
