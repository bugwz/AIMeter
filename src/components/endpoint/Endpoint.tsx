import React, { useState, useMemo } from 'react';
import { UsageProvider, PROVIDER_NAMES, PROVIDER_COLORS } from '../../types/provider';
import { providerLogos } from '../common/providerLogos';
import { SelectField } from '../common/SelectField';

type OutputFormat = 'json' | 'xml' | 'table' | 'markdown' | 'csv';

interface EndpointConfig {
  selectedProviders: UsageProvider[];
  format: OutputFormat;
  pretty: boolean;
  timezone: string;
}
type RequestView = 'url' | 'curl';

const ALL_PROVIDERS = Object.values(UsageProvider).sort((left, right) =>
  (PROVIDER_NAMES[left] || left).localeCompare(PROVIDER_NAMES[right] || right)
);

const isWideChar = (cp: number): boolean =>
  (cp >= 0x1100 && cp <= 0x115f) ||
  cp === 0x2329 || cp === 0x232a ||
  (cp >= 0x2e80 && cp <= 0x3247 && cp !== 0x303f) ||
  (cp >= 0x3250 && cp <= 0x4dbf) ||
  (cp >= 0x4e00 && cp <= 0xa4c6) ||
  (cp >= 0xa960 && cp <= 0xa97c) ||
  (cp >= 0xac00 && cp <= 0xd7a3) ||
  (cp >= 0xf900 && cp <= 0xfaff) ||
  (cp >= 0xfe10 && cp <= 0xfe19) ||
  (cp >= 0xfe30 && cp <= 0xfe6b) ||
  (cp >= 0xff01 && cp <= 0xff60) ||
  (cp >= 0xffe0 && cp <= 0xffe6) ||
  (cp >= 0x1b000 && cp <= 0x1b001) ||
  (cp >= 0x1f200 && cp <= 0x1f251) ||
  (cp >= 0x20000 && cp <= 0x3fffd);

const displayWidth = (text: string): number => {
  let w = 0;
  for (const ch of text) { const cp = ch.codePointAt(0) ?? 0; w += isWideChar(cp) ? 2 : 1; }
  return w;
};

// Convert plain table text to HTML, wrapping wide (CJK) characters in
// <span style="display:inline-block;width:2ch"> so they are forced to
// occupy exactly 2 ASCII-character widths, regardless of font fallback.
const tableTextToHtml = (text: string): string => {
  const out: string[] = [];
  for (const ch of text) {
    if (ch === '&') { out.push('&amp;'); continue; }
    if (ch === '<') { out.push('&lt;'); continue; }
    if (ch === '>') { out.push('&gt;'); continue; }
    const cp = ch.codePointAt(0) ?? 0;
    if (isWideChar(cp)) {
      out.push(`<span style="display:inline-block;width:2ch;overflow:visible;vertical-align:top">${ch}</span>`);
    } else {
      out.push(ch);
    }
  }
  return out.join('');
};


const FORMAT_OPTIONS: { value: OutputFormat; label: string; desc: string }[] = [
  { value: 'json', label: 'JSON', desc: 'Standard API response' },
  { value: 'xml', label: 'XML', desc: 'Traditional system integration' },
  { value: 'table', label: 'Table', desc: 'Terminal table format' },
  { value: 'markdown', label: 'Markdown', desc: 'Documentation friendly' },
  { value: 'csv', label: 'CSV', desc: 'Excel compatible' },
];

