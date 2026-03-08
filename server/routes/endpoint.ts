import { Router, Request, Response } from 'express';
import { storage } from '../storage.js';
import { UsageErrorCode, UsageProvider } from '../../src/types/index.js';
import { enrichProgressTitles } from '../utils/progressTitles.js';

const router = Router();

const OUTPUT_FORMATS = ['json', 'xml', 'table', 'markdown', 'csv'] as const;
type OutputFormat = (typeof OUTPUT_FORMATS)[number];

interface SerializedProgressItem {
  name: string;
  desc?: string;
  usedPercent: number;
  remainingPercent: number | null;
  used: number | null;
  limit: number | null;
  windowMinutes: number | null;
  resetsAt: number | null;
  resetDescription?: string;
}

interface EndpointProviderRecord {
  id: string;
  provider: UsageProvider;
  name: string | null;
  region?: string;
  identity?: {
    plan?: string;
  };
  progress: SerializedProgressItem[];
  cost?: {
    used: number;
    limit: number;
    remaining: number;
    currency?: string;
    period?: string;
  };
  updatedAt: number;
}

interface EndpointErrorRecord {
  id: string;
  provider: UsageProvider;
  code: string;
  message: string;
  timestamp: number;
}

type EndpointItem = EndpointProviderRecord | EndpointErrorRecord;

interface ParsedQuery {
  providersRaw: string;
  format: OutputFormat;
  pretty: boolean;
  timezone: string;
  requestedProviders: UsageProvider[] | null;
}

function sendError(
  res: Response,
  status: number,
  code: string,
  message: string,
  details?: Record<string, unknown>
): void {
  res.status(status).type('application/json').send(
    JSON.stringify(
      {
        success: false,
        error: {
          code,
          message,
          ...(details ? { details } : {}),
        },
      },
      null,
      2
    )
  );
}

function toUnixSeconds(value: Date | string | number | null | undefined): number | null {
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

function roundMetric(value: number | null | undefined): number | null {
  if (value === null || value === undefined || Number.isNaN(value)) return null;
  return Number(value.toFixed(2));
}

function roundPercent(value: number | null | undefined): number | null {
  if (value === null || value === undefined || Number.isNaN(value)) return null;
  return Math.round(value);
}

function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function escapeCsv(value: string): string {
  return `"${value.replace(/"/g, '""')}"`;
}

function isValidTimezone(timezone: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: timezone });
    return true;
  } catch {
    return false;
  }
}

function parseBoolean(value: string | undefined, fallback: boolean): boolean | null {
  if (value === undefined) return fallback;
  const normalized = value.trim().toLowerCase();
  if (normalized === 'true' || normalized === '1') return true;
  if (normalized === 'false' || normalized === '0') return false;
  return null;
}

function parseQuery(req: Request):
  | { ok: true; value: ParsedQuery }
  | { ok: false; status: number; code: string; message: string; details?: Record<string, unknown> } {
  const formatRaw = (typeof req.query.format === 'string' ? req.query.format : 'json').trim().toLowerCase();
  if (!OUTPUT_FORMATS.includes(formatRaw as OutputFormat)) {
    return {
      ok: false,
      status: 400,
      code: 'INVALID_FORMAT',
      message: `format must be one of: ${OUTPUT_FORMATS.join(', ')}`,
      details: { received: formatRaw },
    };
  }

  const prettyRaw = typeof req.query.pretty === 'string' ? req.query.pretty : undefined;
  const pretty = parseBoolean(prettyRaw, true);
  if (pretty === null) {
    return {
      ok: false,
      status: 400,
      code: 'INVALID_PRETTY',
      message: 'pretty must be a boolean value',
      details: { received: prettyRaw },
    };
  }

  const timezone = (typeof req.query.timezone === 'string' ? req.query.timezone : 'UTC').trim() || 'UTC';
  if (!isValidTimezone(timezone)) {
    return {
      ok: false,
      status: 400,
      code: 'INVALID_TIMEZONE',
      message: 'timezone must be a valid IANA timezone string',
      details: { received: timezone },
    };
  }

  const providersInput = typeof req.query.providers === 'string' ? req.query.providers : 'all';
  const providersRaw = providersInput.trim() || 'all';

  if (providersRaw === 'all') {
    return {
      ok: true,
      value: {
        providersRaw,
        format: formatRaw as OutputFormat,
        pretty,
        timezone,
        requestedProviders: null,
      },
    };
  }

  const parsedList = providersRaw
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);

  if (parsedList.length === 0) {
    return {
      ok: false,
      status: 400,
      code: 'INVALID_PROVIDERS',
      message: 'providers must be "all" or a non-empty comma-separated provider list',
      details: { received: providersRaw },
    };
  }

  const unique = Array.from(new Set(parsedList));
  const validProviders = new Set(Object.values(UsageProvider));
  const invalid = unique.filter((item) => !validProviders.has(item as UsageProvider));
  if (invalid.length > 0) {
    return {
      ok: false,
      status: 400,
      code: 'UNKNOWN_PROVIDER',
      message: 'providers contains unsupported provider values',
      details: { invalidProviders: invalid },
    };
  }

  return {
    ok: true,
    value: {
      providersRaw,
      format: formatRaw as OutputFormat,
      pretty,
      timezone,
      requestedProviders: unique as UsageProvider[],
    },
  };
}

