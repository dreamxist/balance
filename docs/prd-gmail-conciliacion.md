# PRD — Conciliación automática vía Gmail + unificación de buckets

**Objetivo:** el balance se actualiza solo, 2×/día, leyendo los correos bancarios del Gmail del usuario. Los gastos se clasifican automáticamente en `consumo` / `necesidad` / `ahorro`; lo desconocido y TODOS los ingresos quedan "por categorizar" para revisión manual. Los números de buckets deben ser idénticos en web, CLI y cualquier otra superficie (hoy no lo son).

**Modo de trabajo:** este PRD se ejecuta en un loop autónomo. Cada iteración: (1) leer el checklist de progreso al final, (2) tomar la primera tarea incompleta, (3) implementarla con sus tests, (4) verificar, (5) marcar el checkbox y commitear. No saltarse fases. Si una tarea está bloqueada por un paso manual del usuario, marcarla `[BLOCKED: razón]` y seguir con la siguiente no bloqueada.

---

## Contexto técnico (verificado)

- Patrón a replicar para cron: `supabase/functions/daily-charges/index.ts` — auth por `CRON_SECRET` (fail-closed) o JWT de usuario; opera con service role; delega a RPC SECURITY DEFINER que usa primitives (`_insert_transaction`, `_update_account_balance`) porque el cron corre con `auth.uid() = NULL`. `create_transaction` exige `auth.uid() = owner`, NO usarla desde el cron.
- Patrón de dedup existente: `transactions.metadata->>'recurring_charge_id'` con índice parcial (ver `supabase/migrations/20260627120000_recurring_auto_manual_catchup.sql:46`).
- Categorías (seed): padres `necesidad`, `consumo`, `ahorro`, `ingreso`, `deuda`, `transfer` con subcategorías `necesidad.*`, `consumo.*`, `ahorro.inversion`, `ingreso.sueldo`, etc. `transactions.category` es `text` nullable — **NULL = por categorizar**.
- Transacciones inmutables (sin UPDATE/DELETE); montos en enteros CLP; RLS deny-by-default con `(select auth.uid())`; vistas con `security_invoker = true`; tests pgTAP en `supabase/tests/`.
- CLI `bal`: comandos en `apps/cli/src/commands/`, cliente autenticado por JWT en `apps/cli/src/lib/client.ts`, wrappers RPC en `packages/core/src/`.

### Fuentes de correo (verificadas en el Gmail real del usuario, 90 días)

| Sender | Subject | Datos | Mapeo |
|---|---|---|---|
| `enviodigital@bancochile.cl` | "Compra con Tarjeta de Crédito" | monto ($X.XXX o US$YY,YY), TC ****NNNN, comercio, dd/mm/yyyy hh:mm en una frase | `expense` en cuenta TC BCh |
| `serviciodetransferencias@bancochile.cl` | "Comprobante de Pago" | pago de servicios (ej. FONASA) desde cta. corriente | `expense` en cta. corriente BCh |
| `serviciodetransferencias@bancochile.cl` | "Transferencia a Terceros" / "Transferencias de Fondos a …" | tabla HTML: monto, cuenta origen (1122334455), destinatario, RUT, banco, ID único `TEF_…` | `expense`/`transfer` según destino |
| `serviciodetransferencias@bancochile.cl` | "Aviso de transferencia de fondos" | transferencia recibida de tercero | `income` |
| `serviciodetransferencias@bancochile.cl` | "Pago de Tarjeta de Crédito Nacional/Internacional" | pago mensual TC | según modelo (no afecta accumulated) |
| `reply@info.bice.cl` | "Hicimos la transferencia" / "Recibiste una transferencia" | monto, cta. corriente BICE 7654321, contraparte | `expense`/`transfer`/`income` |
| `reply@info.bice.cl` | "Confirmación del pago de tarjeta de crédito" | pago TC BICE Visa Gold ****NNNN | pago TC |
| `info@mercadopago.com` | "Tu transferencia fue enviada" | monto, beneficiario, banco y nº cuenta destino | `expense`/`transfer` |
| `no-reply@tenpo.cl` | "Comprobante de transferencia - Tenpo" | transferencia recibida, monto, remitente | `income` |
| `contacto@bci.cl` | "Aviso de transferencia de fondos" | SpA (EJEMPLO SPA), origen/destino con RUT | entity `spa` |

