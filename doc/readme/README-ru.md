<div align="center">

<img src="../../public/img/logo-light.svg" width="80" height="80" align="center" alt="AIMeter logo">

# AIMeter

AIMeter - это self-hosted панель для отслеживания использования, квот и исторических трендов AI-провайдеров.

</div>

<div align="center">

[![React](https://img.shields.io/badge/React-Frontend-61dafb?logo=react&logoColor=white)](#технологический-стек)
[![Express](https://img.shields.io/badge/Express-API-000000?logo=express)](#технологический-стек)
[![TypeScript](https://img.shields.io/badge/TypeScript-Strict-3178c6?logo=typescript&logoColor=white)](#технологический-стек)
[![Runtime](https://img.shields.io/badge/Runtime-Node%20%7C%20Serverless-22c55e)](#режимы-выполнения)
[![Providers](https://img.shields.io/badge/Providers-Multi-0ea5e9)](#поддерживаемые-provider)
[![Deploy](https://img.shields.io/badge/Deploy-Vercel-000000?logo=vercel)](../../deploy/vercel/README.md)
[![Deploy](https://img.shields.io/badge/Deploy-Cloudflare-f38020?logo=cloudflare&logoColor=white)](../../deploy/cloudflare/README.md)

</div>

<div align="center">

[English](../../README.md) | [简体中文](README-zh-CN.md) | [繁體中文](README-zh-TW.md) | [日本語](README-ja.md) | [Français](README-fr.md) | [Deutsch](README-de.md) | [Español](README-es.md) | [Português](README-pt.md) | [**Русский**](README-ru.md) | [한국어](README-ko.md)

</div>

<div align="center">
  <img src="../img/dashboard.png" alt="AIMeter dashboard" width="100%" />
</div>

## Возможности

- Frontend-дашборд на React
- Backend API на Express
- Архитектура адаптеров для нескольких провайдеров
- Режимы runtime: `node` и `serverless`
- Хранилище на базе БД и поток bootstrap
- Единая панель для нескольких AI-провайдеров
- Управление учетными данными провайдеров и отображение квот
- История использования и страницы графиков
- API-страницы для endpoint/proxy
- Инициализация bootstrap + admin route
- Поддержка DB-движков: `sqlite`, `d1`, `postgres`, `mysql`

## Поддерживаемые Provider

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
Примеры по провайдерам и заметки по интеграции: [doc/providers](../providers)

## Технологический стек

- Frontend: React 18, TypeScript, Vite, Tailwind CSS
- Backend: Node.js, Express, TypeScript
- Storage: SQLite / Cloudflare D1 / PostgreSQL / MySQL

## Структура проекта

```text
.
├─ src/                  # Frontend-приложение
├─ server/               # Backend API, auth, jobs, storage
├─ deploy/               # Гайды по деплою для платформ
├─ doc/                  # API-доки, примеры провайдеров, переводы, доки конфигурации
├─ config.all.yaml       # Полный шаблон конфигурации
├─ config.yaml           # Активная локальная конфигурация (создается копированием)
└─ .env.all              # Полный шаблон переменных окружения
```

## Быстрый старт

### 1. Установка

```bash
npm install
```

### 2. Настройка

```bash
cp .env.all .env
cp config.all.yaml config.yaml
```

После этого отредактируйте `.env` и/или `config.yaml` под целевое окружение.

### 3. Запуск

```bash
npm run dev:all
```

Локальные эндпоинты по умолчанию:

- Frontend: `http://localhost:3000`
- Backend: `http://localhost:3001`

## Скрипты

```bash
npm run dev            # только frontend
npm run start:server   # только backend
npm run dev:all        # frontend + backend
npm run dev:mock:all   # frontend + backend (mock-режим)
npm run build          # проверка типов и сборка frontend
npm run preview        # предпросмотр frontend-сборки
npm run cf:dev         # локальная разработка Cloudflare Workers
npm run cf:deploy      # деплой в Cloudflare Workers
```

## Конфигурация

Источники конфигурации и приоритет в текущей реализации:

1. `config.yaml` (или путь из `AIMETER_CONFIG_FILE`)
2. Переменные окружения
3. Встроенные значения по умолчанию

Важно:

- `database.engine` / `AIMETER_DATABASE_ENGINE` обязательно.
- `database.connection` / `AIMETER_DATABASE_CONNECTION` обязательно.
- В режиме `serverless` планировщик отключен.
- В режиме `node` in-process планировщик запускается автоматически.

Подробное соответствие полей и объяснения:

- [doc/conf/README.md](../conf/README.md)

## Деплой

Поддерживаемые режимы деплоя:

- [deploy/README.md](../../deploy/README.md)
- [deploy/container/README.md](../../deploy/container/README.md)
- [deploy/cloudflare/README.md](../../deploy/cloudflare/README.md)
- [deploy/vercel/README.md](../../deploy/vercel/README.md)

## API документация

- [doc/api/README.md](../api/README.md)

## Заметки по безопасности

- Session secret и настройки, связанные с шифрованием, инициализируются и сохраняются системным storage во время bootstrap в режиме БД.
- `AIMETER_CRON_SECRET` и `AIMETER_ENDPOINT_SECRET` - опциональные интеграционные секреты; используйте надежные случайные значения длиной 32 символа.
- В production установите `AIMETER_SERVER_PROTOCOL=https`, чтобы включить более строгие transport-security заголовки.
