<div align="center">

<img src="../../public/img/logo-light.svg" width="80" height="80" align="center" alt="AIMeter logo">

# AIMeter

AIMeter は、AI プロバイダーの利用量・クォータ・履歴トレンドを追跡する self-hosted ダッシュボードです。

</div>

<div align="center">

[![React](https://img.shields.io/badge/React-Frontend-61dafb?logo=react&logoColor=white)](#技術スタック)
[![Express](https://img.shields.io/badge/Express-API-000000?logo=express)](#技術スタック)
[![TypeScript](https://img.shields.io/badge/TypeScript-Strict-3178c6?logo=typescript&logoColor=white)](#技術スタック)
[![Runtime](https://img.shields.io/badge/Runtime-Node%20%7C%20Serverless-22c55e)](#実行モード)
[![Providers](https://img.shields.io/badge/Providers-Multi-0ea5e9)](#対応プロバイダー)
[![Deploy](https://img.shields.io/badge/Deploy-Vercel-000000?logo=vercel)](../../deploy/vercel/README.md)
[![Deploy](https://img.shields.io/badge/Deploy-Cloudflare-f38020?logo=cloudflare&logoColor=white)](../../deploy/cloudflare/README.md)

</div>

<div align="center">

[English](../../README.md) | [简体中文](README-zh-CN.md) | [繁體中文](README-zh-TW.md) | [**日本語**](README-ja.md) | [Français](README-fr.md) | [Deutsch](README-de.md) | [Español](README-es.md) | [Português](README-pt.md) | [Русский](README-ru.md) | [한국어](README-ko.md)

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

## 主な機能

- React フロントエンドダッシュボード
- Express バックエンド API
- マルチプロバイダー対応アダプター構成
- 実行モード: `node` / `serverless`
- DB ベースのストレージと bootstrap フロー
- 複数 AI プロバイダーを横断した統合ダッシュボード
- プロバイダー認証情報管理とクォータ表示
- 利用履歴とチャートページ
- Endpoint / プロキシ関連 API ページ
- Bootstrap + 管理者ルート初期化フロー
- 複数 DB エンジン対応: `sqlite`、`d1`、`postgres`、`mysql`

## 対応プロバイダー

<div align="center">
<table>
  <tr>
    <td align="center" valign="middle" width="140" height="110"><img src="../../public/providers/aliyun.svg" alt="Aliyun" width="40" height="40" style="object-fit: contain;" /><br />Aliyun</td>
    <td align="center" valign="middle" width="140" height="110"><img src="../../public/providers/antigravity.svg" alt="Antigravity" width="40" height="40" style="object-fit: contain;" /><br />Antigravity</td>
    <td align="center" valign="middle" width="140" height="110"><img src="../../public/providers/claude.svg" alt="Claude" width="40" height="40" style="object-fit: contain;" /><br />Claude</td>
    <td align="center" valign="middle" width="140" height="110"><img src="../../public/providers/codex.svg" alt="Codex" width="40" height="40" style="object-fit: contain;" /><br />Codex</td>
    <td align="center" valign="middle" width="140" height="110"><img src="../../public/providers/kimi.svg" alt="Kimi" width="40" height="40" style="object-fit: contain;" /><br />Kimi</td>
    <td align="center" valign="middle" width="140" height="110"><img src="../../public/providers/minimax.svg" alt="MiniMax" width="40" height="40" style="object-fit: contain;" /><br />MiniMax</td>
  </tr>
  <tr>
    <td align="center" valign="middle" width="140" height="110"><img src="../../public/providers/zai.svg" alt="z.ai" width="40" height="40" style="object-fit: contain;" /><br />z.ai</td>
    <td align="center" valign="middle" width="140" height="110"><img src="../../public/providers/copilot.svg" alt="Copilot" width="40" height="40" style="object-fit: contain;" /><br />Copilot</td>
    <td align="center" valign="middle" width="140" height="110"><img src="../../public/providers/openrouter.svg" alt="OpenRouter" width="40" height="40" style="object-fit: contain;" /><br />OpenRouter</td>
    <td align="center" valign="middle" width="140" height="110"><img src="../../public/providers/ollama.svg" alt="Ollama" width="40" height="40" style="object-fit: contain;" /><br />Ollama</td>
    <td align="center" valign="middle" width="140" height="110"><img src="../../public/providers/opencode.svg" alt="OpenCode" width="40" height="40" style="object-fit: contain;" /><br />OpenCode</td>
    <td align="center" valign="middle" width="140" height="110"><img src="../../public/providers/cursor.svg" alt="Cursor" width="40" height="40" style="object-fit: contain;" /><br />Cursor</td>
  </tr>
</table>
</div>

プロバイダー別のサンプルと統合ノート: [docs/providers](../providers)

## 技術スタック

- Frontend: React 18, TypeScript, Vite, Tailwind CSS
- Backend: Node.js, Express, TypeScript
- Storage: SQLite / Cloudflare D1 / PostgreSQL / MySQL

## プロジェクト構成

```text
.
├─ src/                  # フロントエンドアプリ
├─ server/               # バックエンド API, 認証, ジョブ, ストレージ
├─ deploy/               # プラットフォーム別デプロイガイド
├─ docs/                  # API ドキュメント, プロバイダー例, 翻訳, 設定ドキュメント
├─ config.all.yaml       # 設定テンプレート（全項目）
├─ config.yaml           # ローカル有効設定（コピーして作成）
└─ .env.all              # 環境変数テンプレート（全項目）
```

## クイックスタート

### オプション 1: コンテナ（Docker）

nginx + Node.js のシングルコンテナ構成。データはボリュームマウントで永続化されます。

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

アクセス: `http://localhost:3000`

Docker Compose、HTTPS、MySQL/PostgreSQL、マルチアーキテクチャビルドの詳細: [deploy/container/README.md](../../deploy/container/README.md)

### オプション 2: Vercel

Serverless デプロイ。外部の MySQL または PostgreSQL データベースが必要です。

| DB | デプロイ |
|---|---|
| MySQL | [![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Fbugwz%2FAIMeter&env=AIMETER_RUNTIME_MODE%2CAIMETER_SERVER_PROTOCOL%2CAIMETER_DATABASE_ENGINE%2CAIMETER_DATABASE_CONNECTION&envDefaults=%7B%22AIMETER_RUNTIME_MODE%22%3A%22serverless%22%2C%22AIMETER_SERVER_PROTOCOL%22%3A%22https%22%2C%22AIMETER_DATABASE_ENGINE%22%3A%22mysql%22%2C%22AIMETER_DATABASE_CONNECTION%22%3A%22mysql%3A%2F%2FUSER%3APASSWORD%40HOST%3A3306%2FDATABASE%22%7D&envDescription=AIMeter+Vercel+%2B+MySQL&envLink=https%3A%2F%2Fgithub.com%2Fbugwz%2FAIMeter%2Fblob%2Fmain%2Fdeploy%2Fvercel%2FREADME.md) |
| PostgreSQL | [![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Fbugwz%2FAIMeter&env=AIMETER_RUNTIME_MODE%2CAIMETER_SERVER_PROTOCOL%2CAIMETER_DATABASE_ENGINE%2CAIMETER_DATABASE_CONNECTION&envDefaults=%7B%22AIMETER_RUNTIME_MODE%22%3A%22serverless%22%2C%22AIMETER_SERVER_PROTOCOL%22%3A%22https%22%2C%22AIMETER_DATABASE_ENGINE%22%3A%22postgres%22%2C%22AIMETER_DATABASE_CONNECTION%22%3A%22postgresql%3A%2F%2FUSER%3APASSWORD%40HOST%3A5432%2FDATABASE%3Fsslmode%3Drequire%22%7D&envDescription=AIMeter+Vercel+%2B+PostgreSQL&envLink=https%3A%2F%2Fgithub.com%2Fbugwz%2FAIMeter%2Fblob%2Fmain%2Fdeploy%2Fvercel%2FREADME.md) |

環境変数を設定して bootstrap を完了後、外部 cron サービスで `/api/system/jobs/refresh` を 5 分ごとに呼び出します。

Cron 設定と完全な手順: [deploy/vercel/README.md](../../deploy/vercel/README.md)

### オプション 3: Cloudflare Workers

Serverless デプロイ。Cloudflare D1、MySQL、PostgreSQL に対応。

[![Deploy to Cloudflare Workers](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/bugwz/AIMeter)

デプロイ後、DB モードに応じて環境変数を設定してください:

| モード | 必須環境変数 |
|---|---|
| D1 | `AIMETER_RUNTIME_MODE=serverless`<br>`AIMETER_SERVER_PROTOCOL=https`<br>`AIMETER_DATABASE_ENGINE=d1`<br>`AIMETER_DATABASE_CONNECTION=DB` |
| MySQL | `AIMETER_RUNTIME_MODE=serverless`<br>`AIMETER_SERVER_PROTOCOL=https`<br>`AIMETER_DATABASE_ENGINE=mysql`<br>`AIMETER_DATABASE_CONNECTION=mysql://USER:PASSWORD@HOST:3306/DATABASE` |
| PostgreSQL | `AIMETER_RUNTIME_MODE=serverless`<br>`AIMETER_SERVER_PROTOCOL=https`<br>`AIMETER_DATABASE_ENGINE=postgres`<br>`AIMETER_DATABASE_CONNECTION=postgres://USER:PASSWORD@HOST:5432/DATABASE?sslmode=require` |

Cron Triggers は組み込み済みで、`wrangler.jsonc` がデフォルトで 5 分ごとに自動リフレッシュをスケジュールします。

D1 バインディング、Hyperdrive、完全な設定手順: [deploy/cloudflare/README.md](../../deploy/cloudflare/README.md)

## スクリプト

```bash
npm run dev            # フロントエンドのみ
npm run start:server   # バックエンドのみ
npm run dev:all        # フロントエンド + バックエンド
npm run dev:mock:all   # フロントエンド + バックエンド（mock モード）
npm run build          # 型チェック + フロントエンドビルド
npm run preview        # フロントエンドビルドをプレビュー
npm run cf:dev         # Cloudflare Workers ローカル開発（Wrangler）
npm run cf:deploy      # Cloudflare Workers へデプロイ
```

## 設定

現在の実装における設定ソースと優先順位:

1. `config.yaml`（または `AIMETER_CONFIG_FILE` で指定したパス）
2. 環境変数
3. 組み込みデフォルト

重要事項:

- `database.engine` / `AIMETER_DATABASE_ENGINE` は必須。
- `database.connection` / `AIMETER_DATABASE_CONNECTION` は必須。
- `serverless` モードではスケジューラーは無効。
- `node` モードではプロセス内スケジューラーが自動起動。

詳細な項目マッピングと説明:

- [docs/conf/README.md](../conf/README.md)

## デプロイ

対応デプロイモードとドキュメント:

- [deploy/README.md](../../deploy/README.md)
- [deploy/container/README.md](../../deploy/container/README.md)
- [deploy/cloudflare/README.md](../../deploy/cloudflare/README.md)
- [deploy/vercel/README.md](../../deploy/vercel/README.md)

## API ドキュメント

- [docs/api/README.md](../api/README.md)

## セキュリティノート

- DB モードでは、セッションシークレットおよび暗号化関連設定は bootstrap 時にシステムストレージへ初期化・永続化されます。
- `AIMETER_CRON_SECRET` と `AIMETER_ENDPOINT_SECRET` は任意の統合シークレットです。指定する場合は 32 文字の強ランダム値を使用してください。
- 本番環境では `AIMETER_SERVER_PROTOCOL=https` を設定し、厳格なトランスポート関連セキュリティヘッダーを有効化してください。