function toProgressSummary(progress: SerializedProgressItem[]): string {
  if (!progress.length) return '-';
  return progress
    .slice(0, 3)
    .map((item) => `${item.name}:${Math.round(item.usedPercent)}%`)
    .join('; ');
}

function primaryUsedPercent(progress: SerializedProgressItem[]): number | null {
  if (!progress.length) return null;
  return progress[0].usedPercent;
}

function formatTimestampInTimezone(timestampSec: number, timezone: string): string {
  const date = new Date(timestampSec * 1000);
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
  const parts = formatter.formatToParts(date);
  const year = parts.find((part) => part.type === 'year')?.value || '0000';
  const month = parts.find((part) => part.type === 'month')?.value || '01';
  const day = parts.find((part) => part.type === 'day')?.value || '01';
  const hour = parts.find((part) => part.type === 'hour')?.value || '00';
  const minute = parts.find((part) => part.type === 'minute')?.value || '00';
  const second = parts.find((part) => part.type === 'second')?.value || '00';
  return `${year}-${month}-${day} ${hour}:${minute}:${second}`;
}

function fitCell(value: string, width: number): string {
  const chars = Array.from(value);
  const currentWidth = displayWidth(value);
  if (currentWidth <= width) return `${value}${' '.repeat(width - currentWidth)}`;
  if (width <= 3) return '.'.repeat(width);

  let used = 0;
  let output = '';
  const budget = width - 3;
  for (const ch of chars) {
    const w = charDisplayWidth(ch);
    if (used + w > budget) break;
    output += ch;
    used += w;
  }
  const padded = `${output}...`;
  return `${padded}${' '.repeat(Math.max(0, width - displayWidth(padded)))}`;
}

function charDisplayWidth(ch: string): number {
  const code = ch.codePointAt(0);
  if (code === undefined) return 1;
  if (code === 0) return 0;
  if (code <= 0x1f || (code >= 0x7f && code <= 0x9f)) return 0;
  if (code === 0x200d) return 0;
  if (code >= 0xfe00 && code <= 0xfe0f) return 0;
  if (/\p{Mark}/u.test(ch)) return 0;
  if (/\p{Extended_Pictographic}/u.test(ch)) return 2;

  if (
    (code >= 0x1100 && code <= 0x115f) ||
    code === 0x2329 ||
    code === 0x232a ||
    (code >= 0x2e80 && code <= 0xa4cf) ||
    (code >= 0xa960 && code <= 0xa97c) ||
    (code >= 0xac00 && code <= 0xd7a3) ||
    (code >= 0xf900 && code <= 0xfaff) ||
    (code >= 0xfe10 && code <= 0xfe19) ||
    (code >= 0xfe30 && code <= 0xfe6f) ||
    (code >= 0xff00 && code <= 0xff60) ||
    (code >= 0xffe0 && code <= 0xffe6) ||
    (code >= 0x1b000 && code <= 0x1b001) ||
    (code >= 0x1f200 && code <= 0x1f251) ||
    (code >= 0x20000 && code <= 0x3fffd)
  ) {
    return 2;
  }
  return 1;
}

function displayWidth(value: string): number {
  return Array.from(value).reduce((sum, ch) => sum + charDisplayWidth(ch), 0);
}

function formatTimeWindow(windowMinutes: number | null): string {
  if (windowMinutes === null || Number.isNaN(windowMinutes) || windowMinutes <= 0) return '-';
  if (windowMinutes % (60 * 24) === 0) {
    const days = Math.round(windowMinutes / (60 * 24));
    return `${days} ${days === 1 ? 'day' : 'days'}`;
  }
  if (windowMinutes % 60 === 0) {
    const hours = Math.round(windowMinutes / 60);
    return `${hours} ${hours === 1 ? 'hour' : 'hours'}`;
  }
  return `${Math.round(windowMinutes)} min`;
}