const TIMEZONE_OPTIONS = [
  { value: 'Pacific/Midway', label: 'Pacific/Midway (UTC-11)' },
  { value: 'Pacific/Honolulu', label: 'Pacific/Honolulu (UTC-10)' },
  { value: 'America/Anchorage', label: 'America/Anchorage (UTC-9)' },
  { value: 'America/Los_Angeles', label: 'America/Los_Angeles (UTC-8)' },
  { value: 'America/Denver', label: 'America/Denver (UTC-7)' },
  { value: 'America/Chicago', label: 'America/Chicago (UTC-6)' },
  { value: 'America/New_York', label: 'America/New_York (UTC-5)' },
  { value: 'America/Sao_Paulo', label: 'America/Sao_Paulo (UTC-3)' },
  { value: 'UTC', label: 'UTC (UTC+0)' },
  { value: 'Europe/London', label: 'Europe/London (UTC+0)' },
  { value: 'Europe/Paris', label: 'Europe/Paris (UTC+1)' },
  { value: 'Europe/Berlin', label: 'Europe/Berlin (UTC+1)' },
  { value: 'Africa/Cairo', label: 'Africa/Cairo (UTC+2)' },
  { value: 'Europe/Moscow', label: 'Europe/Moscow (UTC+3)' },
  { value: 'Asia/Dubai', label: 'Asia/Dubai (UTC+4)' },
  { value: 'Asia/Karachi', label: 'Asia/Karachi (UTC+5)' },
  { value: 'Asia/Kolkata', label: 'Asia/Kolkata (UTC+5:30)' },
  { value: 'Asia/Dhaka', label: 'Asia/Dhaka (UTC+6)' },
  { value: 'Asia/Bangkok', label: 'Asia/Bangkok (UTC+7)' },
  { value: 'Asia/Shanghai', label: 'Asia/Shanghai (UTC+8)' },
  { value: 'Asia/Singapore', label: 'Asia/Singapore (UTC+8)' },
  { value: 'Asia/Hong_Kong', label: 'Asia/Hong_Kong (UTC+8)' },
  { value: 'Asia/Tokyo', label: 'Asia/Tokyo (UTC+9)' },
  { value: 'Asia/Seoul', label: 'Asia/Seoul (UTC+9)' },
  { value: 'Australia/Sydney', label: 'Australia/Sydney (UTC+10)' },
  { value: 'Pacific/Auckland', label: 'Pacific/Auckland (UTC+12)' },
];

const ProviderLogo: React.FC<{ provider: UsageProvider; size?: number }> = ({ provider, size = 40 }) => {
  const logoPath = providerLogos[provider];
  if (!logoPath) {
    return (
      <div 
        className="rounded-xl flex items-center justify-center font-semibold"
        style={{ 
          width: size, 
          height: size, 
          backgroundColor: PROVIDER_COLORS[provider] || '#666',
          color: '#fff',
          fontSize: size * 0.4
        }}
      >
        {PROVIDER_NAMES[provider]?.[0] || '?'}
      </div>
    );
  }
  return <img src={logoPath} alt={provider} style={{ width: size, height: size }} className="rounded-xl" />;
};

