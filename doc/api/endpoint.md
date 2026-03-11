# Data Export API `/api/endpoint`

This module exports usage data in multiple formats, designed for integration with status pages, monitoring systems, and cron scripts.

---

### `GET /api/endpoint/subscriptions`

Exports the latest usage data for all (or selected) providers. Supports JSON, XML, CSV, Markdown, and Table output formats.

#### Authentication

Two authentication methods are accepted (either one works):

1. **Session cookie** (recommended for browser/frontend): normal or admin role
2. **Endpoint secret** (recommended for scripts/automation): pass the secret via request header

```
x-aimeter-endpoint-secret: <configured_secret>
```

Secret source by deployment mode:
- **Database mode**: auto-generated at first startup; retrieve the current value from the admin Settings page or `GET /api/system/secrets`.
- **Env/config mode**: must match the configured `endpointSecret` value. Configuration priority is `config.yaml` > environment variables (`AIMETER_ENDPOINT_SECRET`) > defaults.

> Endpoint secret authentication is fixed to the `normal` role. If no secret is configured or found, secret-based authentication is unavailable.

#### Query Parameters

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `format` | string | `json` | Output format: `json` / `xml` / `csv` / `markdown` / `table` |
| `providers` | string | `all` | Provider types to include, comma-separated (e.g. `claude,kimi`); `all` returns every configured provider |
| `pretty` | boolean | `true` | Whether to format the output (applies to `json`, `xml`, and `markdown`) |
| `timezone` | string | `UTC` | IANA timezone string (e.g. `America/New_York`) for formatting time fields |

#### Request Examples

**curl**

```bash
# JSON — endpoint secret
curl -H "x-aimeter-endpoint-secret: your_32_char_endpoint_secret" \
  "http://localhost:3001/api/endpoint/subscriptions"

# JSON — session cookie
curl -b cookies.txt \
  "http://localhost:3001/api/endpoint/subscriptions"

# XML, pretty-printed
curl -H "x-aimeter-endpoint-secret: your_32_char_endpoint_secret" \
  "http://localhost:3001/api/endpoint/subscriptions?format=xml&pretty=true"

# CSV, save to file
curl -H "x-aimeter-endpoint-secret: your_32_char_endpoint_secret" \
  "http://localhost:3001/api/endpoint/subscriptions?format=csv" \
  --output usage.csv

# Markdown, specific providers, custom timezone
curl -H "x-aimeter-endpoint-secret: your_32_char_endpoint_secret" \
  "http://localhost:3001/api/endpoint/subscriptions?format=markdown&providers=claude,kimi&timezone=America/New_York"

# ASCII table in terminal
curl -H "x-aimeter-endpoint-secret: your_32_char_endpoint_secret" \
  "http://localhost:3001/api/endpoint/subscriptions?format=table&timezone=America/New_York"
```

**Python (requests)**

```python
import requests

BASE_URL = "http://localhost:3001"
headers = {"x-aimeter-endpoint-secret": "your_32_char_endpoint_secret"}

# JSON — all providers
response = requests.get(f"{BASE_URL}/api/endpoint/subscriptions", headers=headers)
data = response.json()
for provider in data["providers"]:
    if "progress" in provider:
        print(f"{provider['provider']}: {provider['progress'][0]['usedPercent']}% used")

# CSV — save to file
response = requests.get(
    f"{BASE_URL}/api/endpoint/subscriptions",
    headers=headers,
    params={"format": "csv"},
)
with open("usage.csv", "w") as f:
    f.write(response.text)

# JSON — specific providers, compact output
response = requests.get(
    f"{BASE_URL}/api/endpoint/subscriptions",
    headers=headers,
    params={"providers": "claude,kimi", "pretty": "false"},
)
```

**JavaScript / Node.js (fetch)**

