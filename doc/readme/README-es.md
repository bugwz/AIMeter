# AIMeter

AIMeter es un panel self-hosted para supervisar uso, cuota e historial de varios proveedores de IA en un solo lugar.

<div align="center">

[English](../../README.md) | [简体中文](README-zh-CN.md) | [繁體中文](README-zh-TW.md) | [日本語](README-ja.md) | [Français](README-fr.md) | [Deutsch](README-de.md) | [**Español**](README-es.md) | [Português](README-pt.md) | [Русский](README-ru.md) | [한국어](README-ko.md)

</div>

<div align="center">
  <img src="../img/dashboard.png" alt="AIMeter dashboard" width="100%" />
</div>

## Funcionalidades

- Panel unificado para varios proveedores
- Configuración de proveedores y gestión de credenciales
- Historial de uso y vistas con gráficos
- Páginas relacionadas con endpoint y widget
- Actualización automática programada en modo `node`
- Modo mock para desarrollo local y demos
- Backends de almacenamiento: SQLite, PostgreSQL, MySQL
- Modelo de configuración con prioridad a variables de entorno

## Proveedores compatibles

Los adaptadores actuales incluyen:

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

## Stack tecnológico

- Frontend: React 18, TypeScript, Vite, Tailwind CSS
- Backend: Node.js, Express, TypeScript
- Base de datos: better-sqlite3, pg, mysql2

## Estructura del proyecto

```text
.
├─ src/                 # Aplicación frontend
├─ server/              # API backend, auth, jobs, almacenamiento
├─ doc/                 # Notas de diseño, ejemplos de provider, traducciones
├─ config.example.yaml  # Plantilla completa de configuración
└─ .env.example         # Plantilla de variables de entorno
```

## Inicio rápido

### 1. Instalar dependencias

```bash
npm install
```

### 2. Preparar configuración

```bash
cp .env.example .env
cp config.example.yaml config.yaml
```

Edita `config.yaml` y/o `.env` según tu entorno.

### 3. Iniciar frontend + backend

```bash
npm run dev:all
```

Endpoints locales por defecto:

- Frontend: `http://localhost:3000`
- Backend: `http://localhost:3001`

## Scripts comunes

```bash
npm run dev            # solo frontend
npm run start:server   # solo backend
npm run dev:all        # frontend + backend
npm run dev:mock:all   # frontend + backend en modo mock
npm run build          # comprobación de tipos + build frontend
npm run preview        # vista previa del build de producción
```

## Modelo de configuración

Orden de prioridad:

1. Variables de entorno (`.env`)
2. `config.yaml`
3. Valores por defecto internos

Áreas principales:

- `server`: URL de API, puertos frontend/backend, CORS, trust proxy
- `runtime`: `node` o `serverless`, interruptor mock
- `database`: motor, DSN/ruta, claves de cifrado
- `auth`: secreto de sesión, opciones de cookie, rate limits, secretos bootstrap/admin
- `providers`: lista de providers (cuando el modo base de datos está deshabilitado)

## Modos de ejecución

- `node`: inicia un scheduler interno para refresco periódico.
- `serverless`: scheduler deshabilitado; refresco activado por solicitud.

## Motores de base de datos

AIMeter soporta:

- SQLite (por defecto)
- PostgreSQL
- MySQL



## Notas de seguridad

Para despliegue en producción:

- Configura secretos fuertes para sesión y cifrado.
- Habilita cookies seguras detrás de HTTPS.
- Restringe estrictamente los orígenes CORS.
- Protege los secretos bootstrap/admin/cron.
