// deno test supabase/functions/fintoc-sync/
// Fixtures mirror the Fintoc Movements API shape with synthetic values.
import { assertEquals } from 'jsr:@std/assert@1'
import {
  cleanDescription,
  mapMovement,
  type FintocMovement,
  type MapContext,
  type StagedMovement,
} from './mapper.ts'

const ctx: MapContext = { accountNumber: '001122334455', cardLast4: '1234' }

function movement(partial: Partial<FintocMovement>): FintocMovement {
  return {
    id: 'mov_test1',
    description: '',
    amount: -1000,
    currency: 'CLP',
    post_date: '2026-09-28T00:00:00Z',
    type: 'other',
    recipient_account: null,
    sender_account: null,
    ...partial,
  }
}

function mapped(m: FintocMovement, c = ctx): StagedMovement {
  const result = mapMovement(m, c)
  if (result === 'ignore') throw new Error('expected a staged row')
  return result
}

Deno.test('debit purchase becomes bancochile_pago with the merchant', () => {
  const row = mapped(movement({ description: 'Pago:cafe Ejemplo', amount: -5000 }))
  assertEquals(row.source, 'bancochile_pago')
  assertEquals(row.amount, 5000)
  assertEquals(row.merchant, 'cafe Ejemplo')
  assertEquals(row.account_hint, '1122334455')
  assertEquals(row.gmail_message_id, 'fintoc:mov_test1')
  assertEquals(row.bank_tx_id, 'mov_test1')
  assertEquals(row.status, 'pending')
})

Deno.test('positive Pago: is a reversal staged as income for review', () => {
  const row = mapped(movement({ description: 'Pago:tienda Ejemplo', amount: 4500 }))
  assertEquals(row.source, 'bancochile_transfer_in')
  assertEquals(row.counterparty, 'Reverso tienda Ejemplo')
})

Deno.test('outgoing transfer carries recipient name and account as dest_hint', () => {
  const row = mapped(movement({
    description: 'Traspaso A:Persona Ejemplo',
    amount: -20000,
    type: 'transfer',
    recipient_account: { holder_name: 'Persona Ejemplo Uno', number: '000007654321' },
  }))
  assertEquals(row.source, 'bancochile_transfer_out')
  assertEquals(row.counterparty, 'Persona Ejemplo Uno')
  assertEquals(row.dest_hint, '7654321')
})

Deno.test('incoming transfer uses the sender holder name', () => {
  const row = mapped(movement({
    description: 'Traspaso De:Juan Perez Sot',
    amount: 100000,
    type: 'transfer',
    sender_account: { holder_name: 'Juan Perez Soto', number: '5566778899' },
  }))
  assertEquals(row.source, 'bancochile_transfer_in')
  assertEquals(row.counterparty, 'Juan Perez Soto')
})

Deno.test('transfer without counterparty account falls back to the description', () => {
  const row = mapped(movement({ description: 'Traspaso De:Cliente Ejemplo', amount: 25000 }))
  assertEquals(row.counterparty, 'Cliente Ejemplo')
})

Deno.test('card payments map to pago_tc on the configured card', () => {
  const national = mapped(movement({ description: 'Cargo Por Pago Tc', amount: -150000 }))
  assertEquals(national.source, 'bancochile_pago_tc')
  assertEquals(national.counterparty, 'TC Nacional')
  assertEquals(national.account_hint, '1234')

  const international = mapped(movement({ description: 'Pago Tarjeta De Credito', amount: -45000 }))
  assertEquals(international.counterparty, 'TC Internacional')
  assertEquals(international.amount, 45000)
})

Deno.test('card payment without FINTOC_TC_LAST4 stages as error', () => {
  const row = mapped(movement({ description: 'Cargo Por Pago Tc', amount: -1000 }), {
    ...ctx,
    cardLast4: null,
  })
  assertEquals(row.status, 'error')
  assertEquals(row.account_hint, null)
})

Deno.test('line-of-credit principal is ignored', () => {
  assertEquals(mapMovement(movement({ description: 'Transferencia Desde Linea De Credito', amount: 10000 }), ctx), 'ignore')
  assertEquals(mapMovement(movement({ description: 'Amortizacion A Linea De Credito', amount: -12000 }), ctx), 'ignore')
})

Deno.test('line-of-credit interest is an expense', () => {
  const row = mapped(movement({ description: 'Intereses Linea De Credito', amount: -1500 }))
  assertEquals(row.source, 'bancochile_pago')
  assertEquals(row.merchant, 'Intereses Linea De Credito')
})

Deno.test('cash withdrawal stages as error for manual transfer', () => {
  const row = mapped(movement({ description: 'Giro Cajero Automatico             *', amount: -40000 }))
  assertEquals(row.status, 'error')
  assertEquals(row.counterparty, 'Giro Cajero Automatico')
})

Deno.test('unknown charges and credits fall back to expense / income', () => {
  const charge = mapped(movement({ description: 'Comision Compras En El Exterior', amount: -3000 }))
  assertEquals(charge.source, 'bancochile_pago')
  assertEquals(charge.merchant, 'Comision Compras En El Exterior')

  const credit = mapped(movement({ description: 'Abono Segun Instruc.', amount: 15000 }))
  assertEquals(credit.source, 'bancochile_transfer_in')
  assertEquals(credit.counterparty, 'Abono Segun Instruc.')
})

Deno.test('non-CLP movement stages as error', () => {
  const row = mapped(movement({ description: 'Pago:store', amount: -999, currency: 'USD' }))
  assertEquals(row.status, 'error')
})

Deno.test('zero-amount movement is ignored', () => {
  assertEquals(mapMovement(movement({ description: 'Pago:x', amount: 0 }), ctx), 'ignore')
})

Deno.test('cleanDescription trims padding and trailing asterisks', () => {
  assertEquals(cleanDescription('Recaudacion Y Pagos De Servicios   *'), 'Recaudacion Y Pagos De Servicios')
  assertEquals(cleanDescription(null), '')
})
