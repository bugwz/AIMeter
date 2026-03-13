<div align="center">

<img src="../../public/img/logo-light.svg" width="80" height="80" align="center" alt="AIMeter logo">

# AIMeter

AIMeter e um dashboard self-hosted para acompanhar uso, cota e tendencias historicas de provedores de IA.

</div>

<div align="center">

[![React](https://img.shields.io/badge/React-Frontend-61dafb?logo=react&logoColor=white)](#stack-tecnico)
[![Express](https://img.shields.io/badge/Express-API-000000?logo=express)](#stack-tecnico)
[![TypeScript](https://img.shields.io/badge/TypeScript-Strict-3178c6?logo=typescript&logoColor=white)](#stack-tecnico)
[![Runtime](https://img.shields.io/badge/Runtime-Node%20%7C%20Serverless-22c55e)](#modos-de-execucao)
[![Providers](https://img.shields.io/badge/Providers-Multi-0ea5e9)](#provedores-suportados)
[![Deploy](https://img.shields.io/badge/Deploy-Vercel-000000?logo=vercel)](../../deploy/vercel/README.md)
[![Deploy](https://img.shields.io/badge/Deploy-Cloudflare-f38020?logo=cloudflare&logoColor=white)](../../deploy/cloudflare/README.md)

</div>

<div align="center">

[English](../../README.md) | [简体中文](README-zh-CN.md) | [繁體中文](README-zh-TW.md) | [日本語](README-ja.md) | [Français](README-fr.md) | [Deutsch](README-de.md) | [Español](README-es.md) | [**Português**](README-pt.md) | [Русский](README-ru.md) | [한국어](README-ko.md)

</div>

<div align="center">
  <img src="../img/dashboard.png" alt="AIMeter dashboard" width="100%" />
</div>

## Recursos

- Dashboard frontend em React
- API backend em Express
- Arquitetura de adaptadores para varios provedores
- Modos de execucao: `node` e `serverless`
- Armazenamento com base em banco e fluxo de bootstrap
- Dashboard unificado para varios provedores de IA
- Gestao de credenciais e exibicao de quota
- Historico de uso e paginas de graficos
- Paginas de API relacionadas a endpoint/proxy
- Fluxo de inicializacao bootstrap + rota admin
- Engines de banco: `sqlite`, `d1`, `postgres`, `mysql`

## Provedores suportados


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
Exemplos por provedor e notas de integracao: [doc/providers](../providers)

## Stack tecnico

- Frontend: React 18, TypeScript, Vite, Tailwind CSS
- Backend: Node.js, Express, TypeScript
- Storage: SQLite / Cloudflare D1 / PostgreSQL / MySQL

## Estrutura do projeto

```text
.
├─ src/                  # App frontend
├─ server/               # API backend, auth, jobs, storage
├─ deploy/               # Guias de deploy por plataforma
├─ doc/                  # Docs de API, exemplos de provedor, traducoes, docs de config
├─ config.all.yaml       # Template completo de configuracao
├─ config.yaml           # Config local ativa (criada por copia)
└─ .env.all              # Template completo de variaveis de ambiente
```

## Inicio rapido

### 1. Instalar

```bash
npm install
```

### 2. Configurar

```bash
cp .env.all .env
cp config.all.yaml config.yaml
```

Depois, ajuste `.env` e/ou `config.yaml` conforme o alvo de deploy.

### 3. Executar

```bash
npm run dev:all
```

Endpoints locais padrao:

- Frontend: `http://localhost:3000`
- Backend: `http://localhost:3001`

## Scripts

```bash
npm run dev            # somente frontend
npm run start:server   # somente backend
npm run dev:all        # frontend + backend
npm run dev:mock:all   # frontend + backend (modo mock)
npm run build          # type-check e build frontend
npm run preview        # visualizar build frontend
npm run cf:dev         # desenvolvimento local Cloudflare Workers
npm run cf:deploy      # deploy para Cloudflare Workers
```

## Configuracao

Fontes e prioridade de configuracao na implementacao atual:

1. `config.yaml` (ou caminho em `AIMETER_CONFIG_FILE`)
2. Variaveis de ambiente
3. Defaults internos

Importante:

- `database.engine` / `AIMETER_DATABASE_ENGINE` e obrigatorio.
- `database.connection` / `AIMETER_DATABASE_CONNECTION` e obrigatorio.
- No modo `serverless`, o scheduler fica desativado.
- No modo `node`, o scheduler in-process inicia automaticamente.

Mapeamento detalhado de campos e explicacoes:

- [doc/conf/README.md](../conf/README.md)

## Deploy

Modos de deploy suportados:

- [deploy/README.md](../../deploy/README.md)
- [deploy/container/README.md](../../deploy/container/README.md)
- [deploy/cloudflare/README.md](../../deploy/cloudflare/README.md)
- [deploy/vercel/README.md](../../deploy/vercel/README.md)

## Documentacao da API

- [doc/api/README.md](../api/README.md)

## Notas de seguranca

- Session secret e configuracoes de criptografia sao inicializados e persistidos pelo storage do sistema durante o bootstrap no modo banco.
- `AIMETER_CRON_SECRET` e `AIMETER_ENDPOINT_SECRET` sao segredos opcionais de integracao; use valores aleatorios fortes de 32 caracteres.
- Em producao, defina `AIMETER_SERVER_PROTOCOL=https` para habilitar headers de seguranca de transporte mais estritos.