Ruido a excluir por sender/subject: `info.bci.cl`, `beneficiosbice@`, `a.mercadolibre.cl`, `noreply@mercadopago.com` (encuestas), cartolas y estados de cuenta (PDF con clave). Gaps conocidos y aceptados: compras con TC BICE ****NNNN no generan correo; compras con débito no generan correo.

### Bug de buckets (arreglar en Fase 0, es prerequisito)

`apps/web/src/hooks/use-monthly-breakdown.ts` calcula los buckets en el frontend: (a) todo lo que no matchea `necesidad*`/`consumo*`/`ahorro*` — incluida categoría NULL y `deuda` — cae en **consumo** silenciosamente; (b) no filtra `entity`; (c) el cálculo no existe en DB, así que CLI/skills reproducen su propia versión y los números divergen (usuario vio Consumo $A en CLI vs $B en web el mismo día). Con la ingesta automática (que crea transacciones con category NULL a propósito) el bucket Consumo se corrompería más.

---

## Decisiones de diseño (ya tomadas con el usuario — NO reabrir)

1. **Recategorización**: nueva RPC `set_transaction_category(p_transaction_id, p_category)` — única mutación permitida sobre transactions, SOLO el campo `category`, valida ownership y que la categoría exista, registra en `audit_log`. Monto/tipo/fecha/cuenta siguen inmutables.
2. **Compras TC en USD**: se registran de inmediato en CLP con tipo de cambio del día (fuente: `https://mindicador.cl/api/dolar` o similar sin API key), `metadata.fx_estimated = true` y `metadata.original_usd_cents`. El ajuste fino ocurre cuando el usuario cuadre con el estado de cuenta.
3. **Revisión**: panel "Por categorizar" en web (`/movimientos`) + comando `bal inbox` en CLI.
4. **Clasificación**: gastos → regla → `consumo.*`/`necesidad.*`/`ahorro.*`; sin regla → `category = NULL`. Ingresos → SIEMPRE `category = NULL` (el usuario decide si es `ingreso.sueldo`, etc.). Nunca adivinar categoría de un ingreso.
5. **Buckets**: fuente única en DB. Lo NULL se reporta como bucket propio `por_categorizar`, jamás dentro de consumo.

---

## Fase 0 — Única fuente de verdad para buckets

**Entregable:** función DB `get_monthly_buckets(p_month date default null, p_entity entity_type default 'personal')` que retorna jsonb: `{ income, necesidades, consumo, ahorro, por_categorizar, disponible, month }`.

Semántica canónica:
- Ventana: mes calendario de `p_month` (default: mes actual).
- `income` = suma de `type = 'income'` del mes (entity filtrada).
- Gastado por bucket = `expense` suma, `refund` resta, agrupado por prefijo de `category` (`necesidad%`, `consumo%`, `ahorro%`).
- `category IS NULL` o prefijo no reconocido → bucket `por_categorizar` (los `adjustment` no entran a buckets).
- `transfer` con categoría `ahorro%` cuenta en bucket ahorro (convención existente: ahorro a Fintual = transfer). Verificar contra los datos reales que el Ahorro del mes actual cuadre con esta regla; si en los datos el ahorro está registrado como expense, la regla igual lo captura por prefijo.
- `disponible` = income − (necesidades + consumo + ahorro + por_categorizar).
- SECURITY INVOKER o filtro por `(select auth.uid())` — respetar RLS.

