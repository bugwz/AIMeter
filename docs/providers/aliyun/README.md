# Aliyun Usage Query Implementation

This document describes the complete implementation of Aliyun Bailian Coding Plan usage/quota querying in AIMeter.

---

## Table of Contents

1. [Authentication Mode Overview](#1-authentication-mode-overview)
2. [Cookie Authentication](#2-cookie-authentication)
3. [Request Preparation](#3-request-preparation)
4. [Gateway API](#4-gateway-api)
5. [Usage Data Structure & Parsing](#5-usage-data-structure--parsing)
6. [Region Support](#6-region-support)
7. [Error Handling](#7-error-handling)
8. [Data Flow Summary](#8-data-flow-summary)
9. [File Index](#9-file-index)

---

## 1. Authentication Mode Overview

The Aliyun adapter (`src/adapters/AliyunAdapter.ts`) supports a single authentication mode:

| Mode | `AuthType` | Use Case |
|------|-----------|----------|
| Cookie | `AuthType.COOKIE` | Access the Aliyun Bailian console API using browser cookies |

The adapter targets the Alibaba Cloud Bailian (百炼) platform's **Coding Plan** product, calling an internal console gateway endpoint to retrieve quota data.

---

## 2. Cookie Authentication

### 2.1 Credential Format

```typescript
{ type: AuthType.COOKIE; value: string }
```

The `value` must be a full browser cookie string in `key=value; key=value` format, copied from the Aliyun Bailian console. The adapter rejects:
- Empty cookies
- `curl ...` command strings (only the cookie value is accepted)
- Strings without any `=` character

### 2.2 Cookie Normalization

```typescript
value = value
  .replace(/^cookie:\s*/i, '')  // strip "cookie:" prefix
  .replace(/^"(.*)"$/, '$1')    // strip surrounding quotes
  .trim();
```

### 2.3 Key Cookie Fields

The adapter reads specific values from the cookie string to build the request:

| Cookie Key | Purpose |
|-----------|---------|
| `currentRegionId` | Default region if none is configured |
| `cna` | Anonymous tracking ID used in the gateway request body |
| `sec_token` or `secToken` | Security token required by the gateway (see §3.2) |

---

## 3. Request Preparation

Before calling the gateway, the adapter assembles a `PreparedRequest` object:

```typescript
interface PreparedRequest {
  cookie: string;
  referer: string;
  region: string;
  secToken: string;
  params: Record<string, unknown>;
}
```

### 3.1 Region Resolution

Region is resolved in priority order:
1. `config.region` (user-configured)
2. `currentRegionId` from the cookie string
3. Default: `cn-beijing`

The `referer` URL is built from the region:
```
https://bailian.console.aliyun.com/{region}/?tab=coding-plan
```

### 3.2 Security Token (`sec_token`) Resolution

The sec_token is required by the gateway. The adapter resolves it in two steps:

1. **Direct cookie read** — looks for `sec_token` or `secToken` key in the cookie string
2. **HTML page fetch** — if not found in the cookie, fetches the referer page and extracts the token using regex patterns:

```typescript
const patterns = [
  /[?&]sec_token=([A-Za-z0-9_-]+)/i,
  /"sec_token"\s*:\s*"([^"]+)"/i,
  /sec_token['"]?\s*[:=]\s*['"]([^'"]+)['"]/i,
  /secToken['"]?\s*[:=]\s*['"]([^'"]+)['"]/i,
];
```

If the token cannot be extracted, an error is thrown: `Unable to extract sec_token from Aliyun page. Refresh login and retry.`

### 3.3 Gateway Request Parameters

```typescript
{
  Api: 'zeldaEasy.broadscope-bailian.codingPlan.queryCodingPlanInstanceInfoV2',
  V: '1.0',
  Data: {
    queryCodingPlanInstanceInfoRequest: {
      commodityCode: 'sfm_codingplan_public_cn',
      onlyLatestOne: true,
    },
    cornerstoneParam: {
      feTraceId: '<uuid>',
      feURL: 'https://bailian.console.aliyun.com/{region}/?tab=coding-plan#/efm/detail',
      protocol: 'V2',
      consoleSite: 'BAILIAN_ALIYUN',
      'X-Anonymous-Id': '<cna cookie value>',
      // ... other metadata fields
    },
  },
}
```

---

## 4. Gateway API

### 4.1 Endpoint

```
POST https://bailian-cs.console.aliyun.com/data/api.json
  ?action=BroadScopeAspnGateway
  &product=sfm_bailian
  &api=zeldaEasy.broadscope-bailian.codingPlan.queryCodingPlanInstanceInfoV2
  &_v=undefined
```

### 4.2 Request

```http
POST {ALIYUN_GATEWAY_URL}
Content-Type: application/x-www-form-urlencoded
Origin: https://bailian.console.aliyun.com
Referer: https://bailian.console.aliyun.com/{region}/?tab=coding-plan
Cookie: {cookie}

params={encoded JSON}&region={region}&sec_token={secToken}
```

### 4.3 Response Envelope

```json
{
  "code": "200",
  "data": {
    "DataV2": {
      "ret": ["SUCCESS::API call succeeded"],
      "data": {
        "data": {
          "codingPlanInstanceInfos": [ ... ],
          "userId": "..."
        },
        "success": true,
        "failed": false
      }
    },
    "success": true,
    "errorCode": "",
    "errorMsg": ""
  }
}
```

Success is validated by checking all of: `code === "200"`, `data.success === true`, `data.DataV2.ret[]` contains a `SUCCESS::` prefix, and `DataV2.data.failed !== true`.

---

## 5. Usage Data Structure & Parsing

### 5.1 Coding Plan Instance

The adapter extracts the first element of `codingPlanInstanceInfos`:

```typescript
interface AliyunCodingPlanInstance {
  codingPlanQuotaInfo?: {
    per5HourUsedQuota?: number;
    per5HourTotalQuota?: number;
    per5HourQuotaNextRefreshTime?: number;   // Unix milliseconds
    perWeekUsedQuota?: number;
    perWeekTotalQuota?: number;
    perWeekQuotaNextRefreshTime?: number;
    perBillMonthUsedQuota?: number;
    perBillMonthTotalQuota?: number;
    perBillMonthQuotaNextRefreshTime?: number;
  };
  instanceName?: string;   // e.g. "Coding Plan Lite"
  instanceType?: string;
  status?: string;
  remainingDays?: number;
}
```

### 5.2 Sample Response (`demo.gateway.json`)

```json
{
  "codingPlanQuotaInfo": {
    "per5HourUsedQuota": 0,
    "per5HourTotalQuota": 1200,
    "per5HourQuotaNextRefreshTime": 1772955528000,
    "perWeekUsedQuota": 0,
    "perWeekTotalQuota": 9000,
    "perWeekQuotaNextRefreshTime": 1772985600000,
    "perBillMonthUsedQuota": 0,
    "perBillMonthTotalQuota": 18000,
    "perBillMonthQuotaNextRefreshTime": 1773158400000
  },
  "instanceName": "Coding Plan Lite",
  "status": "VALID"
}
```

### 5.3 Progress Windows

Three windows are extracted from `codingPlanQuotaInfo`:

| Window Name | Fields | `windowMinutes` | Description |
|------------|--------|-----------------|-------------|
| `Session` | `per5Hour*` | 300 | 5-hour rolling window |
| `Weekly` | `perWeek*` | 10080 | 7-day window |
| `Monthly` | `perBillMonth*` | 43200 | 30-day billing month |

Each window is only included if `totalQuota > 0`. The `resetsAt` timestamp is derived from the `*QuotaNextRefreshTime` field (Unix milliseconds → `Date`).

```typescript
usedPercent = roundPercentage((used / limit) * 100)
remainingPercent = roundPercentage((remaining / limit) * 100)
```

### 5.4 UsageSnapshot Output

```typescript
{
  provider: 'aliyun',
  progress: [
    { name: 'Session',  windowMinutes: 300,   used, limit, usedPercent, resetsAt },
    { name: 'Weekly',   windowMinutes: 10080, used, limit, usedPercent, resetsAt },
    { name: 'Monthly',  windowMinutes: 43200, used, limit, usedPercent, resetsAt },
  ],
  identity: { plan: 'Coding Plan Lite' },
  updatedAt: Date,
}
```

---

## 6. Region Support

| Region Value | Console Domain | Notes |
|-------------|----------------|-------|
| `cn-beijing` (default) | `bailian.console.aliyun.com` | Mainland China |
| Any valid `regionId` | Same domain, different path | e.g. `cn-shanghai` |

Region is used in the `Referer` header and inside the gateway request body. An incorrect region may still return data but may cause the `sec_token` extraction to fail.

---

## 7. Error Handling

| Condition | Error Message |
|-----------|--------------|
| 401 / 403 HTTP | `Aliyun request unauthorized ({status})` |
| Cookie invalid format | `Invalid cookie format` |
| sec_token not found | `Unable to extract sec_token from Aliyun page. Refresh login and retry.` |
| No Coding Plan instance | `No Coding Plan instance found in Aliyun response` |
| Gateway error code | Returns `data.errorMsg` or `data.DataV2.ret[0]` |
| No quota data on instance | `Aliyun response did not include Coding Plan quota data` |

All 12-second timeouts are applied via `fetchWithTimeout`.

---

## 8. Data Flow Summary

```
User provides browser Cookie
  └─ normalizeCookieCredential() → raw cookie string
      └─ resolveRegion() → region (config / cookie / default)
          └─ resolveSecToken()
              ├─ Direct: read sec_token from cookie keys
              └─ Fallback: GET https://bailian.console.aliyun.com/{region}/
                  └─ regex extract sec_token from HTML
          └─ buildParams() → gateway request body
              └─ POST https://bailian-cs.console.aliyun.com/data/api.json
                  └─ AliyunGatewayEnvelope
                      └─ extractPrimaryInstance() → AliyunCodingPlanInstance
                          └─ buildProgress(codingPlanQuotaInfo)
                              └─ UsageSnapshot { progress[Session, Weekly, Monthly], identity }
```

---

## 9. File Index

| File | Responsibility |
|------|----------------|
| `src/adapters/AliyunAdapter.ts` | Core adapter: cookie normalization, sec_token resolution, gateway call, parsing |
| `src/adapters/utils.ts` | `fetchWithTimeout`, `roundPercentage` utilities |
| `docs/providers/aliyun/demo.gateway.json` | Sample full gateway API response |
| `docs/providers/aliyun/demo.instance.json` | Sample extracted instance object |
