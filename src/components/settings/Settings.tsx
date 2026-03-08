import React, { useState, useEffect } from 'react';
import { apiService } from '../../services/ApiService';
import { LoadingSpinner } from '../common/LoadingSpinner';
import { RuntimeCapabilities } from '../../types';
import { getRuntimeEntry } from '../../runtimeContext';

type Role = 'normal' | 'admin';
type PasswordField = 'oldPassword' | 'newPassword' | 'confirmPassword';

const EyeIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8S1 12 1 12z" />
    <circle cx="12" cy="12" r="3" />
  </svg>
);

const EyeOffIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M17.94 17.94A10.94 10.94 0 0 1 12 20C7 20 2.73 16.89 1 12c.73-2.07 2-3.87 3.6-5.21" />
    <path d="M9.9 4.24A10.94 10.94 0 0 1 12 4c5 0 9.27 3.11 11 8a11.55 11.55 0 0 1-1.67 2.87" />
    <path d="M14.12 14.12a3 3 0 1 1-4.24-4.24" />
    <path d="M1 1l22 22" />
  </svg>
);

function validateNewPassword(password: string): string | null {
  if (password.length < 12) return 'At least 12 characters required';
  if (!/[a-zA-Z]/.test(password)) return 'Must contain at least one letter';
  if (!/[0-9]/.test(password)) return 'Must contain at least one digit';
  return null;
}