Tareas:
- Migración con la función + tests pgTAP que cubran: refund resta, NULL va a por_categorizar, entity spa excluida por default, transfer ahorro cuenta, mes vacío retorna ceros.
- `packages/core/src/reconciliation.ts` (o archivo nuevo `buckets.ts`): wrapper `getMonthlyBuckets()` con tipos.
- Reescribir `use-monthly-breakdown.ts` para consumir la RPC (eliminar el cálculo local). El dashboard debe mostrar el segmento "Por categorizar" (color neutro) en la barra de distribución cuando sea > 0, y disponible negativo debe verse correcto (hoy muestra "un disponible negativo · 0%").
- Nuevo comando `bal buckets [--month YYYY-MM] [--entity] [--json]` que llama al mismo wrapper — este es el output canónico para skills/sesiones.
- Tests vitest para el wrapper y el comando.

**Criterio de aceptación:** `bal buckets --json` y el dashboard muestran números idénticos para el mismo mes/entity, y una transacción sin categoría aparece en `por_categorizar`, no en consumo.

## Fase 1 — Schema de ingesta

**Entregables (migración + pgTAP):**
- Tabla `email_movements`: `id uuid pk`, `user_id`, `gmail_message_id text unique not null`, `source text` (enum-check: `bancochile_tc | bancochile_pago | bancochile_transfer_out | bancochile_transfer_in | bancochile_pago_tc | bice_transfer_out | bice_transfer_in | bice_pago_tc | mp_transfer_out | tenpo_transfer_in | bci_spa`), `amount bigint`, `currency text check in ('CLP','USD')`, `counterparty text`, `merchant text`, `account_hint text` (nº cuenta o últimos 4 de tarjeta del correo), `email_date timestamptz`, `bank_tx_id text` (ej. `TEF_…`), `status text check in ('pending','promoted','discarded','error') default 'pending'`, `transaction_id uuid` (fk a transactions cuando promoted), `raw_snippet text`, `error_detail text`, `created_at`. RLS: owner-only, deny by default. Índice parcial en status='pending'.
- Tabla `categorization_rules`: `id`, `user_id`, `pattern text` (match case-insensitive por `position(pattern in merchant)`), `category text references categories(id)`, `priority int default 0`, `created_at`. RLS owner-only. Seed inicial para el usuario vía migración de datos NO — en su lugar `bal rules add` (Fase 4) y un seed sugerido documentado: CRUNCHYROLL/DISNEY/PLAYSTATION/CINEMARK/APPLE.COM→`consumo.entretencion`, COPEC/PARKING→`necesidad.transporte`, FONASA/SEGURO→`necesidad.salud`, RENDER/KAPSO/SUPERWHISPER→`consumo.tech`, FINTUAL→`ahorro.inversion`.
- Mapeo cuenta: usar `accounts.metadata` para registrar identificadores (`bank_account_numbers: []`, `card_last4`). El matching de `account_hint` → `account_id` se hace contra esto.
- RPC `set_transaction_category(p_transaction_id uuid, p_category text)` (decisión 1) + pgTAP (ownership, categoría inexistente falla, audit_log escribe).
- RPC `promote_email_movements(p_user_id uuid)` SECURITY DEFINER: recorre `pending`, aplica reglas de clasificación (abajo), crea transacciones vía primitives con `metadata.gmail_message_id` + `metadata.source`, índice parcial de dedup como el de recurring, marca `promoted`/`error`. Idempotente: correr dos veces no duplica (pgTAP).

Reglas de clasificación dentro de `promote_email_movements`:
1. Si `bank_tx_id` o `gmail_message_id` ya existe en metadata de transactions → skip (dedup).
2. Transferencia saliente cuyo destino matchea una cuenta propia (por `account_hint`/nº cuenta en `accounts.metadata`) → `transfer` entre cuentas; si existe el correo espejo entrante (mismo monto, ±1 día, par out/in) marcar ambos staging con la misma transacción.
3. Compra TC / pago servicio → `expense`; categoría por `categorization_rules` (mayor priority gana); sin match → NULL.
4. Transferencia saliente a Fintual/Fintoc→Fintual → `transfer` + `ahorro.inversion`.
5. Transferencia entrante de tercero → `income`, category NULL siempre.
6. Pago de TC → `transfer` hacia la cuenta credit_card (revisar cómo el modelo actual registra pagos TC — seguir `docs/workflows.md`).
7. Fuente `bci_spa` → `entity = 'spa'`, category NULL.
8. USD → convertir con tipo de cambio inyectado como parámetro (`p_usd_rate numeric`), `metadata.fx_estimated = true`, `metadata.original_usd_cents`. Si no hay rate disponible → dejar `pending` (no error).

