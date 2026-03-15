# Codex Provider Guide

This document explains the Codex provider setup, add/edit workflow, credential format, and troubleshooting notes.

## Scope

- Provider type: `codex`
- Supported auth type: `oauth` only
- UI flow: manual token input, or Link Auth + Auto Fill flow

## Add/Edit Workflow

In the provider modal, Codex supports two equivalent paths:

1. Link Auth + Auto Fill (recommended)
- Generate authorization link
- Open the link and finish login/consent
- Paste callback URL (or `code#state`) into the modal
- Exchange code and auto-fill `accessToken`, `refreshToken`, `clientId`, `expiresAt`
- Save provider

2. Manual input
- Paste OAuth `accessToken` directly (required)
- Optionally provide `refreshToken`, `clientId`, and `expiresAt`
- Save provider

## Credential Input Format

When calling Providers API create/update with `authType=oauth`, `credentials` supports:

- Plain access token string
- JSON string object with bundle fields

Required:

- `accessToken` must be present (either as plain string credentials or JSON field).

Supported JSON keys (camelCase and snake_case both accepted):

- `accessToken` / `access_token`
- `refreshToken` / `refresh_token`
- `idToken` / `id_token`
- `clientId` / `client_id`
- `clientSecret` / `client_secret`
- `projectId` / `project_id` / `project`
- `expiresAt` / `expiry_date`

## About `clientId`

- `clientId` is an OAuth application identifier, not a user identifier.
- It does not represent a personal account ID.
- Current implementation keeps a default Codex OAuth client id and prefers credential-provided `clientId` when present.

## Runtime Notes

- On OAuth auth failure during refresh/fetch, provider refresh response may include `authRequired: true`.
- Refreshed OAuth credentials for Codex are persisted in database mode.
- Quota window parsing now classifies session/weekly/additional/code-review windows by duration instead of fixed slot assumptions.

## Troubleshooting

If Link Auth exchange fails:

- `Authorization session not found or expired`:
  - regenerate authorization URL and retry immediately
- `OAuth state mismatch`:
  - ensure callback came from the latest generated link/session
- token exchange HTTP error:
  - verify callback contains valid `code`
  - verify network can access `auth.openai.com`

If periodic refresh fails after initial success:

- verify `refreshToken` still exists in stored credential
- verify `clientId` matches the token issuer client
- re-run Link Auth flow to rotate a fresh token bundle
