import React, { useState, useEffect } from 'react';
import { 
  UsageProvider, 
  AuthType, 
  ProviderConfig, 
  Credential,
  PROVIDER_NAMES,
  getRegionsForProvider,
} from '../../types';
import { credentialService } from '../../services/CredentialService';
import { apiService, CopilotAuthStatusResponse } from '../../services/ApiService';
import { LoadingSpinner } from '../common/LoadingSpinner';
import { SelectField } from '../common/SelectField';
import { ProviderLogo } from './ProviderLogo';

interface ProviderModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  editConfig?: ProviderConfig & { id?: string };
  availableProgressItems?: string[];
}

interface CopilotAuthState {
  flowId?: string;
  userCode?: string;
  verificationUri?: string;
  expiresAt?: Date;
  interval?: number;
  status: 'idle' | CopilotAuthStatusResponse['status'];
  tempCredentialId?: string;
  error?: string;
  loading: boolean;
}

interface ClaudeOAuthFormState {
  accessToken: string;
  refreshToken: string;
  clientId: string;
  projectId: string;
  expiresAt: string;
}

type AntigravityDisplayMode = 'pool' | 'models';

interface LinkOAuthState {
  sessionId: string;
  authUrl: string;
  code: string;
  step: 'idle' | 'generated' | 'exchanged';
  loading: boolean;
  error?: string;
}

const EMPTY_LINK_OAUTH: LinkOAuthState = {
  sessionId: '',
  authUrl: '',
  code: '',
  step: 'idle',
  loading: false,
};

const EMPTY_CLAUDE_OAUTH_FORM: ClaudeOAuthFormState = {
  accessToken: '',
  refreshToken: '',
  clientId: '',
  projectId: '',
  expiresAt: '',
};

const REFRESH_INTERVAL_OPTIONS = [
  { value: 5, label: 'Every 5 minutes' },
  { value: 15, label: 'Every 15 minutes' },
  { value: 30, label: 'Every 30 minutes' },
  { value: 60, label: 'Every 1 hour' },
  { value: 120, label: 'Every 2 hours' },
];

const CLAUDE_PLAN_OPTIONS = [
  { value: '', label: 'Unknown' },
  { value: 'Claude Pro', label: 'Claude Pro' },
  { value: 'Claude Max', label: 'Claude Max' },
  { value: 'Claude Team', label: 'Claude Team' },
  { value: 'Claude Enterprise', label: 'Claude Enterprise' },
];

function toInputValue(value?: string | Date): string {
  if (!value) return '';
  return value instanceof Date ? value.toISOString() : value;
}

function toClaudeOAuthFormState(credential: Extract<Credential, { type: AuthType.OAUTH }>): ClaudeOAuthFormState {
  return {
    accessToken: credential.accessToken || '',
    refreshToken: credential.refreshToken || '',
    clientId: credential.clientId || '',
    projectId: credential.projectId || '',
    expiresAt: toInputValue(credential.expiresAt),
  };
}

