# AIMeter

AIMeter 是一个可自托管的仪表盘，用于在一个界面中跟踪多个 AI 服务商的用量、额度与历史趋势。

<div align="center">

[English](../../README.md) | [**简体中文**](README-zh-CN.md) | [繁體中文](README-zh-TW.md) | [日本語](README-ja.md) | [Français](README-fr.md) | [Deutsch](README-de.md) | [Español](README-es.md) | [Português](README-pt.md) | [Русский](README-ru.md) | [한국어](README-ko.md)

</div>

<div align="center">
  <img src="../img/dashboard.png" alt="AIMeter dashboard" width="100%" />
</div>

## 功能特性

- 多服务商统一仪表盘
- Provider 配置与凭证管理
- 用量历史与图表视图
- Endpoint 与 Widget 相关页面
- `node` 运行模式下自动定时刷新
- 面向本地开发与演示的 Mock 模式
- 支持 SQLite、PostgreSQL、MySQL
- 环境变量优先的配置覆盖模型

## 支持的 Provider

当前适配器包括：

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

## 技术栈

- 前端：React 18、TypeScript、Vite、Tailwind CSS
- 后端：Node.js、Express、TypeScript
- 数据库：better-sqlite3、pg、mysql2

## 项目结构

```text
.
├─ src/                 # 前端应用
├─ server/              # 后端 API、鉴权、任务、存储
├─ doc/                 # 设计说明、Provider 示例、多语言文档
├─ config.example.yaml  # 完整配置模板
└─ .env.example         # 环境变量模板
```

## 快速开始

### 1. 安装依赖

```bash
npm install
```

### 2. 准备配置

```bash
cp .env.example .env
cp config.example.yaml config.yaml
```

根据部署情况修改 `config.yaml` 和/或 `.env`。

### 3. 启动前后端

```bash
npm run dev:all
```

默认本地地址：

- 前端：`http://localhost:3000`
- 后端：`http://localhost:3001`

## 常用脚本

```bash
npm run dev            # 仅前端
npm run start:server   # 仅后端
npm run dev:all        # 前端 + 后端
npm run dev:mock:all   # 前端 + 后端（Mock 模式）
npm run build          # 类型检查并构建前端
npm run preview        # 预览生产构建
```

## 配置模型

优先级顺序：

1. 环境变量（`.env`）
2. `config.yaml`
3. 内置默认值

关键配置域：

- `server`：API 地址、前后端端口、CORS、反向代理信任
- `runtime`：`node` 或 `serverless`、mock 开关
- `database`：引擎、DSN/路径、加密密钥
- `auth`：会话密钥、Cookie 选项、限流、bootstrap/admin 密钥
- `providers`：Provider 列表（仅数据库模式关闭时生效）

## 运行模式

- `node`：启动进程内调度器，定期刷新数据。
- `serverless`：禁用调度器，通过请求触发刷新。

## 数据库引擎

AIMeter 支持：

- SQLite（默认）
- PostgreSQL
- MySQL



## 容器化部署

AIMeter 提供单容器部署方案：**nginx**（HTTPS，端口 3000）终止 TLS 并反向代理至 Node.js（内部端口 3001）。

```bash
./deploy/container/build.sh   # 构建镜像
./deploy/container/run.sh     # 启动服务
```

加密密钥与会话密钥在首次启动时自动生成，无需手动配置。

详细说明请参阅 [deploy/container/README.md](../../deploy/container/README.md)。

## 安全说明

生产部署建议：

- 数据库模式下，`AIMETER_ENCRYPTION_KEY` 和 `AIMETER_AUTH_SESSION_SECRET` 在首次启动时自动生成并持久化，仅多实例共享数据库时需手动覆盖。
- 在 HTTPS 后启用安全 Cookie。
- 严格限制 CORS 来源。
- 妥善保管 admin/cron/endpoint 等敏感密钥。
