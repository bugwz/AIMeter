<div align="center">

<img src="../../public/img/logo-light.svg" width="80" height="80" align="center" alt="AIMeter logo">

# AIMeter

AIMeter 是一個可自託管儀表板，用於追蹤 AI 服務商的用量、額度與歷史趨勢。

</div>

<div align="center">

[![React](https://img.shields.io/badge/React-Frontend-61dafb?logo=react&logoColor=white)](#技術棧)
[![Express](https://img.shields.io/badge/Express-API-000000?logo=express)](#技術棧)
[![TypeScript](https://img.shields.io/badge/TypeScript-Strict-3178c6?logo=typescript&logoColor=white)](#技術棧)
[![Runtime](https://img.shields.io/badge/Runtime-Node%20%7C%20Serverless-22c55e)](#執行模式)
[![Providers](https://img.shields.io/badge/Providers-Multi-0ea5e9)](#支援的服務商)
[![Deploy](https://img.shields.io/badge/Deploy-Vercel-000000?logo=vercel)](../../deploy/vercel/README.md)
[![Deploy](https://img.shields.io/badge/Deploy-Cloudflare-f38020?logo=cloudflare&logoColor=white)](../../deploy/cloudflare/README.md)

</div>

<div align="center">

[English](../../README.md) | [简体中文](README-zh-CN.md) | [**繁體中文**](README-zh-TW.md) | [日本語](README-ja.md) | [Français](README-fr.md) | [Deutsch](README-de.md) | [Español](README-es.md) | [Português](README-pt.md) | [Русский](README-ru.md) | [한국어](README-ko.md)

</div>

<div align="center">
  <img src="../img/dashboard.png" alt="AIMeter dashboard" width="100%" />
</div>

<div align="center">
  <table>
    <tr>
      <td align="center" width="33.33%">
        <img src="../img/history.png" alt="AIMeter usage history" width="100%" />
      </td>
      <td align="center" width="33.33%">
        <img src="../img/endpoint.png" alt="AIMeter endpoint" width="100%" />
      </td>
      <td align="center" width="33.33%">
        <img src="../img/settings.png" alt="AIMeter settings" width="100%" />
      </td>
    </tr>
  </table>
</div>

## 功能特色

- React 前端儀表板
- Express 後端 API
- 多服務商適配器架構
- 執行模式：`node` 與 `serverless`
- 基於資料庫的儲存與 bootstrap 流程
- 多個 AI 服務商統一看板
- 服務商憑證管理與額度顯示
- 用量歷史與圖表頁面
- Endpoint / 代理相關 API 頁面
- Bootstrap + 管理員路由初始化流程
- 多種資料庫引擎：`sqlite`、`d1`、`postgres`、`mysql`

## 支援的服務商

<div align="center">
<table>
  <tr>
    <td align="center" valign="middle" width="140" height="110">
      <img src="../../public/providers/aliyun.svg" alt="Aliyun" width="40" height="40" style="object-fit: contain;" /><br />
      Aliyun
    </td>
    <td align="center" valign="middle" width="140" height="110">
      <img src="../../public/providers/antigravity.svg" alt="Antigravity" width="40" height="40" style="object-fit: contain;" /><br />
      Antigravity
    </td>
    <td align="center" valign="middle" width="140" height="110">
      <img src="../../public/providers/claude.svg" alt="Claude" width="40" height="40" style="object-fit: contain;" /><br />
      Claude
    </td>
    <td align="center" valign="middle" width="140" height="110">
      <img src="../../public/providers/codex.svg" alt="Codex" width="40" height="40" style="object-fit: contain;" /><br />
      Codex
    </td>
    <td align="center" valign="middle" width="140" height="110">
      <img src="../../public/providers/kimi.svg" alt="Kimi" width="40" height="40" style="object-fit: contain;" /><br />
      Kimi
    </td>
    <td align="center" valign="middle" width="140" height="110">
      <img src="../../public/providers/minimax.svg" alt="MiniMax" width="40" height="40" style="object-fit: contain;" /><br />
      MiniMax
    </td>
  </tr>
  <tr>
    <td align="center" valign="middle" width="140" height="110">
      <img src="../../public/providers/zai.svg" alt="z.ai" width="40" height="40" style="object-fit: contain;" /><br />
      z.ai
    </td>
    <td align="center" valign="middle" width="140" height="110">
      <img src="../../public/providers/copilot.svg" alt="Copilot" width="40" height="40" style="object-fit: contain;" /><br />
      Copilot
    </td>
    <td align="center" valign="middle" width="140" height="110">
      <img src="../../public/providers/openrouter.svg" alt="OpenRouter" width="40" height="40" style="object-fit: contain;" /><br />
      OpenRouter
    </td>
    <td align="center" valign="middle" width="140" height="110">
      <img src="../../public/providers/ollama.svg" alt="Ollama" width="40" height="40" style="object-fit: contain;" /><br />
      Ollama
    </td>
    <td align="center" valign="middle" width="140" height="110">
      <img src="../../public/providers/opencode.svg" alt="OpenCode" width="40" height="40" style="object-fit: contain;" /><br />
      OpenCode
    </td>
    <td align="center" valign="middle" width="140" height="110">
      <img src="../../public/providers/cursor.svg" alt="Cursor" width="40" height="40" style="object-fit: contain;" /><br />
      Cursor
    </td>
  </tr>
</table>
</div>

服務商範例與整合說明： [docs/providers](../providers)

## 技術棧

- 前端：React 18、TypeScript、Vite、Tailwind CSS
- 後端：Node.js、Express、TypeScript
- 儲存：SQLite / Cloudflare D1 / PostgreSQL / MySQL

## 專案結構

```text
.
├─ src/                  # 前端應用
├─ server/               # 後端 API、驗證、任務、儲存
├─ deploy/               # 各平台部署指南
├─ docs/                  # API 文件、服務商範例、翻譯、設定文件
├─ config.all.yaml       # 完整設定範本
├─ config.yaml           # 目前本地設定（由範本複製）
└─ .env.all              # 完整環境變數範本
```

## 快速開始

### 方式一：容器（Docker）

單容器部署，nginx + Node.js，資料透過掛載卷持久化。

```bash
mkdir -p ~/aimeter/db ~/aimeter/log
docker run -d --name aimeter \
  -p 3000:3000 \
  -e AIMETER_DATABASE_ENGINE=sqlite \
  -e AIMETER_DATABASE_CONNECTION=/aimeter/db/aimeter.db \
  -e AIMETER_SERVER_PORT=3000 \
  -e AIMETER_BACKEND_PORT=3001 \
  -e AIMETER_RUNTIME_MODE=node \
  -v ~/aimeter/db:/aimeter/db \
  -v ~/aimeter/log:/aimeter/log \
  bugwz/aimeter:latest
```

開啟：`http://localhost:3000`

Docker Compose、HTTPS、MySQL/PostgreSQL 及多架構建置：[deploy/container/README.md](../../deploy/container/README.md)

### 方式二：Vercel

Serverless 部署，需要外部 MySQL 或 PostgreSQL 資料庫。

| 資料庫 | 部署 |
|---|---|
| MySQL | [![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Fbugwz%2FAIMeter&env=AIMETER_RUNTIME_MODE%2CAIMETER_SERVER_PROTOCOL%2CAIMETER_DATABASE_ENGINE%2CAIMETER_DATABASE_CONNECTION&envDefaults=%7B%22AIMETER_RUNTIME_MODE%22%3A%22serverless%22%2C%22AIMETER_SERVER_PROTOCOL%22%3A%22https%22%2C%22AIMETER_DATABASE_ENGINE%22%3A%22mysql%22%2C%22AIMETER_DATABASE_CONNECTION%22%3A%22mysql%3A%2F%2FUSER%3APASSWORD%40HOST%3A3306%2FDATABASE%22%7D&envDescription=AIMeter+Vercel+%2B+MySQL&envLink=https%3A%2F%2Fgithub.com%2Fbugwz%2FAIMeter%2Fblob%2Fmain%2Fdeploy%2Fvercel%2FREADME.md) |
| PostgreSQL | [![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Fbugwz%2FAIMeter&env=AIMETER_RUNTIME_MODE%2CAIMETER_SERVER_PROTOCOL%2CAIMETER_DATABASE_ENGINE%2CAIMETER_DATABASE_CONNECTION&envDefaults=%7B%22AIMETER_RUNTIME_MODE%22%3A%22serverless%22%2C%22AIMETER_SERVER_PROTOCOL%22%3A%22https%22%2C%22AIMETER_DATABASE_ENGINE%22%3A%22postgres%22%2C%22AIMETER_DATABASE_CONNECTION%22%3A%22postgresql%3A%2F%2FUSER%3APASSWORD%40HOST%3A5432%2FDATABASE%3Fsslmode%3Drequire%22%7D&envDescription=AIMeter+Vercel+%2B+PostgreSQL&envLink=https%3A%2F%2Fgithub.com%2Fbugwz%2FAIMeter%2Fblob%2Fmain%2Fdeploy%2Fvercel%2FREADME.md) |

設定環境變數並完成 bootstrap 後，設定外部排程服務每 5 分鐘呼叫 `/api/system/jobs/refresh`。

Cron 設定與完整說明：[deploy/vercel/README.md](../../deploy/vercel/README.md)

### 方式三：Cloudflare Workers

Serverless 部署，支援 Cloudflare D1、MySQL 或 PostgreSQL。

[![Deploy to Cloudflare Workers](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/bugwz/AIMeter)

部署後依資料庫模式設定環境變數：

| 模式 | 必填環境變數 |
|---|---|
| D1 | `AIMETER_RUNTIME_MODE=serverless`<br>`AIMETER_SERVER_PROTOCOL=https`<br>`AIMETER_DATABASE_ENGINE=d1`<br>`AIMETER_DATABASE_CONNECTION=DB` |
| MySQL | `AIMETER_RUNTIME_MODE=serverless`<br>`AIMETER_SERVER_PROTOCOL=https`<br>`AIMETER_DATABASE_ENGINE=mysql`<br>`AIMETER_DATABASE_CONNECTION=mysql://USER:PASSWORD@HOST:3306/DATABASE` |
| PostgreSQL | `AIMETER_RUNTIME_MODE=serverless`<br>`AIMETER_SERVER_PROTOCOL=https`<br>`AIMETER_DATABASE_ENGINE=postgres`<br>`AIMETER_DATABASE_CONNECTION=postgres://USER:PASSWORD@HOST:5432/DATABASE?sslmode=require` |

Cron Triggers 已內建，`wrangler.jsonc` 預設每 5 分鐘自動觸發刷新。

D1 綁定、Hyperdrive 及完整設定步驟：[deploy/cloudflare/README.md](../../deploy/cloudflare/README.md)

## 腳本

```bash
npm run dev            # 僅前端
npm run start:server   # 僅後端
npm run dev:all        # 前端 + 後端
npm run dev:mock:all   # 前端 + 後端（Mock 模式）
npm run build          # 型別檢查並建置前端
npm run preview        # 預覽前端建置
npm run cf:dev         # 本地 Cloudflare Workers 開發（Wrangler）
npm run cf:deploy      # 部署到 Cloudflare Workers
```

## 設定

目前實作中的設定來源與優先順序：

1. `config.yaml`（或 `AIMETER_CONFIG_FILE` 指定路徑）
2. 環境變數
3. 內建預設值

重點說明：

- `database.engine` / `AIMETER_DATABASE_ENGINE` 為必填。
- `database.connection` / `AIMETER_DATABASE_CONNECTION` 為必填。
- 在 `serverless` 模式中，排程器停用。
- 在 `node` 模式中，會自動啟動行程內排程器。

欄位映射與詳細說明：

- [docs/conf/README.md](../conf/README.md)

## 部署

支援的部署模式與文件：

- [deploy/README.md](../../deploy/README.md)
- [deploy/container/README.md](../../deploy/container/README.md)
- [deploy/cloudflare/README.md](../../deploy/cloudflare/README.md)
- [deploy/vercel/README.md](../../deploy/vercel/README.md)

## API 文件

- [docs/api/README.md](../api/README.md)

## 安全說明

- 在資料庫模式下，工作階段密鑰與加密相關設定會在 bootstrap 階段由系統儲存初始化並持久化。
- `AIMETER_CRON_SECRET` 與 `AIMETER_ENDPOINT_SECRET` 為可選整合密鑰，建議使用 32 字元高強度隨機值。
- 生產環境請設定 `AIMETER_SERVER_PROTOCOL=https`，啟用更嚴格的傳輸安全標頭。
