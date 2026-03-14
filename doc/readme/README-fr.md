<div align="center">

<img src="../../public/img/logo-light.svg" width="80" height="80" align="center" alt="AIMeter logo">

# AIMeter

AIMeter est un tableau de bord self-hosted pour suivre l'utilisation, les quotas et les tendances historiques des fournisseurs IA.

</div>

<div align="center">

[![React](https://img.shields.io/badge/React-Frontend-61dafb?logo=react&logoColor=white)](#stack-technique)
[![Express](https://img.shields.io/badge/Express-API-000000?logo=express)](#stack-technique)
[![TypeScript](https://img.shields.io/badge/TypeScript-Strict-3178c6?logo=typescript&logoColor=white)](#stack-technique)
[![Runtime](https://img.shields.io/badge/Runtime-Node%20%7C%20Serverless-22c55e)](#modes-dexécution)
[![Providers](https://img.shields.io/badge/Providers-Multi-0ea5e9)](#fournisseurs-pris-en-charge)
[![Deploy](https://img.shields.io/badge/Deploy-Vercel-000000?logo=vercel)](../../deploy/vercel/README.md)
[![Deploy](https://img.shields.io/badge/Deploy-Cloudflare-f38020?logo=cloudflare&logoColor=white)](../../deploy/cloudflare/README.md)

</div>

<div align="center">

[English](../../README.md) | [简体中文](README-zh-CN.md) | [繁體中文](README-zh-TW.md) | [日本語](README-ja.md) | [**Français**](README-fr.md) | [Deutsch](README-de.md) | [Español](README-es.md) | [Português](README-pt.md) | [Русский](README-ru.md) | [한국어](README-ko.md)

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

## Fonctionnalités

- Dashboard frontend React
- API backend Express
- Architecture d'adaptateurs multi-fournisseurs
- Modes runtime : `node` et `serverless`
- Stockage adossé à une base de données et flux de bootstrap
- Dashboard unifié pour plusieurs fournisseurs IA
- Gestion des identifiants fournisseurs et affichage des quotas
- Historique d'usage et pages de graphiques
- Pages API liées aux endpoints/proxy
- Flux d'initialisation bootstrap + route admin
- Moteurs DB : `sqlite`, `d1`, `postgres`, `mysql`

## Fournisseurs pris en charge


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
Exemples spécifiques aux fournisseurs et notes d'intégration : [doc/providers](../providers)

## Stack technique

- Frontend : React 18, TypeScript, Vite, Tailwind CSS
- Backend : Node.js, Express, TypeScript
- Stockage : SQLite / Cloudflare D1 / PostgreSQL / MySQL

## Structure du projet

```text
.
├─ src/                  # Application frontend
├─ server/               # API backend, auth, jobs, stockage
├─ deploy/               # Guides de déploiement par plateforme
├─ doc/                  # Docs API, exemples fournisseurs, traductions, docs config
├─ config.all.yaml       # Modèle de configuration complet
├─ config.yaml           # Configuration locale active (copie du modèle)
└─ .env.all              # Modèle complet des variables d'environnement
```

## Démarrage rapide

### Option 1 : Conteneur (Docker)

Déploiement mono-conteneur nginx + Node.js. Les données sont persistées via un volume monté.

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

Accéder à : `http://localhost:3000`

Docker Compose, HTTPS, MySQL/PostgreSQL et builds multi-arch : [deploy/container/README.md](../../deploy/container/README.md)

### Option 2 : Vercel

Déploiement serverless. Nécessite une base de données MySQL ou PostgreSQL externe.

| Base de données | Déployer |
|---|---|
| MySQL | [![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Fbugwz%2FAIMeter&env=AIMETER_RUNTIME_MODE%2CAIMETER_SERVER_PROTOCOL%2CAIMETER_DATABASE_ENGINE%2CAIMETER_DATABASE_CONNECTION&envDefaults=%7B%22AIMETER_RUNTIME_MODE%22%3A%22serverless%22%2C%22AIMETER_SERVER_PROTOCOL%22%3A%22https%22%2C%22AIMETER_DATABASE_ENGINE%22%3A%22mysql%22%2C%22AIMETER_DATABASE_CONNECTION%22%3A%22mysql%3A%2F%2FUSER%3APASSWORD%40HOST%3A3306%2FDATABASE%22%7D&envDescription=AIMeter+Vercel+%2B+MySQL&envLink=https%3A%2F%2Fgithub.com%2Fbugwz%2FAIMeter%2Fblob%2Fmain%2Fdeploy%2Fvercel%2FREADME.md) |
| PostgreSQL | [![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Fbugwz%2FAIMeter&env=AIMETER_RUNTIME_MODE%2CAIMETER_SERVER_PROTOCOL%2CAIMETER_DATABASE_ENGINE%2CAIMETER_DATABASE_CONNECTION&envDefaults=%7B%22AIMETER_RUNTIME_MODE%22%3A%22serverless%22%2C%22AIMETER_SERVER_PROTOCOL%22%3A%22https%22%2C%22AIMETER_DATABASE_ENGINE%22%3A%22postgres%22%2C%22AIMETER_DATABASE_CONNECTION%22%3A%22postgresql%3A%2F%2FUSER%3APASSWORD%40HOST%3A5432%2FDATABASE%3Fsslmode%3Drequire%22%7D&envDescription=AIMeter+Vercel+%2B+PostgreSQL&envLink=https%3A%2F%2Fgithub.com%2Fbugwz%2FAIMeter%2Fblob%2Fmain%2Fdeploy%2Fvercel%2FREADME.md) |

Définissez les variables d'environnement, terminez le bootstrap, puis configurez un service cron externe pour appeler `/api/system/jobs/refresh` toutes les 5 minutes.

Configuration cron et guide complet : [deploy/vercel/README.md](../../deploy/vercel/README.md)

### Option 3 : Cloudflare Workers

Déploiement serverless. Supporte Cloudflare D1, MySQL ou PostgreSQL.

[![Deploy to Cloudflare Workers](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/bugwz/AIMeter)

Après déploiement, définissez les variables d'environnement selon le mode de base de données :

| Mode | Variables requises |
|---|---|
| D1 | `AIMETER_RUNTIME_MODE=serverless`<br>`AIMETER_SERVER_PROTOCOL=https`<br>`AIMETER_DATABASE_ENGINE=d1`<br>`AIMETER_DATABASE_CONNECTION=DB` |
| MySQL | `AIMETER_RUNTIME_MODE=serverless`<br>`AIMETER_SERVER_PROTOCOL=https`<br>`AIMETER_DATABASE_ENGINE=mysql`<br>`AIMETER_DATABASE_CONNECTION=mysql://USER:PASSWORD@HOST:3306/DATABASE` |
| PostgreSQL | `AIMETER_RUNTIME_MODE=serverless`<br>`AIMETER_SERVER_PROTOCOL=https`<br>`AIMETER_DATABASE_ENGINE=postgres`<br>`AIMETER_DATABASE_CONNECTION=postgres://USER:PASSWORD@HOST:5432/DATABASE?sslmode=require` |

Les Cron Triggers sont intégrés — `wrangler.jsonc` planifie automatiquement un rafraîchissement toutes les 5 minutes.

Liaison D1, Hyperdrive et étapes de configuration complètes : [deploy/cloudflare/README.md](../../deploy/cloudflare/README.md)

## Scripts

```bash
npm run dev            # frontend uniquement
npm run start:server   # backend uniquement
npm run dev:all        # frontend + backend
npm run dev:mock:all   # frontend + backend (mode mock)
npm run build          # vérification de types + build frontend
npm run preview        # prévisualiser le build frontend
npm run cf:dev         # dev local Cloudflare Workers
npm run cf:deploy      # déployer vers Cloudflare Workers
```

## Configuration

Sources de configuration et priorité actuelle :

1. `config.yaml` (ou chemin via `AIMETER_CONFIG_FILE`)
2. Variables d'environnement
3. Valeurs par défaut intégrées

Important :

- `database.engine` / `AIMETER_DATABASE_ENGINE` est requis.
- `database.connection` / `AIMETER_DATABASE_CONNECTION` est requis.
- En mode `serverless`, le scheduler est désactivé.
- En mode `node`, le scheduler in-process démarre automatiquement.

Mappage détaillé des champs et explications :

- [doc/conf/README.md](../conf/README.md)

## Déploiement

Modes de déploiement pris en charge :

- [deploy/README.md](../../deploy/README.md)
- [deploy/container/README.md](../../deploy/container/README.md)
- [deploy/cloudflare/README.md](../../deploy/cloudflare/README.md)
- [deploy/vercel/README.md](../../deploy/vercel/README.md)

## Documentation API

- [doc/api/README.md](../api/README.md)

## Notes de sécurité

- Le secret de session et les paramètres liés au chiffrement sont initialisés et persistés par le stockage système lors du bootstrap en mode base de données.
- `AIMETER_CRON_SECRET` et `AIMETER_ENDPOINT_SECRET` sont des secrets d'intégration optionnels ; utilisez des valeurs aléatoires fortes de 32 caractères.
- En production, définissez `AIMETER_SERVER_PROTOCOL=https` pour activer des en-têtes de sécurité transport plus stricts.
