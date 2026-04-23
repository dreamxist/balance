# Balance — Design System

---

## 1. Brand Identity

### Personality
- Premium but approachable (not corporate banking)
- Calm, confident, precise
- The app feels like a well-crafted tool, not a colorful toy
- Reference: Mercury's restraint + Copilot Money's polish

### Design Principles

1. **El numero ES la interfaz** — Tipografia grande para cifras, labels minimos
2. **Color como informacion** — Verde (cuadrado), ambar (pendiente), rojo (descuadrado)
3. **Calm by default, powerful on demand** — Progressive disclosure agresivo
4. **Light mode first** — Base clara, limpia, con dark mode como alternativa
5. **Keyboard-first** — Cmd+K para toda accion, shortcuts para navegacion

### Logo
- Wordmark: "Balance" in Geist Sans bold
- Icon: Abstract equals sign (=) — represents equilibrium/delta=0
- Usage: wordmark in nav bar, icon as favicon and mobile app icon

### Voice & Tone
- Direct, no fluff
- Numbers speak for themselves
- Labels are descriptive, not clever
- Spanish UI, English for code/technical terms

---

## 2. Design Tokens

### Colors

Light mode (primary):
```
--bg-primary:     #FAFAFA
--bg-card:        #FFFFFF
--bg-elevated:    #FFFFFF
--bg-muted:       #F4F4F5

--text-primary:   #09090B
--text-secondary: #71717A
--text-muted:     #A1A1AA

--border-subtle:  #E4E4E7
--border-default: #D4D4D8

--green-50:       #F0FDF4   (background tint)
--green-500:      #22C55E   (cuadrado, positive)
--green-600:      #16A34A   (cuadrado hover)

--amber-50:       #FFFBEB
--amber-500:      #F59E0B   (pendiente, warning)

--red-50:         #FEF2F2
--red-500:        #EF4444   (descuadrado, negative)

--accent:         #18181B   (primary buttons, inverted)
--accent-hover:   #27272A
```

Dark mode:
```
--bg-primary:     #09090B
--bg-card:        #18181B
--bg-elevated:    #1C1C1E
--bg-muted:       #27272A

--text-primary:   #FAFAFA
--text-secondary: #A1A1AA
--text-muted:     #71717A

--border-subtle:  #27272A
--border-default: #3F3F46
```

### Typography

Font stack:
```
--font-sans:  'Geist Sans', system-ui, -apple-system, sans-serif
--font-mono:  'Geist Mono', 'SF Mono', 'Fira Code', monospace
```

Scale (based on Tailwind defaults):
```
--text-xs:    0.75rem / 1rem      (12px — metadata, timestamps)
--text-sm:    0.875rem / 1.25rem  (14px — labels, secondary text)
--text-base:  1rem / 1.5rem       (16px — body, account items)
--text-lg:    1.125rem / 1.75rem  (18px — section headers)
--text-xl:    1.25rem / 1.75rem   (20px — card titles)
--text-2xl:   1.5rem / 2rem       (24px — subtotals per bucket)
--text-3xl:   1.875rem / 2.25rem  (30px — page titles)
--text-4xl:   2.25rem / 2.5rem    (36px — hero number, patrimonio)
--text-5xl:   3rem / 1            (48px — onboarding hero)
```

Usage rules:
- ALL money amounts: Geist Mono, tabular-nums, font-variant-numeric: tabular-nums
- Labels and body: Geist Sans
- Never mix: a number and its label should have clear font distinction

### Spacing

8px base grid:
```
--space-0:   0
--space-1:   0.25rem  (4px)
--space-2:   0.5rem   (8px)
--space-3:   0.75rem  (12px)
--space-4:   1rem     (16px)
--space-5:   1.25rem  (20px)
--space-6:   1.5rem   (24px)
--space-8:   2rem     (32px)
--space-10:  2.5rem   (40px)
--space-12:  3rem     (48px)
--space-16:  4rem     (64px)
```

Card padding: space-5 (20px) on desktop, space-4 (16px) on mobile
Section gaps: space-6 (24px)
Page padding: space-6 (24px) desktop, space-4 (16px) mobile

### Border Radius
```
--radius-sm:   6px    (inputs, small buttons)
--radius-md:   8px    (cards, dropdowns)
--radius-lg:   12px   (modals, popovers)
--radius-xl:   16px   (onboarding cards, hero sections)
--radius-full: 9999px (pills, avatars, badges)
```

### Shadows
```
--shadow-sm:   0 1px 2px rgba(0,0,0,0.05)
--shadow-md:   0 4px 6px -1px rgba(0,0,0,0.07), 0 2px 4px -2px rgba(0,0,0,0.05)
--shadow-lg:   0 10px 15px -3px rgba(0,0,0,0.08), 0 4px 6px -4px rgba(0,0,0,0.04)
```

Usage: Cards have no shadow by default (border-based). Shadows for elevated elements (modals, dropdowns, command palette). Subtle shadow on hover for interactive cards.

