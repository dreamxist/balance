// Pure mapping from Fintoc Movements API objects to email_movements rows.
//
// Fintoc movements replace the Banco de Chile checking-account emails, so they
// reuse those bancochile_* sources and promote_email_movements books them with
// the same rules. Amount conventions match the email parsers: staged amounts
// are positive integers; the source carries the direction.
//
// Descriptions observed on a real Banco de Chile personas checking account:
//   "Pago:<comercio>"                        debit-card purchase (or reversal when > 0)
//   "Traspaso De:<nombre>" / "Traspaso A:<nombre>"   transfers in / out
//   "Cargo Por Pago Tc"                      automatic payment of the national card
//   "Pago Tarjeta De Credito"                payment of the international card (CLP)
//   "Transferencia Desde Linea De Credito" / "Amortizacion A Linea De Credito"
//                                            line-of-credit principal (not modeled)
//   "Giro Cajero Automatico" / "Giro De Emergencia"   cash withdrawals

import { normalizeAccountNumber } from '../gmail-sync/parsers.ts'

export interface FintocCounterpartyAccount {
  holder_id?: string | null
  holder_name?: string | null
  number?: string | null
}

export interface FintocMovement {
  id: string
  description: string | null
  amount: number
  currency: string
  post_date: string
  type?: string | null
  recipient_account?: FintocCounterpartyAccount | null
  sender_account?: FintocCounterpartyAccount | null
}

export type FintocSource =
  | 'bancochile_pago'
  | 'bancochile_transfer_out'
  | 'bancochile_transfer_in'
  | 'bancochile_pago_tc'

export interface StagedMovement {
  gmail_message_id: string
  source: FintocSource
  amount: number
  currency: 'CLP'
  counterparty: string | null
  merchant: string | null
  account_hint: string | null
  dest_hint: string | null
  email_date: string
  bank_tx_id: string
  raw_snippet: string
  status: 'pending' | 'error'
  error_detail: string | null
}

export interface MapContext {
  /** Fintoc account number of the checking account the movement belongs to. */
  accountNumber: string
  /** Last 4 digits of the credit card paid from this account (FINTOC_TC_LAST4). */
  cardLast4: string | null
}

export function stagedIdFor(movementId: string): string {
  return `fintoc:${movementId}`
}

export function cleanDescription(raw: string | null): string {
  return (raw ?? '').replace(/\*+\s*$/, '').replace(/\s+/g, ' ').trim()
}

function afterPrefix(description: string, prefix: RegExp): string | null {
  const rest = description.replace(prefix, '').trim()
  return rest.length > 0 ? rest : null
}

/**
 * Map one Fintoc movement to a staged row, or 'ignore' for movements that do
 * not belong in the ledger (line-of-credit principal moves in and out of the
 * account on its own; booking it would invent income and expenses).
 */
export function mapMovement(m: FintocMovement, ctx: MapContext): StagedMovement | 'ignore' {
  const description = cleanDescription(m.description)
  const amount = Math.abs(m.amount)
  const accountHint = normalizeAccountNumber(ctx.accountNumber)

  const row = (
    source: FintocSource,
    fields: Partial<StagedMovement> = {},
  ): StagedMovement => ({
    gmail_message_id: stagedIdFor(m.id),
    source,
    amount,
    currency: 'CLP',
    counterparty: null,
    merchant: null,
    account_hint: accountHint,
    dest_hint: null,
    email_date: m.post_date,
    bank_tx_id: m.id,
    raw_snippet: description.slice(0, 500),
    status: 'pending',
    error_detail: null,
    ...fields,
  })

  if (m.amount === 0) return 'ignore'

  if (m.currency !== 'CLP') {
    return row(m.amount < 0 ? 'bancochile_pago' : 'bancochile_transfer_in', {
      status: 'error',
      error_detail: `unsupported currency ${m.currency}`,
    })
  }

  if (/^(transferencia desde|amortizacion a) linea de credito/i.test(description)) {
    return 'ignore'
  }

  if (/^cargo por pago tc/i.test(description) || /^pago tarjeta de credito/i.test(description)) {
    const international = /^pago tarjeta de credito/i.test(description)
    if (!ctx.cardLast4) {
      return row('bancochile_pago_tc', {
        counterparty: international ? 'TC Internacional' : 'TC Nacional',
        account_hint: null,
        status: 'error',
        error_detail: 'FINTOC_TC_LAST4 is not set: cannot tell which card was paid',
      })
    }
    return row('bancochile_pago_tc', {
      counterparty: international ? 'TC Internacional' : 'TC Nacional',
      account_hint: ctx.cardLast4,
    })
  }

  if (/^giro /i.test(description)) {
    return row('bancochile_transfer_out', {
      counterparty: description,
      status: 'error',
      error_detail: 'cash withdrawal: register it as a transfer to your cash account',
    })
  }

  if (/^traspaso a:/i.test(description) && m.amount < 0) {
    const recipient = m.recipient_account
    return row('bancochile_transfer_out', {
      counterparty: recipient?.holder_name?.trim() || afterPrefix(description, /^traspaso a:/i),
      dest_hint: recipient?.number ? normalizeAccountNumber(recipient.number) : null,
    })
  }

  if (/^traspaso de:/i.test(description) && m.amount > 0) {
    return row('bancochile_transfer_in', {
      counterparty: m.sender_account?.holder_name?.trim() || afterPrefix(description, /^traspaso de:/i),
    })
  }

  if (/^pago:/i.test(description)) {
    const merchant = afterPrefix(description, /^pago:/i)
    return m.amount < 0
      ? row('bancochile_pago', { merchant })
      : row('bancochile_transfer_in', { counterparty: `Reverso ${merchant ?? 'pago'}` })
  }

  return m.amount < 0
    ? row('bancochile_pago', { merchant: description || 'Cargo' })
    : row('bancochile_transfer_in', { counterparty: description || 'Abono' })
}
