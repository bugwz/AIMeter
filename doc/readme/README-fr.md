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

### 1. Installer

```bash
npm install
```

### 2. Configurer

```bash
cp .env.all .env
cp config.all.yaml config.yaml
```

Ensuite, modifiez `.env` et/ou `config.yaml` selon votre cible de déploiement.

### 3. Lancer

```bash
npm run dev:all
```

Endpoints locaux par défaut :

- Frontend : `http://localhost:3000`
- Backend : `http://localhost:3001`

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

- [deploy/overview/README.md](../../deploy/overview/README.md)
- [deploy/container/README.md](../../deploy/container/README.md)
- [deploy/cloudflare/README.md](../../deploy/cloudflare/README.md)
- [deploy/vercel/README.md](../../deploy/vercel/README.md)

## Documentation API

- [doc/api/README.md](../api/README.md)

## Notes de sécurité

- Le secret de session et les paramètres liés au chiffrement sont initialisés et persistés par le stockage système lors du bootstrap en mode base de données.
- `AIMETER_CRON_SECRET` et `AIMETER_ENDPOINT_SECRET` sont des secrets d'intégration optionnels ; utilisez des valeurs aléatoires fortes de 32 caractères.
- En production, définissez `AIMETER_SERVER_PROTOCOL=https` pour activer des en-têtes de sécurité transport plus stricts.
