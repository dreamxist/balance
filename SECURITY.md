# Security

Balance handles financial data, so security is treated as a first-class concern. This document describes the threat model, the auth flow, recent fixes, and how to report vulnerabilities.

## Table of contents

- [Threat model](#threat-model)
- [Auth flow](#auth-flow)
- [Recent security fixes](#recent-security-fixes)
- [Known limitations](#known-limitations)
- [Supported versions](#supported-versions)
- [Reporting a vulnerability](#reporting-a-vulnerability)

---

## Threat model

### What Balance protects

- **Cross-user data isolation.** Postgres RLS denies by default. Every read and write is scoped to `auth.uid()`. Functions and views use `security_invoker = true`. Database functions called via RPC re-validate `user_id = auth.uid()` before mutating shared tables (see [recent fixes](#recent-security-fixes)).
- **API key compromise blast radius.** Keys are SHA-256 hashed at rest. Plaintext is shown exactly once, on creation. The Edge Function that exchanges them for JWTs is rate-limited (5 failed attempts per IP per 5 minutes) and individual keys can be revoked instantly via `bal key revoke`.
- **Cron endpoint abuse.** `daily-charges` and `daily-backup` use `service_role` and dump per-user data. They require a `CRON_SECRET` bearer token and are **fail-closed**: if the secret is unset, every request returns 503. Backups are scoped per user, not global.
- **Replay / privilege escalation.** The CLI never holds `service_role`. It receives a short-lived JWT minted from a magic-link OTP, and refreshes via the standard Supabase refresh token flow.

### What Balance does NOT protect

- **Your local machine.** `~/.balance/session.json` (mode 0600) and `BAL_API_KEY` env vars assume an uncompromised laptop. If your machine is owned, your Balance account is owned.
- **Supabase platform.** Balance trusts Supabase's encryption-at-rest, DB backups, network isolation, and Auth implementation. If you do not trust Supabase, do not deploy Balance there.
- **Supply chain.** npm dependencies are not pinned with integrity checks beyond `package-lock.json`. Audit before deploying.
- **Phishing of your Supabase Auth credentials.** Email/password recovery flows go through Supabase Auth.
- **Information leakage from logs.** Edge Functions log truncated user tags (`u_xxxxxxxx`), but custom hosting (Logflare, etc.) might persist more. Review your log retention.

---

## Auth flow

```
┌────────┐  bal login --api-key bal_...
│  CLI   │ ───────────────────────────┐
└────────┘                            │
                                      ▼
                            ┌─────────────────────┐
                            │ Edge: auth-apikey   │  rate-limit (5/5min/IP)
                            │  - SHA-256 lookup   │  fail-closed
                            │  - mark last_used   │
                            │  - magic-link OTP   │
                            │  - exchange OTP     │
                            └──────────┬──────────┘
                                       │ access_token + refresh_token
                                       ▼
                            ┌─────────────────────┐
                            │ ~/.balance/         │  mode 0600
                            │ session.json        │
                            └──────────┬──────────┘
                                       │
                                       ▼
                            ┌─────────────────────┐
                            │ Supabase REST/RPC   │  RLS enforced
                            │ (user JWT)          │  user_id = auth.uid()
                            └─────────────────────┘
```

Key properties:

- API keys are 100% bearer-style; lose one and rotate it. There is no MAC / signature.
- The Edge Function is the only path that uses `service_role`. The CLI and the web app never touch it.
- JWTs default to a short lifetime (configurable in Supabase dashboard). The CLI auto-refreshes on every command.

---

## Recent security fixes

April 2026 audit — applied in migration `20260422235333_security_patch_function_user_validation.sql`.

| Area | Issue | Fix |
| --- | --- | --- |
| **SQL functions** | 12 PL/pgSQL functions accepted a `p_user_id` parameter without verifying it matched `auth.uid()`, so a caller with a valid JWT could in principle write transactions, debts, or snapshots into another user's account. | All affected functions now `assert p_user_id = auth.uid()` (or read it from `auth.uid()` directly) before any mutation. Coverage in `supabase/tests/security_user_validation_test.sql` (pgTAP). |
| **`auth-apikey` Edge Function** | No rate limiting; brute-forcing API keys was bandwidth-bound. | Per-IP token-bucket: 5 failed attempts per 5 minutes, 429 on overflow. Successful auth resets the counter. |
| **`daily-charges` cron** | Function ran globally and could leak charges across users in the result log. | Scoped to one user at a time, with hashed user tags in logs (`u_xxxxxxxx`). |
| **`daily-backup` cron** | Endpoint returned a normal response if `CRON_SECRET` was unset, effectively making the per-user backup dump publicly callable. | Fail-closed: missing `CRON_SECRET` returns 503. Wrong secret returns 401. |

### Tests

- `supabase/tests/security_user_validation_test.sql` — pgTAP suite covering all 12 patched functions, asserting that a JWT for user A cannot mutate user B's data even with a forged `p_user_id`.
- `tests/edge-functions.test.ts` — integration tests for the Edge Functions (rate limit, fail-closed paths, OTP exchange happy path).

Run with:

```bash
supabase test db
npm test --workspace tests
```

---

## Known limitations

- **No 2FA.** Supabase Auth supports MFA via TOTP; Balance does not yet wire it into the web onboarding flow.
- **No client-side encryption.** Sensitive fields (account names, transaction notes) are stored as plaintext in Postgres. Encryption-at-rest is whatever Supabase provides by default — there is no per-user envelope encryption.
- **No audit-log export.** The `audit_log` table records every mutation, but there is no first-class UI / CLI to review or export it.
- **No IP allowlist on Edge Functions.** Anyone on the internet can hit `auth-apikey`, and the only protection is the rate limiter + key hash.
- **No SCA / SBOM.** Dependency scanning is up to the operator. `npm audit` and Dependabot are recommended.
- **Single-region.** Whatever Supabase region you pick is your only copy of the data outside the daily backup dumps.

These are tracked as future work, not blockers for personal use.

---

## Supported versions

Balance is in beta. Only the latest commit on `main` is supported. There are no LTS branches. If you self-host a fork, you are responsible for your own security patching.

| Version | Supported |
| --- | --- |
| `main` (latest) | Yes |
| Older commits | No |

---

## Reporting a vulnerability

If you find a security issue, **please do not open a public GitHub issue.** Instead:

- Use [GitHub Security Advisory](https://github.com/dreamxist/balance/security/advisories/new) for private, coordinated disclosure.

I aim to respond within 72 hours and patch within 14 days for critical issues. Coordinated disclosure is welcome — credit will be given in the changelog and the commit message unless you prefer to stay anonymous.

If the issue affects Supabase itself, please also report it to [Supabase security](https://supabase.com/.well-known/security.txt).
