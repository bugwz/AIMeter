<div align="center">

<img src="../../public/img/logo-light.svg" width="80" height="80" align="center" alt="AIMeter logo">

# AIMeter

AIMeter ist ein self-hosted Dashboard zur Verfolgung von Nutzung, Kontingent und Verlaufstrends von AI-Providern.

</div>

<div align="center">

[![React](https://img.shields.io/badge/React-Frontend-61dafb?logo=react&logoColor=white)](#tech-stack)
[![Express](https://img.shields.io/badge/Express-API-000000?logo=express)](#tech-stack)
[![TypeScript](https://img.shields.io/badge/TypeScript-Strict-3178c6?logo=typescript&logoColor=white)](#tech-stack)
[![Runtime](https://img.shields.io/badge/Runtime-Node%20%7C%20Serverless-22c55e)](#runtime-modi)
[![Providers](https://img.shields.io/badge/Providers-Multi-0ea5e9)](#unterstützte-provider)
[![Deploy](https://img.shields.io/badge/Deploy-Vercel-000000?logo=vercel)](../../deploy/vercel/README.md)
[![Deploy](https://img.shields.io/badge/Deploy-Cloudflare-f38020?logo=cloudflare&logoColor=white)](../../deploy/cloudflare/README.md)

</div>

<div align="center">

[English](../../README.md) | [简体中文](README-zh-CN.md) | [繁體中文](README-zh-TW.md) | [日本語](README-ja.md) | [Français](README-fr.md) | [**Deutsch**](README-de.md) | [Español](README-es.md) | [Português](README-pt.md) | [Русский](README-ru.md) | [한국어](README-ko.md)

</div>

<div align="center">
  <img src="../img/dashboard.png" alt="AIMeter dashboard" width="100%" />
</div>

## Features

- React-Frontend-Dashboard
- Express-Backend-API
- Adapter-Architektur für mehrere Provider
- Runtime-Modi: `node` und `serverless`
- Datenbankgestützte Speicherung und Bootstrap-Flow
- Einheitliches Dashboard über mehrere AI-Provider
- Provider-Credential-Management und Quota-Anzeige
- Nutzungsverlauf und Chart-Seiten
- Endpoint-/Proxy-bezogene API-Seiten
- Bootstrap- und Admin-Initialisierungsflow
- Datenbank-Engines: `sqlite`, `d1`, `postgres`, `mysql`

## Unterstützte Provider

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
Provider-spezifische Beispiele und Integrationshinweise: [doc/providers](../providers)

## Tech Stack

- Frontend: React 18, TypeScript, Vite, Tailwind CSS
- Backend: Node.js, Express, TypeScript
- Storage: SQLite / Cloudflare D1 / PostgreSQL / MySQL

## Projektstruktur

```text
.
├─ src/                  # Frontend-App
├─ server/               # Backend API, Auth, Jobs, Storage
├─ deploy/               # Deployment-Guides nach Plattform
├─ doc/                  # API-Doku, Provider-Beispiele, Übersetzungen, Konfig-Doku
├─ config.all.yaml       # Vollständige Konfigurationsvorlage
├─ config.yaml           # Aktive lokale Konfiguration (durch Kopie erzeugen)
└─ .env.all              # Vollständige Env-Vorlage
```

## Quick Start

### 1. Installieren

```bash
npm install
```

### 2. Konfigurieren

```bash
cp .env.all .env
cp config.all.yaml config.yaml
```

Danach `.env` und/oder `config.yaml` für das Ziel-Deployment anpassen.

### 3. Starten

```bash
npm run dev:all
```

Standard-Endpunkte lokal:

- Frontend: `http://localhost:3000`
- Backend: `http://localhost:3001`

## Skripte

```bash
npm run dev            # nur Frontend
npm run start:server   # nur Backend
npm run dev:all        # Frontend + Backend
npm run dev:mock:all   # Frontend + Backend (Mock-Modus)
npm run build          # Type-Check und Frontend-Build
npm run preview        # Frontend-Build lokal prüfen
npm run cf:dev         # lokale Cloudflare Workers-Entwicklung
npm run cf:deploy      # zu Cloudflare Workers deployen
```

## Konfiguration

Quellen und Priorität in der aktuellen Implementierung:

1. `config.yaml` (oder Pfad aus `AIMETER_CONFIG_FILE`)
2. Umgebungsvariablen
3. Eingebaute Defaults

Wichtig:

- `database.engine` / `AIMETER_DATABASE_ENGINE` ist erforderlich.
- `database.connection` / `AIMETER_DATABASE_CONNECTION` ist erforderlich.
- Im `serverless`-Modus ist der Scheduler deaktiviert.
- Im `node`-Modus startet der In-Process-Scheduler automatisch.

Detaillierte Feldzuordnung und Erklärungen:

- [doc/conf/README.md](../conf/README.md)

## Deployment

Unterstützte Deployment-Modi und Links:

- [deploy/README.md](../../deploy/README.md)
- [deploy/container/README.md](../../deploy/container/README.md)
- [deploy/cloudflare/README.md](../../deploy/cloudflare/README.md)
- [deploy/vercel/README.md](../../deploy/vercel/README.md)

## API-Dokumentation

- [doc/api/README.md](../api/README.md)

## Sicherheitshinweise

- Session-Secret und verschlüsselungsrelevante Einstellungen werden im DB-Modus beim Bootstrap initialisiert und persistiert.
- `AIMETER_CRON_SECRET` und `AIMETER_ENDPOINT_SECRET` sind optionale Integrations-Secrets; falls gesetzt, starke 32-Zeichen-Zufallswerte verwenden.
- In Produktion `AIMETER_SERVER_PROTOCOL=https` setzen, um strengere Transport-Sicherheitsheader zu aktivieren.
