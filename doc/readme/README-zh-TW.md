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

服務商範例與整合說明： [doc/providers](../providers)

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
├─ doc/                  # API 文件、服務商範例、翻譯、設定文件
├─ config.all.yaml       # 完整設定範本
├─ config.yaml           # 目前本地設定（由範本複製）
└─ .env.all              # 完整環境變數範本
```

## 快速開始

### 1. 安裝

```bash
npm install
```

### 2. 設定

```bash
cp .env.all .env
cp config.all.yaml config.yaml
```

接著依部署目標修改 `.env` 與/或 `config.yaml`。

### 3. 執行

```bash
npm run dev:all
```

預設本地端點：

- 前端：`http://localhost:3000`
- 後端：`http://localhost:3001`

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

- [doc/conf/README.md](../conf/README.md)

## 部署

支援的部署模式與文件：

- [deploy/README.md](../../deploy/README.md)
- [deploy/container/README.md](../../deploy/container/README.md)
- [deploy/cloudflare/README.md](../../deploy/cloudflare/README.md)
- [deploy/vercel/README.md](../../deploy/vercel/README.md)

## API 文件

- [doc/api/README.md](../api/README.md)

## 安全說明

- 在資料庫模式下，工作階段密鑰與加密相關設定會在 bootstrap 階段由系統儲存初始化並持久化。
- `AIMETER_CRON_SECRET` 與 `AIMETER_ENDPOINT_SECRET` 為可選整合密鑰，建議使用 32 字元高強度隨機值。
- 生產環境請設定 `AIMETER_SERVER_PROTOCOL=https`，啟用更嚴格的傳輸安全標頭。