function formatAsXml(
  items: EndpointItem[],
  summary: { total: number; providersWithUsage: number; errors: number; averageUsedPercent: number },
  query: ParsedQuery,
  timestamp: number,
  pretty: boolean
): string {
  const indent = pretty ? '  ' : '';
  const newline = pretty ? '\n' : '';

  let xml = `<?xml version="1.0" encoding="UTF-8"?>${newline}`;
  xml += `<subscriptions>${newline}`;
  xml += `${indent}<timestamp>${timestamp}</timestamp>${newline}`;
  xml += `${indent}<query providers="${escapeXml(query.providersRaw)}" format="${query.format}" pretty="${query.pretty}" timezone="${escapeXml(query.timezone)}"/>${newline}`;
  xml += `${indent}<summary>${newline}`;
  xml += `${indent}${indent}<total>${summary.total}</total>${newline}`;
  xml += `${indent}${indent}<providersWithUsage>${summary.providersWithUsage}</providersWithUsage>${newline}`;
  xml += `${indent}${indent}<errors>${summary.errors}</errors>${newline}`;
  xml += `${indent}${indent}<averageUsedPercent>${summary.averageUsedPercent}</averageUsedPercent>${newline}`;
  xml += `${indent}</summary>${newline}`;
  xml += `${indent}<providers>${newline}`;

  for (const item of items) {
    if ('progress' in item) {
      xml += `${indent}${indent}<provider id="${escapeXml(item.id)}" provider="${escapeXml(item.provider)}" status="ok">${newline}`;
      if (item.name) xml += `${indent}${indent}${indent}<name>${escapeXml(item.name)}</name>${newline}`;
      if (item.region) xml += `${indent}${indent}${indent}<region>${escapeXml(item.region)}</region>${newline}`;
      if (item.identity?.plan) {
        xml += `${indent}${indent}${indent}<identity>${newline}`;
        xml += `${indent}${indent}${indent}${indent}<plan>${escapeXml(item.identity.plan)}</plan>${newline}`;
        xml += `${indent}${indent}${indent}</identity>${newline}`;
      }
      xml += `${indent}${indent}${indent}<updatedAt>${item.updatedAt}</updatedAt>${newline}`;
      xml += `${indent}${indent}${indent}<progress>${newline}`;
      for (const progress of item.progress) {
        xml += `${indent}${indent}${indent}${indent}<item name="${escapeXml(progress.name)}">${newline}`;
        if (progress.desc) xml += `${indent}${indent}${indent}${indent}${indent}<desc>${escapeXml(progress.desc)}</desc>${newline}`;
        xml += `${indent}${indent}${indent}${indent}${indent}<usedPercent>${progress.usedPercent}</usedPercent>${newline}`;
        xml += `${indent}${indent}${indent}${indent}${indent}<remainingPercent>${progress.remainingPercent ?? ''}</remainingPercent>${newline}`;
        xml += `${indent}${indent}${indent}${indent}${indent}<used>${progress.used ?? ''}</used>${newline}`;
        xml += `${indent}${indent}${indent}${indent}${indent}<limit>${progress.limit ?? ''}</limit>${newline}`;
        xml += `${indent}${indent}${indent}${indent}${indent}<windowMinutes>${progress.windowMinutes ?? ''}</windowMinutes>${newline}`;
        xml += `${indent}${indent}${indent}${indent}${indent}<resetsAt>${progress.resetsAt ?? ''}</resetsAt>${newline}`;
        if (progress.resetDescription) {
          xml += `${indent}${indent}${indent}${indent}${indent}<resetDescription>${escapeXml(progress.resetDescription)}</resetDescription>${newline}`;
        }
        xml += `${indent}${indent}${indent}${indent}</item>${newline}`;
      }
      xml += `${indent}${indent}${indent}</progress>${newline}`;
      if (item.cost) {
        xml += `${indent}${indent}${indent}<cost>${newline}`;
        xml += `${indent}${indent}${indent}${indent}<used>${item.cost.used}</used>${newline}`;
        xml += `${indent}${indent}${indent}${indent}<limit>${item.cost.limit}</limit>${newline}`;
        xml += `${indent}${indent}${indent}${indent}<remaining>${item.cost.remaining}</remaining>${newline}`;
        if (item.cost.currency) xml += `${indent}${indent}${indent}${indent}<currency>${escapeXml(item.cost.currency)}</currency>${newline}`;
        if (item.cost.period) xml += `${indent}${indent}${indent}${indent}<period>${escapeXml(item.cost.period)}</period>${newline}`;
        xml += `${indent}${indent}${indent}</cost>${newline}`;
      }
      xml += `${indent}${indent}</provider>${newline}`;
    } else {
      xml += `${indent}${indent}<provider id="${escapeXml(item.id)}" provider="${escapeXml(item.provider)}" status="error">${newline}`;
      xml += `${indent}${indent}${indent}<code>${escapeXml(item.code)}</code>${newline}`;
      xml += `${indent}${indent}${indent}<message>${escapeXml(item.message)}</message>${newline}`;
      xml += `${indent}${indent}${indent}<timestamp>${item.timestamp}</timestamp>${newline}`;
      xml += `${indent}${indent}</provider>${newline}`;
    }
  }

  xml += `${indent}</providers>${newline}`;
  xml += `</subscriptions>`;

  return xml;
}

