# AIMeter

AIMeter は、複数の AI プロバイダーの利用量、クォータ、履歴を 1 つの画面で追跡できる self-hosted ダッシュボードです。

<div align="center">

[English](../../README.md) | [简体中文](README-zh-CN.md) | [繁體中文](README-zh-TW.md) | [**日本語**](README-ja.md) | [Français](README-fr.md) | [Deutsch](README-de.md) | [Español](README-es.md) | [Português](README-pt.md) | [Русский](README-ru.md) | [한국어](README-ko.md)

</div>

<div align="center">
  <img src="../img/dashboard.png" alt="AIMeter dashboard" width="100%" />
</div>

## 主な機能

- 複数プロバイダーを統合したダッシュボード
- プロバイダー設定と認証情報の管理
- 利用履歴とチャート表示
- Endpoint / Widget 関連ページ
- `node` 実行モードでの自動定期更新
- ローカル開発・デモ向けの Mock モード
- SQLite、PostgreSQL、MySQL をサポート
- 環境変数優先の設定オーバーライド

## 対応 Provider

現在のアダプター一覧：

- Aliyun
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

## 技術スタック

- フロントエンド：React 18、TypeScript、Vite、Tailwind CSS
- バックエンド：Node.js、Express、TypeScript
- データベース：better-sqlite3、pg、mysql2

## プロジェクト構成

```text
.
├─ src/                 # フロントエンドアプリ
├─ server/              # バックエンド API、認証、ジョブ、ストレージ
├─ doc/                 # 設計資料、Provider サンプル、多言語ドキュメント
├─ config.example.yaml  # 設定テンプレート
└─ .env.example         # 環境変数テンプレート
```

## クイックスタート

### 1. 依存関係のインストール

```bash
npm install
```

### 2. 設定ファイルを用意

```bash
cp .env.example .env
cp config.example.yaml config.yaml
```

環境に合わせて `config.yaml` と `.env` を編集してください。

### 3. フロントエンド + バックエンドを起動

```bash
npm run dev:all
```

デフォルトのローカル URL：

- フロントエンド：`http://localhost:3000`
- バックエンド：`http://localhost:3001`

## 主なスクリプト

```bash
npm run dev            # フロントエンドのみ
npm run start:server   # バックエンドのみ
npm run dev:all        # フロントエンド + バックエンド
npm run dev:mock:all   # フロントエンド + バックエンド（Mock モード）
npm run build          # 型チェック + フロントエンドビルド
npm run preview        # 本番ビルドのプレビュー
```

## 設定モデル

優先順位：

1. 環境変数（`.env`）
2. `config.yaml`
3. 組み込みデフォルト

主な設定領域：

- `server`：API URL、フロント/バックのポート、CORS、プロキシ信頼
- `runtime`：`node` または `serverless`、mock 切り替え
- `database`：エンジン、DSN/パス、暗号化キー
- `auth`：セッションシークレット、Cookie 設定、レート制限、bootstrap/admin シークレット
- `providers`：Provider 一覧（DB モード無効時に使用）

## 実行モード

- `node`：プロセス内スケジューラーで定期更新を実行します。
- `serverless`：スケジューラーを無効化し、リクエスト駆動で更新します。

## データベースエンジン

AIMeter が対応する DB：

- SQLite（デフォルト）
- PostgreSQL
- MySQL



## コンテナデプロイ

AIMeter はシングルコンテナ構成を提供します：**nginx**（HTTPS、ポート 3000）が TLS を終端し、Node.js（内部ポート 3001）へリバースプロキシします。

```bash
./deploy/container/build.sh   # イメージのビルド
./deploy/container/run.sh     # サービスの起動
```

暗号化キーとセッションキーは初回起動時に自動生成されます。手動設定は不要です。

詳細は [deploy/container/README.md](../../deploy/container/README.md) を参照してください。

## セキュリティ

本番環境では次を推奨します：

- データベースモードでは、`AIMETER_ENCRYPTION_KEY` と `AIMETER_AUTH_SESSION_SECRET` は初回起動時に自動生成・永続化されます。複数インスタンスで DB を共有する場合のみ手動設定が必要です。
- HTTPS 配下で Secure Cookie を有効にする。
- CORS オリジンを制限する。
- admin/cron/endpoint の秘密値を適切に保護する。