```js
const BASE_URL = "http://localhost:3001";
const headers = { "x-aimeter-endpoint-secret": "your_32_char_endpoint_secret" };

// JSON — all providers
const res = await fetch(`${BASE_URL}/api/endpoint/subscriptions`, { headers });
const data = await res.json();
data.providers
  .filter((p) => "progress" in p)
  .forEach((p) => console.log(`${p.provider}: ${p.progress[0].usedPercent}% used`));

// CSV — save output
const csvRes = await fetch(
  `${BASE_URL}/api/endpoint/subscriptions?format=csv`,
  { headers }
);
const csv = await csvRes.text();
// write csv to file in Node.js: fs.writeFileSync("usage.csv", csv)

// Markdown — specific providers, Shanghai timezone
const mdRes = await fetch(
  `${BASE_URL}/api/endpoint/subscriptions?format=markdown&providers=claude,kimi&timezone=Asia/Shanghai`,
  { headers }
);
console.log(await mdRes.text());
```

---

#### JSON Response Example

```json
{
  "success": true,
  "timestamp": 1741824000,
  "query": {
    "providers": "all",
    "format": "json",
    "pretty": true,
    "timezone": "UTC"
  },
  "providers": [
    {
      "id": "prov_abc123",
      "provider": "claude",
      "name": "My Claude",
      "region": null,
      "identity": { "plan": "Pro" },
      "progress": [
        {
          "name": "Fast Requests",
          "desc": null,
          "usedPercent": 45,
          "remainingPercent": 55,
          "used": 225.0,
          "limit": 500.0,
          "windowMinutes": 10080.0,
          "resetsAt": 1741910400,
          "resetDescription": "Resets weekly"
        }
      ],
      "cost": {
        "used": 12.50,
        "limit": 100.00,
        "remaining": 87.50,
        "currency": "USD",
        "period": "monthly"
      },
      "updatedAt": 1741824000
    },
    {
      "id": "prov_err456",
      "provider": "kimi",
      "code": "UNKNOWN",
      "message": "No latest progress data",
      "timestamp": 1741824000
    }
  ],
  "summary": {
    "total": 2,
    "providersWithUsage": 1,
    "errors": 1,
    "averageUsedPercent": 45
  }
}
```

---

#### XML Response Example

```xml
<?xml version="1.0" encoding="UTF-8"?>
<subscriptions>
  <timestamp>1741824000</timestamp>
  <query providers="all" format="xml" pretty="true" timezone="UTC"/>
  <summary>
    <total>1</total>
    <providersWithUsage>1</providersWithUsage>
    <errors>0</errors>
    <averageUsedPercent>45</averageUsedPercent>
  </summary>
  <providers>
    <provider id="prov_abc123" provider="claude" status="ok">
      <name>My Claude</name>
      <updatedAt>1741824000</updatedAt>
      <progress>
        <item name="Fast Requests">
          <usedPercent>45</usedPercent>
          <remainingPercent>55</remainingPercent>
          <used>225</used>
          <limit>500</limit>
          <windowMinutes>10080</windowMinutes>
          <resetsAt>1741910400</resetsAt>
        </item>
      </progress>
    </provider>
  </providers>
</subscriptions>
```

---

#### CSV Response Example

```
id,provider,name,status,primaryUsedPercent,progressSummary,costUsed,costLimit,costRemaining,updatedAt,errorCode,errorMessage,timestamp
"prov_abc123","claude","My Claude","ok",45,"Fast Requests:45%",12.50,100.00,87.50,1741824000,,,
"prov_err456","kimi","","error",,,,,,,"UNKNOWN","No latest progress data",1741824000
```

---

#### Markdown Response Example

```
| Provider | Name      | Item          | UsedPct | RemainPct | ResetWindow | ResetAt             | UpdatedAt           |
| :------: | :-------: | :-----------: | :-----: | :-------: | :---------: | :-----------------: | :-----------------: |
| claude   | My Claude | Fast Requests | 45      | 55        | 7 days      | 2026-03-16 00:00:00 | 2026-03-09 00:00:00 |


Summary: providers(total=1), avgUsed=45%, timezone=UTC
```

