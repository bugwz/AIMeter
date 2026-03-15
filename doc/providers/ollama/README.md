# Ollama Usage Query Implementation

This document describes the complete implementation of Ollama Cloud usage/quota querying in AIMeter.

---

## Table of Contents

1. [Authentication Mode Overview](#1-authentication-mode-overview)
2. [Cookie Extraction & Headers](#2-cookie-extraction--headers)
3. [Data Source: HTML Scraping](#3-data-source-html-scraping)
4. [Usage Block Parsing](#4-usage-block-parsing)
5. [Plan Name Parsing](#5-plan-name-parsing)
6. [Session Detection](#6-session-detection)
7. [Error Handling](#7-error-handling)
8. [Data Flow Summary](#8-data-flow-summary)
9. [File Index](#9-file-index)

---

## 1. Authentication Mode Overview

The Ollama adapter (`src/adapters/OllamaAdapter.ts`) supports a single authentication mode:

| Mode | `AuthType` | Use Case |
|------|-----------|---------|
| Cookie | `AuthType.COOKIE` | Browser session cookie from ollama.com |

Unlike most other providers, Ollama does not expose a JSON API for usage data. The adapter scrapes usage information directly from the HTML of the settings page.

---

## 2. Cookie Extraction & Headers

### 2.1 Cookie Input

The cookie value is used as-is (passed directly from `credentials.value`). There is no additional normalization.

### 2.2 Request Headers

```typescript
{
  'Cookie': cookie,
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9',
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ... Chrome/143.0.0.0 Safari/537.36',
  'Origin': 'https://ollama.com',
  'Referer': 'https://ollama.com/settings',
}
```

### 2.3 Credential Validation

```
GET https://ollama.com/settings
  ├─ 401/403        → invalid: 'Invalid or expired session'
  ├─ looksSignedOut → invalid: 'Ollama session expired or sign-in required'
  ├─ no progress    → invalid: 'Could not parse Ollama usage data'
  └─ OK + parseable → valid: true
```

---

## 3. Data Source: HTML Scraping

The adapter fetches `https://ollama.com/settings` and parses the HTML response. No JSON API is involved.

The page contains sections labeled with text strings such as:
- `Session usage` (or `Hourly usage`) — short-window quota
- `Weekly usage` — 7-day quota

Each section includes:
- A percentage display (e.g. `45% used`)
- An optional progress bar with `width: 45%` inline style
- A `data-time="{ISO datetime}"` attribute for the reset timestamp

---

## 4. Usage Block Parsing

### 4.1 Label Search

```typescript
const primaryUsageLabels = ['Session usage', 'Hourly usage'];

// Looks for label text, then parses the next 800 characters for data
const session = parseUsageBlock(['Session usage', 'Hourly usage'], html);
const weekly  = parseUsageBlock(['Weekly usage'], html);
```

### 4.2 Percentage Extraction

Two strategies are tried in order:

1. **Explicit percentage text**: matches `{N}% used`
   ```regex
   /([0-9]+(?:\.[0-9]+)?)\s*%\s*used/i
   ```

2. **Inline style width**: matches `width: {N}%`
   ```regex
   /width:\s*([0-9]+(?:\.[0-9]+)?)%/i
   ```

### 4.3 Reset Timestamp Extraction

```regex
/data-time=["']([^"']+)["']/i
```

The matched value is parsed with `new Date()`.

### 4.4 Progress Windows

| Window | Label(s) | `windowMinutes` |
|--------|---------|-----------------|
| `Session` | `Session usage` or `Hourly usage` | not set (undefined) |
| `Weekly` | `Weekly usage` | not set (undefined) |

```typescript
usedPercent      = roundPercentage(parsed.usedPercent)
remainingPercent = roundPercentage(100 - usedPercent)
```

---

## 5. Plan Name Parsing

The plan name is extracted from the "Cloud Usage" section heading in the HTML. The adapter uses a series of regex patterns applied in priority order:

**Priority 1:** Badge immediately after "Cloud Usage" span:
```regex
/Cloud(?:\s|&nbsp;)+Usage\s*<\/span\s*>\s*<span[^>]*>\s*([^<]+?)\s*<\/span\s*>/is
```

**Priority 2:** Plan badge within the same `<h2>` block:
```regex
/<h2[^>]*>[\s\S]*?<span[^>]*>\s*Cloud(?:\s|&nbsp;)+Usage\s*<\/span\s*>[\s\S]*?<span[^>]*>\s*([^<]+?)\s*<\/span\s*>[\s\S]*?<\/h2>/is
```

**Priority 3 & 4:** Class-based span capture with `rounded-full`, `capitalize`, or `bg-neutral-100` classes.

**Fallback:** Extracts the `<h2>` block containing "Cloud Usage" and scans `<span>` children, skipping spans that contain reset times or percentage text.

The matched value is normalized: first character uppercased, remainder lowercased (e.g. `pro` → `Pro`).

---

## 6. Session Detection

Before parsing, the adapter checks whether the response HTML represents a signed-out page by looking for combinations of:

| Signal | Examples |
|--------|---------|
| Sign-in heading | `sign in to ollama`, `log in to ollama` |
| Auth route | `/api/auth/signin`, `/auth/signin`, `href="/login"` |
| Password field | `type="password"`, `name="password"` |
| Email field | `type="email"`, `name="email"` |
| Form tag | `<form` |

If any of the following combinations is detected, `looksSignedOut()` returns `true` and an error is thrown:
- heading + form + (email or password or auth route)
- form + auth route
- form + password + email field

---

## 7. Error Handling

| Condition | Error Message |
|-----------|--------------|
| 401 / 403 | `Invalid or expired Ollama session` |
| `looksSignedOut` | `Invalid or expired Ollama session` |
| No usage blocks found | `Could not parse Ollama usage data` |
| Other non-2xx | `Ollama API error: {status}` |

All requests use a 12-second timeout via `fetchWithTimeout`.

---

## 8. Data Flow Summary

```
User provides Ollama browser cookie
  └─ extractCookie() → raw cookie string
      └─ GET https://ollama.com/settings
          └─ HTML response
              ├─ looksSignedOut()? → throw auth error
              ├─ parsePlanName(html)
              │   └─ regex chain on Cloud Usage section → plan string
              ├─ parseUsageBlock(['Session usage', 'Hourly usage'], html)
              │   └─ { usedPercent, resetsAt }
              └─ parseUsageBlock(['Weekly usage'], html)
                  └─ { usedPercent, resetsAt }
              └─ UsageSnapshot { progress[Session, Weekly], identity }
```

---

## 9. File Index

| File | Responsibility |
|------|----------------|
| `src/adapters/OllamaAdapter.ts` | Core adapter: HTML fetch, regex-based parsing, session detection |
| `src/adapters/utils.ts` | `fetchWithTimeout`, `roundPercentage` utilities |
| `doc/providers/ollama/demo.html` | Sample settings page HTML for testing parsers |
