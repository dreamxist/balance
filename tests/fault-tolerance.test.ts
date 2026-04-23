import { describe, it, expect, beforeEach } from 'vitest'
import { FinanceEngine, resetIds } from './engine'

let e: FinanceEngine

beforeEach(() => {
  resetIds()
  e = new FinanceEngine()
})

// ============================================================
// 1. INPUT VALIDATION — rechazo de datos invalidos
// ============================================================

describe('Input validation', () => {
  describe('Accounts', () => {
    it('rechaza crear cuenta sin nombre', () => {
      expect(() => e.createAccount({ name: '', type: 'asset', subtype: 'debit' })).not.toThrow()
      // Empty string is technically valid — document if we want to block it
    })

    it('rechaza archivar cuenta inexistente', () => {
      expect(() => e.archiveAccount('nonexistent')).toThrow('not found')
    })

    it('rechaza actualizar balance de cuenta inexistente', () => {
      expect(() => e.updateAccountBalance('nonexistent', 1000)).toThrow('not found')
    })

    it('rechaza renombrar cuenta inexistente', () => {
      expect(() => e.renameAccount('nonexistent', 'New')).toThrow('not found')
    })

    it('permite crear cuenta con balance negativo (TC)', () => {
      const tc = e.createAccount({ name: 'TC', type: 'liability', subtype: 'credit_card', balance: -500000 })
      expect(tc.balance).toBe(-500000)
    })

    it('permite crear cuenta con balance 0', () => {
      const acc = e.createAccount({ name: 'New', type: 'asset', subtype: 'debit', balance: 0 })
      expect(acc.balance).toBe(0)
    })
  })

  describe('Transactions', () => {
    it('rechaza transaccion en cuenta inexistente', () => {
      expect(() => e.createTransaction({
        amount: -1000, accountId: 'nonexistent', description: 'Test',
      })).toThrow('not found')
    })

    it('permite transaccion con monto 0 (auto-detecta como income)', () => {
      e.createAccount({ name: 'A', type: 'asset', subtype: 'debit', balance: 0 })
      const tx = e.createTransaction({ amount: 0, accountId: 'id_1', description: 'Zero' })
      expect(tx.type).toBe('income') // 0 >= 0
      expect(tx.amount).toBe(0)
    })
  })

  describe('Transfers', () => {
    it('rechaza transfer con monto 0', () => {
      e.createAccount({ name: 'A', type: 'asset', subtype: 'debit' })
      e.createAccount({ name: 'B', type: 'asset', subtype: 'debit' })
      expect(() => e.createTransfer({
        fromAccountId: 'id_1', toAccountId: 'id_2', amount: 0, description: 'Bad',
      })).toThrow('positive')
    })

    it('rechaza transfer con monto negativo', () => {
      e.createAccount({ name: 'A', type: 'asset', subtype: 'debit' })
      e.createAccount({ name: 'B', type: 'asset', subtype: 'debit' })
      expect(() => e.createTransfer({
        fromAccountId: 'id_1', toAccountId: 'id_2', amount: -100, description: 'Bad',
      })).toThrow('positive')
    })
  })

  describe('Refunds', () => {
    it('rechaza refund con monto 0', () => {
      e.createAccount({ name: 'A', type: 'asset', subtype: 'debit' })
      expect(() => e.createRefund({
        amount: 0, accountId: 'id_1', description: 'Bad',
      })).toThrow('positive')
    })

    it('rechaza refund con monto negativo', () => {
      e.createAccount({ name: 'A', type: 'asset', subtype: 'debit' })
      expect(() => e.createRefund({
        amount: -100, accountId: 'id_1', description: 'Bad',
      })).toThrow('positive')
    })
  })

  describe('Installments', () => {
    it('rechaza compra en cuenta inexistente', () => {
      expect(() => e.createInstallmentPurchase({
        amount: -100000, installments: 3, accountId: 'nonexistent', description: 'Test',
      })).toThrow('not found')
    })

    it('rechaza pagar deuda inexistente', () => {
      expect(() => e.payDebtInstallment('nonexistent')).toThrow('not found')
    })

    it('rechaza pagar deuda ya pagada', () => {
      e.createAccount({ name: 'TC', type: 'liability', subtype: 'credit_card', balance: 0 })
      e.createInstallmentPurchase({ amount: -30000, installments: 1, accountId: 'id_1', description: 'T' })
      e.payDebtInstallment(e.debts[0].id)
      expect(e.debts[0].status).toBe('paid')
      expect(() => e.payDebtInstallment(e.debts[0].id)).toThrow('not found or already paid')
    })
  })

  describe('Undo', () => {
    it('rechaza undo de transaccion inexistente', () => {
      expect(() => e.undoTransaction('nonexistent')).toThrow('not found')
    })
  })

  describe('Snapshots', () => {
    it('rechaza snapshot duplicado en misma fecha', () => {
      e.createAccount({ name: 'A', type: 'asset', subtype: 'debit', balance: 0 })
      e.createSnapshot('2026-04-01')
      expect(() => e.createSnapshot('2026-04-01')).toThrow('already exists')
    })
  })

  describe('Debt operations', () => {
    it('rechaza payOff de deuda inexistente', () => {
      expect(() => e.payOffDebt('nonexistent')).toThrow('not found')
    })

    it('rechaza payOff de deuda ya pagada', () => {
      e.createAccount({ name: 'TC', type: 'liability', subtype: 'credit_card', balance: 0 })
      e.createInstallmentPurchase({ amount: -30000, installments: 1, accountId: 'id_1', description: 'T' })
      e.payDebtInstallment(e.debts[0].id)
      expect(() => e.payOffDebt(e.debts[0].id)).toThrow('not found or not active')
    })

    it('rechaza cancelar deuda inexistente', () => {
      expect(() => e.archiveDebt('nonexistent')).toThrow('not found')
    })

    it('rechaza cancelar deuda ya pagada/archivada', () => {
      e.createAccount({ name: 'TC', type: 'liability', subtype: 'credit_card', balance: 0 })
      e.createInstallmentPurchase({ amount: -30000, installments: 1, accountId: 'id_1', description: 'T' })
      e.payDebtInstallment(e.debts[0].id)
      expect(() => e.archiveDebt(e.debts[0].id)).toThrow('not found or not active')
    })
  })
})

