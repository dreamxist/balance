#!/usr/bin/env node
/**
 * Read-only smoke tests for the bal CLI.
 *
 * Runs each non-mutating command against the configured Supabase, verifies
 * exit code 0, and validates JSON output where applicable.
 *
 * Usage:
 *   export SUPABASE_URL=...
 *   export SUPABASE_ANON_KEY=...
 *   # a valid session must exist (bal login) OR export BAL_API_KEY=...
 *   npm run smoke --workspace apps/cli
 *
 * This script NEVER creates, updates, or deletes data. Mutating commands
 * (add, transfer, undo, debt pay, etc.) are not exercised here — they are
 * covered by unit tests on their pure helpers.
 */
import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const cliEntry = resolve(__dirname, '..', 'dist', 'index.js')

if (!existsSync(cliEntry)) {
  console.error(`✗ build artifact not found: ${cliEntry}`)
  console.error('  run `npm run build` first')
  process.exit(1)
}

/** @typedef {{ name: string, args: string[], expectJson?: 'array' | 'object' | 'any', allowError?: boolean }} Check */

/** @type {Check[]} */
const checks = [
  { name: 'version', args: ['--version'] },
  { name: 'help', args: ['--help'] },
  { name: 'balance', args: ['balance', '--json'], expectJson: 'object' },
  { name: 'list (week)', args: ['list', '--period', 'week', '--json'], expectJson: 'array' },
  { name: 'list (month, multi-type)', args: ['list', '--period', 'month', '--type', 'income,expense', '--json'], expectJson: 'array' },
  { name: 'list (custom range)', args: ['list', '--date-from', '2020-01-01', '--date-to', '2020-01-02', '--json'], expectJson: 'array' },
  { name: 'account list', args: ['account', 'list', '--json'], expectJson: 'array' },
  { name: 'debt list', args: ['debt', 'list', '--json'], expectJson: 'array' },
  { name: 'category list', args: ['category', 'list', '--json'], expectJson: 'array' },
  { name: 'recurring list', args: ['recurring', 'list', '--json'], expectJson: 'array' },
  { name: 'snapshot list', args: ['snapshot', 'list', '--limit', '1', '--json'], expectJson: 'array' },
  { name: 'fintual sync (dry-run)', args: ['fintual', 'sync', '--dry-run', '--json'], expectJson: 'object' },
  { name: 'spa dashboard', args: ['spa', 'dashboard', '--json'], expectJson: 'object' },
]

function runCheck(check) {
  const started = Date.now()
  const result = spawnSync(process.execPath, [cliEntry, ...check.args], {
    encoding: 'utf8',
    env: process.env,
    timeout: 30_000,
  })
  const ms = Date.now() - started

  if (result.status !== 0) {
    return {
      ok: false,
      ms,
      reason: `exit ${result.status}: ${(result.stderr || result.stdout).trim().slice(0, 200)}`,
    }
  }

  if (check.expectJson) {
    let parsed
    try {
      parsed = JSON.parse(result.stdout)
    } catch (err) {
      return { ok: false, ms, reason: `invalid JSON: ${(err instanceof Error ? err.message : String(err)).slice(0, 120)}` }
    }
    if (check.expectJson === 'array' && !Array.isArray(parsed)) {
      return { ok: false, ms, reason: `expected JSON array, got ${typeof parsed}` }
    }
    if (check.expectJson === 'object' && (Array.isArray(parsed) || typeof parsed !== 'object' || parsed === null)) {
      return { ok: false, ms, reason: `expected JSON object, got ${Array.isArray(parsed) ? 'array' : typeof parsed}` }
    }
  }

  return { ok: true, ms }
}

let passed = 0
let failed = 0
const failures = []

for (const check of checks) {
  const result = runCheck(check)
  const marker = result.ok ? '✓' : '✗'
  const suffix = result.ok ? `${result.ms}ms` : result.reason
  process.stdout.write(`${marker} ${check.name.padEnd(32)} ${suffix}\n`)
  if (result.ok) passed++
  else {
    failed++
    failures.push({ name: check.name, reason: result.reason })
  }
}

process.stdout.write(`\n${passed}/${checks.length} passed\n`)
if (failed > 0) {
  process.stdout.write(`\n${failed} failure(s):\n`)
  for (const f of failures) {
    process.stdout.write(`  ${f.name}: ${f.reason}\n`)
  }
  process.exit(1)
}