function formatAsTable(
  items: EndpointItem[],
  summary: { total: number; providersWithUsage: number; errors: number; averageUsedPercent: number },
  timezone: string
): string {
  const columns = [
    'Provider',
    'Name',
    'Item',
    'UsedPct',
    'RemainPct',
    'ResetWindow',
    'ResetAt',
    'UpdatedAt',
  ] as const;
  type Column = (typeof columns)[number];

  const groups: Array<Record<Column, string>[]> = [];

  for (const item of items) {
    const groupRows: Record<Column, string>[] = [];
    if ('progress' in item) {
      const progressRows = item.progress.length > 0 ? item.progress : [{ name: '-', usedPercent: 0, remainingPercent: null, used: null, limit: null, windowMinutes: null, resetsAt: null }];
      const updatedAt = formatTimestampInTimezone(item.updatedAt, timezone);

      progressRows.forEach((progress, index) => {
        groupRows.push({
          Provider: index === 0 ? item.provider : '',
          Name: index === 0 ? (item.name || '-') : '',
          Item: progress.name,
          UsedPct: String(Math.round(progress.usedPercent)),
          RemainPct: progress.remainingPercent === null ? '-' : String(Math.round(progress.remainingPercent)),
          ResetWindow: formatTimeWindow(progress.windowMinutes),
          ResetAt: progress.resetsAt === null ? '-' : formatTimestampInTimezone(progress.resetsAt, timezone),
          UpdatedAt: index === 0 ? updatedAt : '',
        });
      });
    } else {
      groupRows.push({
        Provider: item.provider,
        Name: '-',
        Item: 'ERROR',
        UsedPct: '-',
        RemainPct: '-',
        ResetWindow: '-',
        ResetAt: '-',
        UpdatedAt: formatTimestampInTimezone(item.timestamp, timezone),
      });
    }
    groups.push(groupRows);
  }

  const rows = groups.flat();
  const widths = columns.reduce<Record<Column, number>>((acc, column) => {
    const maxRowWidth = rows.reduce((max, row) => Math.max(max, displayWidth(row[column])), displayWidth(column));
    acc[column] = Math.min(Math.max(maxRowWidth, column.length), 24);
    return acc;
  }, {} as Record<Column, number>);

  const makeBorder = (left: string, middle: string, right: string, fill: string): string =>
    `${left}${columns.map((column) => fill.repeat(widths[column] + 2)).join(middle)}${right}`;

  const renderRow = (row: Record<Column, string>): string =>
    `│ ${columns.map((column) => fitCell(row[column], widths[column])).join(' │ ')} │`;

  const table: string[] = [];
  table.push(makeBorder('┌', '┬', '┐', '─'));
  table.push(renderRow(columns.reduce((acc, column) => ({ ...acc, [column]: column }), {} as Record<Column, string>)));
  table.push(makeBorder('├', '┼', '┤', '─'));
  groups.forEach((group, index) => {
    group.forEach((row) => table.push(renderRow(row)));
    if (index < groups.length - 1) {
      table.push(makeBorder('├', '┼', '┤', '─'));
    }
  });
  table.push(makeBorder('└', '┴', '┘', '─'));
  const summaryLine = `Summary: providers(total=${summary.total}), avgUsed=${summary.averageUsedPercent}%, timezone=${timezone}`;
  table.push('');
  table.push('');
  table.push(summaryLine);
  return `${table.join('\n')}\n`;
}