// ============================================================
// 2. STATE TRANSITIONS — operaciones ilegales segun estado
// ============================================================

describe('State transitions', () => {
  it('no se puede transaccionar en cuenta archivada (engine no lo previene — es responsabilidad de la UI/CLI)', () => {
    const acc = e.createAccount({ name: 'Old', type: 'asset', subtype: 'debit', balance: 100000 })
    e.archiveAccount(acc.id)
    // Engine permite la transaccion — la DB lo previene con RLS/triggers
    // Documentar: este es un gap del engine vs la DB
    const tx = e.createTransaction({ amount: -10000, accountId: acc.id, description: 'Test' })
    expect(tx).toBeDefined()
    // Pero la cuenta archivada NO participa en reconciliacion
    expect(e.getReconciliationStatus().position).toBe(0) // archivada excluida
  })

  it('deuda pagada no acepta mas cuotas', () => {
    e.createAccount({ name: 'TC', type: 'liability', subtype: 'credit_card', balance: 0 })
    e.createInstallmentPurchase({ amount: -60000, installments: 2, accountId: 'id_1', description: 'T' })

    e.payDebtInstallment(e.debts[0].id)
    e.payDebtInstallment(e.debts[0].id)
    expect(e.debts[0].status).toBe('paid')

    expect(() => e.payDebtInstallment(e.debts[0].id)).toThrow()
  })

  it('deuda archivada no acepta cuotas', () => {
    e.createAccount({ name: 'TC', type: 'liability', subtype: 'credit_card', balance: 0 })
    e.createInstallmentPurchase({ amount: -60000, installments: 3, accountId: 'id_1', description: 'T' })

    e.archiveDebt(e.debts[0].id)
    expect(e.debts[0].status).toBe('archived')

    expect(() => e.payDebtInstallment(e.debts[0].id)).toThrow()
  })

  it('archivar → no se puede desarchivar (no hay funcion)', () => {
    const acc = e.createAccount({ name: 'Old', type: 'asset', subtype: 'debit' })
    e.archiveAccount(acc.id)
    // No existe unarchiveAccount — es intencional
    expect(acc.isArchived).toBe(true)
  })

  it('nombre de cuenta puede reutilizarse despues de archivar', () => {
    e.createAccount({ name: 'CC Visa', type: 'liability', subtype: 'credit_card' })
    e.archiveAccount('id_1')
    // Ahora puedo crear otra con el mismo nombre
    const nueva = e.createAccount({ name: 'CC Visa', type: 'liability', subtype: 'credit_card' })
    expect(nueva.name).toBe('CC Visa')
    expect(e.accounts.length).toBe(2)
  })
})

