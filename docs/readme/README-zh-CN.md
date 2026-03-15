<div align="center">

<img src="../../public/img/logo-light.svg" width="80" height="80" align="center" alt="AIMeter logo">

# AIMeter

AIMeter 是一个可自托管仪表盘，用于跟踪 AI 服务商的用量、额度与历史趋势。

</div>

<div align="center">

[![React](https://img.shields.io/badge/React-Frontend-61dafb?logo=react&logoColor=white)](#技术栈)
[![Express](https://img.shields.io/badge/Express-API-000000?logo=express)](#技术栈)
[![TypeScript](https://img.shields.io/badge/TypeScript-Strict-3178c6?logo=typescript&logoColor=white)](#技术栈)
[![Runtime](https://img.shields.io/badge/Runtime-Node%20%7C%20Serverless-22c55e)](#运行模式)
[![Providers](https://img.shields.io/badge/Providers-Multi-0ea5e9)](#支持的服务商)
[![Deploy](https://img.shields.io/badge/Deploy-Vercel-000000?logo=vercel)](../../deploy/vercel/README.md)
[![Deploy](https://img.shields.io/badge/Deploy-Cloudflare-f38020?logo=cloudflare&logoColor=white)](../../deploy/cloudflare/README.md)

</div>

<div align="center">

[English](../../README.md) | [**简体中文**](README-zh-CN.md) | [繁體中文](README-zh-TW.md) | [日本語](README-ja.md) | [Français](README-fr.md) | [Deutsch](README-de.md) | [Español](README-es.md) | [Português](README-pt.md) | [Русский](README-ru.md) | [한국어](README-ko.md)

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

## 功能特性

- React 前端仪表盘
- Express 后端 API
- 多服务商适配器架构
- 运行模式：`node` 与 `serverless`
- 基于数据库的存储与 bootstrap 流程
- 多个 AI 服务商统一看板
- 服务商凭证管理与额度展示
- 用量历史与图表页面
- Endpoint / 代理相关 API 页面
- Bootstrap + 管理员路由初始化流程
- 多种数据库引擎：`sqlite`、`d1`、`postgres`、`mysql`

## 支持的服务商

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

服务商示例与接入说明： [docs/providers](../providers)

## 技术栈

- 前端：React 18、TypeScript、Vite、Tailwind CSS
- 后端：Node.js、Express、TypeScript
- 存储：SQLite / Cloudflare D1 / PostgreSQL / MySQL

## 项目结构

```text
.
├─ src/                  # 前端应用
├─ server/               # 后端 API、鉴权、任务、存储
├─ deploy/               # 各平台部署指南
├─ docs/                  # API 文档、服务商示例、翻译、配置文档
├─ config.all.yaml       # 完整配置模板
├─ config.yaml           # 当前本地配置（由模板复制）
└─ .env.all              # 完整环境变量模板
```

## 快速开始

### 方式一：容器（Docker）

单容器部署，nginx + Node.js，数据通过挂载卷持久化。

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

访问：`http://localhost:3000`

Docker Compose、HTTPS、MySQL/PostgreSQL 及多架构构建：[deploy/container/README.md](../../deploy/container/README.md)

### 方式二：Vercel

Serverless 部署，需要外部 MySQL 或 PostgreSQL 数据库。

| 数据库 | 部署 |
|---|---|
| MySQL | [![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Fbugwz%2FAIMeter&env=AIMETER_RUNTIME_MODE%2CAIMETER_SERVER_PROTOCOL%2CAIMETER_DATABASE_ENGINE%2CAIMETER_DATABASE_CONNECTION&envDefaults=%7B%22AIMETER_RUNTIME_MODE%22%3A%22serverless%22%2C%22AIMETER_SERVER_PROTOCOL%22%3A%22https%22%2C%22AIMETER_DATABASE_ENGINE%22%3A%22mysql%22%2C%22AIMETER_DATABASE_CONNECTION%22%3A%22mysql%3A%2F%2FUSER%3APASSWORD%40HOST%3A3306%2FDATABASE%22%7D&envDescription=AIMeter+Vercel+%2B+MySQL&envLink=https%3A%2F%2Fgithub.com%2Fbugwz%2FAIMeter%2Fblob%2Fmain%2Fdeploy%2Fvercel%2FREADME.md) |
| PostgreSQL | [![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Fbugwz%2FAIMeter&env=AIMETER_RUNTIME_MODE%2CAIMETER_SERVER_PROTOCOL%2CAIMETER_DATABASE_ENGINE%2CAIMETER_DATABASE_CONNECTION&envDefaults=%7B%22AIMETER_RUNTIME_MODE%22%3A%22serverless%22%2C%22AIMETER_SERVER_PROTOCOL%22%3A%22https%22%2C%22AIMETER_DATABASE_ENGINE%22%3A%22postgres%22%2C%22AIMETER_DATABASE_CONNECTION%22%3A%22postgresql%3A%2F%2FUSER%3APASSWORD%40HOST%3A5432%2FDATABASE%3Fsslmode%3Drequire%22%7D&envDescription=AIMeter+Vercel+%2B+PostgreSQL&envLink=https%3A%2F%2Fgithub.com%2Fbugwz%2FAIMeter%2Fblob%2Fmain%2Fdeploy%2Fvercel%2FREADME.md) |

设置环境变量并完成 bootstrap 后，配置外部定时任务每 5 分钟调用 `/api/system/jobs/refresh`。

Cron 配置与完整说明：[deploy/vercel/README.md](../../deploy/vercel/README.md)

### 方式三：Cloudflare Workers

Serverless 部署，支持 Cloudflare D1、MySQL 或 PostgreSQL。

[![Deploy to Cloudflare Workers](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/bugwz/AIMeter)

部署后按数据库模式设置环境变量：

| 模式 | 必填环境变量 |
|---|---|
| D1 | `AIMETER_RUNTIME_MODE=serverless`<br>`AIMETER_SERVER_PROTOCOL=https`<br>`AIMETER_DATABASE_ENGINE=d1`<br>`AIMETER_DATABASE_CONNECTION=DB` |
| MySQL | `AIMETER_RUNTIME_MODE=serverless`<br>`AIMETER_SERVER_PROTOCOL=https`<br>`AIMETER_DATABASE_ENGINE=mysql`<br>`AIMETER_DATABASE_CONNECTION=mysql://USER:PASSWORD@HOST:3306/DATABASE` |
| PostgreSQL | `AIMETER_RUNTIME_MODE=serverless`<br>`AIMETER_SERVER_PROTOCOL=https`<br>`AIMETER_DATABASE_ENGINE=postgres`<br>`AIMETER_DATABASE_CONNECTION=postgres://USER:PASSWORD@HOST:5432/DATABASE?sslmode=require` |

Cron Triggers 已内置，`wrangler.jsonc` 默认每 5 分钟自动触发刷新。

D1 绑定、Hyperdrive 及完整配置步骤：[deploy/cloudflare/README.md](../../deploy/cloudflare/README.md)

## 脚本

```bash
npm run dev            # 仅前端
npm run start:server   # 仅后端
npm run dev:all        # 前端 + 后端
npm run dev:mock:all   # 前端 + 后端（Mock 模式）
npm run build          # 类型检查并构建前端
npm run preview        # 预览前端构建
npm run cf:dev         # 本地 Cloudflare Workers 开发（Wrangler）
npm run cf:deploy      # 部署到 Cloudflare Workers
```

## 配置

当前实现中的配置来源与优先级：

1. `config.yaml`（或 `AIMETER_CONFIG_FILE` 指定路径）
2. 环境变量
3. 内置默认值

重点说明：

- `database.engine` / `AIMETER_DATABASE_ENGINE` 必填。
- `database.connection` / `AIMETER_DATABASE_CONNECTION` 必填。
- `serverless` 模式下，调度器禁用。
- `node` 模式下，会自动启动进程内调度器。

字段映射与详细说明：

- [docs/conf/README.md](../conf/README.md)

## 部署

支持的部署模式与文档：

- [deploy/README.md](../../deploy/README.md)
- [deploy/container/README.md](../../deploy/container/README.md)
- [deploy/cloudflare/README.md](../../deploy/cloudflare/README.md)
- [deploy/vercel/README.md](../../deploy/vercel/README.md)

## API 文档

- [docs/api/README.md](../api/README.md)

## 安全说明

- 数据库模式下，会话密钥与加密相关设置会在 bootstrap 阶段由系统存储初始化并持久化。
- `AIMETER_CRON_SECRET` 与 `AIMETER_ENDPOINT_SECRET` 为可选集成密钥，建议使用 32 位高强度随机值。
- 生产环境请设置 `AIMETER_SERVER_PROTOCOL=https`，启用更严格的传输安全响应头。
