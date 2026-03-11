import React, { useEffect, useState } from 'react';
import { apiService } from '../../services/ApiService';
import { getRuntimeEntry } from '../../runtimeContext';
import { AppTheme, applyTheme, getStoredTheme, persistTheme } from '../../theme';

interface LockScreenProps {
  onUnlock: () => void;
}

type LockMode = 'check' | 'setup' | 'bootstrap';

const MIN_PASSWORD_LENGTH = 12;
const ROUTE_SECRET_LENGTH = 64;
const ALPHANUMERIC_RE = /^[a-zA-Z0-9]+$/;

function validatePassword(value: string): string {
  if (!value) return '';
  if (value.length < MIN_PASSWORD_LENGTH) return `At least ${MIN_PASSWORD_LENGTH} characters required (${value.length}/${MIN_PASSWORD_LENGTH})`;
  if (!/[a-zA-Z]/.test(value)) return 'Must contain at least one letter';
  if (!/[0-9]/.test(value)) return 'Must contain at least one digit';
  return '';
}

function validateRouteSecret(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return '';
  if (trimmed.length !== ROUTE_SECRET_LENGTH) return `Must be exactly ${ROUTE_SECRET_LENGTH} characters (${trimmed.length}/${ROUTE_SECRET_LENGTH})`;
  if (!ALPHANUMERIC_RE.test(trimmed)) return 'Only letters and numbers allowed (no special characters)';
  return '';
}

function generateAdminRoutePath(): string {
  const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  const bytes = new Uint8Array(64);
  window.crypto.getRandomValues(bytes);
  let result = '';
  for (let i = 0; i < bytes.length; i += 1) {
    result += chars[bytes[i] % chars.length];
  }
  return result;
}

