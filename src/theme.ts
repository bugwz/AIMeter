export type AppTheme = 'dark' | 'light';

const THEME_STORAGE_KEY = 'aimeter_theme';

const isTheme = (value: string | null): value is AppTheme => value === 'dark' || value === 'light';

export const getStoredTheme = (): AppTheme => {
  if (typeof window === 'undefined') {
    return 'dark';
  }

  const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
  return isTheme(stored) ? stored : 'dark';
};

export const applyTheme = (theme: AppTheme) => {
  if (typeof document === 'undefined') {
    return;
  }

  document.documentElement.dataset.theme = theme;
  document.documentElement.style.colorScheme = theme;
};

export const persistTheme = (theme: AppTheme) => {
  if (typeof window === 'undefined') {
    return;
  }

  window.localStorage.setItem(THEME_STORAGE_KEY, theme);
};

export const initializeTheme = () => {
  applyTheme(getStoredTheme());
};