function formatAsMarkdown(
  items: EndpointItem[],
  summary: { total: number; providersWithUsage: number; errors: number; averageUsedPercent: number },
  timezone: string,
  pretty: boolean
): string {
  const escapeMarkdownCell = (value: string): string => value.replace(/\|/g, '\\|');

  type MarkdownColumn = 'Provider' | 'Name' | 'Item' | 'UsedPct' | 'RemainPct' | 'ResetWindow' | 'ResetAt' | 'UpdatedAt';
  const rows: Array<Record<MarkdownColumn, string>> = [];

  for (const item of items) {
    if ('progress' in item) {
      const progressRows = item.progress.length > 0
        ? item.progress
        : [{ name: '-', usedPercent: 0, remainingPercent: null, used: null, limit: null, windowMinutes: null, resetsAt: null }];
      const updatedAt = formatTimestampInTimezone(item.updatedAt, timezone);

      progressRows.forEach((progress, index) => {
        rows.push({
          Provider: item.provider,
          Name: item.name || '-',
          Item: progress.name,
          UsedPct: String(Math.round(progress.usedPercent)),
          RemainPct: progress.remainingPercent === null ? '-' : String(Math.round(progress.remainingPercent)),
          ResetWindow: formatTimeWindow(progress.windowMinutes),
          ResetAt: progress.resetsAt === null ? '-' : formatTimestampInTimezone(progress.resetsAt, timezone),
          UpdatedAt: updatedAt,
        });
      });
    } else {
      rows.push({
        Provider: item.provider,
        Name: '-',
        Item: 'ERROR',
        UsedPct: '-',
        RemainPct: '-',
        ResetWindow: '-',
        ResetAt: '-',
        UpdatedAt: formatTimestampInTimezone(item.timestamp, timezone),
      });
    }
  }

  const columns: MarkdownColumn[] = ['Provider', 'Name', 'Item', 'UsedPct', 'RemainPct', 'ResetWindow', 'ResetAt', 'UpdatedAt'];
  const summaryLine = `Summary: providers(total=${summary.total}), avgUsed=${summary.averageUsedPercent}%, timezone=${timezone}`;

  if (!pretty) {
    const compactLines: string[] = [];
    compactLines.push(`|${columns.join('|')}|`);
    compactLines.push(`|${columns.map(() => ':--:').join('|')}|`);
    rows.forEach((row) => {
      compactLines.push(`|${columns.map((column) => escapeMarkdownCell(row[column])).join('|')}|`);
    });
    compactLines.push('');
    compactLines.push('');
    compactLines.push(summaryLine);
    return `${compactLines.join('\n')}\n`;
  }

  const tableRows = [
    columns.map((column) => column),
    ...rows.map((row) => columns.map((column) => row[column])),
  ];
  const widths = columns.map((_, colIdx) =>
    tableRows.reduce((max, row) => Math.max(max, displayWidth(row[colIdx] || '')), 3)
  );

  const renderRow = (cells: string[]): string =>
    `| ${cells.map((cell, idx) => fitCell(escapeMarkdownCell(cell || ''), widths[idx])).join(' | ')} |`;
  const separator = `| ${widths.map((width) => {
    const fill = '-'.repeat(Math.max(width - 2, 1));
    return `:${fill}:`;
  }).join(' | ')} |`;

  const prettyLines: string[] = [];
  prettyLines.push(renderRow(columns));
  prettyLines.push(separator);
  rows.forEach((row) => {
    prettyLines.push(renderRow(columns.map((column) => row[column])));
  });
  prettyLines.push('');
  prettyLines.push('');
  prettyLines.push(summaryLine);
  return `${prettyLines.join('\n')}\n`;
}

function formatAsCsv(items: EndpointItem[]): string {
  let csv = 'id,provider,name,status,primaryUsedPercent,progressSummary,costUsed,costLimit,costRemaining,updatedAt,errorCode,errorMessage,timestamp\n';

  for (const item of items) {
    if ('progress' in item) {
      const primary = primaryUsedPercent(item.progress);
      csv += [
        escapeCsv(item.id),
        escapeCsv(item.provider),
        escapeCsv(item.name || ''),
        escapeCsv('ok'),
        primary === null ? '' : String(Math.round(primary)),
        escapeCsv(toProgressSummary(item.progress)),
        item.cost ? item.cost.used.toFixed(2) : '',
        item.cost ? item.cost.limit.toFixed(2) : '',
        item.cost ? item.cost.remaining.toFixed(2) : '',
        String(item.updatedAt),
        '',
        '',
        '',
      ].join(',') + '\n';
    } else {
      csv += [
        escapeCsv(item.id),
        escapeCsv(item.provider),
        '',
        escapeCsv('error'),
        '',
        '',
        '',
        '',
        '',
        '',
        escapeCsv(item.code),
        escapeCsv(item.message),
        String(item.timestamp),
      ].join(',') + '\n';
    }
  }

  return csv;
}

