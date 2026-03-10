# AIMeter

AIMeter ist ein self-hosted Dashboard, um Nutzung, Kontingente und Verlauf mehrerer KI-Provider zentral zu überwachen.

<div align="center">

[English](../../README.md) | [简体中文](README-zh-CN.md) | [繁體中文](README-zh-TW.md) | [日本語](README-ja.md) | [Français](README-fr.md) | [**Deutsch**](README-de.md) | [Español](README-es.md) | [Português](README-pt.md) | [Русский](README-ru.md) | [한국어](README-ko.md)

</div>

<div align="center">
  <img src="../img/dashboard.png" alt="AIMeter dashboard" width="100%" />
</div>

## Funktionen

- Einheitliches Dashboard für mehrere Provider
- Verwaltung von Provider-Einstellungen und Zugangsdaten
- Nutzungsverlauf und Diagrammansichten
- Endpoint- und Widget-bezogene Seiten
- Automatischer geplanter Refresh im `node`-Modus
- Mock-Modus für lokale Entwicklung und Demos
- Speicher-Backends: SQLite, PostgreSQL, MySQL
- Konfigurationsmodell mit Priorität für Umgebungsvariablen

## Unterstützte Provider

Aktuell verfügbare Adapter:

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

## Tech Stack

- Frontend: React 18, TypeScript, Vite, Tailwind CSS
- Backend: Node.js, Express, TypeScript
- Datenbank: better-sqlite3, pg, mysql2

## Projektstruktur

```text
.
├─ src/                 # Frontend-Anwendung
├─ server/              # Backend-API, Auth, Jobs, Storage
├─ doc/                 # Design-Notizen, Provider-Beispiele, Übersetzungen
├─ config.example.yaml  # Vollständige Konfigurationsvorlage
└─ .env.example         # Vorlage für Umgebungsvariablen
```

## Schnellstart

### 1. Abhängigkeiten installieren

```bash
npm install
```

### 2. Konfiguration vorbereiten

```bash
cp .env.example .env
cp config.example.yaml config.yaml
```

Passen Sie `config.yaml` und/oder `.env` an Ihre Umgebung an.

### 3. Frontend + Backend starten

```bash
npm run dev:all
```

Standard-URLs lokal:

- Frontend: `http://localhost:3000`
- Backend: `http://localhost:3001`

## Häufige Skripte

```bash
npm run dev            # nur Frontend
npm run start:server   # nur Backend
npm run dev:all        # Frontend + Backend
npm run dev:mock:all   # Frontend + Backend im Mock-Modus
npm run build          # Typprüfung + Frontend-Build
npm run preview        # Produktions-Build lokal prüfen
```

## Konfigurationsmodell

Prioritätsreihenfolge:

1. Umgebungsvariablen (`.env`)
2. `config.yaml`
3. Integrierte Standardwerte

Wichtige Bereiche:

- `server`: API-URL, Frontend/Backend-Ports, CORS, Proxy-Vertrauen
- `runtime`: `node` oder `serverless`, Mock-Schalter
- `database`: Engine, DSN/Pfad, Verschlüsselungsschlüssel
- `auth`: Session-Secret, Cookie-Optionen, Rate Limits, bootstrap/admin-Secrets
- `providers`: Provider-Liste (wenn Datenbankmodus deaktiviert ist)

## Laufzeitmodi

- `node`: startet einen internen Scheduler für periodische Aktualisierung.
- `serverless`: Scheduler deaktiviert, Aktualisierung wird durch Requests ausgelöst.

## Datenbank-Engines

AIMeter unterstützt:

- SQLite (Standard)
- PostgreSQL
- MySQL



## Container-Deployment

AIMeter bietet eine Single-Container-Konfiguration: **nginx** (HTTPS, Port 3000) terminiert TLS und leitet an Node.js (interner Port 3001) weiter.

```bash
./deploy/container/build.sh   # Image bauen
./deploy/container/run.sh     # Dienst starten
```

Verschlüsselungs- und Session-Keys werden beim ersten Start automatisch generiert — keine manuelle Konfiguration erforderlich.

Details siehe [deploy/container/README.md](../../deploy/container/README.md).

## Sicherheitshinweise

Für den Produktivbetrieb:

- Im Datenbankbetrieb werden `AIMETER_ENCRYPTION_KEY` und `AIMETER_AUTH_SESSION_SECRET` beim ersten Start automatisch generiert und gespeichert. Eine manuelle Konfiguration ist nur bei mehreren Instanzen mit gemeinsamer Datenbank erforderlich.
- Secure Cookies hinter HTTPS aktivieren.
- CORS-Origin-Liste strikt begrenzen.
- admin/cron/endpoint-Secrets geschützt aufbewahren.