export const ProviderModal: React.FC<ProviderModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  editConfig,
  availableProgressItems,
}) => {
  const [selectedProvider, setSelectedProvider] = useState<UsageProvider | ''>(
    editConfig?.provider || ''
  );
  const [credentialValue, setCredentialValue] = useState('');
  const [selectedAuthType, setSelectedAuthType] = useState<AuthType>(AuthType.COOKIE);
  const [selectedRegion, setSelectedRegion] = useState<string>('');
  const [refreshInterval, setRefreshInterval] = useState<number>(5);
  const [name, setName] = useState<string>(editConfig?.name || '');
  const [opencodeWorkspaceId, setOpencodeWorkspaceId] = useState<string>(editConfig?.opencodeWorkspaceId || '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showCredentialValue, setShowCredentialValue] = useState(false);
  const [copilotAuth, setCopilotAuth] = useState<CopilotAuthState>({
    status: 'idle',
    loading: false,
  });
  const [copilotCodeCopied, setCopilotCodeCopied] = useState(false);
  const copiedIndicatorTimerRef = React.useRef<number | null>(null);
  const [claudeOAuth, setClaudeOAuth] = useState<ClaudeOAuthFormState>(EMPTY_CLAUDE_OAUTH_FORM);
  const [claudePlan, setClaudePlan] = useState<string>('');
  const [claudeLinkOAuth, setClaudeLinkOAuth] = useState<LinkOAuthState>(EMPTY_LINK_OAUTH);
  const [codexOAuth, setCodexOAuth] = useState<ClaudeOAuthFormState>(EMPTY_CLAUDE_OAUTH_FORM);
  const [codexLinkOAuth, setCodexLinkOAuth] = useState<LinkOAuthState>(EMPTY_LINK_OAUTH);
  const [antigravityOAuth, setAntigravityOAuth] = useState<ClaudeOAuthFormState>(EMPTY_CLAUDE_OAUTH_FORM);
  const [antigravityLinkOAuth, setAntigravityLinkOAuth] = useState<LinkOAuthState>(EMPTY_LINK_OAUTH);
  const [antigravityDisplayMode, setAntigravityDisplayMode] = useState<AntigravityDisplayMode>('pool');
  const [antigravityPoolConfigText, setAntigravityPoolConfigText] = useState('');
  const [defaultProgressItem, setDefaultProgressItem] = useState('');

  const availableProviders = React.useMemo(
    () => [...Object.values(UsageProvider)].sort((a, b) => PROVIDER_NAMES[a].localeCompare(PROVIDER_NAMES[b])),
    [],
  );
  const availableRegions = selectedProvider ? getRegionsForProvider(selectedProvider) : [];
  const hasRegionSupport = availableRegions.length > 0;
  const isEditMode = !!editConfig;

  useEffect(() => {
    if (editConfig && isOpen) {
      setSelectedProvider(editConfig.provider);
      setName(editConfig.name || '');
      setRefreshInterval(editConfig.refreshInterval);
      setSelectedRegion(editConfig.region || '');
      setOpencodeWorkspaceId(editConfig.opencodeWorkspaceId || '');
      setDefaultProgressItem(editConfig.defaultProgressItem || '');
      setSelectedAuthType(editConfig.credentials.type);
      setCredentialValue(
        editConfig.credentials.type === AuthType.OAUTH
          ? editConfig.credentials.accessToken
          : editConfig.credentials.value
      );
      setClaudeOAuth(
        editConfig.provider === UsageProvider.CLAUDE && editConfig.credentials.type === AuthType.OAUTH
          ? toClaudeOAuthFormState(editConfig.credentials)
          : EMPTY_CLAUDE_OAUTH_FORM
      );
      setClaudePlan(
        editConfig.provider === UsageProvider.CLAUDE
          ? (editConfig.plan
            || (typeof editConfig.attrs?.plan === 'string' ? editConfig.attrs.plan : '')
          )
          : '',
      );
      setCodexOAuth(
        editConfig.provider === UsageProvider.CODEX && editConfig.credentials.type === AuthType.OAUTH
          ? toClaudeOAuthFormState(editConfig.credentials)
          : EMPTY_CLAUDE_OAUTH_FORM
      );
      setAntigravityOAuth(
        editConfig.provider === UsageProvider.ANTIGRAVITY && editConfig.credentials.type === AuthType.OAUTH
          ? toClaudeOAuthFormState(editConfig.credentials)
          : EMPTY_CLAUDE_OAUTH_FORM
      );
      const antigravityAttrs = editConfig.provider === UsageProvider.ANTIGRAVITY
        && editConfig.attrs
        && typeof editConfig.attrs === 'object'
        && !Array.isArray(editConfig.attrs)
        ? (editConfig.attrs.antigravity as Record<string, unknown> | undefined)
        : undefined;
      const displayMode = antigravityAttrs?.displayMode === 'models' ? 'models' : 'pool';
      setAntigravityDisplayMode(displayMode);
      const poolConfig = antigravityAttrs?.poolConfig;
      if (poolConfig && typeof poolConfig === 'object' && !Array.isArray(poolConfig)) {
        setAntigravityPoolConfigText(JSON.stringify(poolConfig, null, 2));
      } else {
        setAntigravityPoolConfigText('');
      }
      setClaudeLinkOAuth(EMPTY_LINK_OAUTH);
      setCodexLinkOAuth(EMPTY_LINK_OAUTH);
      setAntigravityLinkOAuth(EMPTY_LINK_OAUTH);
      setError(null);
      setShowCredentialValue(false);
      setCopilotAuth({ status: 'idle', loading: false });
    }
  }, [editConfig, isOpen]);

  useEffect(() => {
    if (!isEditMode) {
      setSelectedProvider('');
      setCredentialValue('');
      setSelectedAuthType(AuthType.COOKIE);
      setSelectedRegion('');
      setRefreshInterval(5);
      setName('');
      setOpencodeWorkspaceId('');
      setDefaultProgressItem('');
      setError(null);
      setShowCredentialValue(false);
      setCopilotAuth({ status: 'idle', loading: false });
      setCopilotCodeCopied(false);
      setClaudeOAuth(EMPTY_CLAUDE_OAUTH_FORM);
      setClaudePlan('');
      setClaudeLinkOAuth(EMPTY_LINK_OAUTH);
      setCodexOAuth(EMPTY_CLAUDE_OAUTH_FORM);
      setCodexLinkOAuth(EMPTY_LINK_OAUTH);
      setAntigravityOAuth(EMPTY_CLAUDE_OAUTH_FORM);
      setAntigravityLinkOAuth(EMPTY_LINK_OAUTH);
      setAntigravityDisplayMode('pool');
      setAntigravityPoolConfigText('');
    }
  }, [isOpen, isEditMode]);

  useEffect(() => {
    return () => {
      if (copiedIndicatorTimerRef.current) {
        window.clearTimeout(copiedIndicatorTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!isOpen || isEditMode) return;
    if (selectedProvider !== UsageProvider.COPILOT || selectedAuthType !== AuthType.OAUTH) return;
    if (!copilotAuth.flowId || copilotAuth.status !== 'pending' || copilotAuth.loading) return;

    const delay = Math.max(1000, (copilotAuth.interval || 5) * 1000);
    const timer = window.setTimeout(async () => {
      try {
        const status = await apiService.getCopilotAuthStatus(copilotAuth.flowId!);
        setCopilotAuth((prev) => ({
          ...prev,
          status: status.status,
          userCode: status.userCode || prev.userCode,
          verificationUri: status.verificationUri || prev.verificationUri,
          expiresAt: status.expiresAt ? new Date(status.expiresAt) : prev.expiresAt,
          tempCredentialId: status.tempCredentialId,
          error: status.error,
          loading: false,
        }));
      } catch (err) {
        setCopilotAuth((prev) => ({
          ...prev,
          status: prev.status === 'pending' ? 'pending' : 'error',
          error: prev.status === 'pending'
            ? `Temporary network issue while checking authorization (${err instanceof Error ? err.message : 'unknown error'}). Retrying...`
            : (err instanceof Error ? err.message : 'Failed to check GitHub authorization'),
          loading: false,
        }));
      }
    }, delay);

    return () => window.clearTimeout(timer);
  }, [isOpen, isEditMode, selectedProvider, selectedAuthType, copilotAuth]);

  const handleProviderChange = (provider: UsageProvider) => {
    setSelectedProvider(provider);
    setCredentialValue('');
    setSelectedRegion('');
    setOpencodeWorkspaceId('');
    setError(null);
    setShowCredentialValue(false);
    setCopilotAuth({ status: 'idle', loading: false });
    setClaudeOAuth(EMPTY_CLAUDE_OAUTH_FORM);
    setClaudePlan('');
    setClaudeLinkOAuth(EMPTY_LINK_OAUTH);
    setCodexOAuth(EMPTY_CLAUDE_OAUTH_FORM);
    setCodexLinkOAuth(EMPTY_LINK_OAUTH);
    setAntigravityOAuth(EMPTY_CLAUDE_OAUTH_FORM);
    setAntigravityLinkOAuth(EMPTY_LINK_OAUTH);
    setAntigravityDisplayMode('pool');
    setAntigravityPoolConfigText('');

    const providerAdapters = getAdaptersForProvider(provider);
    if (providerAdapters.length > 0) {
      setSelectedAuthType(providerAdapters[0]);
    }
    
    const regions = getRegionsForProvider(provider);
    if (regions.length > 0) {
      setSelectedRegion(regions[0].id);
    }
  };

  const handleAuthTypeChange = (authType: AuthType) => {
    setSelectedAuthType(authType);
    setCredentialValue('');
    setShowCredentialValue(false);
    setClaudeOAuth(EMPTY_CLAUDE_OAUTH_FORM);
    setClaudePlan('');
    setClaudeLinkOAuth(EMPTY_LINK_OAUTH);
    setCodexOAuth(EMPTY_CLAUDE_OAUTH_FORM);
    setCodexLinkOAuth(EMPTY_LINK_OAUTH);
    setAntigravityOAuth(EMPTY_CLAUDE_OAUTH_FORM);
    setAntigravityLinkOAuth(EMPTY_LINK_OAUTH);
    setCopilotAuth({ status: 'idle', loading: false });
    setError(null);
  };

  const buildCredentialFromForm = (): Credential => {
    if (selectedProvider === UsageProvider.CLAUDE && selectedAuthType === AuthType.OAUTH) {
      return {
        type: AuthType.OAUTH,
        accessToken: claudeOAuth.accessToken.trim(),
        refreshToken: claudeOAuth.refreshToken.trim() || undefined,
        expiresAt: claudeOAuth.expiresAt.trim() || undefined,
        clientId: claudeOAuth.clientId.trim() || undefined,
        projectId: claudeOAuth.projectId.trim() || undefined,
      };
    }
    if (selectedProvider === UsageProvider.CODEX && selectedAuthType === AuthType.OAUTH) {
      return {
        type: AuthType.OAUTH,
        accessToken: codexOAuth.accessToken.trim(),
        refreshToken: codexOAuth.refreshToken.trim() || undefined,
        expiresAt: codexOAuth.expiresAt.trim() || undefined,
        clientId: codexOAuth.clientId.trim() || undefined,
        projectId: codexOAuth.projectId.trim() || undefined,
      };
    }
    if (selectedProvider === UsageProvider.ANTIGRAVITY && selectedAuthType === AuthType.OAUTH) {
      return {
        type: AuthType.OAUTH,
        accessToken: antigravityOAuth.accessToken.trim(),
        refreshToken: antigravityOAuth.refreshToken.trim() || undefined,
        expiresAt: antigravityOAuth.expiresAt.trim() || undefined,
        clientId: antigravityOAuth.clientId.trim() || undefined,
        projectId: antigravityOAuth.projectId.trim() || undefined,
      };
    }

    return credentialService.createCredential(selectedAuthType, credentialValue);
  };

  const handleCopilotSignIn = async () => {
    setError(null);
    setCopilotAuth({ status: 'idle', loading: true });

    try {
      const result = await apiService.startCopilotAuth();
      setCopilotAuth({
        flowId: result.flowId,
        userCode: result.userCode,
        verificationUri: result.verificationUri,
        expiresAt: new Date(Date.now() + (result.expiresIn * 1000)),
        interval: result.interval,
        status: 'pending',
        loading: false,
      });
    } catch (err) {
      setCopilotAuth({
        status: 'error',
        loading: false,
        error: err instanceof Error ? err.message : 'Failed to start GitHub sign-in',
      });
    }
  };

  const handleOpenCopilotVerification = () => {
    if (copilotAuth.verificationUri) {
      window.open(copilotAuth.verificationUri, '_blank', 'noopener,noreferrer');
    }
  };

  const handleCopyCopilotCode = async () => {
    if (!copilotAuth.userCode) return;

    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(copilotAuth.userCode);
        setCopilotCodeCopied(true);
        if (copiedIndicatorTimerRef.current) {
          window.clearTimeout(copiedIndicatorTimerRef.current);
        }
        copiedIndicatorTimerRef.current = window.setTimeout(() => {
          setCopilotCodeCopied(false);
        }, 1600);
        return;
      }

      const textArea = document.createElement('textarea');
      textArea.value = copilotAuth.userCode;
      textArea.style.position = 'fixed';
      textArea.style.left = '-999999px';
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand('copy');
      document.body.removeChild(textArea);
      setCopilotCodeCopied(true);
      if (copiedIndicatorTimerRef.current) {
        window.clearTimeout(copiedIndicatorTimerRef.current);
      }
      copiedIndicatorTimerRef.current = window.setTimeout(() => {
        setCopilotCodeCopied(false);
      }, 1600);
    } catch (err) {
      setCopilotCodeCopied(false);
      setError(err instanceof Error ? err.message : 'Failed to copy device code');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedProvider) return;
    if (!name.trim()) {
      setError('Name is required');
      return;
    }
    if (selectedProvider === UsageProvider.CLAUDE
      && selectedAuthType === AuthType.OAUTH
      && claudeOAuth.accessToken.trim().length === 0) {
      setError('Claude Access Token is required');
      return;
    }
    if (selectedProvider === UsageProvider.CODEX
      && selectedAuthType === AuthType.OAUTH
      && codexOAuth.accessToken.trim().length === 0) {
      setError('Codex Access Token is required');
      return;
    }
    if (selectedProvider === UsageProvider.ANTIGRAVITY
      && selectedAuthType === AuthType.OAUTH
      && antigravityOAuth.accessToken.trim().length === 0) {
      setError('Antigravity Access Token is required');
      return;
    }
    let antigravityPoolConfig: Record<string, unknown> | undefined;
    if (selectedProvider === UsageProvider.ANTIGRAVITY && antigravityPoolConfigText.trim()) {
      try {
        const parsed = JSON.parse(antigravityPoolConfigText);
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
          throw new Error('Pool config must be a JSON object');
        }
        antigravityPoolConfig = parsed as Record<string, unknown>;
      } catch (parseError) {
        setError(parseError instanceof Error ? parseError.message : 'Invalid Antigravity pool config JSON');
        return;
      }
    }
    const hasClaudeOAuthInput = selectedProvider === UsageProvider.CLAUDE
      && selectedAuthType === AuthType.OAUTH
      && claudeOAuth.accessToken.trim().length > 0;
    const hasCodexOAuthInput = selectedProvider === UsageProvider.CODEX
      && selectedAuthType === AuthType.OAUTH
      && codexOAuth.accessToken.trim().length > 0;
    const hasAntigravityOAuthInput = selectedProvider === UsageProvider.ANTIGRAVITY
      && selectedAuthType === AuthType.OAUTH
      && antigravityOAuth.accessToken.trim().length > 0;

    if (!isEditMode
      && !(selectedProvider === UsageProvider.COPILOT && selectedAuthType === AuthType.OAUTH)
      && !credentialValue
      && !hasClaudeOAuthInput
      && !hasCodexOAuthInput
      && !hasAntigravityOAuthInput) {
      return;
    }
    
    setSaving(true);
    setError(null);
    
    try {
      if (isEditMode && editConfig?.id) {
        const credentials = buildCredentialFromForm();
        const config: ProviderConfig = {
          provider: selectedProvider,
          credentials,
          refreshInterval,
          region: selectedRegion || undefined,
          name: name || undefined,
          claudeAuthMode: selectedProvider === UsageProvider.CLAUDE
            ? (selectedAuthType === AuthType.OAUTH ? 'oauth' : 'cookie')
            : undefined,
          plan: selectedProvider === UsageProvider.CLAUDE ? (claudePlan || undefined) : undefined,
          opencodeWorkspaceId: selectedProvider === UsageProvider.OPENCODE
            ? (opencodeWorkspaceId.trim() || undefined)
            : undefined,
          defaultProgressItem: defaultProgressItem.trim() || undefined,
          attrs: selectedProvider === UsageProvider.ANTIGRAVITY
            ? {
              antigravity: {
                displayMode: antigravityDisplayMode,
                ...(antigravityPoolConfig ? { poolConfig: antigravityPoolConfig } : {}),
              },
            }
            : undefined,
        };

        await credentialService.updateConfig(editConfig.id, config);
      } else if (selectedProvider === UsageProvider.COPILOT && selectedAuthType === AuthType.OAUTH) {
        if (!copilotAuth.tempCredentialId) {
          setError('Complete GitHub authorization before adding Copilot.');
          setSaving(false);
          return;
        }

        await apiService.completeCopilotAuth({
          tempCredentialId: copilotAuth.tempCredentialId,
          name: name.trim(),
          refreshInterval,
        });
      } else {
        const credentials = buildCredentialFromForm();
        
        const config: ProviderConfig = {
          provider: selectedProvider,
          credentials,
          refreshInterval,
          region: selectedRegion || undefined,
          name: name || undefined,
          claudeAuthMode: selectedProvider === UsageProvider.CLAUDE
            ? (selectedAuthType === AuthType.OAUTH ? 'oauth' : 'cookie')
            : undefined,
          plan: selectedProvider === UsageProvider.CLAUDE ? (claudePlan || undefined) : undefined,
          opencodeWorkspaceId: selectedProvider === UsageProvider.OPENCODE
            ? (opencodeWorkspaceId.trim() || undefined)
            : undefined,
          defaultProgressItem: defaultProgressItem.trim() || undefined,
          attrs: selectedProvider === UsageProvider.ANTIGRAVITY
            ? {
              antigravity: {
                displayMode: antigravityDisplayMode,
                ...(antigravityPoolConfig ? { poolConfig: antigravityPoolConfig } : {}),
              },
            }
            : undefined,
        };

        await credentialService.saveConfig(selectedProvider, config);
      }
      onSuccess();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const isCopilotOAuth = selectedProvider === UsageProvider.COPILOT && selectedAuthType === AuthType.OAUTH;
  const isClaudeOAuth = selectedProvider === UsageProvider.CLAUDE && selectedAuthType === AuthType.OAUTH;
  const isCodexOAuth = selectedProvider === UsageProvider.CODEX && selectedAuthType === AuthType.OAUTH;
  const isAntigravityOAuth = selectedProvider === UsageProvider.ANTIGRAVITY && selectedAuthType === AuthType.OAUTH;
  const isCookieInput = selectedAuthType === AuthType.COOKIE;
  const isSensitiveCredential = selectedAuthType === AuthType.COOKIE
    || selectedAuthType === AuthType.API_KEY
    || selectedAuthType === AuthType.JWT
    || selectedAuthType === AuthType.OAUTH;
  const showCopilotDeviceFlow = !isEditMode && isCopilotOAuth;
  const requiresCredentialInput = !showCopilotDeviceFlow;
  const hasClaudeAccessToken = claudeOAuth.accessToken.trim().length > 0;
  const hasCodexAccessToken = codexOAuth.accessToken.trim().length > 0;
  const hasAntigravityAccessToken = antigravityOAuth.accessToken.trim().length > 0;
  const isSubmitDisabled = !selectedProvider
    || !name.trim()
    || (requiresCredentialInput && !isClaudeOAuth && !isCodexOAuth && !isAntigravityOAuth && !credentialValue)
    || (isClaudeOAuth && !hasClaudeAccessToken)
    || (isCodexOAuth && !hasCodexAccessToken)
    || (isAntigravityOAuth && !hasAntigravityAccessToken)
    || (showCopilotDeviceFlow && !copilotAuth.tempCredentialId)
    || saving;

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center p-4 pt-[10vh] pb-[10vh]">
      <div 
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />
      <div className="relative w-full max-w-lg max-h-[80vh] bg-[var(--color-surface)] rounded-2xl shadow-2xl animate-fade-in overflow-hidden flex flex-col">
        <form onSubmit={handleSubmit} className="flex flex-1 min-h-0 flex-col">
          <div className="shrink-0 border-b border-[var(--color-border-subtle)] px-6 py-4">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-semibold text-[var(--color-text-primary)]">
                {isEditMode ? 'Edit Provider' : 'Add Provider'}
              </h2>
              <button
                type="button"
                onClick={onClose}
                className="w-8 h-8 flex items-center justify-center rounded-lg text-[var(--color-text-muted)] hover:bg-[var(--color-bg-subtle)] transition-colors"
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M18 6 6 18M6 6l12 12"/>
                </svg>
              </button>
            </div>
          </div>

          <div className="flex-1 min-h-0 overflow-y-auto px-6 py-5">
            <div className="space-y-5">
            <div>
              <label className="block text-xs font-medium text-[var(--color-text-secondary)] tracking-wide mb-2">
                Select Provider
              </label>
              <SelectField
                value={selectedProvider}
                onChange={(value) => handleProviderChange(value as UsageProvider)}
                options={availableProviders.map((provider) => ({
                  value: provider,
                  label: PROVIDER_NAMES[provider],
                  icon: <ProviderLogo provider={provider} size="sm" frame="none" />,
                }))}
                placeholder="Choose a provider..."
                className="input-field select-field"
                disabled={isEditMode}
              />
            </div>

            {selectedProvider && (
              <div className="space-y-4 animate-fade-in">
                <div>
                  <label className="block text-xs font-medium text-[var(--color-text-secondary)] tracking-wide mb-2">
                    Name <span className="text-[var(--color-error)]">*</span>
                  </label>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder={`${PROVIDER_NAMES[selectedProvider]} - My Custom Name`}
                    className="input-field"
                  />
                  <p className="mt-1.5 text-xs text-[var(--color-text-muted)]">
                    Required. This name will be displayed on the dashboard.
                  </p>
                </div>

                {hasRegionSupport && (
                  <div>
                    <label className="block text-xs font-medium text-[var(--color-text-secondary)] tracking-wide mb-2">
                      Region
                    </label>
                    <SelectField
                      value={selectedRegion}
                      onChange={setSelectedRegion}
                      options={availableRegions.map((region) => ({
                        value: region.id,
                        label: region.displayName,
                      }))}
                      className="input-field select-field"
                    />
                  </div>
                )}

                <>
                  <div>
                    <label className="block text-xs font-medium text-[var(--color-text-secondary)] tracking-wide mb-2">
                      Authentication Type
                    </label>
                    <SelectField
                      value={selectedAuthType}
                      onChange={(value) => handleAuthTypeChange(value as AuthType)}
                      options={getAuthTypesForProvider(selectedProvider).map((authType) => ({
                        value: authType,
                        label: getAuthTypeLabel(authType, selectedProvider),
                      }))}
                      className="input-field select-field"
                    />
                  </div>

                  {showCopilotDeviceFlow ? (
                    <div
                      className={`rounded-2xl border p-4 space-y-3 ${
                        copilotAuth.status === 'authorized'
                          ? 'border-emerald-200 bg-emerald-50/70'
                          : copilotAuth.status === 'error' || copilotAuth.status === 'expired'
                            ? 'border-rose-200 bg-rose-50/70'
                            : 'border-[var(--color-border-subtle)] bg-[var(--color-bg-subtle)]'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="inline-flex items-center rounded-full border border-[var(--color-border-subtle)] bg-[var(--color-surface)] px-2.5 py-0.5 text-[11px] font-medium text-[var(--color-text-secondary)]">
                            GitHub Device Flow
                          </div>
                          <h3 className="mt-2 text-sm font-semibold text-[var(--color-text-primary)]">
                            Sign in with GitHub
                          </h3>
                          <p className="mt-1 text-xs leading-relaxed text-[var(--color-text-tertiary)]">
                            Open GitHub device authorization, approve access, then return here to finish.
                            Token data is stored only on this server.
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={handleCopilotSignIn}
                          disabled={copilotAuth.loading || saving}
                          className="shrink-0 px-3.5 py-2 rounded-lg text-xs font-semibold bg-[var(--color-accent)] text-white hover:opacity-95 disabled:opacity-60 disabled:cursor-not-allowed transition"
                        >
                          {copilotAuth.loading ? 'Starting...' : copilotAuth.status === 'authorized' ? 'Re-authorize' : 'Sign in'}
                        </button>
                      </div>

                      {!copilotAuth.userCode && (
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                          <div className="rounded-lg border border-[var(--color-border-subtle)] bg-[var(--color-surface)] px-3 py-2 text-[11px] text-[var(--color-text-secondary)]">
                            1. Click <span className="font-semibold text-[var(--color-text-primary)]">Sign in</span>
                          </div>
                          <div className="rounded-lg border border-[var(--color-border-subtle)] bg-[var(--color-surface)] px-3 py-2 text-[11px] text-[var(--color-text-secondary)]">
                            2. Enter code on GitHub
                          </div>
                          <div className="rounded-lg border border-[var(--color-border-subtle)] bg-[var(--color-surface)] px-3 py-2 text-[11px] text-[var(--color-text-secondary)]">
                            3. Return and save provider
                          </div>
                        </div>
                      )}

                      {copilotAuth.userCode && (
                        <div className="rounded-lg bg-[var(--color-surface)] border border-[var(--color-border-subtle)] p-3">
                          <div className="text-[11px] tracking-wide text-[var(--color-text-secondary)] mb-1">
                            Device Code
                          </div>
                          <div className="text-lg font-semibold tracking-[0.2em] text-[var(--color-text-primary)]">
                            {copilotAuth.userCode}
                          </div>
                          <div className="mt-3 flex gap-2">
                            <button
                              type="button"
                              onClick={handleCopyCopilotCode}
                              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition duration-150 active:scale-95 ${
                                copilotCodeCopied
                                  ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                                  : 'bg-[var(--color-bg-subtle)] text-[var(--color-text-primary)]'
                              }`}
                            >
                              {copilotCodeCopied ? 'Copied' : 'Copy Code'}
                            </button>
                            <button
                              type="button"
                              onClick={handleOpenCopilotVerification}
                              className="px-3 py-1.5 rounded-lg text-xs font-medium bg-[var(--color-bg-subtle)] text-[var(--color-text-primary)]"
                            >
                              Open GitHub
                            </button>
                          </div>
                        </div>
                      )}

                      {(copilotAuth.status === 'pending'
                        || copilotAuth.status === 'authorized'
                        || copilotAuth.status === 'expired'
                        || copilotAuth.status === 'error') && (
                        <div
                          className={`rounded-lg border px-3 py-2 text-xs ${
                            copilotAuth.status === 'authorized'
                              ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                              : copilotAuth.status === 'pending'
                                ? 'border-amber-200 bg-amber-50 text-amber-800'
                                : 'border-rose-200 bg-rose-50 text-rose-800'
                          }`}
                        >
                          {copilotAuth.status === 'pending' && (copilotAuth.error || 'Waiting for GitHub authorization...')}
                          {copilotAuth.status === 'authorized' && 'GitHub authorization completed. You can add this provider now.'}
                          {(copilotAuth.status === 'error' || copilotAuth.status === 'expired') && (
                            copilotAuth.error || (copilotAuth.status === 'expired'
                              ? 'This authorization expired. Start sign-in again.'
                              : 'GitHub authorization failed.')
                          )}
                        </div>
                      )}

                      {copilotAuth.expiresAt && (
                        <p className="text-xs text-[var(--color-text-tertiary)]">
                          Expires at {formatDateTime(copilotAuth.expiresAt)}
                        </p>
                      )}
                    </div>
                  ) : (
                    isClaudeOAuth ? (
                      <div className="rounded-xl border border-[var(--color-border-subtle)] bg-[var(--color-bg-subtle)] p-4 space-y-4">
                        <div className="rounded-lg border border-[var(--color-border-subtle)] bg-[var(--color-surface)] p-3 space-y-2">
                          <p className="text-xs font-medium text-[var(--color-text-secondary)]">Auto Fill (Link Auth)</p>
                          <p className="text-xs text-[var(--color-text-tertiary)]">
                            This helper exchanges the callback code and auto-fills the inputs below. You can still edit any field manually.
                          </p>
                          <div className="flex flex-wrap items-center gap-2">
                            <button
                              type="button"
                              disabled={claudeLinkOAuth.loading}
                              onClick={async () => {
                                setClaudeLinkOAuth((prev) => ({ ...prev, loading: true, error: undefined }));
                                try {
                                  const result = await apiService.generateClaudeOAuthUrl();
                                  setClaudeLinkOAuth((prev) => ({
                                    ...prev,
                                    sessionId: result.sessionId,
                                    authUrl: result.authUrl,
                                    step: 'generated',
                                    loading: false,
                                  }));
                                } catch (err) {
                                  setClaudeLinkOAuth((prev) => ({
                                    ...prev,
                                    loading: false,
                                    error: err instanceof Error ? err.message : 'Failed to generate link',
                                  }));
                                }
                              }}
                              className="px-3.5 py-2 rounded-lg text-xs font-semibold bg-[var(--color-accent)] text-white hover:opacity-95 disabled:opacity-60 disabled:cursor-not-allowed transition"
                            >
                              {claudeLinkOAuth.loading && claudeLinkOAuth.step === 'idle' ? 'Generating...' : claudeLinkOAuth.step !== 'idle' ? 'Regenerate Link' : 'Generate Authorization Link'}
                            </button>
                            {claudeLinkOAuth.authUrl && (
                              <a
                                href={claudeLinkOAuth.authUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-semibold border border-[var(--color-border-subtle)] bg-[var(--color-bg-subtle)] text-[var(--color-text-primary)] hover:bg-[var(--color-surface)] transition"
                              >
                                Open Authorization Link
                              </a>
                            )}
                          </div>
                          <input
                            type="text"
                            value={claudeLinkOAuth.code}
                            onChange={(e) => setClaudeLinkOAuth((prev) => ({ ...prev, code: e.target.value }))}
                            placeholder="Paste callback URL or code(#state) here..."
                            className="input-field font-mono text-xs"
                            spellCheck={false}
                            autoCapitalize="off"
                            autoCorrect="off"
                          />
                          <button
                            type="button"
                            disabled={claudeLinkOAuth.loading || !claudeLinkOAuth.code.trim() || !claudeLinkOAuth.sessionId}
                            onClick={async () => {
                              setClaudeLinkOAuth((prev) => ({ ...prev, loading: true, error: undefined }));
                              try {
                                const parsed = parseOAuthCallbackInput(claudeLinkOAuth.code);
                                if (!parsed.code) {
                                  throw new Error('Please paste a valid authorization code or callback URL.');
                                }
                                const tokenInfo = await apiService.exchangeClaudeOAuthCode(claudeLinkOAuth.sessionId, parsed.code, parsed.state);
                                setClaudeOAuth((prev) => ({
                                  ...prev,
                                  accessToken: tokenInfo.accessToken || prev.accessToken,
                                  refreshToken: tokenInfo.refreshToken || prev.refreshToken,
                                  clientId: tokenInfo.clientId || prev.clientId,
                                  expiresAt: tokenInfo.expiresAt || prev.expiresAt,
                                }));
                                setClaudeLinkOAuth((prev) => ({ ...prev, loading: false, step: 'exchanged' }));
                              } catch (err) {
                                setClaudeLinkOAuth((prev) => ({
                                  ...prev,
                                  loading: false,
                                  error: err instanceof Error ? err.message : 'Failed to auto fill tokens',
                                }));
                              }
                            }}
                            className="px-3.5 py-2 rounded-lg text-xs font-semibold bg-[var(--color-accent)] text-white hover:opacity-95 disabled:opacity-60 disabled:cursor-not-allowed transition"
                          >
                            {claudeLinkOAuth.loading ? 'Auto Filling...' : 'Auto Fill Inputs'}
                          </button>

                          {claudeLinkOAuth.step === 'exchanged' && (
                            <div className="rounded-lg border border-emerald-200 bg-emerald-50/70 px-3 py-2 text-xs text-emerald-800">
                              Inputs auto-filled. Review values below, then click Add Provider.
                            </div>
                          )}
                          {claudeLinkOAuth.error && (
                            <div className="rounded-lg border border-rose-200 bg-rose-50/70 px-3 py-2 text-xs text-rose-800">
                              {claudeLinkOAuth.error}
                            </div>
                          )}
                        </div>

                        <OAuthField
                          label="Access Token"
                          type="password"
                          value={claudeOAuth.accessToken}
                          onChange={(value) => setClaudeOAuth((prev) => ({ ...prev, accessToken: value }))}
                          placeholder="eyJ..."
                          required
                          help="Required."
                        />
                        <OAuthField
                          label="Refresh Token"
                          type="password"
                          value={claudeOAuth.refreshToken}
                          onChange={(value) => setClaudeOAuth((prev) => ({ ...prev, refreshToken: value }))}
                          placeholder="..."
                          help="Optional. Required for auto refresh together with Client ID."
                        />
                        <OAuthField
                          label="Client ID"
                          value={claudeOAuth.clientId}
                          onChange={(value) => setClaudeOAuth((prev) => ({ ...prev, clientId: value }))}
                          placeholder="9d1c250a-e61b-44d9-88ed-5944d1962f5e"
                          help="Optional. Used for OAuth token refresh."
                        />
                        <OAuthField
                          label="Expiry Time"
                          value={claudeOAuth.expiresAt}
                          onChange={(value) => setClaudeOAuth((prev) => ({ ...prev, expiresAt: value }))}
                          placeholder="1735689600000 or 2026-02-28T12:00:00Z"
                          help="Optional. Supports unix milliseconds or ISO time."
                        />

                        <div className="rounded-lg border border-[var(--color-border-subtle)] bg-[var(--color-surface)] px-3 py-2 text-xs text-[var(--color-text-secondary)] space-y-1">
                          <p className="font-medium text-[var(--color-text-primary)]">Manual Fill Notes</p>
                          <p>Linux: Access Token / Refresh Token can be viewed via:</p>
                          <CommandCopyLine command="cat ~/.claude/.credentials.json" />
                          <p>macOS: Access Token / Refresh Token can be viewed via:</p>
                          <CommandCopyLine command={'security find-generic-password -s "Claude Code-credentials" -w'} />
                          <p>For Client ID and Expiry Time, the macOS lookup method is currently unclear.</p>
                        </div>
                      </div>
                    ) : isCodexOAuth ? (
                      <div className="rounded-xl border border-[var(--color-border-subtle)] bg-[var(--color-bg-subtle)] p-4 space-y-4">
                        <div className="rounded-lg border border-[var(--color-border-subtle)] bg-[var(--color-surface)] p-3 space-y-2">
                          <p className="text-xs font-medium text-[var(--color-text-secondary)]">Auto Fill (Link Auth)</p>
                          <p className="text-xs text-[var(--color-text-tertiary)]">
                            Paste callback URL or code(#state), then auto-fill OAuth fields below.
                          </p>
                          <div className="flex flex-wrap items-center gap-2">
                            <button
                              type="button"
                              disabled={codexLinkOAuth.loading}
                              onClick={async () => {
                                setCodexLinkOAuth((prev) => ({ ...prev, loading: true, error: undefined }));
                                try {
                                  const result = await apiService.generateCodexOAuthUrl();
                                  setCodexLinkOAuth((prev) => ({
                                    ...prev,
                                    sessionId: result.sessionId,
                                    authUrl: result.authUrl,
                                    step: 'generated',
                                    loading: false,
                                  }));
                                } catch (err) {
                                  setCodexLinkOAuth((prev) => ({
                                    ...prev,
                                    loading: false,
                                    error: err instanceof Error ? err.message : 'Failed to generate link',
                                  }));
                                }
                              }}
                              className="px-3.5 py-2 rounded-lg text-xs font-semibold bg-[var(--color-accent)] text-white hover:opacity-95 disabled:opacity-60 disabled:cursor-not-allowed transition"
                            >
                              {codexLinkOAuth.loading && codexLinkOAuth.step === 'idle' ? 'Generating...' : codexLinkOAuth.step !== 'idle' ? 'Regenerate Link' : 'Generate Authorization Link'}
                            </button>
                            {codexLinkOAuth.authUrl && (
                              <a
                                href={codexLinkOAuth.authUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-semibold border border-[var(--color-border-subtle)] bg-[var(--color-bg-subtle)] text-[var(--color-text-primary)] hover:bg-[var(--color-surface)] transition"
                              >
                                Open Authorization Link
                              </a>
                            )}
                          </div>
                          <input
                            type="text"
                            value={codexLinkOAuth.code}
                            onChange={(e) => setCodexLinkOAuth((prev) => ({ ...prev, code: e.target.value }))}
                            placeholder="Paste callback URL or code(#state) here..."
                            className="input-field font-mono text-xs"
                            spellCheck={false}
                            autoCapitalize="off"
                            autoCorrect="off"
                          />
                          <button
                            type="button"
                            disabled={codexLinkOAuth.loading || !codexLinkOAuth.code.trim() || !codexLinkOAuth.sessionId}
                            onClick={async () => {
                              setCodexLinkOAuth((prev) => ({ ...prev, loading: true, error: undefined }));
                              try {
                                const parsed = parseOAuthCallbackInput(codexLinkOAuth.code);
                                if (!parsed.code) {
                                  throw new Error('Please paste a valid authorization code or callback URL.');
                                }
                                const tokenInfo = await apiService.exchangeCodexOAuthCode(codexLinkOAuth.sessionId, parsed.code, parsed.state);
                                setCodexOAuth((prev) => ({
                                  ...prev,
                                  accessToken: tokenInfo.accessToken || prev.accessToken,
                                  refreshToken: tokenInfo.refreshToken || prev.refreshToken,
                                  clientId: tokenInfo.clientId || prev.clientId,
                                  expiresAt: tokenInfo.expiresAt || prev.expiresAt,
                                }));
                                setCodexLinkOAuth((prev) => ({ ...prev, loading: false, step: 'exchanged' }));
                              } catch (err) {
                                setCodexLinkOAuth((prev) => ({
                                  ...prev,
                                  loading: false,
                                  error: err instanceof Error ? err.message : 'Failed to auto fill tokens',
                                }));
                              }
                            }}
                            className="px-3.5 py-2 rounded-lg text-xs font-semibold bg-[var(--color-accent)] text-white hover:opacity-95 disabled:opacity-60 disabled:cursor-not-allowed transition"
                          >
                            {codexLinkOAuth.loading ? 'Auto Filling...' : 'Auto Fill Inputs'}
                          </button>

                          {codexLinkOAuth.step === 'exchanged' && (
                            <div className="rounded-lg border border-emerald-200 bg-emerald-50/70 px-3 py-2 text-xs text-emerald-800">
                              Inputs auto-filled. Review values below, then click Add Provider.
                            </div>
                          )}
                          {codexLinkOAuth.error && (
                            <div className="rounded-lg border border-rose-200 bg-rose-50/70 px-3 py-2 text-xs text-rose-800">
                              {codexLinkOAuth.error}
                            </div>
                          )}
                        </div>

                        <OAuthField
                          label="Access Token"
                          type="password"
                          value={codexOAuth.accessToken}
                          onChange={(value) => setCodexOAuth((prev) => ({ ...prev, accessToken: value }))}
                          placeholder="eyJ..."
                          required
                          help="Required."
                        />
                        <OAuthField
                          label="Refresh Token"
                          type="password"
                          value={codexOAuth.refreshToken}
                          onChange={(value) => setCodexOAuth((prev) => ({ ...prev, refreshToken: value }))}
                          placeholder="..."
                          help="Optional. Required for token auto refresh."
                        />
                        <OAuthField
                          label="Client ID"
                          value={codexOAuth.clientId}
                          onChange={(value) => setCodexOAuth((prev) => ({ ...prev, clientId: value }))}
                          placeholder="app_EMoamEEZ73f0CkXaXp7hrann"
                          help="Optional. Defaults to Codex official OAuth client if empty."
                        />
                        <OAuthField
                          label="Expiry Time"
                          value={codexOAuth.expiresAt}
                          onChange={(value) => setCodexOAuth((prev) => ({ ...prev, expiresAt: value }))}
                          placeholder="1735689600000 or 2026-02-28T12:00:00Z"
                          help="Optional. Supports unix milliseconds or ISO time."
                        />

                        <div className="rounded-lg border border-[var(--color-border-subtle)] bg-[var(--color-surface)] px-3 py-2 text-xs text-[var(--color-text-secondary)] space-y-1">
                          <p className="font-medium text-[var(--color-text-primary)]">Manual Fill Notes</p>
                          <p>You can read token data from:</p>
                          <CommandCopyLine command="cat ~/.codex/auth.json" />
                          <p>Or paste callback URL / code(#state) above to auto-fill.</p>
                        </div>
                      </div>
                    ) : isAntigravityOAuth ? (
                      <div className="rounded-xl border border-[var(--color-border-subtle)] bg-[var(--color-bg-subtle)] p-4 space-y-4">
                        <div className="rounded-lg border border-[var(--color-border-subtle)] bg-[var(--color-surface)] p-3 space-y-2">
                          <p className="text-xs font-medium text-[var(--color-text-secondary)]">Auto Fill (Link Auth)</p>
                          <p className="text-xs text-[var(--color-text-tertiary)]">
                            Paste callback URL or code(#state), then auto-fill OAuth fields below.
                          </p>
                          <div className="flex flex-wrap items-center gap-2">
                            <button
                              type="button"
                              disabled={antigravityLinkOAuth.loading}
                              onClick={async () => {
                                setAntigravityLinkOAuth((prev) => ({ ...prev, loading: true, error: undefined }));
                                try {
                                  const result = await apiService.generateAntigravityOAuthUrl();
                                  setAntigravityLinkOAuth((prev) => ({
                                    ...prev,
                                    sessionId: result.sessionId,
                                    authUrl: result.authUrl,
                                    step: 'generated',
                                    loading: false,
                                  }));
                                } catch (err) {
                                  setAntigravityLinkOAuth((prev) => ({
                                    ...prev,
                                    loading: false,
                                    error: err instanceof Error ? err.message : 'Failed to generate link',
                                  }));
                                }
                              }}
                              className="px-3.5 py-2 rounded-lg text-xs font-semibold bg-[var(--color-accent)] text-white hover:opacity-95 disabled:opacity-60 disabled:cursor-not-allowed transition"
                            >
                              {antigravityLinkOAuth.loading && antigravityLinkOAuth.step === 'idle' ? 'Generating...' : antigravityLinkOAuth.step !== 'idle' ? 'Regenerate Link' : 'Generate Authorization Link'}
                            </button>
                            {antigravityLinkOAuth.authUrl && (
                              <a
                                href={antigravityLinkOAuth.authUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-semibold border border-[var(--color-border-subtle)] bg-[var(--color-bg-subtle)] text-[var(--color-text-primary)] hover:bg-[var(--color-surface)] transition"
                              >
                                Open Authorization Link
                              </a>
                            )}
                          </div>
                          <input
                            type="text"
                            value={antigravityLinkOAuth.code}
                            onChange={(e) => setAntigravityLinkOAuth((prev) => ({ ...prev, code: e.target.value }))}
                            placeholder="Paste callback URL or code(#state) here..."
                            className="input-field font-mono text-xs"
                            spellCheck={false}
                            autoCapitalize="off"
                            autoCorrect="off"
                          />
                          <button
                            type="button"
                            disabled={antigravityLinkOAuth.loading || !antigravityLinkOAuth.code.trim() || !antigravityLinkOAuth.sessionId}
                            onClick={async () => {
                              setAntigravityLinkOAuth((prev) => ({ ...prev, loading: true, error: undefined }));
                              try {
                                const parsed = parseOAuthCallbackInput(antigravityLinkOAuth.code);
                                if (!parsed.code) {
                                  throw new Error('Please paste a valid authorization code or callback URL.');
                                }
                                const tokenInfo = await apiService.exchangeAntigravityOAuthCode(antigravityLinkOAuth.sessionId, parsed.code, parsed.state);
                                setAntigravityOAuth((prev) => ({
                                  ...prev,
                                  accessToken: tokenInfo.accessToken || prev.accessToken,
                                  refreshToken: tokenInfo.refreshToken || prev.refreshToken,
                                  clientId: tokenInfo.clientId || prev.clientId,
                                  projectId: tokenInfo.projectId || prev.projectId,
                                  expiresAt: tokenInfo.expiresAt || prev.expiresAt,
                                }));
                                setAntigravityLinkOAuth((prev) => ({ ...prev, loading: false, step: 'exchanged' }));
                              } catch (err) {
                                setAntigravityLinkOAuth((prev) => ({
                                  ...prev,
                                  loading: false,
                                  error: err instanceof Error ? err.message : 'Failed to auto fill tokens',
                                }));
                              }
                            }}
                            className="px-3.5 py-2 rounded-lg text-xs font-semibold bg-[var(--color-accent)] text-white hover:opacity-95 disabled:opacity-60 disabled:cursor-not-allowed transition"
                          >
                            {antigravityLinkOAuth.loading ? 'Auto Filling...' : 'Auto Fill Inputs'}
                          </button>

                          {antigravityLinkOAuth.step === 'exchanged' && (
                            <div className="rounded-lg border border-emerald-200 bg-emerald-50/70 px-3 py-2 text-xs text-emerald-800">
                              Inputs auto-filled. Review values below, then click Add Provider.
                            </div>
                          )}
                          {antigravityLinkOAuth.error && (
                            <div className="rounded-lg border border-rose-200 bg-rose-50/70 px-3 py-2 text-xs text-rose-800">
                              {antigravityLinkOAuth.error}
                            </div>
                          )}
                        </div>

                        <OAuthField
                          label="Access Token"
                          type="password"
                          value={antigravityOAuth.accessToken}
                          onChange={(value) => setAntigravityOAuth((prev) => ({ ...prev, accessToken: value }))}
                          placeholder="ya29...."
                          required
                          help="Required."
                        />
                        <OAuthField
                          label="Refresh Token"
                          type="password"
                          value={antigravityOAuth.refreshToken}
                          onChange={(value) => setAntigravityOAuth((prev) => ({ ...prev, refreshToken: value }))}
                          placeholder="1//..."
                          help="Optional. Needed for automatic token refresh."
                        />
                        <OAuthField
                          label="Client ID"
                          value={antigravityOAuth.clientId}
                          onChange={(value) => setAntigravityOAuth((prev) => ({ ...prev, clientId: value }))}
                          placeholder="1071006060591-....apps.googleusercontent.com"
                          help="Optional. Defaults to official Antigravity OAuth client."
                        />
                        <OAuthField
                          label="Project ID"
                          value={antigravityOAuth.projectId}
                          onChange={(value) => setAntigravityOAuth((prev) => ({ ...prev, projectId: value }))}
                          placeholder="projects/..."
                          help="Optional. Auto-filled if exchange succeeds; can also be resolved during fetch."
                        />
                        <OAuthField
                          label="Expiry Time"
                          value={antigravityOAuth.expiresAt}
                          onChange={(value) => setAntigravityOAuth((prev) => ({ ...prev, expiresAt: value }))}
                          placeholder="1735689600000 or 2026-02-28T12:00:00Z"
                          help="Optional. Supports unix milliseconds or ISO time."
                        />
                      </div>
                    ) : (
                      <div>
                        <label className="block text-xs font-medium text-[var(--color-text-secondary)] tracking-wide mb-2">
                          {getCredentialLabel(selectedAuthType, selectedProvider)}
                        </label>
                        {isCookieInput ? (
                          <SensitiveInput
                            multiline
                            value={credentialValue}
                            onChange={setCredentialValue}
                            placeholder={getCredentialPlaceholder(selectedAuthType, selectedProvider)}
                            visible={showCredentialValue}
                            onToggleVisibility={() => setShowCredentialValue((prev) => !prev)}
                            className="input-field min-h-[110px] resize-y"
                            spellCheck={false}
                            autoCapitalize="off"
                            autoCorrect="off"
                          />
                        ) : (
                          <SensitiveInput
                            type={isSensitiveCredential && !showCredentialValue ? 'password' : 'text'}
                            value={credentialValue}
                            onChange={setCredentialValue}
                            placeholder={getCredentialPlaceholder(selectedAuthType, selectedProvider)}
                            visible={showCredentialValue}
                            onToggleVisibility={() => setShowCredentialValue((prev) => !prev)}
                            className="input-field"
                            spellCheck={false}
                            autoCapitalize="off"
                            autoCorrect="off"
                          />
                        )}
                        <p className="mt-1.5 text-xs text-[var(--color-text-muted)]">
                          {getCredentialHelp(selectedProvider, selectedAuthType, selectedRegion)}
                        </p>
                      </div>
                    )
                  )}
                </>

                {selectedProvider === UsageProvider.OPENCODE && (
                  <div>
                    <label className="block text-xs font-medium text-[var(--color-text-secondary)] tracking-wide mb-2">
                      Workspace ID
                    </label>
                    <input
                      type="text"
                      value={opencodeWorkspaceId}
                      onChange={(e) => setOpencodeWorkspaceId(e.target.value)}
                      placeholder="wrk_...(Optional)"
                      className="input-field"
                    />
                    <p className="mt-1.5 text-xs text-[var(--color-text-muted)]">
                      <span className="block">Optional. How to get `workspace ID`:</span>
                      <span className="block">
                        1. Open
                        {' '}
                        <a
                          href="https://opencode.ai/zen"
                          target="_blank"
                          rel="noreferrer"
                          className="text-[#1d4ed8] hover:text-[#1e40af] underline decoration-[#1d4ed8]/60 underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1d4ed8]/40 rounded-sm"
                        >
                          OpenCode Zen
                        </a>
                        {' '}
                        and sign in.
                      </span>
                      <span className="block">2. Copy the value after `workspace/` in the address bar.</span>
                      <span className="block">3. Paste the `wrk_...` value here.</span>
                    </p>
                  </div>
                )}

                {selectedProvider === UsageProvider.CLAUDE && (
                  <div>
                    <label className="block text-xs font-medium text-[var(--color-text-secondary)] tracking-wide mb-2">
                      Claude Plan (optional)
                    </label>
                    <SelectField
                      value={claudePlan}
                      onChange={(value) => setClaudePlan(String(value))}
                      options={CLAUDE_PLAN_OPTIONS}
                      className="input-field select-field"
                    />
                    <p className="mt-1.5 text-xs text-[var(--color-text-muted)]">
                      Optional. Used as stored plan metadata and to improve Claude usage window interpretation.
                    </p>
                  </div>
                )}

                {selectedProvider === UsageProvider.ANTIGRAVITY && (
                  <div className="space-y-3">
                    <label className="block text-xs font-medium text-[var(--color-text-secondary)] tracking-wide">
                      Antigravity Display Mode
                    </label>
                    <SelectField
                      value={antigravityDisplayMode}
                      onChange={(value) => setAntigravityDisplayMode(value as AntigravityDisplayMode)}
                      options={[
                        { value: 'pool', label: 'Pool (Claude / Gemini Pro / Gemini Flash)' },
                        { value: 'models', label: 'All models' },
                      ]}
                      className="input-field select-field"
                    />
                    <div>
                      <label className="block text-xs font-medium text-[var(--color-text-secondary)] tracking-wide mb-2">
                        Pool Config (JSON, optional)
                      </label>
                      <textarea
                        value={antigravityPoolConfigText}
                        onChange={(e) => setAntigravityPoolConfigText(e.target.value)}
                        placeholder={'{\"Claude\":[\"claude\",\"gpt-oss\"],\"Gemini Pro\":[\"gemini\",\"pro\"],\"Gemini Flash\":[\"gemini\",\"flash\"]}'}
                        className="input-field min-h-[96px] resize-y font-mono text-xs"
                        spellCheck={false}
                        autoCapitalize="off"
                        autoCorrect="off"
                      />
                      <p className="mt-1.5 text-xs text-[var(--color-text-muted)]">
                        Optional. Override model-to-pool matching rules for dashboard display.
                      </p>
                    </div>
                  </div>
                )}

                <div>
                  <label className="block text-xs font-medium text-[var(--color-text-secondary)] tracking-wide mb-2">
                    Refresh Interval
                  </label>
                  <SelectField
                    value={refreshInterval}
                    onChange={setRefreshInterval}
                    options={REFRESH_INTERVAL_OPTIONS}
                    className="input-field select-field"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-[var(--color-text-secondary)] tracking-wide mb-2">
                    Default Progress Item (optional)
                  </label>
                  {isEditMode && availableProgressItems && availableProgressItems.length > 0 ? (
                    <SelectField
                      value={defaultProgressItem}
                      onChange={setDefaultProgressItem}
                      options={[
                        { value: '', label: '— Default (first item) —' },
                        ...availableProgressItems.map((n) => ({ value: n, label: n })),
                      ]}
                      className="input-field select-field"
                    />
                  ) : (
                    <input
                      type="text"
                      value={defaultProgressItem}
                      onChange={(e) => setDefaultProgressItem(e.target.value)}
                      placeholder="e.g., Primary — defaults to first item"
                      className="input-field"
                    />
                  )}
                </div>
              </div>
            )}
            </div>
          </div>

          <div className="shrink-0 space-y-3 border-t border-[var(--color-border-subtle)] px-4 py-4 sm:px-6">
            {error && (
              <div className="flex items-center gap-2 p-3 rounded-lg text-sm bg-[var(--color-error-subtle)] text-[#dc2626]">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="10"/>
                  <path d="M12 8v4M12 16h.01"/>
                </svg>
                {error}
              </div>
            )}

            <div className="grid grid-cols-1 gap-2.5 pt-2 sm:grid-cols-2 sm:gap-3">
              <button
                type="button"
                onClick={onClose}
                className="w-full min-h-11 rounded-lg bg-[var(--color-bg-subtle)] px-4 py-2.5 text-sm font-medium text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-border-subtle)]"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSubmitDisabled}
                className="btn-primary min-h-11 w-full px-4 py-2.5"
              >
                {saving ? (
                  <>
                    <LoadingSpinner size="sm" />
                    <span>Saving...</span>
                  </>
                ) : (
                  <>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M20 6 9 17l-5-5"/>
                    </svg>
                    <span>{isEditMode ? 'Save Changes' : 'Add Provider'}</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};

function formatDateTime(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  const seconds = String(date.getSeconds()).padStart(2, '0');
  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
}

function parseOAuthCallbackInput(input: string): { code: string; state?: string } {
  const value = input.trim();
  if (!value) return { code: '' };

  if (value.startsWith('http://') || value.startsWith('https://')) {
    try {
      const callbackURL = new URL(value);
      const code = callbackURL.searchParams.get('code')?.trim() || '';
      const state = callbackURL.searchParams.get('state')?.trim();
      return { code, ...(state ? { state } : {}) };
    } catch {
      return { code: value };
    }
  }

  const hashIndex = value.indexOf('#');
  if (hashIndex >= 0) {
    const code = value.slice(0, hashIndex).trim();
    const state = value.slice(hashIndex + 1).trim();
    return { code, ...(state ? { state } : {}) };
  }

  return { code: value };
}

interface OAuthFieldProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  help: React.ReactNode;
  type?: 'text' | 'password';
  required?: boolean;
}

function OAuthField({
  label,
  value,
  onChange,
  placeholder,
  help,
  type = 'text',
  required = false,
}: OAuthFieldProps): JSX.Element {
  const [visible, setVisible] = useState(type !== 'password');
  useEffect(() => {
    if (type !== 'password') setVisible(true);
  }, [type]);

  return (
    <div>
      <label className="block text-xs font-medium text-[var(--color-text-secondary)] tracking-wide mb-2">
        {label} {required && <span className="text-[var(--color-error)]">*</span>}
      </label>
      <SensitiveInput
        type={type === 'password' && !visible ? 'password' : 'text'}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        className="input-field"
        spellCheck={false}
        visible={visible}
        onToggleVisibility={type === 'password' ? () => setVisible((prev) => !prev) : undefined}
      />
      <div className="mt-1.5 text-xs text-[var(--color-text-muted)]">
        {help}
      </div>
    </div>
  );
}

interface CommandCopyLineProps {
  command: string;
}

function CommandCopyLine({ command }: CommandCopyLineProps): JSX.Element {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(command);
      } else {
        const textArea = document.createElement('textarea');
        textArea.value = command;
        textArea.style.position = 'fixed';
        textArea.style.left = '-999999px';
        document.body.appendChild(textArea);
        textArea.select();
        document.execCommand('copy');
        document.body.removeChild(textArea);
      }
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1200);
    } catch {
      setCopied(false);
    }
  };

  return (
    <button
      type="button"
      onClick={handleCopy}
      className="mt-1 flex w-full items-center justify-between gap-2 rounded-md border border-[var(--color-accent)]/35 bg-[var(--color-accent-subtle)] px-2.5 py-1.5 text-left font-mono text-[11px] leading-5 text-[var(--color-text-primary)] shadow-sm transition-colors hover:border-[var(--color-accent)]/55 hover:bg-[var(--color-surface-hover)]"
      aria-label={`Copy command: ${command}`}
    >
      <span className="min-w-0 flex-1 break-all">{command}</span>
      <span className="shrink-0 text-[var(--color-accent)]" aria-hidden="true">
        {copied ? (
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="m20 6-11 11-5-5" />
          </svg>
        ) : (
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
          </svg>
        )}
      </span>
    </button>
  );
}

interface SensitiveInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  type?: 'text' | 'password';
  multiline?: boolean;
  visible?: boolean;
  onToggleVisibility?: () => void;
  spellCheck?: boolean;
  autoCapitalize?: string;
  autoCorrect?: string;
}

function SensitiveInput({
  value,
  onChange,
  placeholder,
  className = 'input-field',
  type = 'text',
  multiline = false,
  visible = true,
  onToggleVisibility,
  spellCheck,
  autoCapitalize,
  autoCorrect,
}: SensitiveInputProps): JSX.Element {
  const supportsVisibilityToggle = Boolean(onToggleVisibility);
  const reservedRightPadding = supportsVisibilityToggle ? '52px' : undefined;
  const baseInputStyle: React.CSSProperties = reservedRightPadding
    ? { paddingRight: reservedRightPadding }
    : {};
  const obscuredTextareaStyle: React.CSSProperties = {
    ...baseInputStyle,
    ...(multiline ? { overflowWrap: 'anywhere' as const } : {}),
    ...(!visible && multiline ? ({ WebkitTextSecurity: 'disc' } as React.CSSProperties) : {}),
  };

  return (
    <div className="relative">
      {multiline ? (
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className={className}
          style={obscuredTextareaStyle}
          spellCheck={spellCheck}
          autoCapitalize={autoCapitalize}
          autoCorrect={autoCorrect}
        />
      ) : (
        <input
          type={type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className={className}
          style={baseInputStyle}
          spellCheck={spellCheck}
          autoCapitalize={autoCapitalize}
          autoCorrect={autoCorrect}
        />
      )}
      {supportsVisibilityToggle && (
        <>
          <div className="pointer-events-none absolute inset-y-1 right-1 z-[1] w-11 rounded-md bg-[var(--color-surface)]" />
        <button
          type="button"
          onClick={onToggleVisibility}
          className="absolute right-2 top-2.5 z-[2] flex h-8 w-8 items-center justify-center rounded-md text-[var(--color-text-muted)] transition-colors hover:bg-[var(--color-bg-subtle)] hover:text-[var(--color-text-primary)]"
          aria-label={visible ? 'Hide sensitive value' : 'Show sensitive value'}
          title={visible ? 'Hide' : 'Show'}
        >
          {visible ? (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M17.94 17.94A10.94 10.94 0 0 1 12 20C7 20 2.73 16.11 1 12c.78-1.82 2-3.41 3.46-4.66" />
              <path d="M9.9 4.24A10.94 10.94 0 0 1 12 4c5 0 9.27 3.89 11 8a11.65 11.65 0 0 1-4.08 5.19" />
              <path d="M1 1l22 22" />
              <path d="M10.58 10.58A2 2 0 0 0 13.42 13.42" />
            </svg>
          ) : (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8S1 12 1 12Z" />
              <circle cx="12" cy="12" r="3" />
            </svg>
          )}
        </button>
        </>
      )}
    </div>
  );
}

function getAdaptersForProvider(provider: UsageProvider): AuthType[] {
  switch (provider) {
    case UsageProvider.ALIYUN:
      return [AuthType.COOKIE];
    case UsageProvider.CLAUDE:
      return [AuthType.OAUTH, AuthType.COOKIE];
    case UsageProvider.CODEX:
      return [AuthType.OAUTH];
    case UsageProvider.ANTIGRAVITY:
      return [AuthType.OAUTH];
    case UsageProvider.KIMI:
      return [AuthType.COOKIE];
    case UsageProvider.MINIMAX:
    case UsageProvider.OPENROUTER:
    case UsageProvider.ZAI:
      return [AuthType.API_KEY];
    case UsageProvider.COPILOT:
      return [AuthType.OAUTH, AuthType.API_KEY];
    case UsageProvider.OLLAMA:
    case UsageProvider.CURSOR:
    case UsageProvider.OPENCODE:
      return [AuthType.COOKIE];
    default:
      return [AuthType.API_KEY];
  }
}

function getAuthTypesForProvider(provider: UsageProvider): AuthType[] {
  return getAdaptersForProvider(provider);
}

function getAuthTypeLabel(authType: AuthType, provider?: UsageProvider): string {
  switch (authType) {
    case AuthType.COOKIE:
      return 'Browser Cookie';
    case AuthType.API_KEY:
      return 'API Key';
    case AuthType.OAUTH:
      return 'OAuth Token';
    case AuthType.JWT:
      return 'JWT Token';
  }
}

function getCredentialLabel(authType: AuthType, provider?: UsageProvider): string {
  switch (authType) {
    case AuthType.COOKIE:
      if (provider === UsageProvider.ALIYUN) {
        return 'Cookie Value';
      }
      if (provider === UsageProvider.KIMI) {
        return 'Browser Cookie Value (kimi-auth)';
      }
      if (provider === UsageProvider.OLLAMA) {
        return 'Cookie Value';
      }
      return 'Cookie Value';
    case AuthType.API_KEY:
      return 'API Key';
    case AuthType.OAUTH:
      return 'Access Token';
    case AuthType.JWT:
      return 'JWT Token';
  }
}

function getCredentialPlaceholder(authType: AuthType, provider?: UsageProvider): string {
  switch (authType) {
    case AuthType.COOKIE:
      if (provider === UsageProvider.ALIYUN) {
        return 'login_current_pk=...; cna=...; login_aliyunid_ticket=...';
      }
      if (provider === UsageProvider.KIMI) {
        return 'eyJxxx...';
      }
      if (provider === UsageProvider.OLLAMA) {
        return 'aid=...; __Secure-session=...';
      }
      if (provider === UsageProvider.CURSOR) {
        return 'WorkosCursorSessionToken=user_...; or user_...';
      }
      if (provider === UsageProvider.OPENCODE) {
        return 'auth=... or just the auth value';
      }
      return 'sessionKey=xxx...';
    case AuthType.API_KEY:
      if (provider === UsageProvider.COPILOT) {
        return 'paste-your-github-token';
      }
      if (provider === UsageProvider.MINIMAX) {
        return 'sk-cp-...';
      }
      if (provider === UsageProvider.ZAI) {
        return 'sk-...';
      }
      return 'sk-or-v1-xxx...';
    case AuthType.OAUTH:
      if (provider === UsageProvider.ANTIGRAVITY) {
        return 'ya29....';
      }
      return 'eyJxxx...';
    case AuthType.JWT:
      return 'eyJxxx...';
  }
}

function getCredentialHelp(provider: UsageProvider, authType: AuthType, region?: string): React.ReactNode {
  if (provider === UsageProvider.COPILOT && authType === AuthType.OAUTH) {
    return 'Sign in with GitHub to authorize Copilot usage access.';
  }

  if (provider === UsageProvider.ANTIGRAVITY && authType === AuthType.OAUTH) {
    return 'Use Link Auth above or paste Antigravity OAuth tokens manually.';
  }

  if (authType === AuthType.API_KEY) {
    if (provider === UsageProvider.COPILOT) {
      return (
        <div className="space-y-1">
          <div>How to create a GitHub fine-grained token:</div>
          <ol className="list-decimal pl-5 space-y-1">
            <li>Open GitHub Settings.</li>
            <li>Go to Developer settings.</li>
            <li>Open Fine-grained personal access tokens.</li>
            <li>
              Click Generate new token:
              {' '}
              <a
                href="https://github.com/settings/personal-access-tokens/new"
                target="_blank"
                rel="noreferrer"
                className="text-[#1d4ed8] hover:text-[#1e40af] underline decoration-[#1d4ed8]/60 underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1d4ed8]/40 rounded-sm"
              >
                Link
              </a>
            </li>
          </ol>
        </div>
      );
    }
    if (provider === UsageProvider.MINIMAX) {
      const isCNRegion = region === 'minimax_cn' || region === 'cn';
      const codingPlanUrl = isCNRegion
        ? 'https://platform.minimaxi.com/user-center/payment/coding-plan'
        : 'https://platform.minimax.io/user-center/payment/coding-plan';
      return (
        <div className="space-y-1">
          <div>How to get MiniMax API Key:</div>
          <ol className="list-decimal pl-5 space-y-1">
            <li>Select the correct region above first.</li>
            <li>
              Open
              {' '}
              <a
                href={codingPlanUrl}
                target="_blank"
                rel="noreferrer"
                className="text-[#1d4ed8] hover:text-[#1e40af] underline decoration-[#1d4ed8]/60 underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1d4ed8]/40 rounded-sm"
              >
                MiniMax Coding Plan
              </a>
            </li>
            <li>Copy your API key from that page and paste it here.</li>
          </ol>
        </div>
      );
    }
    if (provider === UsageProvider.OPENROUTER) {
      return (
        <div>
          Go to
          {' '}
          <a
            href="https://openrouter.ai/settings/keys"
            target="_blank"
            rel="noreferrer"
            className="text-[#1d4ed8] hover:text-[#1e40af] underline decoration-[#1d4ed8]/60 underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1d4ed8]/40 rounded-sm"
          >
            OpenRouter Website
          </a>
          {' '}
          to get your API key information.
        </div>
      );
    }
    if (provider === UsageProvider.ZAI) {
      const isCNRegion = region === 'zai_bigmodel_cn'
        || region === 'bigmodel-cn'
        || region === 'cn';
      const keyUrl = isCNRegion
        ? 'https://open.bigmodel.cn/usercenter/apikeys'
        : 'https://z.ai/manage-apikey/subscription';
      return (
        <div className="space-y-1">
          <div>How to get z.ai API Key:</div>
          <ol className="list-decimal pl-5 space-y-1">
            <li>Select the correct region above first.</li>
            <li>
              Open
              {' '}
              <a
                href={keyUrl}
                target="_blank"
                rel="noreferrer"
                className="text-[#1d4ed8] hover:text-[#1e40af] underline decoration-[#1d4ed8]/60 underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1d4ed8]/40 rounded-sm"
              >
                z.ai API Key Management
              </a>
            </li>
            <li>Copy the API key and paste it here.</li>
          </ol>
        </div>
      );
    }
    return 'Your API key is stored locally and never sent to our servers.';
  }

  if (provider === UsageProvider.CODEX) {
    if (authType === AuthType.OAUTH) {
      return 'Use Link Auth above, or paste access_token from ~/.codex/auth.json.';
    }
    return 'Copy the session cookie from chatgpt.com (browser developer tools).';
  }

  if (provider === UsageProvider.ALIYUN && authType === AuthType.COOKIE) {
    return (
      <div className="space-y-1">
        <div>Paste only Cookie value copied from Aliyun request headers.</div>
        <ol className="list-decimal pl-5 space-y-1">
          <li>
            Open
            {' '}
            <a
              href="https://bailian.console.aliyun.com/"
              target="_blank"
              rel="noreferrer"
              className="text-[#1d4ed8] hover:text-[#1e40af] underline decoration-[#1d4ed8]/60 underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1d4ed8]/40 rounded-sm"
            >
              Aliyun Console
            </a>
            {' '}
            and sign in.
          </li>
          <li>Open the Coding Plan page and press F12.</li>
          <li>In Network, find request `queryCodingPlanInstanceInfoV2` and open Headers.</li>
          <li>Copy `Request Headers` -&gt; `Cookie` value.</li>
          <li>Paste the cookie string here (do not paste curl command).</li>
        </ol>
      </div>
    );
  }

  if (provider === UsageProvider.CURSOR && authType === AuthType.COOKIE) {
    return (
      <div className="space-y-1">
        <div>Accepted formats: `WorkosCursorSessionToken=user_...;` or just `user_...`.</div>
        <div>How to get `WorkosCursorSessionToken`:</div>
        <ol className="list-decimal pl-5 space-y-1">
          <li>
            Open
            {' '}
            <a
              href="https://cursor.com/dashboard"
              target="_blank"
              rel="noreferrer"
              className="text-[#1d4ed8] hover:text-[#1e40af] underline decoration-[#1d4ed8]/60 underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1d4ed8]/40 rounded-sm"
            >
              Cursor Dashboard
            </a>
          </li>
          <li>Press F12 to open DevTools.</li>
          <li>Go to Application.</li>
          <li>In the left sidebar, open Cookies and select https://cursor.com.</li>
          <li>Find WorkosCursorSessionToken, copy its value, and paste it here.</li>
        </ol>
      </div>
    );
  }

  if (provider === UsageProvider.OLLAMA && authType === AuthType.COOKIE) {
    return (
      <div className="space-y-1">
        <div>How to get `aid` and `__Secure-session`:</div>
        <ol className="list-decimal pl-5 space-y-1">
          <li>
            Open
            {' '}
            <a
              href="https://ollama.com/"
              target="_blank"
              rel="noreferrer"
              className="text-[#1d4ed8] hover:text-[#1e40af] underline decoration-[#1d4ed8]/60 underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1d4ed8]/40 rounded-sm"
            >
              Ollama Website
            </a>
            {' '}
            and sign in.
          </li>
          <li>Press F12 to open DevTools.</li>
          <li>Go to Application.</li>
          <li>In the left sidebar, open Cookies and select https://ollama.com.</li>
          <li>Find `aid` and `__Secure-session`, then paste as `aid=...; __Secure-session=...`.</li>
        </ol>
      </div>
    );
  }

  if (provider === UsageProvider.KIMI && authType === AuthType.COOKIE) {
    return (
      <div className="space-y-1">
        <div>Accepted format: only the `kimi-auth` cookie value (JWT string).</div>
        <div>How to get `kimi-auth`:</div>
        <ol className="list-decimal pl-5 space-y-1">
          <li>
            Open
            {' '}
            <a
              href="https://www.kimi.com/"
              target="_blank"
              rel="noreferrer"
              className="text-[#1d4ed8] hover:text-[#1e40af] underline decoration-[#1d4ed8]/60 underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1d4ed8]/40 rounded-sm"
            >
              Kimi Website
            </a>
          </li>
          <li>Press F12 to open DevTools.</li>
          <li>Go to Application.</li>
          <li>In the left sidebar, open Cookies and select https://www.kimi.com.</li>
          <li>Find `kimi-auth`, copy its value only, and paste it here.</li>
        </ol>
      </div>
    );
  }

  if (provider === UsageProvider.OPENCODE && authType === AuthType.COOKIE) {
    return (
      <div className="space-y-1">
        <div>How to get `auth`:</div>
        <ol className="list-decimal pl-5 space-y-1">
          <li>
            Open
            {' '}
            <a
              href="https://opencode.ai/zen"
              target="_blank"
              rel="noreferrer"
              className="text-[#1d4ed8] hover:text-[#1e40af] underline decoration-[#1d4ed8]/60 underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1d4ed8]/40 rounded-sm"
            >
              OpenCode Zen
            </a>
            {' '}
            and sign in.
          </li>
          <li>Press F12 to open DevTools.</li>
          <li>Go to Application.</li>
          <li>In the left sidebar, open Cookies and select https://opencode.ai.</li>
          <li>Find `auth`, copy its value only, or copy it as `auth=...`, and paste it here.</li>
        </ol>
      </div>
    );
  }

  if (provider === UsageProvider.MINIMAX) {
    return 'Select the correct region above first. Then copy the full value from your browser\'s developer tools.';
  }
  
  return 'Copy the full value from your browser\'s developer tools.';
}