export const Settings: React.FC = () => {
  const [passwordForms, setPasswordForms] = useState<Record<Role, Record<PasswordField, string>>>({
    normal: { oldPassword: '', newPassword: '', confirmPassword: '' },
    admin: { oldPassword: '', newPassword: '', confirmPassword: '' },
  });
  const [passwordVisible, setPasswordVisible] = useState<Record<Role, Record<PasswordField, boolean>>>({
    normal: { oldPassword: false, newPassword: false, confirmPassword: false },
    admin: { oldPassword: false, newPassword: false, confirmPassword: false },
  });
  const [passwordMessage, setPasswordMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [changingPassword, setChangingPassword] = useState(false);
  const [capabilities, setCapabilities] = useState<RuntimeCapabilities | null>(null);

  useEffect(() => {
    apiService.getCapabilities().then(setCapabilities).catch(() => undefined);
  }, []);

  const handlePasswordFieldChange = (role: Role, field: PasswordField, value: string) => {
    setPasswordForms((prev) => ({
      ...prev,
      [role]: { ...prev[role], [field]: value },
    }));
    setPasswordMessage(null);
  };

  const toggleVisible = (role: Role, field: PasswordField) => {
    setPasswordVisible((prev) => ({
      ...prev,
      [role]: { ...prev[role], [field]: !prev[role][field] },
    }));
  };

  const handleChangePassword = async (targetRole: Role, e: React.FormEvent) => {
    e.preventDefault();
    const form = passwordForms[targetRole];

    if (!form.oldPassword || !form.newPassword || !form.confirmPassword) {
      setPasswordMessage({ type: 'error', text: 'Please fill in all password fields' });
      return;
    }

    const validationError = validateNewPassword(form.newPassword);
    if (validationError) {
      setPasswordMessage({ type: 'error', text: validationError });
      return;
    }

    if (form.newPassword !== form.confirmPassword) {
      setPasswordMessage({ type: 'error', text: 'New passwords do not match' });
      return;
    }

    setChangingPassword(true);
    setPasswordMessage(null);

    try {
      await apiService.changePassword(targetRole, form.oldPassword, form.newPassword);
      setPasswordMessage({ type: 'success', text: `${targetRole === 'admin' ? 'Admin' : 'Normal'} password changed. Redirecting to login...` });

      // Session for the changed role is now invalidated server-side.
      // Redirect to re-login after a brief delay so the user can read the message.
      setTimeout(() => {
        const { basePath } = getRuntimeEntry();
        // For admin role: redirect to admin login path.
        // For normal role: redirect to normal (root) login path.
        window.location.href = targetRole === 'admin' ? basePath : '/';
      }, 1500);
    } catch (error) {
      setPasswordMessage({
        type: 'error',
        text: error instanceof Error ? error.message : 'Failed to change password',
      });
    } finally {
      setChangingPassword(false);
    }
  };

  const renderPasswordInput = (
    role: Role,
    field: PasswordField,
    placeholder: string,
    autoFocus?: boolean,
  ) => {
    const visible = passwordVisible[role][field];
    return (
      <div className="relative">
        <input
          type={visible ? 'text' : 'password'}
          value={passwordForms[role][field]}
          onChange={(e) => handlePasswordFieldChange(role, field, e.target.value)}
          placeholder={placeholder}
          className="input-field w-full"
          style={{ paddingRight: '44px' }}
          autoFocus={autoFocus}
          autoComplete={field === 'oldPassword' ? 'current-password' : 'new-password'}
        />
        <div className="absolute inset-y-0 right-0 flex w-11 items-center justify-center">
          <button
            type="button"
            onClick={() => toggleVisible(role, field)}
            tabIndex={-1}
            className="text-[var(--color-text-muted)] transition-colors hover:text-[var(--color-text-secondary)]"
            aria-label={visible ? 'Hide password' : 'Show password'}
          >
            {visible ? <EyeIcon /> : <EyeOffIcon />}
          </button>
        </div>
      </div>
    );
  };

  const renderNewPasswordHints = (role: Role) => {
    const value = passwordForms[role].newPassword;
    if (!value) return null;

    const checks = [
      { label: 'At least 12 characters', ok: value.length >= 12 },
      { label: 'Contains a letter', ok: /[a-zA-Z]/.test(value) },
      { label: 'Contains a digit', ok: /[0-9]/.test(value) },
    ];

    const allPassed = checks.every((c) => c.ok);
    if (allPassed) return null;

    return (
      <ul className="mt-1.5 space-y-0.5 pl-0.5">
        {checks.map((check) => (
          <li key={check.label} className={`flex items-center gap-1.5 text-xs ${check.ok ? 'text-[#059669]' : 'text-[var(--color-text-muted)]'}`}>
            {check.ok ? (
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                <path d="M20 6 9 17l-5-5" />
              </svg>
            ) : (
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                <circle cx="12" cy="12" r="9" />
              </svg>
            )}
            {check.label}
          </li>
        ))}
      </ul>
    );
  };

  return (
    <div className="p-8 max-w-7xl mx-auto">
      <div className="mb-8 animate-fade-in">
        <h1 className="text-2xl font-semibold text-[var(--color-text-primary)] tracking-tight">
          Settings
        </h1>
        <p className="text-sm text-[var(--color-text-tertiary)] mt-1">
          Configure your system settings
        </p>
      </div>

      <div className="bg-[var(--color-surface)] rounded-xl p-6 gradient-border animate-fade-in mt-6" style={{ boxShadow: 'var(--shadow-card)' }}>
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-lg flex items-center justify-center bg-[var(--color-bg-subtle)]">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--color-text-muted)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
              <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
            </svg>
          </div>
          <div>
            <h2 className="text-base font-semibold text-[var(--color-text-primary)]">
              Change Password
            </h2>
            <p className="text-xs text-[var(--color-text-tertiary)]">
              Update your dashboard access password
            </p>
          </div>
        </div>

        {capabilities?.auth.admin.mutable === false ? (
          <div className="rounded-lg bg-[var(--color-bg-subtle)] p-4 text-sm text-[var(--color-text-secondary)]">
            Passwords are managed by environment variables in the current deployment mode.
          </div>
        ) : (
          <div className="grid gap-6 md:grid-cols-2">
            {(['normal', 'admin'] as const).map((targetRole) => (
              <form
                key={targetRole}
                onSubmit={(e) => handleChangePassword(targetRole, e)}
                className="space-y-4 rounded-lg bg-[var(--color-bg-subtle)] p-4"
              >
                <div>
                  <h3 className="text-sm font-semibold text-[var(--color-text-primary)]">
                    {targetRole === 'admin' ? 'Admin Password' : 'Normal Password'}
                  </h3>
                </div>

                <div>
                  <label className="block text-xs font-medium text-[var(--color-text-secondary)] tracking-wide mb-2">
                    Current Password
                  </label>
                  {renderPasswordInput(targetRole, 'oldPassword', 'Enter current password')}
                </div>

                <div>
                  <label className="block text-xs font-medium text-[var(--color-text-secondary)] tracking-wide mb-2">
                    New Password
                  </label>
                  {renderPasswordInput(targetRole, 'newPassword', 'Enter new password')}
                  {renderNewPasswordHints(targetRole)}
                </div>

                <div>
                  <label className="block text-xs font-medium text-[var(--color-text-secondary)] tracking-wide mb-2">
                    Confirm New Password
                  </label>
                  {renderPasswordInput(targetRole, 'confirmPassword', 'Confirm new password')}
                  {passwordForms[targetRole].confirmPassword && passwordForms[targetRole].newPassword !== passwordForms[targetRole].confirmPassword && (
                    <p className="mt-1.5 flex items-center gap-1.5 text-xs text-[#dc2626]">
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                        <circle cx="12" cy="12" r="9" />
                        <path d="M12 8v4M12 16h.01" />
                      </svg>
                      Passwords do not match
                    </p>
                  )}
                </div>

                <button
                  type="submit"
                  disabled={
                    changingPassword ||
                    !passwordForms[targetRole].oldPassword ||
                    !passwordForms[targetRole].newPassword ||
                    !passwordForms[targetRole].confirmPassword
                  }
                  className="btn-primary w-full"
                >
                  {changingPassword ? (
                    <>
                      <LoadingSpinner size="sm" />
                      <span>Changing...</span>
                    </>
                  ) : (
                    <>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M12 5v14M5 12h14"/>
                      </svg>
                      <span>Change Password</span>
                    </>
                  )}
                </button>
              </form>
            ))}
          </div>
        )}

        {passwordMessage && (
          <div
            className={`mt-4 flex items-center gap-2 p-3 rounded-lg text-sm animate-fade-in ${
              passwordMessage.type === 'success'
                ? 'bg-[var(--color-success-subtle)] text-[#059669]'
                : 'bg-[var(--color-error-subtle)] text-[#dc2626]'
            }`}
          >
            {passwordMessage.type === 'success' ? (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M20 6 9 17l-5-5"/>
              </svg>
            ) : (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10"/>
                <path d="M12 8v4M12 16h.01"/>
              </svg>
            )}
            {passwordMessage.text}
          </div>
        )}
      </div>
    </div>
  );
};