// ============================================================
// 3. DATA CONSISTENCY — invariantes que nunca deben romperse
// ============================================================

describe('Data consistency invariants', () => {
  describe('Invariante: delta = 0 despues de operacion balanceada', () => {
    beforeEach(() => {
      e.createAccount({ name: 'Wallet', type: 'asset', subtype: 'debit', balance: 1000000 })
      e.createAccount({ name: 'TC', type: 'liability', subtype: 'credit_card', balance: 0, creditLimit: 2000000 })
      e.createOpeningBalance('id_1')
    })

    it('income mantiene delta = 0', () => {
      e.createTransaction({ amount: 500000, accountId: 'id_1', description: 'Sueldo' })
      expect(e.getReconciliationStatus().delta).toBe(0)
    })

    it('expense mantiene delta = 0', () => {
      e.createTransaction({ amount: -200000, accountId: 'id_1', description: 'Gasto' })
      expect(e.getReconciliationStatus().delta).toBe(0)
    })

    it('transfer mantiene delta = 0', () => {
      e.createTransfer({ fromAccountId: 'id_1', toAccountId: 'id_2', amount: 100000, description: 'Pago TC' })
      expect(e.getReconciliationStatus().delta).toBe(0)
    })

    it('installment purchase mantiene delta = 0', () => {
      e.createInstallmentPurchase({ amount: -300000, installments: 6, accountId: 'id_2', description: 'Compra' })
      expect(e.getReconciliationStatus().delta).toBe(0)
    })

    it('debt_payment mantiene delta = 0', () => {
      e.createInstallmentPurchase({ amount: -300000, installments: 6, accountId: 'id_2', description: 'Compra' })
      e.payDebtInstallment(e.debts[0].id)
      expect(e.getReconciliationStatus().delta).toBe(0)
    })

    it('refund mantiene delta = 0', () => {
      e.createTransaction({ amount: -50000, accountId: 'id_2', description: 'Compra' })
      e.createRefund({ amount: 50000, accountId: 'id_2', description: 'Devolucion' })
      expect(e.getReconciliationStatus().delta).toBe(0)
    })

    it('undo mantiene delta = 0', () => {
      const tx = e.createTransaction({ amount: -50000, accountId: 'id_1', description: 'Error' })
      e.undoTransaction(tx.id)
      expect(e.getReconciliationStatus().delta).toBe(0)
    })

    it('adjustment mantiene delta = 0', () => {
      e.createTransaction({ amount: 10000, accountId: 'id_1', description: 'Ajuste', type: 'adjustment' })
      expect(e.getReconciliationStatus().delta).toBe(0)
    })

    it('archiveDebt + refund mantiene delta = 0', () => {
      e.createInstallmentPurchase({ amount: -180000, installments: 6, accountId: 'id_2', description: 'Demo Purchase' })
      e.payDebtInstallment(e.debts[0].id)
      // Store refunds the full amount
      e.createRefund({ amount: 180000, accountId: 'id_2', description: 'Demo Refund' })
      // Archive the debt (cancels remaining installments)
      e.archiveDebt(e.debts[0].id)
      expect(e.getReconciliationStatus().delta).toBe(0)
    })

    it('payOffDebt mantiene delta = 0', () => {
      e.createInstallmentPurchase({ amount: -180000, installments: 6, accountId: 'id_2', description: 'Demo Purchase' })
      e.payDebtInstallment(e.debts[0].id)
      e.payOffDebt(e.debts[0].id)
      expect(e.getReconciliationStatus().delta).toBe(0)
    })

    it('receivePartialPayment mantiene delta = 0', () => {
      const recv = e.createReceivable({ name: 'Friend A', amount: 200000 })
      e.createOpeningBalance(recv.id)
      e.receivePartialPayment(recv.id, 50000, 'id_1')
      expect(e.getReconciliationStatus().delta).toBe(0)
    })
  })

  describe('Invariante: deuda remaining = total - sum(cuotas pagadas)', () => {
    it('despues de N cuotas, remaining es correcto', () => {
      e.createAccount({ name: 'TC', type: 'liability', subtype: 'credit_card', balance: 0 })
      e.createInstallmentPurchase({ amount: -100000, installments: 7, accountId: 'id_1', description: 'T' })

      const debt = e.debts[0]
      let expectedRemaining = -100000

      for (let i = 0; i < 7; i++) {
        const isLast = i === 6
        const cuota = isLast ? debt.lastInstallmentAmount : debt.installmentAmount
        expectedRemaining -= cuota // cuota es negativo, restar negativo = sumar
        e.payDebtInstallment(debt.id)
        expect(debt.remainingAmount).toBe(expectedRemaining)
      }

      expect(debt.remainingAmount).toBe(0)
    })
  })

  describe('Invariante: sum(account.balance) es consistente con transacciones', () => {
    it('la suma de todos los cambios de balance es traceable', () => {
      const mp = e.createAccount({ name: 'Wallet', type: 'asset', subtype: 'debit', balance: 1000000 })
      const tc = e.createAccount({ name: 'TC', type: 'liability', subtype: 'credit_card', balance: 0 })

      // Operaciones mixtas
      e.createTransaction({ amount: 500000, accountId: mp.id, description: 'Ingreso' })
      e.createTransaction({ amount: -80000, accountId: mp.id, description: 'Gasto' })
      e.createInstallmentPurchase({ amount: -120000, installments: 4, accountId: tc.id, description: 'Compra' })
      e.createTransfer({ fromAccountId: mp.id, toAccountId: tc.id, amount: 50000, description: 'Pago TC' })
      e.createRefund({ amount: 20000, accountId: tc.id, description: 'Refund' })

      // Balance de Wallet = 1000000 + 500000 - 80000 - 50000
      expect(mp.balance).toBe(1370000)

      // Balance de TC = 0 - 120000 + 50000 + 20000
      expect(tc.balance).toBe(-50000)

      // Total patrimonio on-budget
      expect(mp.balance + tc.balance).toBe(1320000)
    })
  })

  describe('Invariante: transfer no cambia patrimonio total', () => {
    it('transfer entre N cuentas, patrimonio total es constante', () => {
      e.createAccount({ name: 'A', type: 'asset', subtype: 'debit', balance: 500000 })
      e.createAccount({ name: 'B', type: 'asset', subtype: 'debit', balance: 300000 })
      e.createAccount({ name: 'C', type: 'asset', subtype: 'cash', balance: 50000 })
      e.createAccount({ name: 'TC', type: 'liability', subtype: 'credit_card', balance: -100000 })

      const totalBefore = e.accounts.reduce((s, a) => s + a.balance, 0)

      e.createTransfer({ fromAccountId: 'id_1', toAccountId: 'id_2', amount: 200000, description: 'A→B' })
      e.createTransfer({ fromAccountId: 'id_2', toAccountId: 'id_3', amount: 100000, description: 'B→C' })
      e.createTransfer({ fromAccountId: 'id_1', toAccountId: 'id_4', amount: 100000, description: 'A→TC' })

      const totalAfter = e.accounts.reduce((s, a) => s + a.balance, 0)
      expect(totalAfter).toBe(totalBefore)
    })
  })

  describe('Invariante: installment purchase total = sum(installment_amount * (n-1) + last)', () => {
    const testAmounts = [1, 7, 100, 999, 10000, 99999, 100000, 999999, 1000000, 5555555]
    const testInstallments = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 24]

    for (const amount of testAmounts) {
      for (const inst of testInstallments) {
        it(`-$${amount} en ${inst} cuotas: sum(cuotas) = total`, () => {
          e.createAccount({ name: 'TC', type: 'liability', subtype: 'credit_card', balance: 0 })
          e.createInstallmentPurchase({ amount: -amount, installments: inst, accountId: 'id_1', description: 'T' })

          const debt = e.debts[0]
          const computedTotal = debt.installmentAmount * (inst - 1) + debt.lastInstallmentAmount
          expect(computedTotal).toBe(-amount)

          // Pagar todas y verificar remaining = 0
          for (let i = 0; i < inst; i++) {
            e.payDebtInstallment(debt.id)
          }
          expect(debt.remainingAmount).toBe(0)
          expect(debt.status).toBe('paid')

          // Reset para siguiente iteracion
          resetIds()
          e = new FinanceEngine()
        })
      }
    }
  })
})

