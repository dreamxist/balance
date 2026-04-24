# Changelog

All notable changes to Balance are documented here. Format based on
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), versioning per
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.2.1] — 2026-04-24

### Added

- **`@dreamxist/bal-cli`** — 11 new command groups covering the full webapp surface:
  - `bal transfer <amount> --from --to` — move money between accounts (does not affect accumulated).
  - `bal undo <tx-id>` — reverse a transaction via compensating adjustment (immutable ledger).
  - `bal account {list,create,archive,rename,balance}` — full account CRUD + manual balance override for off-budget accounts.
  - `bal debt {list,create,pay,payoff,archive}` — installment purchase flows with fuzzy match by description.
  - `bal receivable pay <receivable> <amount> --to <account>` — record a payment received from a receivable.
  - `bal category {list,create,rename,delete}` — category tree management.
  - `bal recurring {list,create,delete}` — recurring charges (auto-executed by the `daily-charges` cron).
  - `bal snapshot {create,list}` — capture and browse patrimony snapshots.
  - `bal export [--format json|csv] [--output]` — full dataset export.
  - `bal fintual sync [--dry-run]` — pull Fintual fund prices and update off-budget balances.
  - `bal spa {dashboard, invoice {list,create,pay}, f29, annual}` — business entity (SpA) operations.
- **`bal list` filters** — multi-type (`--type income,expense`), text search (`--search`), custom date range (`--date-from/--date-to`), and new periods (`quarter`, `year`, `all`).
- **Smoke test script** (`scripts/smoke.mjs`, `npm run smoke`) — read-only end-to-end validation of 13 commands against a live backend.

### Fixed

- Robust metadata parsing in `bal fintual sync` — JSONB columns sometimes come back as strings; parses both forms.

## [0.1.1] — 2026-04-23

### Fixed

- `@dreamxist/bal-cli` package metadata: `homepage` and `repository.url` now point to the public [`dreamxist/balance`](https://github.com/dreamxist/balance) repo instead of the private monorepo mirror.

### Changed

- Documentation placeholders (`<TU_GITHUB_URL>`, etc.) replaced with concrete URLs and the maintainer email for security disclosures.

## [0.1.0] — 2026-04-23

First public release. Feature parity with the author's private build.

### Added

- **CLI `bal`** (`@dreamxist/bal-cli`) with five command groups:
  - `bal login` — authenticate with an API key; persists JWT session at `~/.balance/session.json`, auto-refreshes.
  - `bal key create|list|revoke` — manage API keys against the auth-apikey Edge Function.
  - `bal add <amount> <category>` — register transactions (expense/income/refund/adjustment) with account resolution by fuzzy name or UUID.
  - `bal balance` — reconciliation status (position, accumulated, delta, is_balanced) plus per-account breakdown. Includes `--json`.
  - `bal list` — transaction history with `--period day|week|month`, category/account/type filters, and grouped human output.
- **Agent Skill** for Claude Code at `.claude/skills/balance/` — `SKILL.md` + `COMMANDS.md` + `WORKFLOWS.md` + `EXAMPLES.md` + `SETUP.md`. Enables conversational registration and queries from any Claude Code client (CLI, web, mobile) with the skill installed.
- **Web dashboard** (Vite + React 19 + TanStack Router/Query + Tailwind v4): Cuadrar (net worth hero, account groups, receivables/payables), Movimientos, Deudas, Patrimonio, SpA module, Configuración.
- **Database**: Postgres schema with RLS on every table, balance-assertion-first model, immutable transactions with undo/refund/adjustment corrections, snapshots, recurring-charges cron, optional SpA (second entity) module.
- **Edge Functions**: `auth-apikey` (API key → JWT exchange), `daily-charges` (recurring auto-register), `daily-backup`.

### Security

- RLS policies on every public table, `(select auth.uid())` cached lookup pattern, `security_invoker = true` on all views.
- Database functions validate `user_id = auth.uid()` before mutating shared tables.
- API keys stored as SHA-256 hashes only; plaintext shown once at creation.
- Session file `~/.balance/session.json` written with `0600` permissions.

### Known limitations

- Single-currency (CLP, Chilean peso). Multi-currency would require data-model changes; tracking for a future minor version.
- Hard-coded chilean tax/invoicing rules (F29, boletas) live behind a feature flag but are not configurable yet.
- Web app has no automated tests. CLI has 27 unit tests; engine has 281 tests covering core logic.
