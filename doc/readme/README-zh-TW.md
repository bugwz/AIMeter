# AIMeter

AIMeter 是一個可自託管的儀表板，用於在單一介面中追蹤多個 AI 服務商的用量、額度與歷史趨勢。

<div align="center">

[English](../../README.md) | [简体中文](README-zh-CN.md) | [**繁體中文**](README-zh-TW.md) | [日本語](README-ja.md) | [Français](README-fr.md) | [Deutsch](README-de.md) | [Español](README-es.md) | [Português](README-pt.md) | [Русский](README-ru.md) | [한국어](README-ko.md)

</div>

<div align="center">
  <img src="../img/dashboard.png" alt="AIMeter dashboard" width="100%" />
</div>

## 功能特色

- 多服務商統一儀表板
- Provider 設定與憑證管理
- 用量歷史與圖表檢視
- Endpoint 與 Widget 相關頁面
- `node` 執行模式下自動定時刷新
- 適用本地開發與示範的 Mock 模式
- 支援 SQLite、PostgreSQL、MySQL
- 環境變數優先的設定覆蓋模型

## 支援的 Provider

目前支援的適配器：

- Aliyun
- Antigravity
- Claude
- Codex
- Kimi
- MiniMax
- z.ai
- Copilot
- OpenRouter
- Ollama
- OpenCode
- Cursor

## 技術棧

- 前端：React 18、TypeScript、Vite、Tailwind CSS
- 後端：Node.js、Express、TypeScript
- 資料庫：better-sqlite3、pg、mysql2

## 專案結構

```text
.
├─ src/                 # 前端應用
├─ server/              # 後端 API、驗證、任務、儲存
├─ doc/                 # 設計說明、Provider 範例、多語文件
├─ config.example.yaml  # 完整設定範本
└─ .env.all         # 環境變數範本
```

## 快速開始

### 1. 安裝依賴

```bash
npm install
```

### 2. 準備設定

```bash
cp .env.all .env
cp config.example.yaml config.yaml
```

請依部署需求調整 `config.yaml` 與/或 `.env`。

### 3. 啟動前後端

```bash
npm run dev:all
```

預設本地位址：

- 前端：`http://localhost:3000`
- 後端：`http://localhost:3001`

## 常用腳本

```bash
npm run dev            # 僅前端
npm run start:server   # 僅後端
npm run dev:all        # 前端 + 後端
npm run dev:mock:all   # 前端 + 後端（Mock 模式）
npm run build          # 型別檢查並建置前端
npm run preview        # 預覽生產建置
```

## 設定模型

優先順序：

1. 環境變數（`.env`）
2. `config.yaml`
3. 內建預設值

主要設定區塊：

- `server`：API 位址、前後端埠、反向代理信任
- `runtime`：`node` 或 `serverless`、mock 開關
- `database`：引擎、DSN/路徑、加密金鑰
- `auth`：工作階段密鑰、Cookie 選項、限流、bootstrap/admin 密鑰
- `providers`：Provider 清單（僅在關閉資料庫模式時生效）

## 執行模式

- `node`：啟用行程內排程器，週期性刷新資料。
- `serverless`：停用排程器，以請求觸發刷新。

## 資料庫引擎

AIMeter 支援：

- SQLite（預設）
- PostgreSQL
- MySQL



## 容器化部署

AIMeter 提供單容器部署方案：**nginx**（HTTPS，連接埠 3000）終止 TLS 並反向代理至 Node.js（內部連接埠 3001）。

```bash
./deploy/container/build.sh   # 建構映像檔
./deploy/container/run.sh     # 啟動服務
```

加密金鑰與工作階段金鑰於首次啟動時自動生成，無需手動設定。

詳細說明請參閱 [deploy/container/README.md](../../deploy/container/README.md)。

## 安全說明

生產環境建議：

- 資料庫模式下，`AIMETER_ENCRYPTION_KEY` 與 `AIMETER_AUTH_SESSION_SECRET` 於首次啟動時自動生成並持久化，僅多實例共享資料庫時需手動覆寫。
- 在資料庫模式下，`AIMETER_CRON_SECRET` 與 `AIMETER_ENDPOINT_SECRET` 僅用於首次初始化，之後以資料庫中的值為準。
- 在 HTTPS 後啟用安全 Cookie。
- 妥善保管 admin/cron/endpoint 等敏感密鑰。
