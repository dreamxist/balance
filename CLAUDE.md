# Balance — Personal Finance App

## Overview
App de finanzas personales con balance assertion y reconciliacion. Monorepo TypeScript.

## Architecture
- Monorepo: npm workspaces + turborepo
- packages/core: shared business logic (TypeScript)
- apps/web: Vite + React SPA (TanStack Router/Query, Tailwind v4)
- apps/cli: CLI tool `bal` (commander)
- supabase/: migrations, functions, seed data
- Backend: Supabase (PostgreSQL + RLS + Database Functions)
- No custom backend server

## Key docs
- docs/architecture.md — DB schema, functions, security, folder structure
- docs/workflows.md — User flows, business rules, financial logic
- docs/design.md — UI patterns, wireframes, color system, typography
- data/excel-analysis.md — Original Excel analysis (reference only)

## Commands
```bash
npm install              # install all deps
npm run dev              # start web + supabase local
npm run dev:web          # start web only
npm run dev:cli          # run CLI in dev mode
supabase start           # start local Supabase
supabase db reset        # reset + seed local DB
supabase gen types typescript --local > packages/core/src/types.ts
```

## Code conventions
- TypeScript strict, no `any`
- Named exports only
- Prefer `function` declarations over arrow for top-level
- Business logic lives in packages/core, NEVER in apps/web or apps/cli
- Database logic lives in supabase/migrations as PL/pgSQL functions
- UI components in apps/web/src/components/{feature}/
- All money amounts stored as integers (CLP in pesos, USD in cents)
- Commit messages in English

## Financial model (critical)
The app uses Balance Assertion with Reconciliation:
- Position = sum(on_budget assets) - sum(on_budget liabilities)
- Accumulated = sum(income + expense + refund + adjustment transactions)
- Delta = Position - Accumulated (should be 0)
- Transfers and debt_payments do NOT affect accumulated
- Installment purchases: full amount as expense at purchase time, monthly payments are debt_payments
- See docs/workflows.md for complete flow details

## Database patterns
- ALL business logic in Database Functions (PL/pgSQL), not in application code
- Functions decomposed: _primitives (SQL) -> operations (PL/pgSQL) -> views (read-only)
- RLS on every table, deny by default
- Use `(select auth.uid())` in RLS policies (cached, not per-row)
- Views MUST have `security_invoker = true`
- Transactions are immutable — correct with undo/refund, never update/delete
- Snapshots are immutable
- Soft delete via is_archived, never hard delete on financial tables
- CLI uses user JWT (from `bal login` or API key), NOT service_role
- API keys validated via Edge Function, generate short-lived JWT
- service_role only in Edge Functions and admin scripts

## Testing
- Database functions: pgTAP tests in supabase/tests/
- Core logic: vitest in packages/core/
- Web components: vitest + testing-library in apps/web/
- RLS policies: dedicated pgTAP tests per table

## Don't
- Don't add ORMs (Prisma, Drizzle) — use supabase-js + generated types
- Don't add global state (Redux, Zustand) — TanStack Query handles server state
- Don't put business logic in React components — extract to packages/core
- Don't create API routes — use Supabase RPC directly
- Don't store money as floats — always integers
- Don't delete financial records — archive or create reversals

<!-- GSD:project-start source:PROJECT.md -->
## Project

**Balance**

App de finanzas personales que unifica la gestion financiera de una persona y una segunda entidad opcional (SpA u otra empresa) en una sola plataforma. El patron core es Balance Assertion with Reconciliation: cada peso esta ubicado y explicado, delta = 0.

**Core Value:** Cuadrar el balance — que la posicion financiera real (saldos en cuentas) coincida con el registro de movimientos (transacciones acumuladas). Delta = 0.

### Constraints

- **Stack**: Vite + React (no Next.js) — SPA estatico, deploy en Vercel
- **Backend**: Supabase only — no custom backend server
- **DB Logic**: Toda logica de negocio en Database Functions (PL/pgSQL), no en aplicacion
- **Auth**: JWT via Supabase Auth + API keys via Edge Function — CLI no usa service_role
- **Money**: Integers (CLP en pesos, USD en centavos), nunca floats
- **Immutability**: Transactions y snapshots inmutables — corregir con undo/refund
- **RLS**: Deny by default, `(select auth.uid())` pattern, security_invoker en views
- **Single user v1**: Pero RLS y auth preparados para multi-user futuro
<!-- GSD:project-end -->