### Motion
```
--ease-out:      cubic-bezier(0.16, 1, 0.3, 1)     (spring-like, for elements entering)
--ease-in-out:   cubic-bezier(0.45, 0, 0.55, 1)     (smooth, for transitions)

--duration-fast:     100ms   (button press, hover)
--duration-normal:   200ms   (tab switch, card expand)
--duration-slow:     300ms   (number count-up, page transition)
--duration-emphasis: 500ms   (delta reaching 0, snapshot save)
```

Micro-interactions reference:

| Elemento | Animacion | Duracion |
|----------|-----------|----------|
| Numeros al cambiar saldo | Count-up/down animado | 300ms |
| Tab switching | View Transitions API (morph) | 200ms |
| Card expand/collapse | Height + opacity | 200ms ease-out |
| Snapshot guardado | Flash verde en delta | 400ms |
| Delta llega a 0 | Pulse verde + check | 500ms |
| Skeleton loading | Shimmer | loop |

---

## 3. Components

### 3.1 Navigation Bar (top)

Desktop:
```
┌─────────────────────────────────────────────────────────────┐
│  Balance              ◉ Cuadrar  Movimientos  SpA  Patrimonio  │
│  [= icon]                                                    │
│                                               [⌘K]    [FZ ◯]│
└─────────────────────────────────────────────────────────────┘
```
- Height: 56px
- Border bottom: 1px border-subtle
- Logo left, tabs center, actions right
- Active tab: text-primary + bottom indicator (2px, accent)
- Inactive tab: text-secondary, hover: text-primary

Tabs:
- **Cuadrar**: Balance assertion + reconciliacion (pantalla principal)
- **Movimientos**: Registro de transacciones con filtros
- **SpA**: Modulo empresa (facturas, IVA, utilidades)
- **Patrimonio**: Net worth total (liquido + inversiones + propiedades)

Mobile:
```
┌──────────────────────────────────┐
│  Balance  [= icon]        [◯ FZ]│
├──────────────────────────────────┤
│  ◉ Cuadrar | Movimientos | SpA | Patrimonio │  <- horizontal scroll
└──────────────────────────────────┘
```
- Two rows: logo bar (48px) + tab bar (44px)
- Tabs scroll horizontally if they overflow
- No hamburger menu — everything is in tabs + command palette

### 3.2 Money Display

Large (hero/total):
```
$ 700,000
  ^ Geist Mono, text-4xl, bold, text-primary
  Formatted with thousand separator (dot in CLP, comma in USD)
```

Medium (subtotal per bucket):
```
$ 200,000
  ^ Geist Mono, text-2xl, semibold, text-primary
```

Small (account row):
```
Checking A          $ 500,000
  ^ Geist Sans sm       ^ Geist Mono base, text-right, tabular-nums
```

Negative amounts:
```
-$ 50,000
  ^ text-red-500 (always red for debts, regardless of context)
```

Positive change:
```
+50,000 (↑5.9%)
  ^ text-green-500
```

### 3.3 Card

Base card:
```css
bg-card
border border-subtle
rounded-md (8px)
padding: space-5
```

States:
- Default: border-subtle
- Hover (interactive): shadow-sm + border-default (subtle lift)
- Active/Selected: border-accent
- Disabled: opacity-50

Bento card (variable size): Same base, but spans grid columns:
- span-1: single column (account detail)
- span-2: double column (patrimonio hero)
- span-3: full width (history table)

### 3.4 Bucket Card (Tengo / Me Deben / Debo)

```
┌────────────────────────────────┐
│  Tengo                    ↗    │  <- label: text-sm, text-muted
│                                │     arrow: green for positive, red for negative
│  $ 600,000                   │  <- Geist Mono, text-2xl, semibold
│                                │
│  Checking A              $ 500,000   │  <- account rows
│  Checking A                $ 80,000   │     right-aligned tabular nums
│  Bank B                    $ 0   │
│  Efectivo           $ 10,000   │
│                                │
│  [+ Cuenta]                    │  <- text-sm, text-muted, hover: text-primary
└────────────────────────────────┘
```

Account row:
- Height: 40px (touch target)
- Padding: space-2 horizontal
- Hover: bg-muted
- Click: inline edit of balance
- Name: text-sm, Geist Sans, truncate if long
- Amount: text-base, Geist Mono, tabular-nums, right-aligned

Account card detail (within a bucket):
```
┌────────────────────────────┐
│  Checking A              │  <- nombre cuenta
│  $ 500,000               │  <- saldo actual (editable inline)
│  Actualizado hace 2 dias   │  <- metadata
└────────────────────────────┘
```

- Click en el saldo abre input inline para actualizar
- Swipe left (mobile) o hover (desktop) muestra acciones: editar, eliminar

### 3.5 Delta Indicator

```
States:
  ● $0         -> green-500 dot + "Cuadrado" text-green-500
  ● $12,500    -> amber-500 dot + amount text-amber-500
  ● -50,000  -> red-500 dot + amount text-red-500
```

The dot is 8px, rounded-full. Positioned left of the number. The text below says "Cuadrado" / "Pendiente" / "Descuadrado" in text-xs text-muted.

When delta reaches 0: pulse animation (scale 1->1.2->1, opacity 0.8->1) on the dot, 500ms.

### 3.6 Input Fields

