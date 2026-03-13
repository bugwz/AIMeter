import React, { Suspense, lazy, useEffect, useState } from 'react';
import { Routes, Route, useNavigate, useLocation } from 'react-router-dom';
import { Dashboard } from './components/dashboard/Dashboard';
import { Endpoint } from './components/endpoint/Endpoint';
import { LockScreen, checkAuth } from './components/auth/LockScreen';
import { NotFoundPage } from './components/common/NotFoundPage';
import { PageLoader } from './components/common';
import { apiService } from './services/ApiService';
import { getRuntimeEntry } from './runtimeContext';
import { AppTheme, applyTheme, getStoredTheme, persistTheme } from './theme';
import { RuntimeCapabilities } from './types';

const History = lazy(() =>
  import('./components/history/History').then((module) => ({ default: module.History })),
);

const Settings = lazy(() =>
  import('./components/settings/Settings').then((module) => ({ default: module.Settings })),
);

export default function App() {
  const navigate = useNavigate();
  const location = useLocation();
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(checkAuth());
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [theme, setTheme] = useState<AppTheme>(getStoredTheme);
  const [capabilities, setCapabilities] = useState<RuntimeCapabilities | null>(null);

  useEffect(() => {
    const syncAuthState = async () => {
      try {
        const status = await apiService.getAuthStatus();
        if (status.authenticated) {
          setIsAuthenticated(true);
          return;
        }
        setIsAuthenticated(false);
      } catch {
        setIsAuthenticated(false);
      }
    };

    syncAuthState();
  }, []);

  useEffect(() => {
    if (!isAuthenticated) return;
    apiService.getCapabilities().then(setCapabilities).catch(() => undefined);
  }, [isAuthenticated]);

  useEffect(() => {
    if (capabilities?.ui.showSettings === false && location.pathname === '/settings') {
      navigate('/');
    }
  }, [capabilities, location.pathname, navigate]);

  useEffect(() => {
    applyTheme(theme);
    persistTheme(theme);
  }, [theme]);
  
  const handleUnlock = () => {
    setIsAuthenticated(true);
  };

  const getActiveTab = (): string => {
    const path = location.pathname.slice(1);
    return path || 'dashboard';
  };

  const activeTab = getActiveTab();
  const runtimeEntry = getRuntimeEntry();
  const runtimeRole = runtimeEntry.role;
  const logoSrc = theme === 'dark' ? '/img/logo-dark.svg' : '/img/logo-light.svg';
  const canShowSettings = capabilities ? capabilities.ui.showSettings : runtimeRole === 'admin';
  const knownPaths = ['/', '/endpoint'];

  if (capabilities?.history.enabled !== false) {
    knownPaths.push('/history');
  }

  if (canShowSettings) {
    knownPaths.push('/settings');
  }

  const isNotFoundRoute = !knownPaths.includes(location.pathname);

  if (runtimeEntry.invalidAdminPath) {
    return <NotFoundPage />;
  }

  const handleNavClick = (path: string) => {
    navigate(path);
    setMobileMenuOpen(false);
  };

  const toggleTheme = () => {
    setTheme((current) => (current === 'dark' ? 'light' : 'dark'));
  };

  if (!isAuthenticated) {
    return <LockScreen onUnlock={handleUnlock} />;
  }
  
  return (
      <div className="min-h-screen" style={{ background: 'transparent' }}>
      <header 
        className="sticky top-0 z-50 glass"
        style={{ 
          borderBottom: '1px solid var(--color-border-subtle)',
        }}
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <div className="flex items-center justify-between h-16 gap-4">
            <div className="flex items-center gap-3" onClick={() => navigate('/')} style={{ cursor: 'pointer' }}>
              <div
                className="w-8 h-8 rounded-lg flex items-center justify-center"
                style={{ boxShadow: theme === 'dark' ? '0 10px 24px rgba(0,0,0,0.28)' : '0 10px 24px rgba(80,99,114,0.18)' }}
              >
                <img src={logoSrc} alt="AIMeter Logo" className="w-full h-full object-contain" />
              </div>
              <span className="text-base font-semibold text-[var(--color-text-primary)] tracking-tight hidden sm:block">
                AIMeter
              </span>
            </div>
            
            <div className="flex items-center gap-2 ml-auto">
              <nav className="hidden md:flex items-center gap-1">
                <TabButton 
                  active={activeTab === 'dashboard'} 
                  onClick={() => navigate('/')}
                  icon={
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="3" y="3" width="7" height="9" rx="1"/>
                      <rect x="14" y="3" width="7" height="5" rx="1"/>
                      <rect x="14" y="12" width="7" height="9" rx="1"/>
                      <rect x="3" y="16" width="7" height="5" rx="1"/>
                    </svg>
                  }
                >
                  Dashboard
                </TabButton>
                {capabilities?.history.enabled !== false && (
                  <TabButton 
                    active={activeTab === 'history'} 
                    onClick={() => navigate('/history')}
                    icon={
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M3 3v18h18"/>
                        <path d="M18 9l-5 5-4-4-3 3"/>
                      </svg>
                    }
                  >
                    History
                  </TabButton>
                )}
                <TabButton 
                  active={activeTab === 'endpoint'} 
                  onClick={() => navigate('/endpoint')}
                  icon={
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M22 12h-4l-3 9L9 3l-3 9H2"/>
                    </svg>
                  }
                >
                  Endpoint
                </TabButton>
                {canShowSettings && (
                  <TabButton 
                    active={activeTab === 'settings'} 
                    onClick={() => navigate('/settings')}
                    icon={
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/>
                        <circle cx="12" cy="12" r="3"/>
                      </svg>
                    }
                  >
                    Settings
                  </TabButton>
                )}
              </nav>

              <button
                type="button"
                onClick={toggleTheme}
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

              <button 
                type="button"
                className="md:hidden p-2 rounded-lg text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-subtle)] transition-colors"
                onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                style={{ WebkitTapHighlightColor: 'transparent' }}
              >
                {mobileMenuOpen ? (
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M18 6 6 18"/>
                    <path d="m6 6 12 12"/>
                  </svg>
                ) : (
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="4" x2="20" y1="12" y2="12"/>
                    <line x1="4" x2="20" y1="6" y2="6"/>
                    <line x1="4" x2="20" y1="18" y2="18"/>
                  </svg>
                )}
              </button>
            </div>
          </div>
        </div>

        <div 
          className={`md:hidden overflow-hidden transition-all duration-300 ease-in-out ${
            mobileMenuOpen ? 'max-h-96 opacity-100' : 'max-h-0 opacity-0'
          }`}
        >
          <div className="px-4 py-3 space-y-1 border-t border-[var(--color-border-subtle)] bg-[var(--color-surface)]">
            <MobileTabButton 
              active={activeTab === 'dashboard'} 
              onClick={() => handleNavClick('/')}
              icon={
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="3" width="7" height="9" rx="1"/>
                  <rect x="14" y="3" width="7" height="5" rx="1"/>
                  <rect x="14" y="12" width="7" height="9" rx="1"/>
                  <rect x="3" y="16" width="7" height="5" rx="1"/>
                </svg>
              }
            >
              Dashboard
            </MobileTabButton>
            {capabilities?.history.enabled !== false && (
              <MobileTabButton 
                active={activeTab === 'history'} 
                onClick={() => handleNavClick('/history')}
                icon={
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M3 3v18h18"/>
                    <path d="M18 9l-5 5-4-4-3 3"/>
                  </svg>
                }
              >
                History
              </MobileTabButton>
            )}
            <MobileTabButton 
              active={activeTab === 'endpoint'} 
              onClick={() => handleNavClick('/endpoint')}
              icon={
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M22 12h-4l-3 9L9 3l-3 9H2"/>
                </svg>
              }
            >
              Endpoint
            </MobileTabButton>
            {canShowSettings && (
              <MobileTabButton 
                active={activeTab === 'settings'} 
                onClick={() => handleNavClick('/settings')}
                icon={
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/>
                    <circle cx="12" cy="12" r="3"/>
                  </svg>
                }
              >
                Settings
              </MobileTabButton>
            )}
          </div>
        </div>
      </header>
      
      <main className={isNotFoundRoute ? 'h-[calc(100svh-4rem)] overflow-hidden' : undefined}>
        <Suspense fallback={<PageLoader />}>
          <Routes>
            <Route path="/" element={<Dashboard />} />
            {capabilities?.history.enabled !== false && <Route path="/history" element={<History />} />}
            <Route path="/endpoint" element={<Endpoint />} />
            {canShowSettings && <Route path="/settings" element={<Settings />} />}
            <Route path="*" element={<NotFoundPage fullViewport={false} />} />
          </Routes>
        </Suspense>
      </main>
    </div>
  );
}

