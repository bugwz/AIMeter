import React, { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

export interface SelectOption<T extends string | number> {
  value: T;
  label: string;
  icon?: React.ReactNode;
  disabled?: boolean;
}

interface SelectFieldProps<T extends string | number> {
  value: T;
  onChange: (value: T) => void;
  options: Array<SelectOption<T>>;
  className?: string;
  placeholder?: string;
  disabled?: boolean;
  showTriggerIcon?: boolean;
}

export function SelectField<T extends string | number>({
  value,
  onChange,
  options,
  className = '',
  placeholder,
  disabled = false,
  showTriggerIcon = true,
}: SelectFieldProps<T>) {
  const [open, setOpen] = useState(false);
  const [menuStyle, setMenuStyle] = useState<React.CSSProperties>({
    position: 'fixed',
    left: 0,
    top: 0,
    width: 0,
    visibility: 'hidden',
    zIndex: 9999,
    transform: 'translateZ(0)',
  });
  const rootRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const listboxId = useId();

  const selectedOption = useMemo(
    () => options.find((option) => option.value === value),
    [options, value],
  );
  const hasAnyIcons = useMemo(
    () => options.some((option) => Boolean(option.icon)),
    [options],
  );
  const showSelectedIcon = showTriggerIcon && Boolean(selectedOption?.icon);

  const getMenuPositionStyle = (): React.CSSProperties | null => {
    const rect = triggerRef.current?.getBoundingClientRect();
    if (!rect) return null;

    const viewportHeight = window.innerHeight;
    const estimatedMenuHeight = Math.min(options.length * 44 + 12, 300);
    const spaceBelow = viewportHeight - rect.bottom;
    const shouldOpenUpward = spaceBelow < estimatedMenuHeight && rect.top > spaceBelow;

    return {
      position: 'fixed',
      left: rect.left,
      width: rect.width,
      top: shouldOpenUpward ? 'auto' : rect.bottom + 8,
      bottom: shouldOpenUpward ? viewportHeight - rect.top + 8 : 'auto',
      visibility: 'visible',
      zIndex: 9999,
      transform: 'translateZ(0)',
    };
  };

  useLayoutEffect(() => {
    if (!open) return;

    const updateMenuPosition = () => {
      const nextStyle = getMenuPositionStyle();
      if (nextStyle) {
        setMenuStyle(nextStyle);
      }
    };

    updateMenuPosition();

    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (!rootRef.current?.contains(target) && !menuRef.current?.contains(target)) {
        setOpen(false);
      }
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false);
        triggerRef.current?.focus();
      }
    };

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleEscape);
    window.addEventListener('resize', updateMenuPosition);
    window.addEventListener('scroll', updateMenuPosition, true);

    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleEscape);
      window.removeEventListener('resize', updateMenuPosition);
      window.removeEventListener('scroll', updateMenuPosition, true);
    };
  }, [open, options.length]);

  useEffect(() => {
    setOpen(false);
  }, [value]);

  const triggerClasses = className.includes('select-field')
    ? className
    : ['select-field', className].filter(Boolean).join(' ');
  const isPlaceholder = !selectedOption;

  return (
    <div ref={rootRef} className="relative">
      <button
        ref={triggerRef}
        type="button"
        disabled={disabled}
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-controls={listboxId}
        data-placeholder={isPlaceholder ? 'true' : 'false'}
        className={`relative text-left ${isPlaceholder ? 'text-[var(--color-text-muted)]' : ''} ${triggerClasses}`}
        onClick={() => {
          if (!disabled) {
            setOpen((current) => {
              const next = !current;
              if (next) {
                const nextStyle = getMenuPositionStyle();
                if (nextStyle) {
                  setMenuStyle(nextStyle);
                }
              }
              return next;
            });
          }
        }}
      >
        <span className={`flex min-h-6 items-center ${showSelectedIcon ? 'gap-2.5' : 'gap-2'}`}>
          {showSelectedIcon ? (
            <span
              className="flex h-6 w-6 shrink-0 items-center justify-center overflow-hidden rounded-lg border"
              style={{
                borderColor: 'var(--provider-logo-border)',
                background: 'var(--provider-logo-bg)',
                boxShadow: 'var(--provider-logo-shadow)',
              }}
            >
              {selectedOption?.icon}
            </span>
          ) : null}
          <span className={`block min-w-0 flex-1 truncate text-left ${showSelectedIcon ? 'font-medium tracking-[-0.01em]' : ''}`}>
            {selectedOption?.label || placeholder || ''}
          </span>
        </span>
        <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[var(--color-text-tertiary)]">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="m6 9 6 6 6-6" />
          </svg>
        </span>
      </button>

      {open && createPortal(
        <div
          ref={menuRef}
          style={menuStyle}
          className="overflow-hidden rounded-2xl p-1.5"
          role="listbox"
          id={listboxId}
        >
          <div
            className="rounded-2xl"
            style={{
              border: '1px solid var(--color-border)',
              background: 'var(--color-surface)',
              boxShadow: 'var(--shadow-lg)',
            }}
          >
            <div className="max-h-72 overflow-y-auto p-1">
              {options.map((option) => {
                const active = option.value === value;

                return (
                  <button
                    key={String(option.value)}
                    type="button"
                    role="option"
                    aria-selected={active}
                    disabled={option.disabled}
                    onClick={() => {
                      if (!option.disabled) {
                        onChange(option.value);
                        setOpen(false);
                      }
                    }}
                    className={`flex w-full items-center rounded-xl px-3 py-2.5 text-left text-sm transition-colors ${
                      option.disabled
                        ? 'cursor-not-allowed opacity-55'
                        : active
                          ? ''
                          : 'hover:bg-[var(--color-bg-subtle)] hover:text-[var(--color-text-primary)]'
                    } ${hasAnyIcons ? 'gap-2.5' : 'gap-2'}`}
                    style={
                      option.disabled
                        ? { color: 'var(--color-text-muted)' }
                        : active
                          ? {
                              color: 'var(--color-accent)',
                              background: 'var(--color-accent-subtle)',
                              boxShadow: 'inset 0 0 0 1px var(--color-border), inset 0 1px 0 rgba(255,255,255,0.04)',
                            }
                          : { color: 'var(--color-text-secondary)' }
                    }
                  >
                    {option.icon ? (
                      <span
                        className="flex h-7 w-7 shrink-0 items-center justify-center overflow-hidden rounded-lg border"
                        style={{
                          borderColor: active ? 'var(--color-accent)' : 'var(--provider-logo-border)',
                          background: 'var(--provider-logo-bg)',
                          boxShadow: 'var(--provider-logo-shadow)',
                        }}
                      >
                        {option.icon}
                      </span>
                    ) : hasAnyIcons ? (
                      <span className="h-7 w-7 shrink-0" />
                    ) : null}
                    <span className={`min-w-0 flex-1 truncate ${option.icon ? 'font-medium tracking-[-0.01em]' : ''}`}>
                      {option.label}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}
