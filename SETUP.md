# Self-hosting Balance

This guide walks you through deploying your own Balance backend on Supabase, building the web app, and authenticating the CLI against it. End-to-end time: roughly 30 minutes.

> Balance is single-tenant by design (one human, one Supabase project) but every table enforces RLS, so multi-user is supported at the data layer.

## Table of contents

1. [Prerequisites](#prerequisites)
2. [Step 1 — Clone and install](#step-1--clone-and-install)
3. [Step 2 — Create a Supabase project](#step-2--create-a-supabase-project)
4. [Step 3 — Apply database migrations](#step-3--apply-database-migrations)
5. [Step 4 — Deploy Edge Functions](#step-4--deploy-edge-functions)
6. [Step 5 — Set Edge Function secrets](#step-5--set-edge-function-secrets)
7. [Step 6 — Configure local env vars](#step-6--configure-local-env-vars)
8. [Step 7 — Create your user account](#step-7--create-your-user-account)
9. [Step 8 — Generate an API key for the CLI](#step-8--generate-an-api-key-for-the-cli)
10. [Step 9 — Use the CLI](#step-9--use-the-cli)
11. [End-to-end verification](#end-to-end-verification)
12. [Troubleshooting](#troubleshooting)
13. [Cost estimate](#cost-estimate)

---

## Prerequisites

| Tool | Why | Install |
| --- | --- | --- |
| **Node 22+** | Monorepo + CLI runtime | [nodejs.org](https://nodejs.org) |
| **npm 10+** | Workspaces | Bundled with Node |
| **Supabase CLI** | Apply migrations + deploy functions | `brew install supabase/tap/supabase` |
| **Supabase account** | Hosted Postgres + Auth + Edge runtime | [supabase.com](https://supabase.com) |
| **gh CLI** (optional) | Cloning + secrets management | `brew install gh` |
| **Docker** (optional) | Required only if you want to run Supabase locally | [docker.com](https://docker.com) |

You will also need to choose:

- A Supabase project region (closest to you).
- A long random `CRON_SECRET` (generate with `openssl rand -hex 32`).

---

## Step 1 — Clone and install

```bash
gh repo clone dreamxist/balance      # or git clone https://github.com/dreamxist/balance.git
cd balance
npm install
```

This installs the monorepo (`apps/web`, `apps/cli`, `packages/core`).

Build everything once to confirm the toolchain works:

```bash
npm run build
```

---

## Step 2 — Create a Supabase project

1. Sign in at [app.supabase.com](https://app.supabase.com).
2. Create a new project. Pick a strong database password and store it in your password manager.
3. Note the **project ref** (the slug in the dashboard URL, e.g. `YOUR_PROJECT_REF`).
4. From the dashboard, copy:
   - **Project URL** → `SUPABASE_URL`
   - **anon public** key → `SUPABASE_ANON_KEY`
   - **service_role** key → `SUPABASE_SERVICE_ROLE_KEY` (Edge Functions only — never ship to the client)

Link the local repo to your project:

```bash
supabase login
supabase link --project-ref <your-project-ref>
```

---

## Step 3 — Apply database migrations

Migrations live in `supabase/migrations/`. They define enums, tables, RLS policies, PL/pgSQL functions, views, the recurring-charges system, the SpA invoice module, and the security patch from April 2026.

Push them to your hosted project:

```bash
supabase db push
```

Sanity check from the SQL editor or `psql`:

```sql
select count(*) from pg_proc where proname like 'create_%';   -- should be > 0
select count(*) from information_schema.tables
  where table_schema = 'public';                              -- should be ~ 20+
```

If you want to run the test suite against a local Postgres:

```bash
supabase start            # boots local stack on :54321/:54322/:54323
supabase db reset         # applies migrations + seed.sql to the local DB
```

> Local development is optional. Most contributors target the hosted project directly because the CLI and web app only need a `SUPABASE_URL` to point at.

---

## Step 4 — Deploy Edge Functions

Balance ships four Edge Functions:

| Function | Purpose | Needs cron? |
| --- | --- | --- |
| `auth-apikey` | Exchanges an API key for a short-lived JWT (used by the CLI). Rate-limited. | No |
| `daily-charges` | Cron: applies recurring charges and debt installments per user. | Yes (daily) |
| `daily-backup` | Cron: dumps each onboarded user's data to Supabase Storage. Fail-closed. | Yes (daily) |
| `api-docs` | Serves a small OpenAPI/markdown reference. | No |

Deploy them all:

```bash
supabase functions deploy auth-apikey
supabase functions deploy daily-charges
supabase functions deploy daily-backup
supabase functions deploy api-docs
```

(Or in one shot: `supabase functions deploy auth-apikey daily-charges daily-backup api-docs`.)

### Schedule the cron functions

Supabase exposes pg_cron. From the SQL editor:

```sql
-- Run daily-charges every day at 06:00 UTC
select cron.schedule(
  'daily-charges',
  '0 6 * * *',
  $$
  select net.http_post(
    url := '<SUPABASE_URL>/functions/v1/daily-charges',
    headers := jsonb_build_object('Authorization', 'Bearer <CRON_SECRET>')
  );
  $$
);

-- Run daily-backup every day at 07:00 UTC
select cron.schedule(
  'daily-backup',
  '0 7 * * *',
  $$
  select net.http_post(
    url := '<SUPABASE_URL>/functions/v1/daily-backup',
    headers := jsonb_build_object('Authorization', 'Bearer <CRON_SECRET>')
  );
  $$
);
```

Replace `<SUPABASE_URL>` and `<CRON_SECRET>` with your real values. Both endpoints are **fail-closed**: missing secret = 503.

---

## Step 5 — Set Edge Function secrets

```bash
supabase secrets set CRON_SECRET=<long-random-string>

# Optional but recommended: use the new ECC-compatible auth secret key
# (sb_secret_...) for auth-apikey instead of service_role.
supabase secrets set AUTH_SECRET_KEY=sb_secret_xxx
```

Confirm:

```bash
supabase secrets list
```

`SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are injected automatically — you do not set them.

---

## Step 6 — Configure local env vars

Copy `.env.example` to `.env` (gitignored) and fill in values for the CLI/core packages:

```bash
cp .env.example .env
```

```env
# Used by the CLI and core package (repo root .env)
SUPABASE_URL=https://<project-ref>.supabase.co
SUPABASE_ANON_KEY=eyJ...
```

Create `apps/web/.env.local` for the Vite web app:

```bash
cat > apps/web/.env.local <<'EOF'
VITE_SUPABASE_URL=https://<project-ref>.supabase.co
VITE_SUPABASE_ANON_KEY=eyJ...
EOF
```

Vite reads `VITE_*` from `apps/web/.env*` files. If those vars are only in the root `.env`, the web app will fail at startup with `Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY`.

For Vercel deploys, set the same `VITE_*` variables in the project settings.

---

## Step 7 — Create your user account

Balance uses Supabase Auth. The simplest way to get an account is the web app's signup form:

```bash
npm run dev:web
```

1. Open <http://localhost:5173>.
2. Sign up with email + password (email confirmations are off by default — see `supabase/config.toml`).
3. Log in once so a row is created in `public.profiles`.
4. Complete onboarding (initial accounts, opening balances).

Alternatively, create the user from the Supabase dashboard (Authentication → Users → "Add user") and log in once via the web app to trigger profile creation.

---

## Step 8 — Generate an API key for the CLI

API keys live in `public.api_keys`. They are hashed (SHA-256) and only shown in plaintext at creation time.

From the repo root:

```bash
export BAL_EMAIL=you@example.com
export BAL_PASSWORD='your-password'

npx tsx apps/cli/src/index.ts key create --name "laptop"
```

You will get something like:

```
API key created. Save it now — it will NOT be shown again:

  bal_live_XXXXXXXXXXXXXXXXXXXXXXXX

Prefix: bal_live_AB
Name:   laptop
ID:     11111111-1111-1111-1111-111111111111
```

Store the key in your password manager or shell secrets. You can `bal key revoke <prefix>` later.

---

## Step 9 — Use the CLI

If you installed the published CLI globally:

```bash
npm install -g @dreamxist/bal-cli
```

Otherwise, alias the dev command:

```bash
alias bal="npx tsx $(pwd)/apps/cli/src/index.ts"
```

Authenticate and check your balance:

```bash
export SUPABASE_URL="https://<project-ref>.supabase.co"
export SUPABASE_ANON_KEY="<anon-key>"

bal login --api-key bal_live_XXXX
bal balance
```

The session is cached at `~/.balance/session.json` (mode `0600`) and refreshed automatically.

---

## End-to-end verification

Run this as a smoke test once everything is wired up:

```bash
bal balance                                           # delta should be 0
bal add 5000 test --account "<your-account-name>"     # register a fake expense
bal list --period day                                 # see the new row
# Then in the web app, open / movimientos and confirm it shows up.
```

To revert: `bal list --period day --json` to get the id, then call `undo_transaction(<id>)` from SQL or use the web UI.

For the security tests:

```bash
# pgTAP tests (require a local Supabase or a DATABASE_URL env)
supabase test db
```

Edge function integration tests:

```bash
npm test --workspace tests
```

---

## Troubleshooting

**`error: Missing SUPABASE_URL`**
Export `SUPABASE_URL` (and `SUPABASE_ANON_KEY`) in the same shell where you run `bal`. The CLI does **not** read `.env` automatically — that file is for `npm run dev`.

**`login failed (401): Invalid API key`**
Double-check the key prefix in `bal key list`. Keys starting with `bal_test_` from a different project will not match. The `auth-apikey` function rate-limits to 5 failed attempts per IP per 5 minutes.

**`login failed (429)`**
You hit the rate limit. Wait 5 minutes or restart from a different IP.

**`No session. Run \`bal login --api-key <key>\` first.`**
Either the file at `~/.balance/session.json` is missing, or the refresh token is older than 30 days. Run `bal login` again.

**`Server misconfigured` from `daily-backup` or `daily-charges`**
You forgot `supabase secrets set CRON_SECRET=...`. These functions are fail-closed.

**Migrations fail with "permission denied"**
Make sure you ran `supabase link` against the right project and your access token is fresh (`supabase login`).

**`bal add` errors with "account not found"**
Run `bal balance` to list your accounts, then re-run with the exact name (fuzzy match accepts substrings) or the UUID.

---

## Cost estimate

For one user with the daily cron jobs enabled, a Balance install fits inside Supabase's free tier:

- 500 MB database (plenty for years of transactions)
- 500K Edge Function invocations/month (you will use a handful per day)
- 1 GB Storage (daily backups, with 30-day retention)
- 50K monthly active users (you'll have 1)

Vercel's hobby plan is free for the web app. Total: **$0/mo** for personal use, scaling up only if you start ingesting bank statements or onboarding family members.