<!-- GSD:stack-start source:research/STACK.md -->
## Technology Stack

## Validation Summary
| Area | Veredicto | Accion |
|------|-----------|--------|
| Vite 6 | **ACTUALIZAR a Vite 8** | Vite 8.0.3 es estable, usa Rolldown (10-30x builds mas rapidos) |
| React 19 | CONFIRMADO | Estable, sin issues |
| Supabase (supabase-js v2) | CONFIRMADO con **FLAG** | Migrar a nuevo modelo de API keys (publishable/secret) durante desarrollo |
| TanStack Router | CONFIRMADO | v1.168+, excelente con Vite y React 19 |
| TanStack Query | CONFIRMADO | Sigue siendo la eleccion correcta |
| Tailwind v4 | CONFIRMADO | CSS-first config funciona bien |
| shadcn/ui | CONFIRMADO con ajustes | Usar `tw-animate-css` en vez de `tailwindcss-animate` |
| framer-motion | **RENOMBRAR a `motion`** | Paquete renombrado, importar de `motion/react` |
| Recharts | **FLAG: problemas con React 19** | Recharts 3.x tiene issues reportados con React 19.2.3 |
| cmdk | CONFIRMADO | v1.1.1 compatible con React 19 |
| vaul | CONFIRMADO | v1.1.2 compatible con React 19 |
| sonner | CONFIRMADO | Integrado con shadcn |
| Turborepo + bun | CONFIRMADO | Bun estable en Turborepo 2.7+, lockfile v1 soportado |
## Correcciones Criticas
### 1. Vite 6 -> Vite 8
### 2. framer-motion -> motion
### 3. Recharts + React 19 = Problemas reportados
- **Opcion A (recomendada):** Mantener Recharts pero pinear version y probar temprano. shadcn/ui chart components usan Recharts bajo el hood, asi que hay buena integracion.
- **Opcion B:** Migrar a Nivo o Tremor si los problemas persisten.
## Ajustes Recomendados
### 4. tailwindcss-animate -> tw-animate-css
### 5. Supabase API Keys: Nuevo modelo
- `SUPABASE_ANON_KEY` en el codigo actual -> sera `SUPABASE_PUBLISHABLE_KEY`
- `service_role` en Edge Functions -> sera `sb_secret_...`
- El Edge Function pattern para API keys de CLI sigue siendo valido, pero la implementacion interna cambia
## Stack Confirmado (con correcciones aplicadas)
### Core Framework
| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| Vite | ^8.0.0 | Build tool + dev server | Rolldown bundler, HMR instantaneo, static SPA output |
| @vitejs/plugin-react | ^6.0.0 | React Fast Refresh | Usa Oxc, Babel ya no es dependencia |
| React | ^19.0.0 | UI framework | Estable, bien soportado por todo el stack |
| React DOM | ^19.0.0 | DOM renderer | Par con React |
| TypeScript | ^5.7.0 | Type safety | Strict mode, no `any` |
### Routing & State
| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| @tanstack/react-router | ^1.168.0 | Client-side routing | Type-safe, file-based routing con Vite plugin, search params como state |
| @tanstack/router-vite-plugin | ^1.161.0 | Auto route generation | Code-splitting automatico |
| @tanstack/react-query | ^5.0.0 | Server state management | Cache, refetch, optimistic updates. Reemplaza Redux/Zustand |
### Backend & Auth
| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| @supabase/supabase-js | ^2.101.0 | Client SDK | PostgreSQL + RLS + Auth + Realtime + Edge Functions |
| Supabase CLI | latest | Local dev + migrations | `supabase start`, `supabase db reset`, type generation |
### Styling & UI
| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| tailwindcss | ^4.0.0 | Utility CSS | CSS-first config con @theme, no JS config file |
| @tailwindcss/vite | ^4.0.0 | Vite integration | Plugin nativo para Tailwind v4 |
| shadcn/ui | latest (CLI) | Component library | Radix primitives, customizable, no vendor lock-in |
| tw-animate-css | latest | Animations for shadcn | Reemplazo CSS-puro de tailwindcss-animate para Tw v4 |
| geist | latest | Typography | Geist Sans + Geist Mono, excelente para numeros financieros |
### UI Libraries
| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| motion | ^12.37.0 | Animations | Count-up de numeros, layout transitions, AnimatePresence |
| cmdk | ^1.1.1 | Command palette | Cmd+K, lightweight, React 19 compatible |
| vaul | ^1.1.2 | Bottom sheets (mobile) | Web-native drawer, React 19 compatible |
| sonner | latest | Toast notifications | Integrado con shadcn, ligero |
| react-day-picker | latest | Date picker | Integrado con shadcn |
| recharts | ^3.8.0 | Charts | Para patrimonio historico. FLAG: probar con React 19 temprano |
### CLI
| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| commander | latest | CLI framework | Estandar para CLIs en Node |
### Monorepo & Build
| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| npm | ^10.9.0 | Package manager | Workspaces, stable, built-in with Node |
| turbo | ^2.7.0 | Monorepo orchestration | Task caching, parallel builds |
### Testing
| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| vitest | ^3.0.0 | Unit/integration tests | Compatible con Vite 8, rapido |
| @testing-library/react | latest | Component tests | Estandar para React testing |
| pgTAP | latest | Database function tests | Tests de PL/pgSQL y RLS policies |
### Deploy
| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| Vercel | - | Hosting | Zero-config para Vite SPA, Edge Functions de Supabase aparte |
## Alternatives Considered
| Category | Recommended | Alternative | Why Not |
|----------|-------------|-------------|---------|
| Build tool | Vite 8 | Vite 6 (docs) | Vite 6 sin patches, Vite 8 es Rolldown-powered |
| Router | TanStack Router | React Router v7 | TanStack es type-safe de verdad, search params como state, mejor DX |
| Charts | Recharts | Nivo, Tremor | shadcn/ui chart components wrappean Recharts. Cambiar solo si hay issues con React 19 |
| Animations | motion | CSS animations only | motion necesario para count-up de numeros y layout animations complejas |
| State | TanStack Query | Zustand, Redux | No hay client state complejo. Server state es todo lo que necesitamos |
| ORM | supabase-js + types | Prisma, Drizzle | Constraint del proyecto: logica en DB functions, no ORM |
| CSS | Tailwind v4 | Tailwind v3 | v4 es CSS-first, @theme nativo, mejor DX |
## Installation (corregido)
# En la raiz del monorepo
# Core dependencies (apps/web)
# Build
# Routing & State
# Styling
# shadcn/ui (init + components)
# Additional UI
# Supabase
# CLI (apps/cli)
# Monorepo
# Testing
## Dependencias que NO instalar
| Paquete | Razon |
|---------|-------|
| `framer-motion` | Renombrado a `motion` |
| `tailwindcss-animate` | Deprecado, usar `tw-animate-css` |
| `prisma` / `drizzle-orm` | Constraint: logica en DB functions |
| `zustand` / `redux` | TanStack Query cubre server state, no hay client state complejo |
| `next` | Constraint: SPA con Vite, no SSR |
| `axios` | Supabase client maneja todas las requests |
## Flags para monitorear durante desarrollo
## Sources
- [Vite 8 Release](https://vite.dev/blog/announcing-vite8) - HIGH confidence
- [shadcn/ui Tailwind v4 Guide](https://ui.shadcn.com/docs/tailwind-v4) - HIGH confidence
- [Motion (ex-Framer Motion)](https://motion.dev/docs/react-upgrade-guide) - HIGH confidence
- [TanStack Router Releases](https://github.com/TanStack/router/releases) - HIGH confidence
- [Supabase API Keys Discussion](https://github.com/orgs/supabase/discussions/29260) - HIGH confidence
- [Recharts React 19 Issues](https://github.com/recharts/recharts/issues/6857) - MEDIUM confidence
- [tw-animate-css](https://github.com/Wombosvideo/tw-animate-css) - HIGH confidence
- [Turborepo Bun Support](https://turborepo.dev/blog/turbo-2-6) - HIGH confidence
<!-- GSD:stack-end -->

<!-- GSD:conventions-start source:CONVENTIONS.md -->
## Conventions

### UI Components
- Components in `apps/web/src/components/{feature}/` (dashboard, transactions, debts, patrimonio, etc.)
- Hooks in `apps/web/src/hooks/` — one per data concern (use-accounts, use-debts, use-fintual, etc.)
- TanStack Query for all server state — no local state for server data
- shadcn/ui components in `apps/web/src/components/ui/`
- Tailwind v4 CSS-first config in `apps/web/src/app.css`

### Financial Logic
- Savings to Fintual = `transfer` type (not expense) — doesn't affect delta
- Debt payments = `debt_payment` type — doesn't affect accumulated
- Recurring charges via `recurring_charges` table + `daily-charges` cron: `auto_charge` distinguishes automatic vs. manual; catch-up by month with ledger-based dedup (`transactions.metadata.recurring_charge_id`); managed with `bal recurring` and reconciled at `bal balance`
- Fintual integration (optional): API at `https://fintual.cl/api/real_assets/{id}/days`, shares stored in account metadata
- Account balances updated directly for off-budget accounts (no adjustment transactions)
- Opening balance calibrated via `adjustment` with category `apertura`

### Account Types in UI
- "Tengo" = debit + cash + credit_card (grouped by bank)
- "Me deben" = receivable (with inline add/archive)
- "Debo" = payable (with inline add/archive)
- Off-budget: investment, property (shown in Patrimonio only)
- Bank grouping: accounts sharing a bank keyword in their name are grouped together in the UI (see `BANK_MAPPINGS` in `apps/web/src/routes/_authenticated/index.tsx`)

### Deploy
- Web: Vercel (zero-config Vite SPA) — auto-deploy from main branch
- DB: Supabase (project ref: YOUR_PROJECT_REF)
- `supabase db push` for migrations, `vercel --prod` or push to main for frontend
- Environment: VITE_SUPABASE_URL + VITE_SUPABASE_ANON_KEY in Vercel env vars
<!-- GSD:conventions-end -->

<!-- GSD:architecture-start source:ARCHITECTURE.md -->
## Architecture

### Database (25 migrations)
- Enums, profiles, categories, accounts (Phase 1)
- Transactions, audit_log, primitives, operations (Phase 2)
- Reconciliation view, categories CRUD, RLS + audit triggers (Phase 2)
- Account operations, debts, error_log (Phase 2-3)
- Debt primitives/operations, transfers, receivables (Phase 3)
- Snapshots, views (active_debts, credit_card_status, monthly_summary) (Phase 3)
- Complete onboarding function, recurring_charges table (Phase 4+)

### Web App Pages
- `/` — Dashboard (Cuadrar): patrimonio hero, distribution bar, bank-grouped accounts, receivables, payables
- `/movimientos` — Balance chart, cuadrar panel (disponible/comprometido/delta), filters (category pills + type pills), grouped transaction list
- `/deudas` — Active debts with progress bars, payment tracking
- `/patrimonio` — Net worth with Stocks/Propiedades filters, time range (1y/2y/5y/total), trend chart, distribution pie, Fintual live sync
- `/spa` — SpA module behind feature flag
- `/configuracion` — Account management (CRUD by type), recurring charges management

### Integrations
- Fintual API: real-time fund prices (configure fund IDs per account metadata)
- Edge Function `daily-charges`: cron for auto-registering recurring charges + debt payments
<!-- GSD:architecture-end -->

<!-- GSD:workflow-start source:GSD defaults -->
## GSD Workflow Enforcement

Before using Edit, Write, or other file-changing tools, start work through a GSD command so planning artifacts and execution context stay in sync.

Use these entry points:
- `/gsd:quick` for small fixes, doc updates, and ad-hoc tasks
- `/gsd:debug` for investigation and bug fixing
- `/gsd:execute-phase` for planned phase work

Do not make direct repo edits outside a GSD workflow unless the user explicitly asks to bypass it.
<!-- GSD:workflow-end -->

<!-- GSD:profile-start -->
## Developer Profile

> Profile not yet configured. Run `/gsd:profile-user` to generate your developer profile.
> This section is managed by `generate-claude-profile` -- do not edit manually.
<!-- GSD:profile-end -->
