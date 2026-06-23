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

### Authentication

| Command | Description |
| --- | --- |
| `bal login --api-key <key>` | Exchange an API key for a JWT and persist a session. |
| `bal key create --name <label>` | Generate a new API key. Plaintext is shown **once**. |
| `bal key list [--include-revoked]` | List your API keys (never shows plaintext). |
| `bal key revoke <id\|prefix>` | Revoke an API key by UUID or unique prefix. |

### Transactions

| Command | Description |
| --- | --- |
| `bal add <amount> <category> --account <name\|id> [--type] [--note] [--date]` | Register a transaction. Types: `expense` (default), `income`, `refund`, `adjustment`. |
| `bal transfer <amount> --from <name\|id> --to <name\|id> [--note] [--date]` | Move money between two accounts (does not affect accumulated). |
| `bal undo <tx-id>` | Reverse a transaction by creating a compensating adjustment (immutable ledger). |
| `bal list [--period] [--type] [--category] [--account] [--search] [--entity] [--date-from] [--date-to] [--limit]` | List transactions. Period: `day\|week\|month\|quarter\|year\|all`. `--type` accepts comma-separated values. `--entity personal\|spa\|all`. |
| `bal balance [--entity personal\|spa\|all] [--json]` | Show position, accumulated, delta, and per-account balances. Default entity `personal`; `spa` shows business cash + month flows. |
| `bal patrimonio [--neto] [--tasa <pct>] [--json]` | Gross net worth (personal + SpA) with optional after-tax estimate. |

### Accounts

| Command | Description |
| --- | --- |
| `bal account list [--archived] [--type] [--subtype]` | List accounts with balance and on-budget flag. |
| `bal account create <name> --type <asset\|liability> --subtype <...> [--balance] [--credit-limit] [--entity] [--currency] [--off-budget]` | Create an account. |
| `bal account archive <name\|id>` | Archive an account (soft delete). |
| `bal account rename <name\|id> <new-name>` | Rename an account. |
| `bal account balance <name\|id> <new-balance>` | Manually set a balance (typically for off-budget: investments, property). |

### Debts (installment purchases)

| Command | Description |
| --- | --- |
| `bal debt list` | List active debts with progress. |
| `bal debt create <amount> <installments> <category> --account <name\|id>` | Register an installment purchase. |
| `bal debt pay <debt-id\|description>` | Pay one installment. |
| `bal debt payoff <debt-id\|description> [--actual-amount]` | Pay off a debt entirely. |
| `bal debt archive <debt-id\|description>` | Mark a debt as closed. |

### Receivables

| Command | Description |
| --- | --- |
| `bal receivable pay <receivable> <amount> --to <account>` | Record a payment received from a receivable. |

### Categories

| Command | Description |
| --- | --- |
| `bal category list [--entity]` | List categories. |
| `bal category create <parent-id> <id> <name>` | Create a subcategory under an existing parent. |
| `bal category rename <id> <new-name>` | Rename a category. |
| `bal category delete <id>` | Delete a category (fails if referenced by transactions). |

### Recurring charges

| Command | Description |
| --- | --- |
| `bal recurring list [--include-inactive]` | List recurring charges. |
| `bal recurring create <name> <amount> --day <1-31> --category <id> --account <name\|id>` | Create a recurring charge that auto-registers on day_of_month. |
| `bal recurring delete <id\|name>` | Delete a recurring charge. |

### Snapshots & export

| Command | Description |
| --- | --- |
| `bal snapshot create [--date]` | Capture a snapshot of current position (net worth, accumulated, delta). |
| `bal snapshot list [--limit]` | Show snapshot history. |
| `bal export [--format json\|csv] [--output <path>]` | Export all data. |

### Fintual integration

| Command | Description |
| --- | --- |
| `bal fintual sync [--dry-run]` | Pull latest Fintual prices and update off-budget account balances. |

### SpA (business entity)

| Command | Description |
| --- | --- |
| `bal spa dashboard` | Show business accounts, monthly income/expenses, IVA due. |
| `bal spa invoice list [--direction emitida\|recibida] [--month YYYY-MM]` | List invoices. |
| `bal spa invoice create --direction <d> --counterpart <name> --neto <amount> [--doc-type] [--folio] [--account] [--create-transaction]` | Create an invoice. `--doc-type`: `factura_afecta\|factura_exenta\|factura_exportacion\|boleta\|nota_credito`. |
| `bal spa invoice pay <invoice-id> --account <name\|id>` | Mark an invoice as paid. |
| `bal spa gasto <amount> <category> [--moneda CLP\|USD] [--tc <rate>] [--account]` | SpA expense (foreign SaaS = no VAT credit). USD converts to CLP. |
| `bal spa f29 <YYYY-MM>` | Compute F29 summary for a given month. |
| `bal spa f29-declarar <YYYY-MM> [--codigo code=value ...] [--folio]` | Mark a period declared, storing the official SII codes (source of truth). |
| `bal spa sueldo <amount> --to <personal account>` | Owner salary: inter-entity transfer SpA → personal. |
| `bal spa annual [year]` | Annual summary. |

Chilean tax notes: foreign SaaS purchases use `bal spa gasto` (expense, no VAT credit — rolls into the annual income tax, not the monthly F29); domestic purchases with VAT use `bal spa invoice create --direction recibida`. The official SII F29 codes are the source of truth — store them with `bal spa f29-declarar --codigo`.

### Conventions

- **Amount parsing**: plain integers (`12000`) or thousand-separated (`12.000`, `12,000`, `12 000`, `12_000`). All money is stored as integers (CLP in pesos, USD in cents). No decimals.
- **Account selection**: `--account` accepts UUID or a substring of the name (case-insensitive fuzzy match). Ambiguous matches error out.
- **JSON output**: every read command accepts `--json` for machine-readable output. Useful for piping into `jq`, scripts, or other tools.
- **Transaction immutability**: transactions are never updated or deleted. Corrections use `bal undo` (creates a compensating adjustment).

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

Built by **Pancho Zúñiga**. Building in public.

- LinkedIn: <!-- TODO: add LinkedIn URL -->
- GitHub: https://github.com/dreamxist
- Twitter / X: <!-- TODO: add Twitter URL -->