## Fase 2 — Edge Function `gmail-sync`

**Entregable:** `supabase/functions/gmail-sync/index.ts` siguiendo el esqueleto de `daily-charges`:
- Auth: `CRON_SECRET` (fail-closed) o JWT de usuario (para `bal sync` manual).
- Secrets: `GMAIL_CLIENT_ID`, `GMAIL_CLIENT_SECRET`, `GMAIL_REFRESH_TOKEN` (OAuth2 de Google, scope `gmail.readonly`). Refrescar access token contra `https://oauth2.googleapis.com/token`.
- Query Gmail: `users.messages.list` con `q` = senders conocidos + `after:{último sync}` (persistir watermark en tabla `sync_state` o en `profiles.metadata`), luego `messages.get` (format full) por id.
- Parsers puros en `supabase/functions/gmail-sync/parsers.ts`: una función por fuente (regex sobre texto/HTML), retornan el shape de `email_movements` o `null`. **Los parsers deben ser funciones puras testeables**; incluir fixtures reales anonimizados en `supabase/functions/gmail-sync/parsers.test.ts` (correr con `deno test`) usando los formatos documentados arriba (frase de compra TC BCh, tabla HTML de transferencia BCh, correo MP, Tenpo, BICE, BCI).
- Correo que matchea sender pero no parsea → fila en `email_movements` con `status='error'` + `error_detail` (nunca silencioso).
- Obtener `p_usd_rate` de mindicador.cl (con fallback: si falla, pasar NULL y los USD quedan pending).
- Al final llama `promote_email_movements` y retorna resumen `{fetched, parsed, promoted, pending, errors}`.
- **Paso manual del usuario (documentar en `docs/setup-gmail.md`, no bloquea el resto):** crear proyecto Google Cloud, OAuth client (tipo Desktop), correr script one-shot `scripts/gmail-auth.ts` (entregable) que imprime la URL de consentimiento y captura el refresh token; `supabase secrets set`. Programar pg_cron 2×/día (11:00 y 23:00 UTC) via dashboard, igual que daily-charges.

## Fase 3 — Superficies de revisión

- Web: sección "Por categorizar" en `/movimientos` — lista transacciones `category IS NULL` del usuario + staging `pending`/`error`; asignar categoría llama `set_transaction_category`; checkbox "recordar regla para {merchant}" → insert en `categorization_rules`. Reusar pills de categoría existentes. Los `income` sin categoría destacados (el usuario decide sueldo/freelance/otro).
- CLI: `bal inbox` interactivo (patrón de `reconcileRecurringInteractive` en `bal balance`): recorre pendientes, ofrece categorías numeradas + "recordar regla" + skip + descartar staging. `bal rules list|add|rm` para gestionar `categorization_rules`. `bal sync` dispara `gmail-sync` con JWT.
- Wrappers en `packages/core/src/` para todo lo nuevo (named exports, sin `any`).

## Fase 4 — Deploy y cierre

- `supabase db push` a stage primero (MCP `supabase-stage` disponible), luego prod (`supabase-prod`), deploy de `gmail-sync`, secrets, cron en dashboard (manual usuario).
- Regenerar tipos: `supabase gen types typescript --local > packages/core/src/types.ts`.
- Actualizar `docs/architecture.md` (tablas/funciones nuevas) y `docs/workflows.md` (flujo de conciliación por correo). Actualizar la skill `balance` (`~/home/brain/.claude/skills/balance/`) para que cualquier reporte de buckets use `bal buckets --json` como única fuente.
- Backfill opcional: `bal sync --since 2026-06-01` para cargar histórico (con dedup contra transacciones manuales existentes vía monto+fecha+cuenta → si hay colisión probable, dejar en staging `pending` con nota, no duplicar).

