# AIMeter

AIMeter est un tableau de bord self-hosted pour suivre l'utilisation, les quotas et l'historique de plusieurs fournisseurs IA dans une interface unique.

<div align="center">

[English](../../README.md) | [简体中文](README-zh-CN.md) | [繁體中文](README-zh-TW.md) | [日本語](README-ja.md) | [**Français**](README-fr.md) | [Deutsch](README-de.md) | [Español](README-es.md) | [Português](README-pt.md) | [Русский](README-ru.md) | [한국어](README-ko.md)

</div>

<div align="center">
  <img src="../img/dashboard.png" alt="AIMeter dashboard" width="100%" />
</div>

## Fonctionnalités

- Tableau de bord unifié pour plusieurs fournisseurs
- Gestion des paramètres fournisseur et des identifiants
- Historique d'utilisation et vues graphiques
- Pages liées aux endpoints et aux widgets
- Rafraîchissement planifié automatique en mode `node`
- Mode mock pour le développement local et les démonstrations
- Stockage SQLite, PostgreSQL et MySQL
- Modèle de configuration avec priorité aux variables d'environnement

## Fournisseurs pris en charge

Les adaptateurs actuels incluent :

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

## Stack technique

- Frontend : React 18, TypeScript, Vite, Tailwind CSS
- Backend : Node.js, Express, TypeScript
- Base de données : better-sqlite3, pg, mysql2

## Structure du projet

```text
.
├─ src/                 # Application frontend
├─ server/              # API backend, auth, jobs, stockage
├─ doc/                 # Notes de conception, exemples provider, traductions
├─ config.example.yaml  # Modèle de configuration complet
└─ .env.example         # Modèle de variables d'environnement
```

## Démarrage rapide

### 1. Installer les dépendances

```bash
npm install
```

### 2. Préparer la configuration

```bash
cp .env.example .env
cp config.example.yaml config.yaml
```

Modifiez `config.yaml` et/ou `.env` selon votre environnement.

### 3. Lancer frontend + backend

```bash
npm run dev:all
```

URLs locales par défaut :

- Frontend : `http://localhost:3000`
- Backend : `http://localhost:3001`

## Scripts courants

```bash
npm run dev            # frontend uniquement
npm run start:server   # backend uniquement
npm run dev:all        # frontend + backend
npm run dev:mock:all   # frontend + backend en mode mock
npm run build          # vérification des types + build frontend
npm run preview        # prévisualisation du build de production
```

## Modèle de configuration

Ordre de priorité :

1. Variables d'environnement (`.env`)
2. `config.yaml`
3. Valeurs par défaut intégrées

Zones clés :

- `server` : URL API, ports frontend/backend, CORS, trust proxy
- `runtime` : `node` ou `serverless`, activation du mock
- `database` : moteur, DSN/chemin, clés de chiffrement
- `auth` : secret de session, options cookie, rate limit, secrets bootstrap/admin
- `providers` : liste des providers (quand le mode base de données est désactivé)

## Modes d'exécution

- `node` : démarre un planificateur interne pour les rafraîchissements périodiques.
- `serverless` : planificateur désactivé, rafraîchissement déclenché par requête.

## Moteurs de base de données

AIMeter prend en charge :

- SQLite (par défaut)
- PostgreSQL
- MySQL



## Déploiement en conteneur

AIMeter fournit une configuration monoconteneur : **nginx** (HTTPS, port 3000) termine le TLS et fait office de proxy vers Node.js (port interne 3001).

```bash
./deploy/container/build.sh   # construire l'image
./deploy/container/run.sh     # démarrer le service
```

Les clés de chiffrement et de session sont générées automatiquement au premier démarrage — aucune configuration manuelle requise.

Pour plus de détails, voir [deploy/container/README.md](../../deploy/container/README.md).

## Notes de sécurité

Pour un déploiement en production :

- En mode base de données, `AIMETER_ENCRYPTION_KEY` et `AIMETER_AUTH_SESSION_SECRET` sont auto-générés au premier démarrage et persistés. Une configuration manuelle n'est nécessaire que pour plusieurs instances partageant une base de données.
- Activez les cookies sécurisés derrière HTTPS.
- Limitez strictement les origines CORS.
- Protégez les secrets admin/cron/endpoint.