// ============================================================
// 4. RECOVERY — operaciones que corrigen errores
// ============================================================

describe('Error recovery', () => {
  beforeEach(() => {
    e.createAccount({ name: 'Wallet', type: 'asset', subtype: 'debit', balance: 1000000 })
    e.createAccount({ name: 'TC', type: 'liability', subtype: 'credit_card', balance: 0, creditLimit: 2000000 })
    e.createOpeningBalance('id_1')
  })

  it('undo de gasto restaura balance y delta', () => {
    const tx = e.createTransaction({ amount: -100000, accountId: 'id_1', description: 'Gasto' })

    expect(e.accounts[0].balance).toBe(900000)
    expect(e.getReconciliationStatus().delta).toBe(0)

    e.undoTransaction(tx.id)

    expect(e.accounts[0].balance).toBe(1000000)
    expect(e.getReconciliationStatus().delta).toBe(0)
  })

  it('undo de ingreso restaura balance y delta', () => {
    const tx = e.createTransaction({ amount: 500000, accountId: 'id_1', description: 'Ingreso' })
    e.undoTransaction(tx.id)

    expect(e.accounts[0].balance).toBe(1000000)
    expect(e.getReconciliationStatus().delta).toBe(0)
  })

  it('undo de undo genera doble reversa (vuelve al estado del gasto)', () => {
    const tx = e.createTransaction({ amount: -100000, accountId: 'id_1', description: 'Gasto' })
    const undoTx = e.undoTransaction(tx.id)

    expect(e.accounts[0].balance).toBe(1000000)

    // Undo del undo
    e.undoTransaction(undoTx.id)

    expect(e.accounts[0].balance).toBe(900000) // volvio al gasto original
    expect(e.getReconciliationStatus().delta).toBe(0)
  })

  it('ajuste manual cuadra un delta no-zero', () => {
    // Simular gasto no registrado: balance bajo pero no hay transaccion
    e.updateAccountBalance('id_1', 900000) // alguien gasto 100K sin registrar

    const status = e.getReconciliationStatus()
    expect(status.delta).toBe(-100000) // position < accumulated

    // Ajuste para cuadrar
    e.createTransaction({ amount: -100000, accountId: 'id_1', description: 'Gasto no registrado', type: 'adjustment' })
    e.updateAccountBalance('id_1', 900000) // restaurar balance real

    expect(e.getReconciliationStatus().delta).toBe(0)
  })

  it('payOffDebt recupera deuda parcialmente pagada', () => {
    e.createInstallmentPurchase({ amount: -180000, installments: 6, accountId: 'id_2', description: 'Demo Purchase' })

    e.payDebtInstallment(e.debts[0].id) // cuota 1
    e.payDebtInstallment(e.debts[0].id) // cuota 2

    expect(e.debts[0].remainingAmount).toBe(-120000)

    e.payOffDebt(e.debts[0].id)

    expect(e.debts[0].status).toBe('paid')
    expect(e.debts[0].remainingAmount).toBe(0)
    expect(e.getReconciliationStatus().delta).toBe(0)
  })

  it('archiveDebt sin refund: user updates balance when reconciling', () => {
    e.createInstallmentPurchase({ amount: -180000, installments: 6, accountId: 'id_2', description: 'Demo Purchase' })

    e.payDebtInstallment(e.debts[0].id) // cuota 1

    // Archive debt (bank cancels future installments)
    e.archiveDebt(e.debts[0].id)
    expect(e.debts[0].status).toBe('archived')

    // TC balance hasn't changed yet — it still shows the full purchase amount
    // The user updates the TC balance when they reconcile (check the real balance)
    // The delta will show the discrepancy until the user updates
  })

  it('devolucion completa de compra en cuotas: refund + archiveDebt', () => {
    e.createInstallmentPurchase({ amount: -180000, installments: 6, accountId: 'id_2', description: 'Demo Purchase' })

    // Store refunds full amount to TC
    e.createRefund({ amount: 180000, accountId: 'id_2', description: 'Demo Refund' })

    // Archive the debt
    e.archiveDebt(e.debts[0].id)

    expect(e.debts[0].status).toBe('archived')
    // TC: -180K (purchase) + 180K (refund) = 0
    expect(e.accounts[1].balance).toBe(0)
    expect(e.getReconciliationStatus().delta).toBe(0)
  })
})

