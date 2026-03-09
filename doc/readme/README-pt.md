# AIMeter

AIMeter e um dashboard self-hosted para acompanhar uso, cota e historico de varios provedores de IA em um unico lugar.

<div align="center">

[English](../../README.md) | [简体中文](README-zh-CN.md) | [繁體中文](README-zh-TW.md) | [日本語](README-ja.md) | [Français](README-fr.md) | [Deutsch](README-de.md) | [Español](README-es.md) | [**Português**](README-pt.md) | [Русский](README-ru.md) | [한국어](README-ko.md)

</div>

<div align="center">
  <img src="../img/dashboard.png" alt="AIMeter dashboard" width="100%" />
</div>

## Recursos

- Dashboard unificado para varios provedores
- Configuracao de provedores e gerenciamento de credenciais
- Historico de uso e visualizacao com graficos
- Paginas relacionadas a endpoint e widget
- Atualizacao automatica agendada no modo `node`
- Modo mock para desenvolvimento local e demos
- Backends de armazenamento: SQLite, PostgreSQL, MySQL
- Modelo de configuracao com prioridade para variaveis de ambiente

## Provedores suportados

Os adaptadores atuais incluem:

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

## Stack tecnica

- Frontend: React 18, TypeScript, Vite, Tailwind CSS
- Backend: Node.js, Express, TypeScript
- Banco de dados: better-sqlite3, pg, mysql2

## Estrutura do projeto

```text
.
├─ src/                 # Aplicacao frontend
├─ server/              # API backend, auth, jobs, armazenamento
├─ doc/                 # Notas de design, exemplos de provider, traducoes
├─ config.example.yaml  # Modelo completo de configuracao
└─ .env.example         # Modelo de variaveis de ambiente
```

## Inicio rapido

### 1. Instalar dependencias

```bash
npm install
```

### 2. Preparar configuracao

```bash
cp .env.example .env
cp config.example.yaml config.yaml
```

Edite `config.yaml` e/ou `.env` de acordo com seu ambiente.

### 3. Iniciar frontend + backend

```bash
npm run dev:all
```

Endpoints locais padrao:

- Frontend: `http://localhost:3000`
- Backend: `http://localhost:3001`

## Scripts comuns

```bash
npm run dev            # somente frontend
npm run start:server   # somente backend
npm run dev:all        # frontend + backend
npm run dev:mock:all   # frontend + backend no modo mock
npm run build          # verificacao de tipos + build frontend
npm run preview        # pre-visualizar build de producao
```

## Modelo de configuracao

Ordem de prioridade:

1. Variaveis de ambiente (`.env`)
2. `config.yaml`
3. Valores padrao internos

Areas principais:

- `server`: URL da API, portas frontend/backend, CORS, trust proxy
- `runtime`: `node` ou `serverless`, chave mock
- `database`: engine, DSN/caminho, chaves de criptografia
- `auth`: segredo de sessao, opcoes de cookie, rate limits, segredos bootstrap/admin
- `providers`: lista de providers (quando o modo de banco esta desativado)

## Modos de execucao

- `node`: inicia scheduler interno para atualizacao periodica.
- `serverless`: scheduler desativado; atualizacao por requisicao.

## Engines de banco de dados

AIMeter suporta:

- SQLite (padrao)
- PostgreSQL
- MySQL



## Deploy com container

AIMeter inclui uma configuracao de container unico: **nginx** (HTTPS, porta 3000) encerra o TLS e faz proxy para o Node.js (porta interna 3001).

```bash
./deploy/container/build.sh   # construir a imagem
./deploy/container/run.sh     # iniciar o servico
```

As chaves de criptografia e sessao sao geradas automaticamente no primeiro inicio — nenhuma configuracao manual necessaria.

Para mais detalhes, consulte [deploy/container/README.md](../../deploy/container/README.md).

## Notas de seguranca

Para producao:

- No modo banco de dados, `AIMETER_ENCRYPTION_KEY` e `AIMETER_AUTH_SESSION_SECRET` sao gerados automaticamente no primeiro inicio e persistidos. Configuracao manual so e necessaria para multiplas instancias compartilhando um banco de dados.
- Ative cookies seguros em HTTPS.
- Restrinja origens CORS.
- Proteja os segredos admin/cron/endpoint.
