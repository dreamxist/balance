# Balance

> Opinionated personal finance, built around one promise: every peso is located and explained.

Balance is a personal-finance app for developers who want full control over their money model. It is built on top of Supabase, ships a TypeScript CLI, and uses the **Balance Assertion with Reconciliation** pattern at its core: your real positions (cash in accounts, cards, investments, debts) must always equal the sum of your registered transactions. Delta = 0 or you find out fast.

This is not a YNAB or Mint replacement. It is a self-hosted, code-first alternative for people who like spreadsheets, the command line, and the idea that their financial system should be auditable end to end.

Status: **Beta — building in public.** Used daily by the author to migrate 9 years of Excel history. Schema is stable; UI iterating.

---

## Demo

![Balance demo](docs/assets/demo.gif)

> Replace `docs/assets/demo.gif` with a real recording. A 20-second loop showing `bal balance` + the dashboard works well.

---

## Features

- **Balance assertion engine.** Position vs. accumulated, delta = 0, or you debug it.
- **First-class CLI.** Add expenses, income, transfers, and debt payments without touching the browser.
- **Web dashboard.** React + Vite SPA: net worth, cash flow, debts, recurring charges, snapshots.
- **Multiple account types.** Cash, debit, credit cards, investments (Fintual integration), debts, receivables, properties.
- **Installment-aware debts.** Buy now, register later: full expense at purchase, monthly debt payments tracked separately.
- **Recurring charges.** Edge function cron auto-registers monthly subscriptions and debt installments.
- **Snapshots & immutable history.** Transactions are never edited or deleted — corrections happen via undo / refund / adjustment.
- **Strict isolation.** Postgres RLS on every table. CLI uses short-lived JWTs minted from API keys, never `service_role`.
- **Fully self-hostable.** Supabase free tier is enough for personal use.

## Stack

![Supabase](https://img.shields.io/badge/Supabase-3ECF8E?logo=supabase&logoColor=white)
![Postgres](https://img.shields.io/badge/Postgres-4169E1?logo=postgresql&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?logo=typescript&logoColor=white)
![React](https://img.shields.io/badge/React-61DAFB?logo=react&logoColor=black)
![Vite](https://img.shields.io/badge/Vite-646CFF?logo=vite&logoColor=white)
![License: MIT](https://img.shields.io/badge/license-MIT-green)

| Layer | Tech |
| --- | --- |
| Database | Supabase Postgres + RLS + PL/pgSQL functions |
| Edge runtime | Supabase Edge Functions (Deno) |
| Web | React 19, Vite 8, TanStack Router/Query, Tailwind v4 |
| CLI | Node 22+, TypeScript, commander |
| Monorepo | npm workspaces + Turborepo |
| Deploy | Vercel (web) + Supabase (db/functions) |

---

## Quick start (CLI)

The published CLI is `@dreamxist/bal-cli`. You still need a Supabase backend with the Balance schema deployed — see [SETUP.md](./SETUP.md).

```bash
# 1. Install
npm install -g @dreamxist/bal-cli

# 2. Point at your backend + log in with an API key
export SUPABASE_URL="https://<project-ref>.supabase.co"
export SUPABASE_ANON_KEY="<anon-key>"
bal login --api-key bal_...

# 3. Check your books
bal balance
```

More commands:

```bash
bal add 12000 supermercado --account "Checking"
bal add 1500000 sueldo --type income --account "Checking"
bal list --period month --type expense
bal key list
```

Full reference: [`apps/cli/README.md`](./apps/cli/README.md).

---

## Personal and SpA (two entities)

Balance tracks **two entities** in one database: your **personal** finances and, optionally, a **company (SpA)**. The `entity` field (`personal` | `spa`) keeps accounts and transactions separate, and reconciliation is scoped per entity — so company activity never breaks your personal `delta = 0`.

| | Personal | SpA (company) |
| --- | --- | --- |
| Accounts | `on_budget = true` | `entity = 'spa'`, usually `on_budget = false` |
| Reconciliation | full cuadre (delta 0) | tracked as **gross net worth** (pre-tax), excluded from personal delta |
| Commands | `bal add` / `bal balance` / `bal list` | `bal spa …` + `bal balance --entity spa` |

### Personal

```bash
bal balance                 # personal reconciliation (default)
bal add 12000 comida --account "Checking"
bal list --period month --type expense
```

### SpA (invoicing, VAT/F29, owner salary)

```bash
bal balance --entity spa                                          # company cash + month income/expenses
bal spa invoice create --direction emitida --counterpart "Client" --neto 2000000 --create-transaction  # sales invoice (VAT 19%)
bal spa invoice create --direction recibida --counterpart "Supplier" --neto 11990                       # domestic purchase (VAT credit)
bal spa gasto 10 saas --moneda USD --tc 950 --note "Hosting"      # foreign expense (no VAT credit)
bal spa f29 2026-05                                               # monthly VAT/F29 summary
bal spa f29-declarar 2026-05 --codigo 091=380355 --folio 123      # store official SII figures
bal spa sueldo 900000 --to "Checking"                            # owner salary SpA→personal
bal spa annual                                                   # yearly sales/costs/profit
bal patrimonio --neto --tasa 12.5                               # gross vs estimated after-tax net worth
```

The SpA module is feature-flagged (`profiles.features.spa`) and also has a web view at `/spa`. Foreign SaaS purchases are expensed without VAT credit (they go to the annual income tax, not the monthly F29); the official SII F29 codes are the source of truth. Full reference: [CLI commands](./.claude/skills/balance/COMMANDS.md).

---

## Self-host

Balance is designed to run on your own Supabase project. Step-by-step instructions, including migrations, edge functions, secrets, and cron setup, live in [SETUP.md](./SETUP.md).

Costs: a personal-scale install fits comfortably in the Supabase free tier (one project, < 500 MB DB, daily edge-function cron). Web hosting is also free on Vercel.

---

## Project layout

```
balance/
├── apps/
│   ├── cli/        # bal CLI (published as @dreamxist/bal-cli)
│   └── web/        # React + Vite SPA
├── packages/
│   └── core/       # Shared TypeScript business logic
├── supabase/
│   ├── migrations/ # SQL migrations (run via `supabase db push`)
│   ├── functions/  # Edge Functions (auth-apikey, daily-charges, ...)
│   └── tests/      # pgTAP tests
├── docs/           # Architecture, workflows, design notes
└── tests/          # Engine + edge-function integration tests
```

## Documentation

- [SETUP.md](./SETUP.md) — Self-hosting guide
- [SECURITY.md](./SECURITY.md) — Threat model, recent fixes, disclosure policy
- [CONTRIBUTING.md](./CONTRIBUTING.md) — How to work on Balance
- [docs/architecture.md](./docs/architecture.md) — DB schema and function design
- [docs/workflows.md](./docs/workflows.md) — Financial flows and business rules
- [docs/design.md](./docs/design.md) — UI patterns and component library

## License

[MIT](./LICENSE) © 2026 Francisco Zúñiga Palma.

## Author

Built by **Pancho Zúñiga** — fullstack developer, building in public at [github.com/dreamxist](https://github.com/dreamxist).

If Balance is useful to you, a star on GitHub or a note about your setup helps a lot. Issues and PRs welcome.