interface TabButtonProps {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
  icon: React.ReactNode;
}

const TabButton: React.FC<TabButtonProps> = ({ active, onClick, children, icon }) => (
  <button
    type="button"
    onClick={onClick}
    className={`flex items-center gap-2 px-4 py-2 rounded-lg border text-sm font-medium outline-none focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent-subtle)] transition-colors duration-200 ${
      active
        ? 'bg-[var(--color-accent-subtle)] text-[var(--color-accent)] border-[var(--color-border)] shadow-sm'
        : 'border-transparent text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-subtle)] hover:text-[var(--color-text-primary)] hover:border-[var(--color-border-subtle)] active:bg-[var(--color-bg-subtle)]'
    }`}
    style={{ WebkitTapHighlightColor: 'transparent' }}
  >
    {icon}
    {children}
  </button>
);

interface MobileTabButtonProps {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
  icon: React.ReactNode;
}

const MobileTabButton: React.FC<MobileTabButtonProps> = ({ active, onClick, children, icon }) => (
  <button
    type="button"
    onClick={onClick}
    className={`flex items-center gap-3 w-full px-4 py-3 rounded-lg border text-sm font-medium outline-none focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent-subtle)] transition-colors duration-200 ${
      active
        ? 'bg-[var(--color-accent-subtle)] text-[var(--color-accent)] border-[var(--color-border-subtle)]'
        : 'border-transparent text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-subtle)] hover:text-[var(--color-text-primary)] hover:border-[var(--color-border-subtle)] active:bg-[var(--color-bg-subtle)]'
    }`}
    style={{ WebkitTapHighlightColor: 'transparent' }}
  >
    {icon}
    {children}
  </button>
);
