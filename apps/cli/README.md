# @dreamxist/bal-cli

> Command-line interface for [Balance](https://github.com/dreamxist/balance) — opinionated personal finance with `delta = 0` reconciliation.

`bal` is a thin TypeScript CLI that talks to a self-hosted Balance backend (Supabase + PostgreSQL + Edge Functions). It is **read/write**: list accounts, register transactions, manage API keys, and check whether your books are balanced — without leaving the terminal.

`@dreamxist/bal-cli` is just the client. To use it, you need a backend — see the [self-hosting guide](https://github.com/dreamxist/balance/blob/main/SETUP.md).

## Install

```bash
npm install -g @dreamxist/bal-cli
```

Requires **Node 22+**.

## Quickstart

```bash
# Point the CLI at your backend
export SUPABASE_URL="https://<project-ref>.supabase.co"
export SUPABASE_ANON_KEY="<anon-public-key>"

# Authenticate with an API key minted from the web app
bal login --api-key bal_live_XXXXXXXXXXXXXXXX

# Show net position vs. accumulated transactions
bal balance
```

The session is cached at `~/.balance/session.json` (mode `0600`) and refreshed automatically on every command.

## Commands

| Command | Description |
| --- | --- |
| `bal login --api-key <key>` | Exchange an API key for a JWT and persist a session. |
| `bal balance [--json]` | Show position, accumulated, delta, and per-account balances. |
| `bal add <amount> <category> --account <name\|id> [--type <type>] [--note <text>] [--date YYYY-MM-DD] [--json]` | Register a transaction. `--type` defaults to `expense`. |
| `bal list [--period day\|week\|month] [--type <type>] [--category <prefix>] [--account <name\|id>] [--limit N] [--json]` | List recent transactions. Default period is `week`. |
| `bal key create --name <label> [--email <e>] [--password <p>] [--json]` | Generate a new API key. Plaintext is shown **once**. |
| `bal key list [--include-revoked] [--json]` | List your API keys (never shows plaintext). |
| `bal key revoke <id\|prefix>` | Revoke an API key by UUID or unique prefix. |

### Transaction types

`expense`, `income`, `refund`, `adjustment` are accepted by `bal add`.

`transfer` and `debt_payment` are not exposed via `bal add` — they have richer semantics (paired account moves, debt linkage). Use the web app or the corresponding `core` functions until dedicated CLI commands land.

### Amount parsing

`bal add` accepts plain integers (`12000`) or thousand-separated forms (`12.000`, `12,000`, `12 000`, `12_000`). All money is stored as integers (CLP in pesos, USD in cents). No decimals.

### Account selection

`--account` accepts either a UUID or a substring of the account name (case-insensitive fuzzy match). Ambiguous matches error out.

### JSON output

Every command accepts `--json` for machine-readable output. Useful for piping into `jq`, scripts, or other tools.

## Environment variables

| Var | Purpose | Required |
| --- | --- | --- |
| `SUPABASE_URL` | Your Balance backend URL. | Yes |
| `SUPABASE_ANON_KEY` | Public anon key from the Supabase project. | Yes |
| `BAL_API_KEY` | Default API key for `bal login` (avoids passing `--api-key`). | No |
| `BAL_EMAIL` / `BAL_PASSWORD` | Default credentials for `bal key create/list/revoke` (which require fresh password auth). | No |
| `BAL_SESSION_FILE` | Override the session cache path (default `~/.balance/session.json`). | No |
| `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` | Read as fallbacks for the two `SUPABASE_*` vars. | No |

The CLI does **not** read `.env` files automatically. Use a tool like [direnv](https://direnv.net) or your shell profile to export the vars.

## Backend setup

`bal` needs a Balance backend. Spinning one up takes ~30 minutes:

1. Create a Supabase project.
2. Push the migrations from the [Balance monorepo](https://github.com/dreamxist/balance) (`supabase db push`).
3. Deploy the Edge Functions (`auth-apikey`, `daily-charges`, `daily-backup`, `api-docs`).
4. Set `CRON_SECRET` and schedule the daily cron jobs.
5. Sign up via the web app and generate your first API key.

Full instructions: <https://github.com/dreamxist/balance/blob/main/SETUP.md>

## Security notes

- API keys are SHA-256 hashed in Postgres. Plaintext is shown exactly once.
- Sessions are stored at `~/.balance/session.json` with mode `0600`. Treat that file as a secret.
- The `auth-apikey` Edge Function is rate-limited (5 failed attempts per IP per 5 minutes).
- All RPC calls use a **user JWT**, never `service_role`. RLS enforces tenancy in the database.

For the full threat model and disclosure policy: <https://github.com/dreamxist/balance/blob/main/SECURITY.md>

## Versioning

This package follows semver from `1.0.0` onward. Pre-1.0 releases may break between minor versions — pin if you script against `bal --json` outputs.

## License

[MIT](https://github.com/dreamxist/balance/blob/main/LICENSE) © 2026 Francisco Zúñiga Palma.

## Author

Built by **Pancho Zúñiga**, building in public at [github.com/dreamxist](https://github.com/dreamxist).