---

#### Table Response Example

```
┌──────────┬───────────┬───────────────┬─────────┬───────────┬─────────────┬─────────────────────┬─────────────────────┐
│ Provider │ Name      │ Item          │ UsedPct │ RemainPct │ ResetWindow │ ResetAt             │ UpdatedAt           │
├──────────┼───────────┼───────────────┼─────────┼───────────┼─────────────┼─────────────────────┼─────────────────────┤
│ claude   │ My Claude │ Fast Requests │ 45      │ 55        │ 7 days      │ 2026-03-16 00:00:00 │ 2026-03-09 00:00:00 │
└──────────┴───────────┴───────────────┴─────────┴───────────┴─────────────┴─────────────────────┴─────────────────────┘


Summary: providers(total=1), avgUsed=45%, timezone=UTC
```

---

#### Content-Type Reference

| format | Content-Type |
|--------|-------------|
| `json` | `application/json` |
| `xml` | `application/xml` |
| `csv` | `text/csv` |
| `markdown` | `text/markdown` |
| `table` | `text/plain` |

---

#### Common Integration Patterns

**Shell cron — extract a single metric (curl + jq)**

```bash
#!/bin/bash
# Print Claude's primary usage percentage
curl -s -H "x-aimeter-endpoint-secret: $AIMETER_ENDPOINT_SECRET" \
  "http://localhost:3001/api/endpoint/subscriptions?format=json&pretty=false" \
  | jq '.providers[] | select(.provider == "claude") | .progress[0].usedPercent'
```

**Status page — fetch Markdown table (curl)**

```bash
curl -s -H "x-aimeter-endpoint-secret: $AIMETER_ENDPOINT_SECRET" \
  "http://localhost:3001/api/endpoint/subscriptions?format=markdown&timezone=America/New_York"
```

**Python cron — alert when usage exceeds threshold**

```python
import requests

headers = {"x-aimeter-endpoint-secret": "your_32_char_endpoint_secret"}
res = requests.get(
    "http://localhost:3001/api/endpoint/subscriptions",
    headers=headers,
    params={"format": "json", "pretty": "false"},
)
for provider in res.json()["providers"]:
    if "progress" in provider and provider["progress"][0]["usedPercent"] > 80:
        print(f"ALERT: {provider['provider']} is at {provider['progress'][0]['usedPercent']}% usage")
```

**Node.js — periodic poll and log**

```js
import { writeFileSync } from "fs";

const headers = { "x-aimeter-endpoint-secret": process.env.AIMETER_ENDPOINT_SECRET };

async function poll() {
  const res = await fetch(
    "http://localhost:3001/api/endpoint/subscriptions?format=json&pretty=false",
    { headers }
  );
  const { providers, summary } = await res.json();
  console.log(`[${new Date().toISOString()}] avg=${summary.averageUsedPercent}%`);
  providers.filter((p) => "progress" in p).forEach((p) => {
    console.log(`  ${p.provider}: ${p.progress[0].usedPercent}%`);
  });
}

setInterval(poll, 5 * 60 * 1000); // every 5 minutes
poll();
```

---

#### Error Codes

| Status | Code | Description |
|--------|------|-------------|
| 401 | `UNAUTHORIZED` | Not authenticated (no valid session cookie or endpoint secret) |
| 400 | `INVALID_FORMAT` | `format` is not a supported value |
| 400 | `INVALID_PRETTY` | `pretty` is not a valid boolean |
| 400 | `INVALID_TIMEZONE` | `timezone` is not a valid IANA timezone string |
| 400 | `INVALID_PROVIDERS` | `providers` is empty or malformed |
| 400 | `UNKNOWN_PROVIDER` | `providers` contains unsupported provider type values |
| 500 | `INTERNAL_ERROR` | Server error |