router.get('/subscriptions', async (req: Request, res: Response) => {
  const parsed = parseQuery(req);
  if (!parsed.ok) {
    sendError(res, parsed.status, parsed.code, parsed.message, parsed.details);
    return;
  }

  const query = parsed.value;

  try {
    const allProviders = await storage.listProviders();
    const selectedProviders = query.requestedProviders
      ? allProviders.filter((provider) => query.requestedProviders!.includes(provider.provider))
      : allProviders;

    const nowTs = Math.floor(Date.now() / 1000);

    const items: EndpointItem[] = await Promise.all(
      selectedProviders.map(async (provider) => {
        const latestUsage = await storage.getLatestUsage(provider.id);

        if (!latestUsage || !latestUsage.progress) {
          const errorRecord: EndpointErrorRecord = {
            id: provider.id,
            provider: provider.provider,
            code: UsageErrorCode.UNKNOWN,
            message: 'No latest progress data',
            timestamp: nowTs,
          };
          return errorRecord;
        }

        const progressItems = enrichProgressTitles(provider.provider, latestUsage.progress.items || []).map((item) => ({
          name: item.name,
          desc: item.desc,
          usedPercent: roundPercent(item.usedPercent) ?? 0,
          remainingPercent: roundPercent(item.remainingPercent),
          used: roundMetric(item.used),
          limit: roundMetric(item.limit),
          windowMinutes: roundMetric(item.windowMinutes),
          resetsAt: toUnixSeconds(item.resetsAt),
          resetDescription: item.resetDescription,
        }));

        const identityPlan = typeof latestUsage.identityData?.plan === 'string'
          ? latestUsage.identityData.plan.trim()
          : '';

        const successRecord: EndpointProviderRecord = {
          id: provider.id,
          provider: provider.provider,
          name: provider.name || null,
          region: provider.region,
          identity: identityPlan ? { plan: identityPlan } : undefined,
          progress: progressItems,
          cost: latestUsage.progress.cost
            ? {
                used: roundMetric(latestUsage.progress.cost.used) ?? 0,
                limit: roundMetric(latestUsage.progress.cost.limit) ?? 0,
                remaining: roundMetric(latestUsage.progress.cost.remaining) ?? 0,
                currency: latestUsage.progress.cost.currency,
                period: latestUsage.progress.cost.period,
              }
            : undefined,
          updatedAt: toUnixSeconds(latestUsage.createdAt) ?? nowTs,
        };

        return successRecord;
      })
    );

    const successItems = items.filter((item): item is EndpointProviderRecord => 'progress' in item);
    const primaryValues = successItems
      .map((item) => primaryUsedPercent(item.progress))
      .filter((value): value is number => value !== null);
    const averageUsedPercent = primaryValues.length
      ? Math.round(primaryValues.reduce((sum, value) => sum + value, 0) / primaryValues.length)
      : 0;

    const summary = {
      total: items.length,
      providersWithUsage: successItems.length,
      errors: items.length - successItems.length,
      averageUsedPercent,
    };

    if (query.format === 'xml') {
      res.type('application/xml').send(formatAsXml(items, summary, query, nowTs, query.pretty));
      return;
    }
    if (query.format === 'table') {
      res.type('text/plain').send(formatAsTable(items, summary, query.timezone));
      return;
    }
    if (query.format === 'markdown') {
      res.type('text/markdown').send(formatAsMarkdown(items, summary, query.timezone, query.pretty));
      return;
    }
    if (query.format === 'csv') {
      res.type('text/csv').send(formatAsCsv(items));
      return;
    }

    const response = {
      success: true,
      timestamp: nowTs,
      query: {
        providers: query.providersRaw,
        format: query.format,
        pretty: query.pretty,
        timezone: query.timezone,
      },
      providers: items,
      summary,
    };

    res.type('application/json').send(query.pretty ? JSON.stringify(response, null, 2) : JSON.stringify(response));
  } catch (error) {
    sendError(
      res,
      500,
      'INTERNAL_ERROR',
      error instanceof Error ? error.message : 'Unknown error'
    );
  }
});

export default router;
