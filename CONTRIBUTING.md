# Contributing to Balance

Thanks for your interest. Balance is a building-in-public personal-finance project, so contributions of any size are welcome — bug reports, doc fixes, new commands, RLS improvements, all of it.

This guide gets you from `git clone` to a green PR.

## Table of contents

- [Code of conduct](#code-of-conduct)
- [Local setup](#local-setup)
- [Project layout](#project-layout)
- [Running tests](#running-tests)
- [Testing Edge Functions](#testing-edge-functions)
- [Code style](#code-style)
- [Commit conventions](#commit-conventions)
- [Pull request process](#pull-request-process)
- [Reporting issues](#reporting-issues)

---

## Code of conduct

Be kind, be specific, assume good faith. Report abusive behavior through a [GitHub Security Advisory](https://github.com/dreamxist/balance/security/advisories/new). There is no formal CoC document yet — for now, the [Contributor Covenant](https://www.contributor-covenant.org/) applies in spirit.

## Local setup

You will need Node 22+, npm 10+, and the [Supabase CLI](https://supabase.com/docs/guides/cli). Docker is optional (only needed for local Supabase).

```bash
git clone https://github.com/dreamxist/balance.git
cd balance
npm install
npm run build         # confirm everything compiles
```

If you want a full local stack:

```bash
supabase start        # boots Postgres, GoTrue, Edge Runtime
supabase db reset     # apply migrations + seed
npm run dev           # web (5173) + cli watcher
```

If you just want to point at a hosted dev project, fill `.env` with `SUPABASE_URL` and `SUPABASE_ANON_KEY` (see [SETUP.md](./SETUP.md) for details).

---

## Project layout

```
apps/cli/         # bal CLI (commander)
apps/web/         # React + Vite SPA
packages/core/    # Shared TypeScript business logic — IMPORT FROM HERE in apps/*
supabase/
  migrations/     # SQL migrations (sequential, immutable once merged)
  functions/      # Edge Functions (Deno)
  tests/          # pgTAP tests for SQL + RLS
tests/            # Vitest engine + edge-function integration tests
docs/             # Architecture, workflows, design notes
```

Rules of thumb (also in [`CLAUDE.md`](./CLAUDE.md)):

- **Business logic lives in `packages/core` or in PL/pgSQL functions.** Never in React components or CLI command handlers.
- **All money is integers.** CLP in pesos, USD in cents. No floats, ever.
- **Transactions are immutable.** Correct with `undo`, `refund`, or `adjustment` — never `UPDATE` or `DELETE` financial rows.
- **RLS on every table, deny by default.** Use `(select auth.uid())` (cached) in policies.
- **Views must set `security_invoker = true`.**

---

## Running tests

```bash
npm test                  # turbo-driven: runs all package tests
npm run typecheck         # tsc --noEmit across the monorepo
npm run lint              # eslint where wired up
```

Per-workspace:

```bash
npm test --workspace @balance/cli
npm test --workspace @balance/core
npm test --workspace tests           # engine + edge-function integration
```

Database tests (pgTAP):

```bash
supabase test db          # requires supabase start beforehand
```

The pgTAP suite under `supabase/tests/` covers RLS, financial primitives, transfers, snapshots, debts, and the April 2026 user-validation security patch.

---

## Testing Edge Functions

Locally:

```bash
supabase functions serve auth-apikey --no-verify-jwt
# In another terminal:
curl -X POST http://localhost:54321/functions/v1/auth-apikey \
  -H "x-api-key: bal_dev_..."
```

Integration tests (against a local stack):

```bash
npm test --workspace tests
```

When you change an Edge Function, deploy it explicitly to your dev project:

```bash
supabase functions deploy auth-apikey
```

Remember that cron functions (`daily-charges`, `daily-backup`) require `CRON_SECRET` — they fail-closed without it.

---

## Code style

- **TypeScript strict.** No `any`. If you need an escape hatch, use `unknown` and narrow.
- **Prefer named exports.** No `export default`.
- **Top-level `function` declarations** are preferred over arrow functions for hoisting and readability. Arrow functions inside expressions are fine.
- **No comments stating the obvious.** Explain *why*, not *what*.
- **No new ORMs.** Use `supabase-js` and the generated `Database` types from `packages/core/src/types.ts`. Regenerate with:

  ```bash
  npm run db:types
  ```

- **No global client state libraries** (Redux, Zustand). TanStack Query holds server state; URL/search params hold the rest.
- **CSS:** Tailwind v4 utility classes, `tw-animate-css` for animations, shadcn/ui primitives in `apps/web/src/components/ui/`.

Keep diffs small. Do not refactor unrelated code in a feature PR.

---

## Commit conventions

We use [Conventional Commits](https://www.conventionalcommits.org/). Examples:

```
feat(cli): add `bal transfer` command
fix(rls): scope debt_payments policy to owner only
chore(deps): bump @supabase/supabase-js to 2.101.0
docs(setup): clarify CRON_SECRET wiring
test(security): cover create_transaction p_user_id mismatch
refactor(core): extract reconciliation helpers
```

Scopes we use: `cli`, `web`, `core`, `db`, `rls`, `edge`, `docs`, `setup`, `security`, `deps`.

Commit messages are in **English**. Conversation, issue discussion, and PR descriptions can be in either English or Spanish.

If your commit fixes a security issue, link to the affected migration or function in the body, and mention `Security:` so it stands out in the changelog.

---

## Pull request process

1. **Fork** and create a feature branch from `main`.
2. Run `npm run typecheck && npm test && npm run build` locally before pushing.
3. Open the PR with:
   - A clear title (Conventional Commits format is fine here too).
   - **Summary:** what changed and why.
   - **Test plan:** the commands you ran and what you observed.
   - **Screenshots / GIFs** for any UI change.
4. If the change touches:
   - **Migrations** → make sure the migration is additive and named with the next available numeric prefix or a `YYYYMMDDHHMMSS_` timestamp. Never edit a migration that has shipped.
   - **Edge Functions** → include a deploy note in the PR description.
   - **Security** → also update [SECURITY.md](./SECURITY.md) and add a pgTAP test.
5. Wait for review. CI must be green. I will merge with squash + a Conventional Commits subject.

For larger features, open an issue first to align on scope. Anything that changes the financial model (new transaction type, new account type, reconciliation tweaks) gets extra scrutiny.

---

## Reporting issues

- **Bugs:** open a GitHub issue with reproduction steps, expected vs. actual, environment (Node version, OS, hosted vs. local Supabase).
- **Security vulnerabilities:** do **not** file a public issue. See [SECURITY.md](./SECURITY.md) for the disclosure email.
- **Feature requests:** issues are fine, but be explicit about your use case. Balance is opinionated and not every feature fits.

Thanks for helping.