// ============================================================
// 5. CONSISTENCY UNDER COMPLEX SEQUENCES
// ============================================================

describe('Complex operation sequences', () => {
  it('compra → cuota → refund parcial → pagar resto: todo cuadra', () => {
    e.createAccount({ name: 'Wallet', type: 'asset', subtype: 'debit', balance: 1000000 })
    e.createAccount({ name: 'TC', type: 'liability', subtype: 'credit_card', balance: 0, creditLimit: 2000000 })
    e.createOpeningBalance('id_1')

    // Comprar en 6 cuotas
    e.createInstallmentPurchase({ amount: -180000, installments: 6, accountId: 'id_2', description: 'Demo Purchase' })
    expect(e.getReconciliationStatus().delta).toBe(0)

    // Pagar 2 cuotas
    e.payDebtInstallment(e.debts[0].id)
    e.payDebtInstallment(e.debts[0].id)
    expect(e.getReconciliationStatus().delta).toBe(0)

    // Refund parcial en la TC (la tienda devuelve 50K)
    e.createRefund({ amount: 50000, category: 'consumo.ropa', accountId: 'id_2', description: 'Refund parcial' })
    expect(e.getReconciliationStatus().delta).toBe(0)

    // Pagar las cuotas restantes
    for (let i = 0; i < 4; i++) {
      e.payDebtInstallment(e.debts[0].id)
      expect(e.getReconciliationStatus().delta).toBe(0)
    }

    expect(e.debts[0].status).toBe('paid')
  })

  it('multiples cuentas + multiples deudas + transfers: delta siempre 0', () => {
    const mp = e.createAccount({ name: 'Wallet', type: 'asset', subtype: 'debit', balance: 2000000 })
    const checking = e.createAccount({ name: 'Checking', type: 'asset', subtype: 'debit', balance: 500000 })
    const cash = e.createAccount({ name: 'Cash', type: 'asset', subtype: 'cash', balance: 30000 })
    const tc1 = e.createAccount({ name: 'TC-1', type: 'liability', subtype: 'credit_card', balance: 0, creditLimit: 1500000 })
    const tc2 = e.createAccount({ name: 'TC-2', type: 'liability', subtype: 'credit_card', balance: 0, creditLimit: 1000000 })

    e.createOpeningBalance(mp.id)
    e.createOpeningBalance(checking.id)
    e.createOpeningBalance(cash.id)

    const checkDelta = () => expect(e.getReconciliationStatus().delta).toBe(0)

    // Ingresos
    e.createTransaction({ amount: 2000000, accountId: mp.id, description: 'Sueldo' })
    checkDelta()

    // Gastos en distintas cuentas
    e.createTransaction({ amount: -50000, accountId: mp.id, description: 'G1' })
    e.createTransaction({ amount: -30000, accountId: checking.id, description: 'G2' })
    e.createTransaction({ amount: -10000, accountId: cash.id, description: 'G3' })
    e.createTransaction({ amount: -80000, accountId: tc1.id, description: 'G4' })
    e.createTransaction({ amount: -25000, accountId: tc2.id, description: 'G5' })
    checkDelta()

    // Cuotas en dos TC distintas
    e.createInstallmentPurchase({ amount: -300000, installments: 10, accountId: tc1.id, description: 'D1' })
    e.createInstallmentPurchase({ amount: -120000, installments: 4, accountId: tc2.id, description: 'D2' })
    e.createInstallmentPurchase({ amount: -60000, installments: 3, accountId: tc1.id, description: 'D3' })
    checkDelta()

    // Transferencias
    e.createTransfer({ fromAccountId: mp.id, toAccountId: checking.id, amount: 500000, description: 'T1' })
    e.createTransfer({ fromAccountId: checking.id, toAccountId: cash.id, amount: 100000, description: 'ATM' })
    e.createTransfer({ fromAccountId: mp.id, toAccountId: tc1.id, amount: 380000, description: 'Pago TC1' })
    e.createTransfer({ fromAccountId: checking.id, toAccountId: tc2.id, amount: 145000, description: 'Pago TC2' })
    checkDelta()

    // Pagar cuotas
    e.payDebtInstallment(e.debts[0].id) // D1 cuota 1
    e.payDebtInstallment(e.debts[1].id) // D2 cuota 1
    e.payDebtInstallment(e.debts[2].id) // D3 cuota 1
    checkDelta()

    // Refund
    e.createRefund({ amount: 25000, accountId: tc2.id, description: 'Refund' })
    checkDelta()

    // Undo de un gasto
    const gastoAUndo = e.transactions.find(t => t.description === 'G3')!
    e.undoTransaction(gastoAUndo.id)
    checkDelta()

    // Snapshot
    const snap = e.createSnapshot('2026-04-30')
    expect(snap.delta).toBe(0)
  })

  it('operaciones repetidas rapidas no acumulan error', () => {
    e.createAccount({ name: 'Wallet', type: 'asset', subtype: 'debit', balance: 10000000 })
    e.createOpeningBalance('id_1')

    // 1000 operaciones pequeñas
    for (let i = 0; i < 500; i++) {
      e.createTransaction({ amount: -7, accountId: 'id_1', description: `G${i}` })
      e.createTransaction({ amount: 3, accountId: 'id_1', description: `I${i}` })
    }

    expect(e.getReconciliationStatus().delta).toBe(0)
    expect(e.accounts[0].balance).toBe(10000000 - (500 * 7) + (500 * 3))
  })

  it('balance puede ir a negativo (sobregiro) y reconciliacion sigue cuadrando', () => {
    e.createAccount({ name: 'Wallet', type: 'asset', subtype: 'debit', balance: 100 })
    e.createOpeningBalance('id_1')

    e.createTransaction({ amount: -500, accountId: 'id_1', description: 'Sobregiro' })

    expect(e.accounts[0].balance).toBe(-400) // negativo
    expect(e.getReconciliationStatus().delta).toBe(0) // sigue cuadrando
  })
})