export const Endpoint: React.FC = () => {
  const [config, setConfig] = useState<EndpointConfig>({
    selectedProviders: [],
    format: 'json',
    pretty: true,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  });
  const [previewData, setPreviewData] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState<'url' | 'curl' | null>(null);
  const [requestView, setRequestView] = useState<RequestView>('url');

  const apiBaseUrl = `${window.location.origin}/api`;
  const supportsPretty = config.format === 'json' || config.format === 'xml' || config.format === 'markdown';
  const supportsTimezone = config.format === 'table' || config.format === 'markdown';

  const generatedUrl = useMemo(() => {
    const params = new URLSearchParams();
    if (config.selectedProviders.length > 0) {
      params.append('providers', config.selectedProviders.join(','));
    }
    params.append('format', config.format);
    if (supportsPretty) {
      params.append('pretty', config.pretty.toString());
    }
    if (supportsTimezone) {
      params.append('timezone', config.timezone);
    }
    return `${apiBaseUrl}/endpoint/subscriptions?${params.toString()}`;
  }, [config, apiBaseUrl, supportsPretty, supportsTimezone]);

  const generatedCurl = useMemo(() => {
    return `curl -H "x-aimeter-endpoint-secret: <your-secret>" '${generatedUrl}'`;
  }, [generatedUrl]);

  const copyToClipboard = (text: string, type: 'url' | 'curl') => {
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(text);
    } else {
      const textArea = document.createElement('textarea');
      textArea.value = text;
      textArea.style.position = 'fixed';
      textArea.style.left = '-999999px';
      document.body.appendChild(textArea);
      textArea.select();
      try {
        document.execCommand('copy');
      } catch (err) {
        console.error('Failed to copy:', err);
      }
      document.body.removeChild(textArea);
    }
    setCopied(type);
    setTimeout(() => setCopied(null), 2000);
  };

  const handleProviderToggle = (provider: UsageProvider) => {
    setConfig(prev => ({
      ...prev,
      selectedProviders: prev.selectedProviders.includes(provider)
        ? prev.selectedProviders.filter(p => p !== provider)
        : [...prev.selectedProviders, provider],
    }));
  };

  const handleSelectAll = () => {
    setConfig(prev => ({ ...prev, selectedProviders: [...ALL_PROVIDERS] }));
  };

  const handleClearAll = () => {
    setConfig(prev => ({ ...prev, selectedProviders: [] }));
  };

  const handleTestEndpoint = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (config.selectedProviders.length > 0) {
        params.append('providers', config.selectedProviders.join(','));
      }
      params.append('format', config.format);
      if (supportsPretty) {
        params.append('pretty', config.pretty.toString());
      }
      if (supportsTimezone) {
        params.append('timezone', config.timezone);
      }

      const response = await fetch(`${apiBaseUrl}/endpoint/subscriptions?${params.toString()}`);
      
      if (config.format === 'json') {
        const data = await response.json();
        setPreviewData(config.pretty ? JSON.stringify(data, null, 2) : JSON.stringify(data));
      } else {
        const text = await response.text();
        setPreviewData(text);
      }
    } catch (error) {
      setPreviewData(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setLoading(false);
    }
  };

  const splitAsciiRow = (line: string): string[] => {
    if (!line.startsWith('│') || !line.endsWith('│')) return [];
    return line
      .slice(1, -1)
      .split('│')
      .map((cell) => cell.trim());
  };

  const normalizeAsciiTableForPreview = (raw: string): string => {
    const lines = raw.split('\n');
    const tableLines = lines.filter((line) => /[┌┬┐├┼┤└┴┘│]/.test(line));
    const summaryLines = lines.filter((line) => line.startsWith('Summary:'));
    if (!tableLines.length) return raw;

    const rowLines = tableLines.filter((line) => line.startsWith('│') && line.endsWith('│'));
    if (rowLines.length < 2) return raw;

    const header = splitAsciiRow(rowLines[0]);
    if (!header.length) return raw;

    const dataRows = rowLines.slice(1).map(splitAsciiRow).filter((cells) => cells.length === header.length);
    const allRows = [header, ...dataRows];
    const colCount = header.length;

    const toUnits = displayWidth;

    const colUnits = new Array<number>(colCount).fill(0);
    for (let col = 0; col < colCount; col += 1) {
      colUnits[col] = allRows.reduce((max, row) => Math.max(max, toUnits(row[col] || '')), 0);
    }

    const fit = (text: string, width: number): string => {
      const units = toUnits(text);
      if (units >= width) return text;
      return `${text}${' '.repeat(width - units)}`;
    };

    const border = (left: string, mid: string, right: string): string =>
      `${left}${colUnits.map((w) => '─'.repeat(w + 2)).join(mid)}${right}`;

    const renderRow = (cells: string[]): string =>
      `│ ${cells.map((cell, idx) => fit(cell || '', colUnits[idx])).join(' │ ')} │`;

    const bodyRowsRaw = tableLines.slice(3, -1);
    const bodyTokens: Array<{ type: 'row'; cells: string[] } | { type: 'sep' }> = [];
    for (const line of bodyRowsRaw) {
      if (line.startsWith('│') && line.endsWith('│')) {
        const cells = splitAsciiRow(line);
        if (cells.length === colCount) bodyTokens.push({ type: 'row', cells });
      } else if (line.startsWith('├') && line.endsWith('┤')) {
        bodyTokens.push({ type: 'sep' });
      }
    }

    const rebuilt: string[] = [];
    rebuilt.push(border('┌', '┬', '┐'));
    rebuilt.push(renderRow(header));
    rebuilt.push(border('├', '┼', '┤'));
    bodyTokens.forEach((token) => {
      if (token.type === 'sep') rebuilt.push(border('├', '┼', '┤'));
      else rebuilt.push(renderRow(token.cells));
    });
    rebuilt.push(border('└', '┴', '┘'));
    if (summaryLines.length) {
      rebuilt.push('');
      rebuilt.push('');
      rebuilt.push(...summaryLines);
    }

    return rebuilt.join('\n');
  };

  const splitMarkdownRow = (line: string): string[] => {
    if (!line.trim().startsWith('|') || !line.trim().endsWith('|')) return [];
    return line
      .trim()
      .slice(1, -1)
      .split('|')
      .map((cell) => cell.trim());
  };

  const normalizeMarkdownTableForPreview = (raw: string): string => {
    const lines = raw.split('\n');
    const tableStart = lines.findIndex((line) => line.trim().startsWith('|') && line.trim().endsWith('|'));
    if (tableStart < 0) return raw;

    let tableEnd = tableStart;
    while (tableEnd < lines.length && lines[tableEnd].trim().startsWith('|') && lines[tableEnd].trim().endsWith('|')) {
      tableEnd += 1;
    }

    const tableLines = lines.slice(tableStart, tableEnd);
    if (tableLines.length < 2) return raw;

    const header = splitMarkdownRow(tableLines[0]);
    if (!header.length) return raw;
    const colCount = header.length;
    const dataRows = tableLines
      .slice(2)
      .map(splitMarkdownRow)
      .filter((cells) => cells.length === colCount);

    const allRows = [header, ...dataRows];
    const colUnits = new Array<number>(colCount).fill(0);
    for (let col = 0; col < colCount; col += 1) {
      colUnits[col] = allRows.reduce((max, row) => Math.max(max, displayWidth(row[col] || '')), 3);
    }

    const fit = (text: string, width: number): string => {
      const units = displayWidth(text);
      if (units >= width) return text;
      return `${text}${' '.repeat(width - units)}`;
    };

    const renderRow = (cells: string[]): string =>
      `| ${cells.map((cell, idx) => fit(cell || '', colUnits[idx])).join(' | ')} |`;
    const renderAlign = (): string =>
      `| ${colUnits.map((width) => `:${'-'.repeat(Math.max(width - 2, 1))}:`).join(' | ')} |`;

    const rebuiltTable = [renderRow(header), renderAlign(), ...dataRows.map((row) => renderRow(row))];
    return [...lines.slice(0, tableStart), ...rebuiltTable, ...lines.slice(tableEnd)].join('\n');
  };

  const previewPreClass = config.format === 'table' || config.format === 'markdown'
    ? 'p-4 rounded-lg bg-[var(--color-bg-subtle)] text-xs text-[var(--color-text-secondary)] overflow-auto max-h-96 font-mono whitespace-pre'
    : 'p-4 rounded-lg bg-[var(--color-bg-subtle)] text-xs text-[var(--color-text-secondary)] overflow-auto max-h-96 font-mono whitespace-pre-wrap break-all';

  const tablePreviewStyle = config.format === 'table' || config.format === 'markdown'
    ? { fontFamily: '"SF Mono","Cascadia Mono","Fira Code","Noto Sans Mono CJK SC","Sarasa Mono SC","Menlo",monospace' as const }
    : undefined;
  const previewText = useMemo(() => {
    if (!previewData) return previewData;
    if (config.format === 'table') return normalizeAsciiTableForPreview(previewData);
    if (config.format === 'markdown') return normalizeMarkdownTableForPreview(previewData);
    return previewData;
  }, [config.format, previewData]);

  return (
    <div className="p-8 max-w-7xl mx-auto">
      <div className="mb-8 animate-fade-in">
        <h1 className="text-2xl font-semibold text-[var(--color-text-primary)] tracking-tight">
          Endpoint
        </h1>
        <p className="text-sm text-[var(--color-text-tertiary)] mt-1">
          Configure and access subscription data via API
        </p>
      </div>

      <div className="space-y-6">
        <div className="grid grid-cols-1 gap-6">
          <div className="group relative bg-[var(--color-surface)] rounded-xl p-5 card-hover gradient-border animate-fade-in" style={{ boxShadow: 'var(--shadow-card)' }}>
            <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 mb-4">
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 rounded-xl flex items-center justify-center bg-[var(--color-accent-subtle)]">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--color-accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/>
                    <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>
                  </svg>
                </div>
                <div>
                  <h2 className="text-[15px] font-semibold text-[var(--color-text-primary)]">
                    Generated URL
                  </h2>
                  <p className="text-xs text-[var(--color-text-tertiary)]">
                    Generate request URL or cURL command
                  </p>
                </div>
              </div>
              <div className="inline-flex w-full sm:w-auto rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-subtle)] p-1">
                <button
                  onClick={() => setRequestView('url')}
                  className={`flex-1 sm:flex-none px-3 py-1.5 text-xs rounded-md transition-colors ${
                    requestView === 'url'
                      ? 'bg-[var(--color-surface)] text-[var(--color-text-primary)]'
                      : 'text-[var(--color-text-tertiary)] hover:text-[var(--color-text-primary)]'
                  }`}
                >
                  URL
                </button>
                <button
                  onClick={() => setRequestView('curl')}
                  className={`flex-1 sm:flex-none px-3 py-1.5 text-xs rounded-md transition-colors ${
                    requestView === 'curl'
                      ? 'bg-[var(--color-surface)] text-[var(--color-text-primary)]'
                      : 'text-[var(--color-text-tertiary)] hover:text-[var(--color-text-primary)]'
                  }`}
                >
                  cURL
                </button>
              </div>
            </div>

            <div className="relative">
              <pre className="p-4 pr-14 rounded-lg bg-[var(--color-bg-subtle)] text-xs text-[var(--color-text-secondary)] whitespace-pre-wrap break-all font-mono">
                {requestView === 'url' ? generatedUrl : generatedCurl}
              </pre>
              <button
                onClick={() => copyToClipboard(requestView === 'url' ? generatedUrl : generatedCurl, requestView)}
                className="absolute top-3 right-3 p-2 rounded-lg bg-[var(--color-surface)] border border-[var(--color-border)] hover:bg-[var(--color-bg-subtle)] transition-all duration-200"
                title={requestView === 'url' ? 'Copy URL' : 'Copy cURL'}
              >
                {copied === requestView ? (
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--color-success)" strokeWidth="2">
                    <path d="M20 6 9 17l-5-5"/>
                  </svg>
                ) : (
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
                    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
                  </svg>
                )}
              </button>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
          <div className="col-span-1 lg:col-span-3 group bg-[var(--color-surface)] rounded-xl p-5 card-hover gradient-border animate-fade-in" style={{ boxShadow: 'var(--shadow-card)' }}>
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 rounded-xl flex items-center justify-center bg-[var(--color-accent-subtle)] shrink-0">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--color-accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
                    <path d="M22 4 12 14.01l-3-3"/>
                  </svg>
                </div>
                <div>
                  <h2 className="text-[15px] font-semibold text-[var(--color-text-primary)]">
                    Providers
                  </h2>
                  <p className="text-xs text-[var(--color-text-tertiary)]">
                    Select providers to include
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2 sm:gap-3">
                <span className="text-xs text-[var(--color-text-muted)]">
                  {config.selectedProviders.length} selected
                </span>
                <button 
                  onClick={handleSelectAll} 
                  className="btn-primary !py-1.5 !px-3 !text-xs"
                >
                  Select All
                </button>
                <button 
                  onClick={handleClearAll} 
                  className="btn-primary !py-1.5 !px-3 !text-xs"
                >
                  Clear
                </button>
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
              {ALL_PROVIDERS.map(provider => (
                <button
                  key={provider}
                  onClick={() => handleProviderToggle(provider)}
                  className={`group/provider flex flex-col items-center gap-1.5 p-3 rounded-xl transition-all duration-200 hover:scale-[1.02] ${
                    config.selectedProviders.includes(provider)
                      ? 'bg-[var(--color-accent-subtle)] border-2 border-[var(--color-accent)]'
                      : 'bg-[var(--color-bg-subtle)] border-2 border-transparent hover:border-[var(--color-border)]'
                  }`}
                >
                  <ProviderLogo provider={provider} size={32} />
                  <span className="text-xs font-medium text-[var(--color-text-secondary)] truncate w-full text-center group-hover/provider:text-[var(--color-text-primary)]">
                    {PROVIDER_NAMES[provider]}
                  </span>
                </button>
              ))}
            </div>
          </div>

          <div className="col-span-1 lg:col-span-2 group bg-[var(--color-surface)] rounded-xl p-5 card-hover gradient-border animate-fade-in stagger-1" style={{ boxShadow: 'var(--shadow-card)' }}>
            <div className="flex items-center gap-3 mb-4">
              <div className="w-11 h-11 rounded-xl flex items-center justify-center bg-[var(--color-accent-subtle)]">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--color-accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/>
                  <circle cx="12" cy="12" r="3"/>
                </svg>
              </div>
              <div>
                <h2 className="text-[15px] font-semibold text-[var(--color-text-primary)]">
                  Options
                </h2>
                <p className="text-xs text-[var(--color-text-tertiary)]">
                  Configuration settings
                </p>
              </div>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-[var(--color-text-secondary)] tracking-wide mb-2">
                  Output Format
                </label>
                <SelectField
                  value={config.format}
                  onChange={(value) => setConfig(prev => ({ ...prev, format: value as OutputFormat }))}
                  options={FORMAT_OPTIONS.map((option) => ({
                    value: option.value,
                    label: option.label,
                  }))}
                  className="input-field select-field"
                />
              </div>

              {supportsPretty && (
                <div>
                  <label className="block text-xs font-medium text-[var(--color-text-secondary)] tracking-wide mb-2">
                    Pretty Print
                  </label>
                  <div className="flex items-center justify-between p-3 rounded-lg bg-[var(--color-bg-subtle)]">
                    <span className="text-sm text-[var(--color-text-secondary)]">Enable pretty printing</span>
                    <button
                      onClick={() => setConfig(prev => ({ ...prev, pretty: !prev.pretty }))}
                      className={`relative w-11 h-6 rounded-full transition-colors ${
                        config.pretty ? 'bg-[var(--color-accent)]' : 'bg-[var(--color-border)]'
                      }`}
                    >
                      <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow-md transition-transform ${config.pretty ? 'translate-x-5' : ''}`} />
                    </button>
                  </div>
                </div>
              )}

              {supportsTimezone && (
                <div>
                  <label className="block text-xs font-medium text-[var(--color-text-secondary)] tracking-wide mb-2">
                    Timezone
                  </label>
                  <SelectField
                    value={config.timezone}
                    onChange={(value) => setConfig(prev => ({ ...prev, timezone: value }))}
                    options={TIMEZONE_OPTIONS}
                    className="input-field select-field"
                  />
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-6">
          <div className="group bg-[var(--color-surface)] rounded-xl p-5 card-hover gradient-border animate-fade-in stagger-1" style={{ boxShadow: 'var(--shadow-card)' }}>
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 rounded-xl flex items-center justify-center bg-[var(--color-accent-subtle)] shrink-0">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--color-accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                    <circle cx="12" cy="12" r="3"/>
                  </svg>
                </div>
                <div>
                  <h2 className="text-[15px] font-semibold text-[var(--color-text-primary)]">
                    Preview
                  </h2>
                  <p className="text-xs text-[var(--color-text-tertiary)]">
                    API response preview
                  </p>
                </div>
              </div>
              <button
                onClick={handleTestEndpoint}
                disabled={loading}
                className="btn-primary !py-2 !px-4"
              >
                {loading ? (
                  <span className="animate-spin">⟳</span>
                ) : (
                  <>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M22 2 11 13"/>
                      <path d="M22 2l-7 20-4-9-9-4 20-7z"/>
                    </svg>
                    Send Request
                  </>
                )}
              </button>
            </div>

            {previewData ? (
              config.format === 'table' || config.format === 'markdown' ? (
                <pre
                  className={previewPreClass}
                  style={tablePreviewStyle}
                  dangerouslySetInnerHTML={{ __html: tableTextToHtml(previewText) }}
                />
              ) : (
                <pre className={previewPreClass} style={tablePreviewStyle}>
                  {previewText}
                </pre>
              )
            ) : (
              <div className="p-8 rounded-lg bg-[var(--color-bg-subtle)] border border-[var(--color-border)] border-dashed text-center flex flex-col items-center justify-center min-h-[20rem]">
                <div className="w-12 h-12 rounded-xl bg-[var(--color-surface)] flex items-center justify-center mb-3">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--color-text-muted)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                    <circle cx="12" cy="12" r="3"/>
                  </svg>
                </div>
                <p className="text-sm text-[var(--color-text-muted)]">Click "Send Request" to preview the response</p>
              </div>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 gap-6">
          <div className="group bg-[var(--color-surface)] rounded-xl p-5 card-hover gradient-border animate-fade-in stagger-1" style={{ boxShadow: 'var(--shadow-card)' }}>
            <div className="flex items-center gap-3 mb-4">
              <div className="w-11 h-11 rounded-xl flex items-center justify-center bg-[var(--color-accent-subtle)]">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--color-accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/>
                  <polyline points="14 2 14 8 20 8"/>
                  <line x1="16" y1="13" x2="8" y2="13"/>
                  <line x1="16" y1="17" x2="8" y2="17"/>
                  <line x1="10" y1="9" x2="8" y2="9"/>
                </svg>
              </div>
              <div>
                <h2 className="text-[15px] font-semibold text-[var(--color-text-primary)]">
                  API Parameters
                </h2>
                <p className="text-xs text-[var(--color-text-tertiary)]">
                  Available query parameters
                </p>
              </div>
            </div>

            <div className="overflow-x-auto rounded-lg border border-[var(--color-border)]">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-[var(--color-bg-subtle)]">
                    <th className="text-left py-3 px-4 font-semibold text-[var(--color-text-secondary)]">Parameter</th>
                    <th className="text-left py-3 px-4 font-semibold text-[var(--color-text-secondary)]">Type</th>
                    <th className="text-left py-3 px-4 font-semibold text-[var(--color-text-secondary)]">Default</th>
                    <th className="text-left py-3 px-4 font-semibold text-[var(--color-text-secondary)]">Description</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-t border-[var(--color-border)]">
                    <td className="py-3 px-4 font-mono text-[var(--color-accent)]">providers</td>
                    <td className="py-3 px-4 text-[var(--color-text-tertiary)]">string</td>
                    <td className="py-3 px-4 text-[var(--color-text-tertiary)]">all</td>
                    <td className="py-3 px-4 text-[var(--color-text-tertiary)]">Comma-separated provider IDs</td>
                  </tr>
                  <tr className="border-t border-[var(--color-border)]">
                    <td className="py-3 px-4 font-mono text-[var(--color-accent)]">format</td>
                    <td className="py-3 px-4 text-[var(--color-text-tertiary)]">string</td>
                    <td className="py-3 px-4 text-[var(--color-text-tertiary)]">json</td>
                    <td className="py-3 px-4 text-[var(--color-text-tertiary)]">json | xml | table | markdown | csv</td>
                  </tr>
                  <tr className="border-t border-[var(--color-border)]">
                    <td className="py-3 px-4 font-mono text-[var(--color-accent)]">pretty</td>
                    <td className="py-3 px-4 text-[var(--color-text-tertiary)]">boolean</td>
                    <td className="py-3 px-4 text-[var(--color-text-tertiary)]">true</td>
                    <td className="py-3 px-4 text-[var(--color-text-tertiary)]">Format JSON/XML/Markdown output</td>
                  </tr>
                  <tr className="border-t border-[var(--color-border)]">
                    <td className="py-3 px-4 font-mono text-[var(--color-accent)]">timezone</td>
                    <td className="py-3 px-4 text-[var(--color-text-tertiary)]">string</td>
                    <td className="py-3 px-4 text-[var(--color-text-tertiary)]">browser local</td>
                    <td className="py-3 px-4 text-[var(--color-text-tertiary)]">Timezone for date formatting</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Endpoint;