```
┌──────────────────────────┐
│  $ 180,000               │
└──────────────────────────┘
  ^ border border-default
    rounded-sm (6px)
    padding: space-2 space-3
    font: Geist Mono for amounts
    focus: ring-2 ring-accent/20 border-accent
```

Inline edit (click on amount to edit):
- Amount text transforms into input
- No visible border change, just cursor appears
- Escape cancels, Enter saves
- Auto-format thousands as you type

### 3.7 Button

Primary:
```css
bg-accent text-white rounded-sm px-4 py-2
hover: bg-accent-hover
active: scale(0.98)
font: text-sm font-medium
```

Secondary:
```css
bg-transparent border border-default text-primary rounded-sm px-4 py-2
hover: bg-muted
```

Ghost (text only):
```css
text-secondary hover:text-primary
hover: bg-muted rounded-sm
padding: space-1 space-2
```

Destructive:
```css
bg-red-500 text-white rounded-sm
hover: bg-red-600
```

### 3.8 Command Palette (Cmd+K)

```
┌──────────────────────────────────────────────┐
│  [Q] Buscar o ejecutar...                     │
├──────────────────────────────────────────────┤
│  Recientes                                    │
│  > Registrar movimiento          ⌘N          │
│  > Guardar snapshot              ⌘S          │
│                                               │
│  Navegacion                                   │
│  > Ir a Cuadrar                  ⌘1          │
│  > Ir a Movimientos              ⌘2          │
│  > Ir a SpA                      ⌘3          │
│  > Ir a Patrimonio               ⌘4          │
│                                               │
│  Acciones                                     │
│  > Actualizar saldo                          │
│  > Nueva cuenta                              │
│  > Buscar transaccion                        │
└──────────────────────────────────────────────┘
```

- Overlay: bg-black/50 backdrop-blur-sm
- Panel: bg-card shadow-lg rounded-lg max-w-lg mx-auto mt-[20vh]
- Input: no border, text-lg, autofocus
- Items: hover:bg-muted, text-sm, keyboard navigable
- Groups: text-xs text-muted uppercase tracking-wider
- Shortcuts: text-xs text-muted, mono font

### 3.9 Transaction Row

Desktop:
```
┌─────┬────────────────┬──────────────┬──────────┬──────────┐
│ 28  │ Arriendo       │ ● Necesidad  │ Checking A       │ +$225K   │
│ mar │                │              │          │          │
└─────┴────────────────┴──────────────┴──────────┴──────────┘
```

