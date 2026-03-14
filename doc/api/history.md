# History API `/api/history`

All endpoints require a **normal or admin session cookie**.

---

### `GET /api/history`

Returns compressed historical usage data. Supports querying all providers or a single provider. Data is downsampled into time buckets to reduce payload size.

#### Authentication

normal or admin session cookie.

#### Query Parameters

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `days` | number | `30` | Number of days to query |
| `intervalMinutes` | number | auto | Interval granularity in minutes; auto-selected based on `days` if omitted |
| `bucketMinutes` | number | — | Backward-compatible alias of `intervalMinutes` (deprecated) |
| `provider` | string | — | Filter to a single provider ID; returns all providers if omitted |

**Auto bucket selection:**

| `days` range | Default bucket |
|-------------|----------------|
| ≤ 7 | 5 minutes |
| ≤ 14 | 10 minutes |
| ≤ 30 | 15 minutes |
| ≤ 60 | 20 minutes |
| ≤ 90 | 30 minutes |
| > 90 | 60 minutes |

> When `days` ≥ 90, `intervalMinutes` has a minimum of 20 regardless of the explicit value.

#### Request Examples

```bash
# All providers, last 7 days
curl -b cookies.txt "http://localhost:3001/api/history?days=7"

# Single provider, last 30 days, 30-minute interval
curl -b cookies.txt "http://localhost:3001/api/history?days=30&provider=prov_abc123&intervalMinutes=30"
```

#### Response Example

```json
{
  "success": true,
  "data": {
    "prov_abc123": {
      "k": ["Fast Requests", "Slow Requests"],
      "d": [
        {
          "t": 1741737600,
          "p": [[0, 32], [1, 15]],
          "c": [12.50, 100.00]
        },
        {
          "t": 1741824000,
          "p": [[0, 45], [1, 20]]
        }
      ]
    }
  }
}
```

#### Compressed Format

Each provider ID maps to a `CompactHistorySeries` object:

**`CompactHistorySeries`**

| Field | Type | Description |
|-------|------|-------------|
| `k` | string[] | Index of progress item names; array position is the item's numeric ID |
| `d` | CompactHistoryRecord[] | Time series, sorted ascending by timestamp |

**`CompactHistoryRecord`**

| Field | Type | Description |
|-------|------|-------------|
| `t` | number | Unix timestamp (seconds) of the latest record in this bucket |
| `p` | [number, number][] | (optional) Progress entries: `[itemIndex, usedPercent]`, where `itemIndex` maps into `k` |
| `c` | [number, number] | (optional) Cost data: `[used, limit]` in the provider's currency unit |

**Parsing example:**

```
k = ["Fast Requests", "Slow Requests"]
d[0].p = [[0, 32], [1, 15]]
  → Fast Requests: 32% used
  → Slow Requests: 15% used

d[0].c = [12.50, 100.00]
  → $12.50 used of $100.00 limit
```

#### Error Codes

| Status | Code | Description |
|--------|------|-------------|
| 401 | `UNAUTHORIZED` | Not authenticated |
| 500 | `INTERNAL_ERROR` | Server error |