export function LockScreen({ onUnlock }: LockScreenProps) {
  const role = getRuntimeEntry().role;
  const sessionKey = role === 'admin' ? 'aimeter_admin_authenticated' : 'aimeter_normal_authenticated';
  const [theme, setTheme] = useState<AppTheme>(getStoredTheme);
  const [mode, setMode] = useState<LockMode>('check');
  const [password, setPassword] = useState('');
  const [adminPassword, setAdminPassword] = useState('');
  const [adminRoutePath, setAdminRoutePath] = useState(generateAdminRoutePath);
  const [authMutable, setAuthMutable] = useState(true);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [passwordVisible, setPasswordVisible] = useState({
    password: false,
    adminPassword: false,
  });

  const renderPasswordInput = ({
    value,
    onChange,
    placeholder,
    visible,
    onToggleVisible,
    autoFocus,
  }: {
    value: string;
    onChange: (value: string) => void;
    placeholder: string;
    visible: boolean;
    onToggleVisible: () => void;
    autoFocus?: boolean;
  }) => (
    <div className="relative">
      <input
        type={visible ? 'text' : 'password'}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="input-field w-full"
        style={{ paddingRight: '50px' }}
        autoFocus={autoFocus}
      />
      <div className="absolute inset-y-0 right-0 flex w-12 items-center justify-center">
        <button
          type="button"
          onClick={onToggleVisible}
          tabIndex={-1}
          className="text-[var(--color-text-muted)] transition-colors hover:text-[var(--color-text-secondary)]"
          aria-label={visible ? 'Hide password' : 'Show password'}
        >
          {visible ? (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8S1 12 1 12z" />
              <circle cx="12" cy="12" r="3" />
            </svg>
          ) : (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M17.94 17.94A10.94 10.94 0 0 1 12 20C7 20 2.73 16.89 1 12c.73-2.07 2-3.87 3.6-5.21" />
              <path d="M9.9 4.24A10.94 10.94 0 0 1 12 4c5 0 9.27 3.11 11 8a11.55 11.55 0 0 1-1.67 2.87" />
              <path d="M14.12 14.12a3 3 0 1 1-4.24-4.24" />
              <path d="M1 1l22 22" />
            </svg>
          )}
        </button>
      </div>
    </div>
  );

  useEffect(() => {
    applyTheme(theme);
    persistTheme(theme);
  }, [theme]);

  useEffect(() => {
    checkAuthStatus();
  }, []);

  const sleep = (ms: number) => new Promise<void>((resolve) => {
    window.setTimeout(resolve, ms);
  });

  const checkAuthStatus = async () => {
    let lastError: unknown = null;
    try {
      const retryDelays = [0, 500];
      for (let i = 0; i < retryDelays.length; i += 1) {
        try {
          if (retryDelays[i] > 0) {
            await sleep(retryDelays[i]);
          }
          const status = await apiService.getAuthStatus();
          if (status.authenticated) {
            sessionStorage.setItem(sessionKey, 'true');
            onUnlock();
            return;
          }
          setAuthMutable(status.authMutable !== false);
          if (status.bootstrapRequired && role === 'normal') {
            setMode('bootstrap');
          } else {
            setMode(status.needsSetup ? 'setup' : 'check');
          }
          setError('');
          return;
        } catch (error) {
          lastError = error;
        }
      }

      setError(lastError instanceof Error ? lastError.message : 'Failed to check auth status');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      if (mode === 'bootstrap') {
        if (!authMutable) {
          throw new Error('Current deployment requires normal/admin passwords and admin route path to be provided in config');
        }
        if (password.length < MIN_PASSWORD_LENGTH || adminPassword.length < MIN_PASSWORD_LENGTH) {
          throw new Error(`Normal and admin passwords must both be at least ${MIN_PASSWORD_LENGTH} characters`);
        }
        if (password === adminPassword) {
          throw new Error('Normal and admin passwords must be different');
        }
        const secretError = validateRouteSecret(adminRoutePath);
        if (secretError) {
          throw new Error(secretError);
        }
        await apiService.bootstrapSetup(password, adminPassword, adminRoutePath.trim());
        sessionStorage.setItem(sessionKey, 'true');
        onUnlock();
        return;
      }

      if (mode === 'setup') {
        if (!authMutable) {
          throw new Error('Password setup is disabled in the current deployment mode');
        }
        if (password.length < MIN_PASSWORD_LENGTH) {
          throw new Error(`Password must be at least ${MIN_PASSWORD_LENGTH} characters`);
        }
        await apiService.setupPassword(password);
        sessionStorage.setItem(sessionKey, 'true');
        onUnlock();
        return;
      }

      const isValid = await apiService.verifyPassword(password);
      if (isValid) {
        sessionStorage.setItem(sessionKey, 'true');
        onUnlock();
      } else {
        try {
          const status = await apiService.getAuthStatus();
          if (status.authenticated) {
            sessionStorage.setItem(sessionKey, 'true');
            onUnlock();
            return;
          }
        } catch {
          // Keep the original incorrect password message.
        }
        setError('Incorrect password');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setIsLoading(false);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 relative overflow-hidden">
        <div className="absolute inset-0" style={{ background: 'linear-gradient(135deg, var(--color-surface-hover) 0%, var(--color-bg) 52%, var(--color-bg-subtle) 100%)' }} />
        <div className="relative z-10">
          <svg className="animate-spin" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="var(--color-accent)" strokeWidth="2">
            <circle cx="12" cy="12" r="10" strokeOpacity="0.25" />
            <path d="M12 2a10 10 0 0 1 10 10" strokeLinecap="round" />
          </svg>
        </div>
      </div>
    );
  }

  const title = mode === 'bootstrap'
    ? 'Initial Setup'
    : mode === 'setup'
      ? (role === 'admin' ? 'Set Admin Password' : 'Set Password')
      : (role === 'admin' ? 'Enter Admin Password' : 'Enter Password');

  const subtitle = mode === 'bootstrap'
    ? 'Create the normal password, admin password, and 64-character admin route path'
    : mode === 'setup'
      ? (role === 'admin' ? 'Create a password to protect the admin console' : 'Create a password to protect your dashboard')
      : (role === 'admin' ? 'Enter your admin password to access the full management console' : 'Enter your password to access the dashboard');

  return (
    <div className="min-h-screen flex items-center justify-center p-4 relative overflow-hidden">
      <div className="absolute inset-0" style={{ background: 'linear-gradient(135deg, var(--color-surface-hover) 0%, var(--color-bg) 52%, var(--color-bg-subtle) 100%)' }} />
      <div className="absolute inset-0" style={{ backgroundImage: 'radial-gradient(circle at 1px 1px, var(--color-border-subtle) 1px, transparent 0)', backgroundSize: '32px 32px' }} />

      <div className="absolute top-4 right-4 z-20">
        <button
          type="button"
          onClick={() => setTheme((current) => (current === 'dark' ? 'light' : 'dark'))}
          className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-[var(--color-border)] text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-bg-subtle)] transition-colors"
          aria-label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
          title={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
          style={{ WebkitTapHighlightColor: 'transparent' }}
        >
          {theme === 'dark' ? (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="4" />
              <path d="M12 2v2" />
              <path d="M12 20v2" />
              <path d="m4.93 4.93 1.41 1.41" />
              <path d="m17.66 17.66 1.41 1.41" />
              <path d="M2 12h2" />
              <path d="M20 12h2" />
              <path d="m6.34 17.66-1.41 1.41" />
              <path d="m19.07 4.93-1.41 1.41" />
            </svg>
          ) : (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 3a6 6 0 1 0 9 9 9 9 0 1 1-9-9z" />
            </svg>
          )}
          <span className="hidden sm:inline text-sm font-medium">
            {theme === 'dark' ? 'Light' : 'Dark'}
          </span>
        </button>
      </div>

      <div className="relative z-10 w-full max-w-md animate-fade-in">
        <div className="text-center mb-10">
          <div
            className="inline-flex items-center justify-center w-16 h-16 rounded-2xl mb-6 shadow-lg"
            style={{
              background: 'linear-gradient(135deg, var(--color-surface-hover) 0%, var(--color-accent-subtle) 55%, var(--color-bg-subtle) 100%)',
              boxShadow: 'var(--shadow-md)',
            }}
          >
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--color-text-primary)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
              <path d="M7 11V7a5 5 0 0 1 10 0v4" />
            </svg>
          </div>
          <h1 className="text-2xl font-semibold text-[var(--color-text-primary)] tracking-tight mb-2">{title}</h1>
          <p className="text-sm text-[var(--color-text-secondary)]">{subtitle}</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {mode === 'bootstrap' ? (
            <>
              <div>
                <label className="mb-2 block text-xs font-medium text-[var(--color-text-secondary)]">Normal Password</label>
                {renderPasswordInput({
                  value: password,
                  onChange: setPassword,
                  placeholder: 'Create normal password',
                  visible: passwordVisible.password,
                  onToggleVisible: () => setPasswordVisible((prev) => ({ ...prev, password: !prev.password })),
                  autoFocus: true,
                })}
                {validatePassword(password) && (
                  <p className="mt-1 text-xs text-[#f87171]">{validatePassword(password)}</p>
                )}
              </div>
              <div>
                <label className="mb-2 block text-xs font-medium text-[var(--color-text-secondary)]">Admin Password</label>
                {renderPasswordInput({
                  value: adminPassword,
                  onChange: setAdminPassword,
                  placeholder: 'Create admin password',
                  visible: passwordVisible.adminPassword,
                  onToggleVisible: () => setPasswordVisible((prev) => ({ ...prev, adminPassword: !prev.adminPassword })),
                })}
                {validatePassword(adminPassword) && (
                  <p className="mt-1 text-xs text-[#f87171]">{validatePassword(adminPassword)}</p>
                )}
                {!validatePassword(adminPassword) && adminPassword && adminPassword === password && (
                  <p className="mt-1 text-xs text-[#f87171]">Normal and admin passwords must be different</p>
                )}
              </div>
              <div>
                <div className="mb-2 flex items-center justify-between gap-2">
                  <label className="block text-xs font-medium text-[var(--color-text-secondary)]">Admin Route Path</label>
                  <button
                    type="button"
                    onClick={() => setAdminRoutePath(generateAdminRoutePath())}
                    className="text-xs font-medium text-[var(--color-accent)] hover:opacity-80"
                  >
                    Regenerate
                  </button>
                </div>
                <textarea
                  value={adminRoutePath}
                  onChange={(e) => setAdminRoutePath(e.target.value)}
                  placeholder="64-character alphanumeric secret"
                  className="input-field w-full min-h-[112px] resize-y font-mono text-xs"
                />
                {(() => {
                  const secretError = validateRouteSecret(adminRoutePath);
                  const trimmed = adminRoutePath.trim();
                  const isValid = !secretError && trimmed.length === ROUTE_SECRET_LENGTH;
                  return (
                    <p className={`mt-2 rounded-md border px-3 py-2 text-xs font-medium ${isValid ? 'border-[var(--color-accent)]/40 bg-[var(--color-accent-subtle)] text-[var(--color-text-primary)]' : 'border-[#f87171]/40 bg-[#f87171]/10 text-[#f87171]'}`}>
                      {secretError ? (
                        <span>{secretError}</span>
                      ) : (
                        <>
                          <span>Admin route path length: {trimmed.length}/{ROUTE_SECRET_LENGTH}. Letters and numbers only.</span>
                          <span className="mt-1 block font-mono text-[11px] break-all">
                            Admin console path preview: /{trimmed || '<admin-route-secret>'}
                          </span>
                        </>
                      )}
                    </p>
                  );
                })()}
              </div>
            </>
          ) : (
            <>
              <div>
                {renderPasswordInput({
                  value: password,
                  onChange: setPassword,
                  placeholder: mode === 'setup' ? 'Create password' : 'Enter password',
                  visible: passwordVisible.password,
                  onToggleVisible: () => setPasswordVisible((prev) => ({ ...prev, password: !prev.password })),
                  autoFocus: true,
                })}
                {mode === 'setup' && validatePassword(password) && (
                  <p className="mt-1 text-xs text-[#f87171]">{validatePassword(password)}</p>
                )}
              </div>

            </>
          )}

          {error && <p className="text-sm text-[#f87171] animate-fade-in">{error}</p>}

          <button type="submit" disabled={isLoading} className="btn-primary w-full h-12 text-base">
            {isLoading ? (
              <svg className="animate-spin" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10" strokeOpacity="0.25" />
                <path d="M12 2a10 10 0 0 1 10 10" strokeLinecap="round" />
              </svg>
            ) : mode === 'bootstrap' ? (
              'Complete Initial Setup'
            ) : mode === 'setup' ? (
              'Create Password'
            ) : (
              'Unlock'
            )}
          </button>
        </form>

        {mode === 'check' && (
          <div className="mt-6 pt-6 border-t border-[var(--color-border)]">
            <button
              type="button"
              onClick={async () => {
                if (confirm('This will clear your session. You will need to re-enter password. Continue?')) {
                  try {
                    await apiService.logout();
                  } catch {
                    // Best-effort logout; still clear local state.
                  }
                  sessionStorage.removeItem(sessionKey);
                  window.location.reload();
                }
              }}
              className="w-full text-sm text-[var(--color-text-tertiary)] hover:text-[var(--color-text-secondary)] transition-colors"
            >
              Lock again
            </button>
          </div>
        )}
      </div>

      <div className="absolute bottom-6 left-1/2 -translate-x-1/2 text-xs text-[var(--color-text-muted)]">
        {mode === 'bootstrap' ? 'Initial setup data will be written to the database' : 'Your password is stored securely on the server'}
      </div>
    </div>
  );
}

export function checkAuth(): boolean {
  const role = getRuntimeEntry().role;
  const sessionKey = role === 'admin' ? 'aimeter_admin_authenticated' : 'aimeter_normal_authenticated';
  return sessionStorage.getItem(sessionKey) === 'true';
}