- Height: 48px (touch target for mobile)
- Date: text-xs text-muted, 40px width
- Description: text-sm text-primary, truncate
- Category: text-xs, colored dot (category color) + text
- Account: text-xs text-muted
- Amount: Geist Mono text-sm, right-aligned
  - Positive: text-green-500
  - Negative: text-primary (expenses are "normal", don't highlight)
  - Refund: text-green-500 with "~" prefix
  - Debt payment: text-muted with ">" prefix

Mobile transaction row:
```
┌──────────────────────────────────┐
│  Arriendo                +$225K  │
│  28 mar . Necesidad . Checking A        │
└──────────────────────────────────┘
```
- Two lines: description+amount top, metadata bottom
- Swipe left: Edit | Delete
- Tap: open detail view

### 3.10 Snapshot Row

```
Mar 2026    650,000    ● Cuadrado    [ver detalle]
```

- Height: 44px
- Date: text-sm text-primary, fixed width
- Amount: Geist Mono text-sm
- Status: delta indicator (dot + label)
- Action: ghost button, hover visible only

### 3.11 Bottom Sheet (mobile actions)

For quick transaction entry, transfers, account updates on mobile:

```
┌──────────────────────────────────┐
│  ━━━━━  (drag handle)            │
│                                  │
│  Registrar movimiento            │
│                                  │
│  $ [____________]                │
│  ...                             │
└──────────────────────────────────┘
```

- Slides up from bottom with spring animation
- Drag to dismiss or expand
- backdrop: bg-black/30
- Sheet: bg-card rounded-t-xl
- Handle: 32px x 4px, bg-muted, centered

### 3.12 Toast Notifications

```
┌──────────────────────────────────────┐
│  OK  Movimiento registrado  (-$150K) │
│     [Deshacer]                       │
└──────────────────────────────────────┘
```

- Position: bottom-center on mobile, bottom-right on desktop
- Auto-dismiss: 5 seconds
- bg-card shadow-lg border border-subtle rounded-lg
- Undo action for reversible operations

---

## 4. Screen Layouts

### 4.1 Cuadrar (pantalla principal)

Vista principal. El usuario ve su posicion financiera y la cuadra.

Desktop (4 cols, bento grid):
```
┌──────────────────────────────────┬────────────────┐
│                                  │                │
│  Patrimonio liquido              │    Delta       │
│  $ 700,000                     │    $ 0  ●      │
│                                  │                │
│  vs anterior: +50,000 (↑5.9%)  │  Cuadrado      │
│                                  │                │
├────────────────┬─────────────────┼────────────────┤
│ Tengo          │ Me deben        │ Debo           │
│                │                 │                │
│ $ 600,000    │ $ 200,000     │ -$ 80,000     │
│                │                 │                │
│ Checking A  500,000│ Friend A   100,000 │ CC Visa   -50,000│
│ Checking B  200,000│ Friend B    50,000 │ CC Master -30,000│
│ Cash         20,000│                    │ Loan Demo -60,000│
│                    │                    │                  │
│ [+ Cuenta]     │ [+ Deudor]      │ [+ Deuda]      │
└────────────────┴─────────────────┴────────────────┘

- - - Historial de snapshots - - -

Mar 2026   650,000   ● Cuadrado    [ver detalle]
Feb 2026   550,000   ● Cuadrado    [ver detalle]
Ene 2026   400,000   ● Cuadrado    [ver detalle]
```

Mobile (1 col):
```
┌──────────────────────────┐
│  Patrimonio liquido      │
│  $ 700,000             │
│  Delta: $0 ● Cuadrado   │
├──────────────────────────┤
│  Tengo        600,000 │  <- tap expande detalle
├──────────────────────────┤
│  Me deben     200,000 │  <- tap expande detalle
├──────────────────────────┤
│  Debo          -80,000 │  <- tap expande detalle
├──────────────────────────┤
│  Historial               │
│  Mar  650,000  ●      │
│  Feb  550,000  ●      │
└──────────────────────────┘
```

### 4.2 Movimientos

Lista de transacciones con filtros. Registro rapido inline.

Desktop:
```
┌──────────────────────────────────────────────────┐
│  Marzo 2026                    [< mes >] [filtro]│
│                                                   │
│  Ingresos     $2,285,000    ████████████████      │
│  Gastos      -$1,707,950    ██████████████        │
│  Balance       $577,050                           │
│                                                   │
│  ┌─────┬────────────┬───────────┬────────┬──────┐│
│  │ 28  │ Arriendo   │ Necesidad │ Checking A     │+225K ││
│  │ 25  │ Bencina    │ Necesidad │ Checking A    │-150K ││
│  │ 22  │ Clothing demo  │ Consumo   │ CC Mastercard│ -30K ││
│  │ 20  │ Client Corp    │ Ingreso   │ Checking A     │  +2M ││
│  │ 18  │ Tatuaje    │ Consumo   │ Efect  │ -80K ││
│  │ ...                                          ││
│  └─────┴────────────┴───────────┴────────┴──────┘│
│                                                   │
│  [+ Registrar movimiento]                         │
└──────────────────────────────────────────────────┘
```

Mobile:
```
┌──────────────────────────────────┐
│  Abril 2026           [<] [>] [≡]│
├──────────────────────────────────┤
│  Ingresos    $2,285,000          │
│  Gastos     -$1,707,950          │
│  ─────────────────────           │
│  Balance      $577,050           │
├──────────────────────────────────┤
│  28 mar                          │
│  ┌──────────────────────────────┐│
│  │ Arriendo             +$225K  ││
│  │ Necesidad . Checking A               ││
│  ├──────────────────────────────┤│
│  │ Bencina              -$150K  ││
│  │ Necesidad . Checking A              ││
│  └──────────────────────────────┘│
│  25 mar                          │
│  ┌──────────────────────────────┐│
│  │ Clothing demo             -$30K  ││
│  │ Consumo . CC Mastercard            ││
│  └──────────────────────────────┘│
└──────────────────────────────────┘
                             [+ O]
```

### 4.3 SpA

Modulo empresa. Separado de personal pero visible en el mismo app.

```
┌──────────────────────────────┬───────────────────┐
│  Saldo SpA Checking           │  IVA prox. dia 20 │
│  $ 300,000                 │  $ 285,000        │
│                              │                   │
├──────────────────────────────┼───────────────────┤
│  Facturas emitidas           │  Gastos empresa   │
│                              │                   │
│  Client Corp  Abr  $2M neto +IVA│  Claude   $45,000 │
│  Client2  Mar  $500K    pago │  Render   $12,000 │
│                              │  Entel    $25,000 │
│                              │                   │
├──────────────────────────────┴───────────────────┤
│  Utilidades acumuladas 2026:  $3,200,000         │
│  ████████████████████░░░░░░  Meta: $8,000,000    │
└──────────────────────────────────────────────────┘
```

### 4.4 Patrimonio

Net worth total con desglose y tendencia historica.

```
┌──────────────────────────────────────────────────┐
│  Patrimonio total                                 │
│  $ 56,642,500                                     │
│                                                   │
│  ┌──────────────────────────────────────────┐    │
│  │  Grafico de tendencia 2017-2026          │    │
│  │  ___/‾‾‾\____/‾‾‾‾‾‾‾‾‾‾↗              │    │
│  └──────────────────────────────────────────┘    │
│                                                   │
│  ┌──────────┐ ┌──────────┐ ┌──────────────┐     │
│  │ Liquido  │ │Inversiones│ │ Propiedades  │     │
│  │  $1.1M   │ │  $14.5M  │ │   $35M       │     │
│  │  2.0%    │ │  25.6%   │ │   61.8%      │     │
│  └──────────┘ └──────────┘ └──────────────┘     │
└──────────────────────────────────────────────────┘
```

### 4.5 Login

Desktop:
```
┌──────────────────────────────────────────────────┐
│                                                   │
│              Balance                              │
│              [= icon]                             │
│                                                   │
│         ┌──────────────────────┐                 │
│         │                      │                 │
│         │  Inicia sesion       │                 │
│         │                      │                 │
│         │  Email [__________]  │                 │
│         │  Pass  [__________]  │                 │
│         │                      │                 │
│         │  [Entrar]            │                 │
│         │                      │                 │
│         │  No tienes cuenta?   │                 │
│         │  Crear cuenta        │                 │
│         └──────────────────────┘                 │
│                                                   │
└──────────────────────────────────────────────────┘
```

Centered card, max-w-sm, minimal.

### 4.6 Onboarding (primer ingreso)

Flujo de 5 pasos. El usuario puede completarlo en menos de 2 minutos.
Solo los pasos 2 y 3 son necesarios para que el primer balance cuadre.

```
Paso 1: Signup

┌──────────────────────────────────────────┐
│  Balance                                  │
│                                           │
│  Crea tu cuenta                           │
│                                           │
│  Email     [____________________]         │
│  Password  [____________________]         │
│                                           │
│           [Crear cuenta]                  │
│                                           │
│  Ya tienes cuenta? Inicia sesion          │
└──────────────────────────────────────────┘
```

```
Paso 2: Cuanto tienes

┌──────────────────────────────────────────┐
│  Bienvenido a Balance                     │
│                                           │
│  Cuanta plata tienes hoy?                │
│  (suma todo: cuentas, efectivo, lo que sea)│
│                                           │
│  $ [____________]                         │
│                                           │
│  □ Quiero separar por cuenta              │
│    (puedes hacerlo despues tambien)       │
│                                           │
│                        [Continuar ->]     │
└──────────────────────────────────────────┘

Si marca "separar por cuenta":

┌──────────────────────────────────────────┐
│  Agrega tus cuentas                       │
│                                           │
│  [Checking A    ] $ [________]  [x]     │
│  [Bank A     ] $ [________]  [x]     │
│  [Efectivo        ] $ [________]  [x]     │
│                                           │
│  [+ Agregar cuenta]                       │
│                                           │
│                        [Continuar ->]     │
└──────────────────────────────────────────┘
```

```
Paso 3: Debes algo

┌──────────────────────────────────────────┐
│  Tienes deudas?                           │
│  (tarjetas de credito, cuotas, prestamos) │
│                                           │
│  O No debo nada                           │
│  O Si, debo aproximadamente:             │
│    $ [____________]                       │
│                                           │
│  □ Quiero detallar mis deudas             │
│                                           │
│                        [Continuar ->]     │
└──────────────────────────────────────────┘
```

```
Paso 4: Perfil (opcional)

┌──────────────────────────────────────────┐
│  Un par de cosas mas                      │
│                                           │
│  Nombre      [______________]             │
│  Telefono    [______________] (opcional)  │
│                                           │
│  Cual es tu situacion?                    │
│  (selecciona lo que aplique)              │
│                                           │
│  □ Tengo una empresa (SpA, EIRL, etc)    │
│  □ Tengo inversiones (fondos, acciones)  │
│  □ Arriendo una propiedad                │
│  □ Pago impuestos trimestrales           │
│                                           │
│                        [Empezar ->]       │
└──────────────────────────────────────────┘
```

```
Paso 5: Dashboard listo

┌──────────────────────────────────────────┐
│  Listo! Tu balance inicial:               │
│                                           │
│  Tienes:    600,000                    │
│  Debes:      -80,000                    │
│  Patrimonio: $3,287,584                   │
│  Delta:      $0  ● Cuadrado              │
│                                           │
│  Recomendado para ti:                     │
│  -> Activa el modulo SpA                  │
│  -> Agrega tus inversiones en Patrimonio  │
│  -> Detalla tus cuentas y deudas          │
│                                           │
│          [Ir al dashboard]                │
└──────────────────────────────────────────┘
```

Notas de diseno del onboarding:
- Transiciones suaves entre pasos (View Transitions API)
- Numeros con count-up animado en el paso 5
- El paso 4 es skippable (boton "Saltar" en la esquina)
- Las recomendaciones del paso 5 se generan segun lo que selecciono en paso 4

### 4.7 Settings

```
┌──────────────────────────────────────────────────┐
│  Settings                                         │
│                                                   │
│  Perfil                                           │
│  ┌──────────────────────────────────────────────┐│
│  │  Nombre     [Jane Doe    ] [Guardar] ││
│  │  Email      francisco@email.com   (no edit)  ││
│  │  Telefono   [+56 9 1234 5678     ] [Guardar] ││
│  └──────────────────────────────────────────────┘│
│                                                   │
│  Modulos activos                                  │
│  ┌──────────────────────────────────────────────┐│
│  │  [x] SpA (empresa)                           ││
│  │  [x] Inversiones (off-budget)                ││
│  │  [ ] Arriendo                                ││
│  │  [ ] Impuestos                               ││
│  └──────────────────────────────────────────────┘│
│                                                   │
│  API Keys                                         │
│  ┌──────────────────────────────────────────────┐│
│  │  openclaw              bal_sk_a3f8...         ││
│  │  Creado: Mar 15, 2026  Ultimo uso: hace 2h   ││
│  │                              [Revocar]        ││
│  ├──────────────────────────────────────────────┤│
│  │  CLI laptop            bal_sk_7b2e...         ││
│  │  Creado: Abr 1, 2026   Ultimo uso: hace 5min ││
│  │                              [Revocar]        ││
│  └──────────────────────────────────────────────┘│
│                                                   │
│  [+ Crear API Key]                                │
│                                                   │
│  ┌──────────────────────────────────────────────┐│
│  │  Nueva API Key                                ││
│  │                                               ││
│  │  Nombre: [________________]                   ││
│  │                                               ││
│  │  ! La key solo se mostrara una vez.           ││
│  │  Copiala antes de cerrar este dialogo.        ││
│  │                                               ││
│  │            [Crear]  [Cancelar]                 ││
│  └──────────────────────────────────────────────┘│
│                                                   │
│  Categorias                                       │
│  [tree of categories, editable]                   │
│                                                   │
│  Tema                                             │
│  (x) Light   ( ) Dark   ( ) System               │
│                                                   │
│  Zona peligrosa                                   │
│  [Exportar datos]  [Cerrar sesion]               │
└──────────────────────────────────────────────────┘
```

### 4.8 Debt Detail (click on a debt from Debo bucket)

```
┌──────────────────────────────────────────────────┐
│  <- Sneakers Demo                               │
│                                                   │
│  Total:        $180,000                           │
│  Cuotas:       6 de 10,000                       │
│  Pagadas:      2 / 6                              │
│  Restante:     $120,000                           │
│  Proxima:      Mayo 2026                          │
│                                                   │
│  ████████░░░░░░░░░░░░░░  33%                     │
│                                                   │
│  Historial de cuotas                              │
│  ┌──────┬──────────┬─────────┐                   │
│  │ 1/6  │ Mar 2026 │ 10,000 │ OK Pagada        │
│  │ 2/6  │ Abr 2026 │ 10,000 │ OK Pagada        │
│  │ 3/6  │ May 2026 │ 10,000 │ O  Pendiente     │
│  │ 4/6  │ Jun 2026 │ 10,000 │ O  Pendiente     │
│  │ 5/6  │ Jul 2026 │ 10,000 │ O  Pendiente     │
│  │ 6/6  │ Ago 2026 │ 10,000 │ O  Pendiente     │
│  └──────┴──────────┴─────────┘                   │
│                                                   │
│  Cuenta: CC Mastercard                                  │
│  Categoria: Consumo > Ropa                        │
│                                                   │
│  [Pagar cuota]  [Pagar todo]  [Archivar]         │
└──────────────────────────────────────────────────┘
```

### 4.9 Snapshot Detail (click from history)

```
┌──────────────────────────────────────────────────┐
│  <- Snapshot Mar 2026                  ● Cuadrado│
│                                                   │
│  Patrimonio:    650,000                        │
│  vs anterior:   +$543,288 (↑14%)                 │
│                                                   │
│  Cuentas al momento del cierre:                   │
│  ┌──────────────────────────────────────────────┐│
│  │  Checking A              500,000                   ││
│  │  Checking A                80,000                   ││
│  │  Efectivo            $10,000                  ││
│  │  CC Visa            -50,000                  ││
│  │  CC Mastercard           -30,000                  ││
│  └──────────────────────────────────────────────┘│
│                                                   │
│  Resumen del mes                                  │
│  Ingresos:    $2,285,000                          │
│  Gastos:     -$1,707,950                          │
│  Balance:      $577,050                           │
│                                                   │
│  Distribucion:                                    │
│  Necesidades   45%  ████████████████              │
│  Consumo       32%  ██████████████                │
│  Ahorro        23%  ██████████                    │
└──────────────────────────────────────────────────┘
```

### 4.10 Component Modals

#### Formulario rapido de movimiento

Modal o drawer desde bottom. Minimo de campos:

```
┌──────────────────────────────────┐
│  Registrar movimiento            │
│                                  │
│  $ [________]                    │
│                                  │
│  Categoria   [Necesidad    v]    │
│  Cuenta      [Checking A           v]    │
│  Descripcion [______________]    │
│                                  │
│  O Personal   O SpA              │
│                                  │
│            [Guardar]             │
└──────────────────────────────────┘
```

#### Agregar cuenta (modal)

```
┌──────────────────────────────────┐
│  Agregar cuenta              [x] │
│                                  │
│  Nombre       [______________]   │
│  Tipo         [Debito        v]  │
│  Subtipo      [Cuenta corriente] │
│  Entidad      [O Personal O SpA] │
│  Moneda       [CLP          v]   │
│  Saldo inicial  $ [________]     │
│                                  │
│  -- Solo para TC --              │
│  Cupo total     $ [________]     │
│                                  │
│  -- Solo para inversiones --     │
│  [ ] No reconciliable (off-budget)│
│                                  │
│            [Guardar]             │
└──────────────────────────────────┘
```

#### Compra en cuotas (formulario transaccion)

```
┌──────────────────────────────────┐
│  Registrar movimiento            │
│                                  │
│  $ [________]   monto total      │
│                                  │
│  Categoria   [Consumo > Ropa v]  │
│  Cuenta      [CC Mastercard       v]   │
│  Descripcion [Sneakers Demo ]  │
│                                  │
│  [x] Compra en cuotas            │
│  ┌──────────────────────────┐    │
│  │ Cuotas    [6        ]    │    │
│  │ Valor cuota  10,000     │    │ <- calculado automatico
│  │ Primera cuota  Mar 2026  │    │
│  │ Ultima cuota   Ago 2026  │    │
│  └──────────────────────────┘    │
│                                  │
│  O Personal   O SpA              │
│                                  │
│            [Guardar]             │
└──────────────────────────────────┘
```

#### Transferencia entre cuentas

```
┌──────────────────────────────────┐
│  Transferencia                   │
│                                  │
│  $ [________]                    │
│                                  │
│  Desde   [Checking A (debito)     v]    │
│           Saldo: 80,000         │
│                                  │
│       |                          │
│       v                          │
│                                  │
│  Hacia   [CC Mastercard          v]    │
│           Deuda: -30,000       │
│                                  │
│  Nota    [Pago TC marzo    ]     │
│                                  │
│  O Misma entidad                 │
│  O SpA -> Personal               │
│  O Personal -> SpA               │
│                                  │
│            [Transferir]          │
└──────────────────────────────────┘
```

---

## 5. Empty States

Lo que el usuario ve en primer uso o cuando no hay datos.

### Primera vez (sin cuentas)

```
┌──────────────────────────────────────────────────┐
│                                                   │
│            Bienvenido a Balance                   │
│                                                   │
│  Para empezar, agrega tus cuentas con su saldo   │
│  actual. No necesitas historial — arrancamos      │
│  desde hoy.                                       │
│                                                   │
│  ┌────────┐ ┌────────┐ ┌────────┐               │
│  │ Debito │ │   TC   │ │Efectivo│               │
│  └────────┘ └────────┘ └────────┘               │
│                                                   │
│           [Agregar primera cuenta]                │
│                                                   │
└──────────────────────────────────────────────────┘
```

### Sin movimientos (cuentas creadas, sin transacciones)

```
┌──────────────────────────────────────────────────┐
│  Marzo 2026                                       │
│                                                   │
│  No hay movimientos este mes.                     │
│                                                   │
│  Registra tu primer gasto o ingreso para          │
│  empezar a trackear tu flujo mensual.             │
│                                                   │
│           [+ Registrar movimiento]                │
│                                                   │
└──────────────────────────────────────────────────┘
```

### Sin snapshots (nunca ha cuadrado)

```
┌──────────────────────────────────────────────────┐
│  Historial de snapshots                           │
│                                                   │
│  Aun no has cuadrado tu primer mes.               │
│  Cuando quieras, actualiza tus saldos reales      │
│  y guarda un snapshot para tener un punto de      │
│  referencia.                                      │
│                                                   │
│           [Ir a Cuadrar]                          │
│                                                   │
└──────────────────────────────────────────────────┘
```

---

## 6. Mobile Patterns

### Navigation (mobile)
- Tab bar scrolls horizontally
- Active tab indicator slides with animation
- Settings accessible via avatar tap (top right)
- Command palette replaced by search icon (top bar)

### Quick Actions (mobile)
- FAB (floating action button) bottom-right: "+" for quick transaction
- Tap FAB -> bottom sheet with transaction form
- Long press FAB -> shows quick options (transaction, transfer, update balance)

### Gestures
- Swipe left on transaction row -> Edit | Delete actions
- Swipe down on Cuadrar -> refresh balances
- Swipe between tabs (horizontal)
- Pull down on lists -> refresh data

### Mobile-specific layouts

Cuadrar mobile (expanded):
```
┌──────────────────────────────────┐
│  Balance  [=]              [FZ O]│
│  Cuadrar | Movimientos | SpA |..│
├──────────────────────────────────┤
│                                  │
│  Patrimonio liquido              │
│  $ 700,000                     │
│  ● Cuadrado . delta $0           │
│                                  │
├──────────────────────────────────┤
│  Tengo                 600,000│
│  ┌──────────────────────────────┐│
│  │ Checking A            $ 500,000    ││
│  │ Checking A              $ 80,000    ││
│  │ Efectivo          $ 10,000   ││
│  └──────────────────────────────┘│
│  [+ Cuenta]                      │
├──────────────────────────────────┤
│  Me deben              200,000│
│  > Tap para expandir             │
├──────────────────────────────────┤
│  Debo                   -80,000│
│  > Tap para expandir             │
├──────────────────────────────────┤
│  Snapshots                       │
│  Mar  650,000  ●              │
│  Feb  550,000  ●              │
└──────────────────────────────────┘
                             [+ O] <- FAB
```

Movimientos mobile:
```
┌──────────────────────────────────┐
│  Abril 2026           [<] [>] [≡]│
├──────────────────────────────────┤
│  Ingresos    $2,285,000          │
│  Gastos     -$1,707,950          │
│  ─────────────────────           │
│  Balance      $577,050           │
├──────────────────────────────────┤
│  28 mar                          │
│  ┌──────────────────────────────┐│
│  │ Arriendo             +$225K  ││
│  │ Necesidad . Checking A               ││
│  ├──────────────────────────────┤│
│  │ Bencina              -$150K  ││
│  │ Necesidad . Checking A              ││
│  └──────────────────────────────┘│
│  25 mar                          │
│  ┌──────────────────────────────┐│
│  │ Clothing demo             -$30K  ││
│  │ Consumo . CC Mastercard            ││
│  └──────────────────────────────┘│
└──────────────────────────────────┘
                             [+ O]
```

---

## 7. Keyboard Shortcuts

Global:
```
Cmd+K       Command palette
Cmd+1-4     Navigate tabs (Cuadrar, Movimientos, SpA, Patrimonio)
Cmd+N       New transaction
Cmd+S       Save snapshot (when on Cuadrar)
Cmd+T       New transfer
Escape      Close modal/sheet/palette
```

In lists:
```
j/k         Navigate up/down
Enter       Open/select item
e           Edit selected
d           Delete selected (with confirmation)
```

---

## 8. Responsive Breakpoints

```
xs:   < 640px    Phone portrait (single column, bottom sheet actions)
sm:   640-767px  Phone landscape / small tablet
md:   768-1023px Tablet (2 columns, side-by-side buckets)
lg:   1024-1279px Laptop (3 columns, bento grid)
xl:   >= 1280px  Desktop (4 columns, full bento grid)
```

Grid system:
- xs-sm: 1 column, full width, stacked cards
- md: 2 columns, 50/50 or 60/40
- lg: 3 columns
- xl: 4 columns (patrimonio span-3, delta span-1, buckets 3xspan-1)

---

## 9. Tailwind v4 Theme Config

Implementacion concreta de los design tokens en Tailwind v4 (CSS-first):

```css
/* apps/web/src/app.css */
@import "tailwindcss";

@theme {
  /* Background */
  --color-bg-primary: #FAFAFA;
  --color-bg-card: #FFFFFF;
  --color-bg-muted: #F4F4F5;

  /* Text */
  --color-text-primary: #09090B;
  --color-text-secondary: #71717A;
  --color-text-muted: #A1A1AA;

  /* Border */
  --color-border-subtle: #E4E4E7;
  --color-border-default: #D4D4D8;

  /* Semantic */
  --color-income: #16A34A;
  --color-expense: #09090B;
  --color-positive: #22C55E;
  --color-warning: #F59E0B;
  --color-negative: #EF4444;

  /* Accent */
  --color-accent: #18181B;
  --color-accent-hover: #27272A;

  /* Radius */
  --radius-sm: 6px;
  --radius-md: 8px;
  --radius-lg: 12px;
  --radius-xl: 16px;
  --radius-full: 9999px;

  /* Fonts */
  --font-sans: 'Geist', system-ui, -apple-system, sans-serif;
  --font-mono: 'Geist Mono', 'SF Mono', 'Fira Code', monospace;

  /* Animation */
  --ease-out: cubic-bezier(0.32, 0.72, 0, 1);
  --duration-fast: 150ms;
  --duration-normal: 200ms;
  --duration-slow: 400ms;
  --duration-emphasis: 600ms;
}

/* Dark mode */
@variant dark (&:is(.dark *)) {
  --color-bg-primary: #09090B;
  --color-bg-card: #18181B;
  --color-bg-muted: #27272A;
  --color-text-primary: #FAFAFA;
  --color-text-secondary: #A1A1AA;
  --color-text-muted: #71717A;
  --color-border-subtle: #27272A;
  --color-border-default: #3F3F46;
  --color-expense: #FAFAFA;
}
```

---

## 10. Stack

| Layer | Technology | Why |
|-------|-----------|-----|
| Framework | Vite 6 + React 19 | SPA rapido, no necesita SSR |
| Styling | Tailwind CSS v4 | CSS-first config, @theme nativo |
| Typography | Geist Sans + Geist Mono | Vercel's font, excelente para numeros |
| Components | shadcn/ui (Radix primitives) | Customizable, no vendor lock-in |
| Animations | motion (framer-motion v12) | Numbers count-up, layout transitions |
| Transitions | View Transitions API | Native browser, zero JS overhead |
| Charts | Recharts | Patrimonio historico, distribucion |
| Command palette | cmdk | Paco Coursey, lightweight |
| Bottom sheets | vaul | Web-native bottom sheets |
| Toasts | sonner | Integrated with shadcn |
| Date picker | react-day-picker | Integrated with shadcn |
| State | TanStack Query + TanStack Router | Type-safe routing + server state |
| Backend | Supabase (auth, DB, realtime) | PostgreSQL + RLS + auto API |
| Deploy | Vercel | Zero config for Vite |

### Install commands

```bash
# Core
npm create vite@latest apps/web -- --template react-ts
cd apps/web

# Styling
npm install tailwindcss@next @tailwindcss/vite
npm install geist  # Geist fonts

# shadcn/ui (init + components)
npx shadcn@latest init
npx shadcn@latest add button card input dialog dropdown-menu
npx shadcn@latest add toast sonner  # notifications
npx shadcn@latest add command       # cmdk wrapper

# Additional UI
npm install cmdk vaul framer-motion recharts
npm install @tanstack/react-query @tanstack/react-router

# Supabase
npm install @supabase/supabase-js
```
