# CommandCode Usage Query Implementation

This document describes the CommandCode usage/quota querying in AIMeter.

---

## 1. Authentication Mode Overview

| Mode | `AuthType` | Use Case |
|------|-----------|---------|
| CLI session key | `AuthType.API_KEY` | The `apiKey` the official `command-code` CLI stores in `~/.commandcode/auth.json` |

This is **not** a provider API key. The `/alpha/*` routes are the CLI's own backend and
expect the CLI session key, which looks like `user_…`. A key from any other surface will
be rejected with 401/403.

No OAuth flow and no cookie are involved, so there is nothing to refresh: when the session
key is rotated by the CLI, it must be re-entered in AIMeter.

---

## 2. Headers

```ts
{
  Authorization: `Bearer ${apiKey}`,
  Accept: 'application/json',
  'User-Agent': 'AIMeter',
  'x-command-code-version': '1.54.2',
  'x-cli-environment': 'production',
}
```

The version header is **required**: the `/alpha` routes gate on it. It is pinned in the
adapter rather than being user-configurable, so a config cannot send a version the API
rejects.

---

## 3. Endpoints

Base: `https://api.commandcode.ai`. All are `GET`.

| Endpoint | Purpose |
|----------|---------|
| `/alpha/whoami?limits=1` | Identity: `user`, `org.id` |
| `/alpha/billing/credits?orgId=…` | `windowLimits.fiveHour` / `.weekly`, `credits.monthlyCredits`, `credits.planId` |
| `/alpha/billing/subscriptions?orgId=…` | `planId`, `currentPeriodEnd` |
| `/alpha/usage/summary?orgId=…` | `totalCredits` (period spend), `totalCount`, tokens, `successRate` |

`orgId` comes from `whoami` and is appended when present. It is optional: a personal
account with no org resolves fine without it.

---

## 4. Response Envelope

Every `/alpha` route answers either a **flat** object or the same object **wrapped once in
`data`**. Both shapes are handled rather than guessed:

```ts
unwrap(payload, 'windowLimits')   // payload.windowLimits, else payload.data.windowLimits
```

The direct key always wins. An envelope that is present but empty must not shadow a real
top-level value.

---

## 5. Progress Item Construction

### 5.1 Five-hour and weekly windows

From `windowLimits.fiveHour` / `windowLimits.weekly`:

| Field | Meaning |
|-------|---------|
| `used` | consumed in the window |
| `cap` | window allowance |
| `resetAt` | ISO-8601, epoch seconds or epoch milliseconds |

`usedPercent = min(100, used / cap * 100)` with `windowMinutes` 300 and 10080 respectively.

### 5.2 Monthly window

The monthly percentage needs **two** numbers from **two** different routes:

* `billing/credits → credits.monthlyCredits` is what is **left** in the period;
* `usage/summary → totalCredits` is what was **spent** in the period.

Neither alone yields a percentage. The cap is reconstructed as `spent + remaining`, which
is why both requests are issued. With only one of them available the monthly window is
**omitted** rather than rendered — `ProgressItem.usedPercent` is a required number, and a
fabricated `0` reads as "nothing used", the opposite of "unknown".

### 5.3 Plan label

`planId` is mapped through a tier table (`individual-go` → `Go`, `individual-goat` → `GOAT`,
`individual-pro-v1` → `Pro`, …). An unknown id is passed through verbatim rather than
dropped, so a new tier shows up as its raw id instead of vanishing.

---

## 6. Error Handling

| Condition | Behaviour |
|-----------|-----------|
| 401 / 403 | `CommandCode session key is invalid or revoked` |
| 404 on `whoami` | `This CommandCode plan does not include API access` |
| Empty body (HTTP 200) | Treated as no data, not a parse error |
| Invalid JSON | `Invalid CommandCode JSON response` |
| No windows parsed | `No usage data returned by CommandCode API` |

All requests use the shared `fetchWithTimeout` helper.

---

## 7. Known Traps

* **Do not treat `monthlyCredits` as the cap.** It is the remaining allowance. Using it as
  the denominator silently inverts the percentage.
* **404 is a plan limitation, not a bad key.** A plan without API access answers 404; a bad
  key answers 401/403. The two need different messages, and conflating them sends users
  hunting for a credential that is fine.
* **The version header is load-bearing.** Removing it makes every route fail.

---

## 8. Files

| File | Responsibility |
|------|----------------|
| `src/adapters/CommandCodeAdapter.ts` | Endpoint calls, envelope unwrapping, window mapping |
| `docs/providers/commandcode/demo.json` | Response shape examples |
| `public/providers/commandcode.svg` | Provider logo |