---

## Restricciones globales (respetar SIEMPRE)

- Lógica de negocio en PL/pgSQL (migraciones), NUNCA en apps/web ni apps/cli. Frontend/CLI solo llaman RPCs.
- Transacciones y snapshots inmutables; única excepción: `set_transaction_category` (solo category, con audit).
- Montos en enteros (CLP pesos, USD centavos). Jamás floats en dinero.
- RLS deny-by-default en tablas nuevas, `(select auth.uid())`, vistas con `security_invoker = true`.
- TypeScript strict, sin `any`, named exports, `function` declarations top-level.
- Commits en inglés, convencionales (`feat(db):`, `feat(functions):`, `fix(web):`…), uno por tarea lógica.

## Verificación por iteración del loop

```bash
supabase start && supabase db reset        # aplica migraciones + seed
supabase test db                           # pgTAP
npm run build                              # turbo build (web + cli + core)
npx vitest run                             # unit tests core/web/cli
deno test supabase/functions/gmail-sync/   # parsers (desde Fase 2)
```

Todo verde antes de marcar el checkbox y commitear. Si `supabase start` no está disponible en el entorno, marcar la verificación DB como `[SKIPPED-ENV]` en el checklist y NO marcarla completa.

## Checklist de progreso (el loop marca aquí)

### Fase 0 — Buckets
- [x] Migración `get_monthly_buckets` + pgTAP
- [x] Wrapper core `getMonthlyBuckets` + tests
- [x] `use-monthly-breakdown.ts` consume RPC; barra muestra "Por categorizar"; disponible negativo bien renderizado
- [x] `bal buckets` + tests
- [x] Verificación cruzada: web y CLI idénticos (local: mismo JSON en wrapper web y `bal buckets --json`; NULL cayó en por_categorizar)

### Fase 1 — Schema
- [x] Migración `email_movements` + `categorization_rules` + RLS + pgTAP
- [x] RPC `set_transaction_category` + pgTAP
- [x] RPC `promote_email_movements` (todas las reglas 1-8) + pgTAP de idempotencia y dedup

### Fase 2 — gmail-sync
- [x] Parsers puros + fixtures + deno tests (las 10 fuentes)
- [x] Edge function completa (auth, watermark, fx, promote, resumen)
- [x] `scripts/gmail-auth.ts` + `docs/setup-gmail.md`

### Fase 3 — Revisión
- [x] Panel web "Por categorizar" (categorizar + recordar regla)
- [x] `bal inbox`, `bal rules`, `bal sync` + tests
- [x] Wrappers core completos

### Fase 4 — Cierre
- [x] Deploy (directo a **prod** con ok del usuario — stage sigue pausado): 7 migraciones aplicadas (incl. huérfana `20260628120000` recuperada al repo y matcher currency-aware por TC ****NNNN compartida), `gmail-sync` desplegada `--no-verify-jwt` (auth propia fail-closed, verificado 401), metadata de cuentas configurado, `CRON_SECRET`+`GMAIL_USER_ID` seteados, pg_cron `gmail-sync-am/pm` 11:00/23:00 UTC
- [x] Docs actualizados (architecture, workflows, skill balance)
- [x] `[MANUAL]` OAuth Google: client Desktop creado (`<gcloud-project>`), refresh token capturado con `scripts/gmail-auth.ts`, secrets configurados — sistema ACTIVO
- [x] Backfill histórico con dedup (`bal sync --since 2026-07-01`: 40 correos → 32 movimientos promovidos, 0 errores tras ajustar parsers a formatos reales; junio disponible con `--since 2026-06-01` si se quiere más historia)