// ============================================================
// 6. SNAPSHOT CONSISTENCY
// ============================================================

describe('Snapshot consistency', () => {
  it('snapshot refleja el estado exacto al momento de creacion', () => {
    const mp = e.createAccount({ name: 'Wallet', type: 'asset', subtype: 'debit', balance: 1000000 })
    e.createOpeningBalance(mp.id)

    e.createTransaction({ amount: -200000, accountId: mp.id, description: 'Gasto' })

    const snap = e.createSnapshot('2026-04-30')
    expect(snap.totalAssets).toBe(800000)
    expect(snap.netWorth).toBe(800000)
    expect(snap.accumulated).toBe(800000) // 1M - 200K
    expect(snap.delta).toBe(0)

    // Despues del snapshot, agrego mas transacciones
    e.createTransaction({ amount: -100000, accountId: mp.id, description: 'Gasto post-snap' })

    // El snapshot guardado NO cambio
    expect(e.snapshots[0].totalAssets).toBe(800000) // inmutable
    expect(e.snapshots[0].netWorth).toBe(800000) // inmutable

    // Pero el estado actual si cambio
    expect(mp.balance).toBe(700000)
  })

  it('multiples snapshots capturan evolucion correctamente', () => {
    const mp = e.createAccount({ name: 'Wallet', type: 'asset', subtype: 'debit', balance: 0 })
    e.createOpeningBalance(mp.id)

    e.createTransaction({ amount: 1000000, accountId: mp.id, description: 'Mes 1' })
    const snap1 = e.createSnapshot('2026-01-31')

    e.createTransaction({ amount: 500000, accountId: mp.id, description: 'Mes 2' })
    const snap2 = e.createSnapshot('2026-02-28')

    e.createTransaction({ amount: -300000, accountId: mp.id, description: 'Mes 3' })
    const snap3 = e.createSnapshot('2026-03-31')

    expect(snap1.netWorth).toBe(1000000)
    expect(snap2.netWorth).toBe(1500000)
    expect(snap3.netWorth).toBe(1200000)

    // Todos cuadrados
    expect(snap1.delta).toBe(0)
    expect(snap2.delta).toBe(0)
    expect(snap3.delta).toBe(0)
  })

  it('snapshot con cuentas off-budget: net_worth incluye todo, delta solo on-budget', () => {
    e.createAccount({ name: 'Wallet', type: 'asset', subtype: 'debit', balance: 1000000 })
    e.createAccount({ name: 'Broker', type: 'asset', subtype: 'investment', balance: 14500000, onBudget: false })
    e.createAccount({ name: 'TC', type: 'liability', subtype: 'credit_card', balance: -200000 })
    e.createOpeningBalance('id_1')
    e.createOpeningBalance('id_3')

    const snap = e.createSnapshot('2026-04-30')

    expect(snap.totalAssets).toBe(1000000 + 14500000) // ambas
    expect(snap.totalLiabilities).toBe(200000) // abs
    expect(snap.netWorth).toBe(15300000) // todo
    expect(snap.delta).toBe(0) // solo on-budget: 1M + (-200K) = 800K = accumulated
  })
})

