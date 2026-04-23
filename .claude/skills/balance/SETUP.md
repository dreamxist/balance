# Setup — cómo habilitar este skill en un vault/entorno nuevo

Este archivo es para el **agente que instala el skill** (ej: Claude en el vault de Obsidian) y para el **usuario** que configura el entorno.

## Requisitos del entorno

El host donde corra `bal` necesita:

- Node 22+ (probado con 22.22.0)
- Acceso a red saliente hacia:
  - `*.supabase.co` (API + Edge Functions)
  - `fintual.cl` (opcional, solo si se agregan features de Fintual)
- Repo `balance-app` clonado localmente (para correr el CLI con `npx tsx apps/cli/src/index.ts ...` si no está instalado globalmente)

## Env vars que el usuario debe configurar

Solo nombres — el usuario pone los valores en su entorno.

| Nombre | Scope | Rol |
|---|---|---|
| `SUPABASE_URL` | requerido | URL del proyecto Supabase (sin barra final). Acepta también `VITE_SUPABASE_URL`. |
| `SUPABASE_ANON_KEY` | requerido | Publishable key / anon key del proyecto. Acepta también `VITE_SUPABASE_ANON_KEY`. |
| `BAL_API_KEY` | recomendado | API key (`bal_...`) para `bal login` sin prompt. Generada vía `bal key create`. |
| `BAL_EMAIL` | solo para `bal key ...` | Email de la cuenta Balance. Alternativa al flag `--email`. |
| `BAL_PASSWORD` | solo para `bal key ...` | Password. Preferí env var sobre flag para no dejar rastro en historial. |
| `BAL_SESSION_FILE` | opcional | Ruta alternativa al archivo de sesión. Default: `~/.balance/session.json`. |

## Portar el skill a un vault de Obsidian

El vault se sincroniza por Git. Claude Code descubre skills en `.claude/skills/<name>/SKILL.md`. Hay dos opciones:

### Opción A — el vault y el repo son uno solo
Si el vault **ES** este repo (o un worktree/clone), no hay nada que copiar. El skill ya está en `.claude/skills/balance/`.

### Opción B — el vault es un repo Git separado
Copiar el directorio completo al vault:

```
<vault>/.claude/skills/balance/
├── SKILL.md
├── COMMANDS.md
├── WORKFLOWS.md
├── EXAMPLES.md
└── SETUP.md
```

Comando sugerido desde la raíz del vault:

```bash
# ajustar la ruta del repo balance-app origen
cp -R /path/to/balance-app/.claude/skills/balance .claude/skills/balance
git add .claude/skills/balance
git commit -m "feat(skills): add balance skill for bal CLI"
```

Después del primer sync, Claude Code (CLI, web, móvil) descubre el skill automáticamente cuando abre ese repo/vault.

## Verificación — pasos para confirmar que quedó bien

1. Setear env vars (ver tabla arriba). Mínimo `SUPABASE_URL` y `SUPABASE_ANON_KEY`.
2. Generar API key una vez (pide email+password):
   ```
   npx tsx /path/to/balance-app/apps/cli/src/index.ts key create --name "<device>"
   ```
   Guardar el valor `bal_...` que imprime. Va a ser el `BAL_API_KEY`.
3. Exportar `BAL_API_KEY` y correr:
   ```
   npx tsx /path/to/balance-app/apps/cli/src/index.ts login
   npx tsx /path/to/balance-app/apps/cli/src/index.ts balance
   ```
4. Si `balance` imprime `Delta $0 [green]` y las cuentas, el CLI está bien.
5. Abrir una sesión nueva de Claude Code en el vault. Preguntarle algo típico: "¿cuánto tengo?". Claude debería activar el skill y correr `bal balance --json`.

## Troubleshooting

| Síntoma | Causa probable | Fix |
|---|---|---|
| `Missing SUPABASE_URL ... env var` | Env no exportada en el shell de Claude | Configurar en el entorno del agente (settings → environment variables) |
| `login failed (401): Invalid API key` | Key revocada o mal copiada | Regenerar con `bal key create`, revocar la vieja |
| `Session expired. Run bal login again` | Refresh token inválido | `bal login --api-key $BAL_API_KEY` |
| `No account matches "..."` | Match fuzzy falla | Usar uuid o un fragmento más específico del nombre |
| Claude no activa el skill | `description` en SKILL.md no matchea el prompt | Editar SKILL.md y agregar keywords que uses |
