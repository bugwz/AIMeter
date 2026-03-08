import React from 'react';
import { getRuntimeEntry } from '../../runtimeContext';

interface NotFoundPageProps {
  fullViewport?: boolean;
}

export function NotFoundPage({ fullViewport = true }: NotFoundPageProps) {
  const { invalidAdminPath } = getRuntimeEntry();

  const title = invalidAdminPath ? 'Invalid Admin Route' : 'Page Not Found';
  const eyebrow = invalidAdminPath ? 'Restricted Entry' : 'Unknown Route';
  const subtitle = invalidAdminPath
    ? 'The admin entry path does not match the configured route secret for this deployment.'
    : 'The requested path does not map to a valid AIMeter screen.';
  const statusLabel = invalidAdminPath ? 'Access blocked by route validation' : 'This path is not exposed by the current app';
  const guidance = invalidAdminPath
    ? 'Use the exact 64-character admin route secret configured for this deployment.'
    : 'Return to the dashboard or step back to the previous valid screen.';
  return (
    <div className={`${fullViewport ? 'h-[100svh]' : 'h-full'} relative overflow-hidden`}>
      <div
        className="absolute inset-0"
        style={{
          background:
            'radial-gradient(circle at top right, var(--color-bg-glow-1), transparent 30%), radial-gradient(circle at 18% 16%, var(--color-bg-glow-2), transparent 24%), radial-gradient(circle at bottom left, var(--color-bg-glow-3), transparent 28%), var(--color-bg)',
        }}
      />
      <div
        className="absolute inset-0 opacity-60"
        style={{
          backgroundImage:
            'linear-gradient(rgba(255,255,255,0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.03) 1px, transparent 1px)',
          backgroundSize: '40px 40px',
          maskImage: 'radial-gradient(circle at center, black 42%, transparent 88%)',
        }}
      />

      <div className="relative z-10 h-full max-w-7xl mx-auto px-4 py-4 sm:px-6 sm:py-5 lg:px-10 lg:py-6">
        <div className="flex h-full items-center justify-center">
          <section className="animate-fade-in w-full max-w-5xl">
            <div
              className="relative overflow-hidden rounded-[28px] bg-[var(--color-surface)] px-5 py-8 gradient-border sm:px-8 sm:py-10 lg:px-12 lg:py-12"
              style={{ boxShadow: 'var(--shadow-card)' }}
            >
              <div
                className="pointer-events-none absolute -right-24 top-0 h-48 w-48 rounded-full blur-3xl sm:h-64 sm:w-64"
                style={{ background: invalidAdminPath ? 'rgba(239, 68, 68, 0.14)' : 'rgba(96, 165, 250, 0.12)' }}
              />
              <div
                className="pointer-events-none absolute -left-16 bottom-0 h-40 w-40 rounded-full blur-3xl sm:h-56 sm:w-56"
                style={{ background: 'var(--color-bg-glow-2)' }}
              />

              <div className="relative">
                <div className="inline-flex items-center gap-2 rounded-full border px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-[#fca5a5] sm:text-[11px]" style={{ borderColor: 'rgba(239,68,68,0.18)', background: 'rgba(127,29,29,0.14)' }}>
                  {eyebrow}
                </div>

                <div className="mt-6 grid gap-8 lg:grid-cols-[minmax(0,1fr)_220px] lg:items-end">
                  <div className="min-w-0">
                    <div
                      className="text-[64px] leading-none font-semibold tracking-[-0.08em] sm:text-[96px] lg:text-[136px] xl:text-[152px]"
                      style={{
                        color: 'var(--color-text-primary)',
                        textShadow: '0 18px 48px rgba(0,0,0,0.28)',
                      }}
                    >
                      404
                    </div>
                    <h1 className="mt-3 max-w-2xl text-3xl font-semibold tracking-tight text-[var(--color-text-primary)] sm:text-4xl lg:text-5xl">
                      {title}
                    </h1>
                    <p className="mt-3 max-w-2xl text-sm leading-6 text-[var(--color-text-secondary)] sm:text-base sm:leading-7">
                      {subtitle}
                    </p>
                  </div>

                  <div className="grid gap-3 self-stretch sm:grid-cols-2 lg:grid-cols-1">
                    <div className="rounded-2xl border px-4 py-4" style={{ borderColor: 'var(--color-border-subtle)', background: 'var(--color-bg-subtle)' }}>
                      <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--color-text-tertiary)]">
                        Status
                      </div>
                      <div className="mt-2 text-sm font-medium leading-6 text-[var(--color-text-primary)]">
                        {statusLabel}
                      </div>
                    </div>
                    <div className="rounded-2xl border px-4 py-4" style={{ borderColor: 'var(--color-border-subtle)', background: 'var(--color-bg-subtle)' }}>
                      <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--color-text-tertiary)]">
                        Next Step
                      </div>
                      <div className="mt-2 text-sm leading-6 text-[var(--color-text-secondary)]">
                        {guidance}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="mt-6 h-px w-full" style={{ background: 'linear-gradient(90deg, rgba(255,255,255,0.12) 0%, rgba(255,255,255,0.02) 100%)' }} />

                <div className="mt-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex flex-wrap gap-3">
                    <a href="/" className="btn-primary">
                      Back To Home
                    </a>
                    {!invalidAdminPath && (
                      <button
                        type="button"
                        onClick={() => window.history.back()}
                        className="inline-flex items-center justify-center rounded-lg border px-4 py-2 text-sm font-medium text-[var(--color-text-secondary)] transition-colors hover:text-[var(--color-text-primary)] hover:bg-[var(--color-bg-subtle)]"
                        style={{ borderColor: 'var(--color-border-subtle)' }}
                      >
                        Go Back
                      </button>
                    )}
                  </div>

                  <p className="max-w-md text-xs leading-6 text-[var(--color-text-tertiary)] sm:text-sm sm:text-right">
                    {invalidAdminPath
                      ? 'Only the active deployment secret can open the admin entry screen.'
                      : 'If this URL should exist, verify the route registration and navigation source.'}
                  </p>
                </div>
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
