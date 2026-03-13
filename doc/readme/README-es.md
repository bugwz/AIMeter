<div align="center">

<img src="../../public/img/logo-light.svg" width="80" height="80" align="center" alt="AIMeter logo">

# AIMeter

AIMeter es un dashboard self-hosted para rastrear uso, cuota y tendencias históricas de proveedores de IA.

</div>

<div align="center">

[![React](https://img.shields.io/badge/React-Frontend-61dafb?logo=react&logoColor=white)](#stack-tecnológico)
[![Express](https://img.shields.io/badge/Express-API-000000?logo=express)](#stack-tecnológico)
[![TypeScript](https://img.shields.io/badge/TypeScript-Strict-3178c6?logo=typescript&logoColor=white)](#stack-tecnológico)
[![Runtime](https://img.shields.io/badge/Runtime-Node%20%7C%20Serverless-22c55e)](#modos-de-ejecución)
[![Providers](https://img.shields.io/badge/Providers-Multi-0ea5e9)](#proveedores-compatibles)
[![Deploy](https://img.shields.io/badge/Deploy-Vercel-000000?logo=vercel)](../../deploy/vercel/README.md)
[![Deploy](https://img.shields.io/badge/Deploy-Cloudflare-f38020?logo=cloudflare&logoColor=white)](../../deploy/cloudflare/README.md)

</div>

<div align="center">

[English](../../README.md) | [简体中文](README-zh-CN.md) | [繁體中文](README-zh-TW.md) | [日本語](README-ja.md) | [Français](README-fr.md) | [Deutsch](README-de.md) | [**Español**](README-es.md) | [Português](README-pt.md) | [Русский](README-ru.md) | [한국어](README-ko.md)

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

## Funcionalidades

- Dashboard frontend con React
- API backend con Express
- Arquitectura de adaptadores multi-proveedor
- Modos runtime: `node` y `serverless`
- Almacenamiento basado en base de datos y flujo de bootstrap
- Dashboard unificado para varios proveedores de IA
- Gestión de credenciales de proveedores y visualización de cuota
- Historial de uso y páginas de gráficos
- Páginas API relacionadas con endpoint/proxy
- Flujo de inicialización bootstrap + ruta admin
- Motores DB: `sqlite`, `d1`, `postgres`, `mysql`

## Proveedores compatibles


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
Ejemplos por proveedor y notas de integración: [doc/providers](../providers)

## Stack tecnológico

- Frontend: React 18, TypeScript, Vite, Tailwind CSS
- Backend: Node.js, Express, TypeScript
- Almacenamiento: SQLite / Cloudflare D1 / PostgreSQL / MySQL

## Estructura del proyecto

```text
.
├─ src/                  # App frontend
├─ server/               # API backend, auth, jobs, almacenamiento
├─ deploy/               # Guías de despliegue por plataforma
├─ doc/                  # Docs API, ejemplos de proveedor, traducciones, docs de config
├─ config.all.yaml       # Plantilla completa de configuración
├─ config.yaml           # Configuración local activa (copiada de la plantilla)
└─ .env.all              # Plantilla completa de variables de entorno
```

## Inicio rápido

### 1. Instalar

```bash
npm install
```

### 2. Configurar

```bash
cp .env.all .env
cp config.all.yaml config.yaml
```

Después edita `.env` y/o `config.yaml` según el despliegue objetivo.

### 3. Ejecutar

```bash
npm run dev:all
```

Endpoints locales por defecto:

- Frontend: `http://localhost:3000`
- Backend: `http://localhost:3001`

## Scripts

```bash
npm run dev            # solo frontend
npm run start:server   # solo backend
npm run dev:all        # frontend + backend
npm run dev:mock:all   # frontend + backend (modo mock)
npm run build          # chequeo de tipos y build frontend
npm run preview        # previsualizar build frontend
npm run cf:dev         # desarrollo local de Cloudflare Workers
npm run cf:deploy      # desplegar a Cloudflare Workers
```

## Configuración

Fuentes de configuración y prioridad actual:

1. `config.yaml` (o ruta desde `AIMETER_CONFIG_FILE`)
2. Variables de entorno
3. Valores por defecto internos

Importante:

- `database.engine` / `AIMETER_DATABASE_ENGINE` es obligatorio.
- `database.connection` / `AIMETER_DATABASE_CONNECTION` es obligatorio.
- En modo `serverless`, el scheduler está deshabilitado.
- En modo `node`, el scheduler en proceso se inicia automáticamente.

Mapeo detallado de campos y explicaciones:

- [doc/conf/README.md](../conf/README.md)

## Despliegue

Modos de despliegue compatibles:

- [deploy/README.md](../../deploy/README.md)
- [deploy/container/README.md](../../deploy/container/README.md)
- [deploy/cloudflare/README.md](../../deploy/cloudflare/README.md)
- [deploy/vercel/README.md](../../deploy/vercel/README.md)

## Documentación API

- [doc/api/README.md](../api/README.md)

## Notas de seguridad

- El session secret y la configuración de cifrado se inicializan y persisten por el almacenamiento del sistema durante bootstrap en modo base de datos.
- `AIMETER_CRON_SECRET` y `AIMETER_ENDPOINT_SECRET` son secretos opcionales de integración; usa valores aleatorios robustos de 32 caracteres.
- En producción usa `AIMETER_SERVER_PROTOCOL=https` para habilitar cabeceras de seguridad de transporte más estrictas.
