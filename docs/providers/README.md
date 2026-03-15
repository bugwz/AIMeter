# Provider Documentation Index

This directory contains implementation documentation for each provider supported by AIMeter.
Each provider document covers authentication modes, API endpoints, data structures, parsing logic, and error handling.

---

## Providers

| Provider | Auth Type | Region Support | README |
|---------|-----------|---------------|--------|
| [Aliyun](#aliyun) | Cookie | China (cn-beijing default) | [→](./aliyun/README.md) |
| [Antigravity](#antigravity) | OAuth | — | [→](./antigravity/README.md) |
| [Claude](#claude) | Cookie, OAuth | — | [→](./claude/README.md) |
| [Codex](#codex) | OAuth | — | [→](./codex/README.md) |
| [Copilot](#copilot) | OAuth, API Key | — | [→](./copliot/README.md) |
| [Cursor](#cursor) | Cookie | — | [→](./cursor/README.md) |
| [Kimi](#kimi) | Cookie, JWT, API Key | — | [→](./kimi/README.md) |
| [MiniMax](#minimax) | Cookie, API Key | China / Global | [→](./minimax/README.md) |
| [Ollama](#ollama) | Cookie | — | [→](./ollama/README.md) |
| [OpenRouter](#openrouter) | API Key | — | [→](./openrouter/README.md) |
| [z.ai](#zai) | API Key | China / Global | [→](./zai/README.md) |

---

## Aliyun

**Adapter:** `src/adapters/AliyunAdapter.ts`
**Auth:** Browser Cookie (`sessionKey` from the Bailian console)
**Quota windows:** Session (5 h), Weekly (7 d), Monthly (billing month)

Calls the Aliyun Bailian internal console gateway (`BroadScopeAspnGateway`) via a POST request. Requires a `sec_token` that is read from the cookie or extracted from the console HTML page. Supports region configuration (defaults to `cn-beijing`).

---

## Antigravity

**Adapter:** `src/adapters/AntigravityAdapter.ts`
**Auth:** Google OAuth 2.0
**Quota windows:** Per-model (5 h window each)

Calls Google Cloud Code Assist internal APIs (`/v1internal:loadCodeAssist`, `/v1internal:fetchAvailableModels`). Supports proactive and reactive token refresh via `https://oauth2.googleapis.com/token`. Falls back between two base URLs (`daily-cloudcode-pa.googleapis.com` → `cloudcode-pa.googleapis.com`). Resolves a `projectId` automatically on first use.

---

## Claude

**Adapter:** `src/adapters/ClaudeAdapter.ts`
**Auth:** Cookie (`sessionKey`) or OAuth 2.0 (PKCE)
**Quota windows:** Session (5 h), Weekly (7 d), Weekly Sonnet (Max/Enterprise only)

Cookie mode calls `claude.ai/api`. OAuth mode calls `api.anthropic.com/api/oauth/usage`. Supports proactive and reactive token refresh. OAuth token refresh is persisted to the database after each successful fetch.

---

## Codex

**Adapter:** `src/adapters/CodexAdapter.ts`
**Auth:** OAuth 2.0
**Quota windows:** Session, Weekly, and additional windows classified by duration

Supports Link Auth + Auto Fill flow and manual token input. Refreshed OAuth credentials are persisted in database mode. See the [Codex README](./codex/README.md) for the full credential input format and troubleshooting guide.

---

## Copilot

**Adapter:** `src/adapters/CopilotAdapter.ts`
**Auth:** OAuth token or Personal Access Token (API Key)
**Quota windows:** Monthly (per quota type: Premium, Chat, Completions, etc.)

Calls `https://api.github.com/copilot_internal/user` with Copilot extension headers. Handles two response shapes: `quota_snapshots` (newer) and `limited_user_quotas` + `monthly_quotas` (older free-tier format).

---

## Cursor

**Adapter:** `src/adapters/CursorAdapter.ts`
**Auth:** Cookie (`WorkosCursorSessionToken`)
**Quota windows:** Plan (billing cycle), Secondary / On-demand (optional)

Calls `cursor.com/api/usage-summary` and `cursor.com/api/auth/me` in parallel, with an optional legacy `cursor.com/api/usage` call. Usage values are denominated in cents and converted to USD. Includes an on-demand cost snapshot when a spending limit is set.

---

## Kimi

**Adapter:** `src/adapters/KimiAdapter.ts`
**Auth:** Cookie (`kimi-auth` JWT), JWT, or API Key
**Quota windows:** Weekly (7 d), Rate Limit (sub-window, duration from API)

Calls Kimi's gRPC-style gateway endpoints (`BillingService/GetUsages`, `SubscriptionService/GetSubscription`). JWT is decoded client-side to extract session headers (`device_id`, `ssid`, `sub`). Tries three request payload variants for the usage endpoint.

---

## MiniMax

**Adapter:** `src/adapters/MiniMaxAdapter.ts`
**Auth:** Cookie or API Key
**Quota windows:** Prompt (interval window, duration derived from `start_time`/`end_time`)
**Regions:** Global (`platform.minimax.io`) / China (`platform.minimaxi.com`)

Calls `/v1/api/openplatform/coding_plan/remains`. Raw token counts are divided by 15 to convert to prompt units. Also fetches user info and scrapes the coding plan HTML page for plan name. Plan tier is inferred from the computed limit value.

---

## Ollama

**Adapter:** `src/adapters/OllamaAdapter.ts`
**Auth:** Cookie
**Quota windows:** Session (hourly), Weekly

No JSON API — scrapes usage data directly from the HTML of `https://ollama.com/settings`. Extracts percentages via `{N}% used` text or inline `width: N%` styles, and parses reset timestamps from `data-time` attributes. Detects signed-out state via form/link heuristics.

---

## OpenRouter

**Adapter:** `src/adapters/OpenRouterAdapter.ts`
**Auth:** API Key
**Quota windows:** Key-level credits (daily/weekly/monthly, optional), Total Credits (lifetime)

Calls `openrouter.ai/api/v1/credits` and `openrouter.ai/api/v1/key` in parallel. Shows a key-level spending limit item only when a limit is configured on the key. Calculates reset timestamps from the current UTC time based on the `limit_reset` period.

---

## z.ai

**Adapter:** `src/adapters/ZaiAdapter.ts`
**Auth:** API Key
**Quota windows:** Session (5 h), Weekly (7 d), Web Searches (time-based)
**Regions:** Global (`api.z.ai`) / China (`open.bigmodel.cn`)

Calls `/api/monitor/usage/quota/limit`. Parses `TOKENS_LIMIT` items (labeled Session / Weekly by `unit` code) and `TIME_LIMIT` items (labeled Web Searches). The endpoint URL can be fully overridden via `Z_AI_QUOTA_URL` or `Z_AI_API_HOST` environment variables.
