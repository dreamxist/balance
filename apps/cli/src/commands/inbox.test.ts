import { describe, expect, it } from 'vitest'
import { renderInboxList } from './inbox'
import { renderRules } from './rules'
import { renderSyncSummary } from './sync'
import type { CategorizationRule, EmailMovement, GmailSyncSummary, UncategorizedTransaction } from '@balance/core'

function tx(partial: Partial<UncategorizedTransaction>): UncategorizedTransaction {
  return {
    id: 't1', user_id: 'u1', account_id: 'a1', type: 'expense', amount: 33333,
    description: 'Compra sin categorizar', category: null, entity: 'personal',
    date: '2026-07-10', debt_id: null, transfer_to: null, metadata: {},
    created_at: '2026-07-10T00:00:00Z',
    ...partial,
  } as UncategorizedTransaction
}

function staging(partial: Partial<EmailMovement>): EmailMovement {
  return {
    id: 'm1', user_id: 'u1', gmail_message_id: 'g1', source: 'bancochile_tc',
    amount: 2379, currency: 'USD', counterparty: null, merchant: 'OPENAI',
    account_hint: '1234', email_date: '2026-07-08T09:00:00Z', bank_tx_id: null,
    status: 'pending', transaction_id: null, raw_snippet: null, error_detail: null,
    created_at: '2026-07-08T09:00:00Z',
    ...partial,
  } as EmailMovement
}

describe('renderInboxList', () => {
  it('renders empty inbox message', () => {
    expect(renderInboxList([], [])).toContain('inbox vacío')
  })

  it('marks uncategorized income and shows staging status', () => {
    const out = renderInboxList(
      [tx({}), tx({ id: 't2', type: 'income', amount: 200000, description: 'Transferencia recibida' })],
      [staging({}), staging({ id: 'm2', status: 'error', error_detail: 'no account matches hint "9999"' })],
    )
    expect(out).toContain('Sin categoría (2):')
    expect(out).toContain('[INGRESO]')
    expect(out).toContain('Staging (2):')
    expect(out).toContain('US$23.79')
    expect(out).toContain('no account matches hint')
  })
})

describe('renderRules', () => {
  it('renders empty state with hint', () => {
    expect(renderRules([])).toContain('bal rules add')
  })

  it('renders pattern, category, priority and id', () => {
    const out = renderRules([
      { id: 'r1', user_id: 'u1', pattern: 'CRUNCHYROLL', category: 'consumo.entretencion', priority: 10, created_at: '' } as CategorizationRule,
    ])
    expect(out).toMatch(/CRUNCHYROLL\s+consumo\.entretencion\s+10\s+r1/)
  })
})

describe('renderSyncSummary', () => {
  const summary: GmailSyncSummary = {
    mode: 'user', since: '2026-07-01T00:00:00.000Z',
    fetched: 12, parsed: 9, ignored: 3, staged_errors: 1, usd_rate: null,
    promoted: 8, pending: 1, errors: 1, skipped_existing: 2, failures: ['fetch x: 500'],
  }

  it('renders counters, duplicates, usd warning and failures', () => {
    const out = renderSyncSummary(summary)
    expect(out).toContain('Sync desde 2026-07-01')
    expect(out).toMatch(/correos nuevos\s+12/)
    expect(out).toMatch(/promovidos\s+8/)
    expect(out).toMatch(/duplicados\s+2/)
    expect(out).toContain('sin tipo de cambio USD')
    expect(out).toContain('! fetch x: 500')
  })

  it('omits duplicates line when zero', () => {
    const out = renderSyncSummary({ ...summary, skipped_existing: 0, usd_rate: 912.5, failures: [] })
    expect(out).not.toContain('duplicados')
    expect(out).not.toContain('sin tipo de cambio')
  })
})