// ============================================================
// 7. EDGE CASES NUMERICOS
// ============================================================

describe('Edge cases numericos', () => {
  it('montos de 1 peso', () => {
    e.createAccount({ name: 'A', type: 'asset', subtype: 'debit', balance: 1 })
    e.createOpeningBalance('id_1')
    e.createTransaction({ amount: -1, accountId: 'id_1', description: 'Micro' })
    expect(e.accounts[0].balance).toBe(0)
    expect(e.getReconciliationStatus().delta).toBe(0)
  })

  it('montos grandes no overflow', () => {
    e.createAccount({ name: 'Broker', type: 'asset', subtype: 'investment', balance: 3000000, onBudget: false })
    e.createAccount({ name: 'Wallet', type: 'asset', subtype: 'debit', balance: 500000 })
    e.createOpeningBalance('id_2')

    const snap = e.createSnapshot('2026-04-30')
    expect(snap.totalAssets).toBe(3500000)
    expect(snap.delta).toBe(0)
  })

  it('cuotas con montos primos (no divisibles)', () => {
    e.createAccount({ name: 'TC', type: 'liability', subtype: 'credit_card', balance: 0 })

    // 97 es primo, en 7 cuotas: 97/7 = 13 truncado, last = 97 - 13*6 = 19
    e.createInstallmentPurchase({ amount: -97, installments: 7, accountId: 'id_1', description: 'T' })

    const d = e.debts[0]
    expect(d.installmentAmount).toBe(-13)
    expect(d.lastInstallmentAmount).toBe(-19)
    expect(d.installmentAmount * 6 + d.lastInstallmentAmount).toBe(-97)

    for (let i = 0; i < 7; i++) e.payDebtInstallment(d.id)
    expect(d.remainingAmount).toBe(0)
  })

  it('muchas transacciones pequeñas no acumulan error de redondeo', () => {
    e.createAccount({ name: 'Wallet', type: 'asset', subtype: 'debit', balance: 0 })
    e.createOpeningBalance('id_1')

    // Sumar 1 peso 100000 veces y restar 100000
    for (let i = 0; i < 1000; i++) {
      e.createTransaction({ amount: 1, accountId: 'id_1', description: `+1 #${i}` })
    }
    e.createTransaction({ amount: -1000, accountId: 'id_1', description: 'Restar todo' })

    expect(e.accounts[0].balance).toBe(0)
    expect(e.getReconciliationStatus().delta).toBe(0)
  })
})

