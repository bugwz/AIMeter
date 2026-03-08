import React, { useState, useEffect } from 'react';
import { credentialService } from '../../services/CredentialService';
import { UsageProvider, ProviderConfig, PROVIDER_NAMES } from '../../types';
import { LoadingSpinner } from '../common/LoadingSpinner';

type LayoutOption = 'row' | 'col' | 'grid';
type TypeOption = 'primary' | 'secondary' | 'tertiary' | 'cost';
type ThemeOption = 'dark' | 'light';

export const WidgetBuilder: React.FC = () => {
  const [configs, setConfigs] = useState<ProviderConfig[]>([]);
  const [loading, setLoading] = useState(true);
  
  const [selectedProviders, setSelectedProviders] = useState<Set<UsageProvider>>(new Set());
  const [layout, setLayout] = useState<LayoutOption>('row');
  const [type, setType] = useState<TypeOption>('primary');
  const [theme, setTheme] = useState<ThemeOption>('dark');
  
  const [previewLoading, setPreviewLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    loadConfigs();
  }, []);

  const loadConfigs = async () => {
    setLoading(true);
    try {
      const allConfigs = await credentialService.getAllConfigs();
      const enabledConfigs = Object.values(allConfigs);
      setConfigs(enabledConfigs);
      
      if (enabledConfigs.length > 0) {
        setSelectedProviders(new Set([enabledConfigs[0].provider]));
      }
    } catch (error) {
      console.error('Failed to load configs', error);
    } finally {
      setLoading(false);
    }
  };

  const toggleProvider = (provider: UsageProvider) => {
    setPreviewLoading(true);
    setSelectedProviders(prev => {
      const next = new Set(prev);
      if (next.has(provider)) {
        if (next.size > 1) next.delete(provider);
      } else {
        next.add(provider);
      }
      return next;
    });
  };

  const getWidgetUrl = () => {
    return `${window.location.origin}/api/widget/image?providers=${Array.from(selectedProviders).join(',')}&layout=${layout}&type=${type}&theme=${theme}`;
  };

  const widgetUrl = getWidgetUrl();

  const copyToClipboard = async () => {
    try {
      await navigator.clipboard.writeText(widgetUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy text: ', err);
    }
  };

  if (loading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  if (configs.length === 0) {
    return (
      <div className="p-8 max-w-7xl mx-auto flex flex-col items-center justify-center py-24 px-4 animate-fade-in">
        <div className="w-16 h-16 rounded-2xl bg-[var(--color-bg-subtle)] flex items-center justify-center mb-4">
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="var(--color-text-muted)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 2L2 7l10 5 10-5-10-5z"/>
          </svg>
        </div>
        <h2 className="text-lg font-medium text-[var(--color-text-primary)] mb-1">
          No providers available
        </h2>
        <p className="text-sm text-[var(--color-text-tertiary)] text-center max-w-sm">
          Add some providers in Settings first to generate a widget.
        </p>
      </div>
    );
  }

  return (
    <div className="p-8 max-w-7xl mx-auto animate-fade-in">
      <div className="mb-8">
        <h1 className="text-2xl font-semibold text-[var(--color-text-primary)] tracking-tight">
          Lockscreen Widget
        </h1>
        <p className="text-sm text-[var(--color-text-tertiary)] mt-1">
          Design a custom widget image for your mobile lockscreen or Scriptable.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 items-start">
        
        <div className="lg:col-span-5 flex flex-col items-center justify-start lg:sticky lg:top-24 mb-10 lg:mb-0 z-10">
          
          <div className="relative w-[280px] h-[580px] bg-[#1a1a1a] rounded-[48px] p-3 shadow-2xl border border-white/10" style={{ boxShadow: '0 40px 80px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.05)' }}>
            <div className="absolute top-3 left-1/2 -translate-x-1/2 w-[100px] h-[28px] bg-black rounded-b-[16px] z-20"></div>
            
            <div 
              className="w-full h-full rounded-[36px] overflow-hidden relative flex flex-col"
              style={{
                backgroundColor: theme === 'dark' ? '#000' : '#f5f5f5',
                backgroundImage: theme === 'dark' 
                  ? 'radial-gradient(circle at top, #222 0%, #000 100%)'
                  : 'radial-gradient(circle at top, #fff 0%, #eaeaea 100%)'
              }}
            >
              <div className="w-full flex justify-center pt-14 pb-8 z-10">
                <span className={`text-[64px] font-medium tracking-tight ${theme === 'dark' ? 'text-white/90' : 'text-black/80'}`} style={{ fontFamily: '-apple-system, BlinkMacSystemFont' }}>
                  9:41
                </span>
              </div>

              <div className="w-full px-4 flex justify-center items-start min-h-[160px] relative z-10">
                {previewLoading && (
                  <div className="absolute inset-0 flex items-center justify-center z-20">
                    <LoadingSpinner />
                  </div>
                )}
                
                {selectedProviders.size > 0 ? (
                  <img 
                    src={`/api/widget/image?providers=${Array.from(selectedProviders).join(',')}&layout=${layout}&type=${type}&theme=${theme}`}
                    alt="Widget Preview" 
                    className={`max-w-full object-contain transition-opacity duration-300 ${previewLoading ? 'opacity-50' : 'opacity-100'}`}
                    style={{ filter: theme === 'dark' ? 'drop-shadow(0 4px 12px rgba(0,0,0,0.5))' : 'drop-shadow(0 4px 12px rgba(0,0,0,0.1))' }}
                    onLoad={() => setPreviewLoading(false)}
                    onError={() => setPreviewLoading(false)}
                    key={`${Array.from(selectedProviders).join(',')}-${layout}-${type}-${theme}`}
                  />
                ) : (
                  <div className={`w-full h-[120px] rounded-2xl flex items-center justify-center border-2 border-dashed ${theme === 'dark' ? 'border-white/20 text-white/40' : 'border-black/20 text-black/40'}`}>
                    Select a provider
                  </div>
                )}
              </div>

              <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex gap-4 opacity-40 z-10">
                <div className={`w-12 h-12 rounded-2xl ${theme === 'dark' ? 'bg-white/20' : 'bg-black/10'}`}></div>
                <div className={`w-12 h-12 rounded-2xl ${theme === 'dark' ? 'bg-white/20' : 'bg-black/10'}`}></div>
                <div className={`w-12 h-12 rounded-2xl ${theme === 'dark' ? 'bg-white/20' : 'bg-black/10'}`}></div>
                <div className={`w-12 h-12 rounded-2xl ${theme === 'dark' ? 'bg-white/20' : 'bg-black/10'}`}></div>
              </div>
            </div>

            <div className="absolute bottom-4 left-1/2 -translate-x-1/2 w-32 h-1 bg-white/30 rounded-full z-20"></div>
          </div>
          <p className="text-sm font-medium text-[var(--color-text-tertiary)] mt-6 flex items-center gap-2">
            <span className="relative flex h-2.5 w-2.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[var(--color-text-primary)] opacity-40"></span>
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-[var(--color-text-primary)]"></span>
            </span>
            Live Preview
          </p>
        </div>

        <div className="lg:col-span-7 space-y-8">
          
          <WidgetControls
            configs={configs}
            selectedProviders={selectedProviders}
            toggleProvider={toggleProvider}
            layout={layout}
            setLayout={setLayout}
            type={type}
            setType={setType}
            theme={theme}
            setTheme={setTheme}
            setPreviewLoading={setPreviewLoading}
          />

          <div className="bg-[var(--color-surface)] p-8 rounded-3xl border border-[var(--color-border-subtle)] shadow-sm">
            <h3 className="text-sm font-medium text-[var(--color-text-primary)] flex items-center gap-2 mb-4">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/>
                <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>
              </svg>
              Integration URL
            </h3>
            
            <div className="flex gap-2">
              <input 
                type="text" 
                readOnly 
                value={widgetUrl}
                className="flex-1 bg-[var(--color-bg-subtle)] border border-[var(--color-border-subtle)] rounded-xl px-4 py-3 text-sm text-[var(--color-text-primary)] font-mono outline-none focus:ring-2 focus:ring-[var(--color-text-primary)]/20 transition-shadow"
              />
              <button
                onClick={copyToClipboard}
                className="flex items-center justify-center gap-2 px-6 py-3 bg-[var(--color-text-primary)] text-white rounded-xl text-sm font-medium hover:opacity-90 transition-opacity cursor-pointer flex-shrink-0"
              >
                {copied ? (
                  <>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="20 6 9 17 4 12"/>
                    </svg>
                    Copied
                  </>
                ) : (
                  <>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
                      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
                    </svg>
                    Copy
                  </>
                )}
              </button>
            </div>
            
            <div className="mt-5 p-4 rounded-xl bg-blue-500/10 border border-blue-500/20 text-blue-600 dark:text-blue-400">
              <p className="text-sm flex gap-2">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="flex-shrink-0 mt-0.5">
                  <circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/>
                </svg>
                <span className="leading-relaxed">
                  <strong>How to use:</strong> Add a Scriptable or web widget to your iOS lock screen and set this URL as the image source.
                </span>
              </p>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
};

interface WidgetControlsProps {
  configs: ProviderConfig[];
  selectedProviders: Set<UsageProvider>;
  toggleProvider: (p: UsageProvider) => void;
  layout: LayoutOption;
  setLayout: (l: LayoutOption) => void;
  type: TypeOption;
  setType: (t: TypeOption) => void;
  theme: ThemeOption;
  setTheme: (t: ThemeOption) => void;
  setPreviewLoading: (l: boolean) => void;
}

const WidgetControls: React.FC<WidgetControlsProps> = ({
  configs, selectedProviders, toggleProvider,
  layout, setLayout, type, setType, theme, setTheme, setPreviewLoading
}) => {
  return (
    <div className="bg-[var(--color-surface)] p-8 rounded-3xl border border-[var(--color-border-subtle)] shadow-sm">
      <h2 className="text-xl font-semibold text-[var(--color-text-primary)] mb-6">Personalize</h2>
      
      <div className="space-y-8">
        <div>
          <label className="block text-sm font-medium text-[var(--color-text-primary)] mb-1">Providers</label>
          <p className="text-xs text-[var(--color-text-tertiary)] mb-4">Select which AI providers to show in your widget.</p>
          <div className="flex flex-wrap gap-2">
            {configs.map(config => {
              const isSelected = selectedProviders.has(config.provider);
              return (
                <button
                  key={config.provider}
                  onClick={() => toggleProvider(config.provider)}
                  className={`px-4 py-2 rounded-xl text-sm font-medium transition-all duration-200 border cursor-pointer flex items-center gap-2 ${
                    isSelected 
                      ? 'bg-[var(--color-text-primary)] border-[var(--color-text-primary)] text-white shadow-sm' 
                      : 'bg-transparent border-[var(--color-border-subtle)] text-[var(--color-text-secondary)] hover:border-[var(--color-text-primary)] hover:text-[var(--color-text-primary)]'
                  }`}
                >
                  {isSelected && (
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="20 6 9 17 4 12"/>
                    </svg>
                  )}
                  {PROVIDER_NAMES[config.provider] || config.provider}
                </button>
              );
            })}
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-[var(--color-text-primary)] mb-3">Widget Layout</label>
          <div className="flex bg-[var(--color-bg-subtle)] p-1.5 rounded-xl border border-[var(--color-border-subtle)]">
            {(['row', 'col', 'grid'] as LayoutOption[]).map(l => (
              <button
                key={l}
                onClick={() => { setPreviewLoading(true); setLayout(l); }}
                className={`flex-1 py-2 text-sm font-medium rounded-lg capitalize transition-all cursor-pointer ${
                  layout === l 
                    ? 'bg-[var(--color-surface)] shadow-sm text-[var(--color-text-primary)] border border-black/5 dark:border-white/5' 
                    : 'text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] border border-transparent'
                }`}
              >
                {l === 'row' ? 'Horizontal' : l === 'col' ? 'Vertical' : 'Grid'}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-[var(--color-text-primary)] mb-3">Data Metric</label>
          <div className="grid grid-cols-2 gap-3">
            {[
              { id: 'primary', label: 'First Quota', icon: 'M12 2L2 7l10 5 10-5-10-5z' },
              { id: 'secondary', label: 'Second Quota', icon: 'M2 17l10 5 10-5' },
              { id: 'tertiary', label: 'Third Quota', icon: 'M12 22V12' },
              { id: 'cost', label: 'Overage Cost', icon: 'M12 1v22M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6' },
            ].map(item => {
              const isSelected = type === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => { setPreviewLoading(true); setType(item.id as TypeOption); }}
                  className={`p-4 rounded-xl text-left transition-all duration-200 border cursor-pointer flex flex-col gap-3 ${
                    isSelected 
                      ? 'bg-[var(--color-bg-subtle)] border-[var(--color-text-primary)]' 
                      : 'bg-transparent border-[var(--color-border-subtle)] hover:bg-[var(--color-bg-subtle)]'
                  }`}
                >
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={isSelected ? 'var(--color-text-primary)' : 'var(--color-text-muted)'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d={item.icon}/>
                  </svg>
                  <span className={`text-sm font-medium ${isSelected ? 'text-[var(--color-text-primary)]' : 'text-[var(--color-text-secondary)]'}`}>
                    {item.label}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-[var(--color-text-primary)] mb-3">Theme</label>
          <div className="flex bg-[var(--color-bg-subtle)] p-1.5 rounded-xl border border-[var(--color-border-subtle)]">
            {(['dark', 'light'] as ThemeOption[]).map(t => (
              <button
                key={t}
                onClick={() => { setPreviewLoading(true); setTheme(t); }}
                className={`flex-1 py-2 text-sm font-medium rounded-lg capitalize transition-all cursor-pointer flex items-center justify-center gap-2 ${
                  theme === t 
                    ? 'bg-[var(--color-surface)] shadow-sm text-[var(--color-text-primary)] border border-black/5 dark:border-white/5' 
                    : 'text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] border border-transparent'
                }`}
              >
                {t === 'dark' ? (
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>
                ) : (
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="5"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/></svg>
                )}
                {t} Mode
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