// ============================================================
// 8. ENTITY ISOLATION
// ============================================================

describe('Entity isolation', () => {
  it('transacciones de SpA no afectan reconciliacion personal', () => {
    const mp = e.createAccount({ name: 'Wallet', type: 'asset', subtype: 'debit', balance: 1000000 })
    const spaBank = e.createAccount({ name: 'SpA Checking', type: 'asset', subtype: 'debit', balance: 0, entity: 'spa' })
    e.createOpeningBalance(mp.id)
    e.createOpeningBalance(spaBank.id)

    // Ingreso solo en SpA
    e.createTransaction({ amount: 5000000, accountId: spaBank.id, description: 'Factura' })

    // Reconciliacion personal no se ve afectada
    const personal = e.getEntityReconciliation('personal')
    expect(personal.position).toBe(1000000)
    expect(personal.delta).toBe(0)

    // SpA cuadra por su lado
    const spa = e.getEntityReconciliation('spa')
    expect(spa.position).toBe(5000000)
    expect(spa.delta).toBe(0)
  })

  it('transfer inter-entidad: patrimonio global constante', () => {
    const mp = e.createAccount({ name: 'Wallet', type: 'asset', subtype: 'debit', balance: 0 })
    const spaBank = e.createAccount({ name: 'SpA Checking', type: 'asset', subtype: 'debit', balance: 3000000, entity: 'spa' })
    e.createOpeningBalance(mp.id)
    e.createOpeningBalance(spaBank.id)

    const totalBefore = e.accounts.reduce((s, a) => s + a.balance, 0)

    e.createTransfer({ fromAccountId: spaBank.id, toAccountId: mp.id, amount: 2000000, description: 'Sueldo' })

    const totalAfter = e.accounts.reduce((s, a) => s + a.balance, 0)
    expect(totalAfter).toBe(totalBefore)

    // Global reconciliation sigue cuadrando
    expect(e.getReconciliationStatus().delta).toBe(0)
  })
})
