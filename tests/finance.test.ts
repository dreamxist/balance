import { describe, it, expect, beforeEach } from 'vitest'
import { FinanceEngine, resetIds } from './engine'

let engine: FinanceEngine

beforeEach(() => {
  resetIds()
  engine = new FinanceEngine()
})

// ============================================================
// 1. SETUP INICIAL
// ============================================================

describe('Setup inicial', () => {
  it('crear cuentas con saldos iniciales y que el delta sea 0 con transaccion de apertura', () => {
    const mp = engine.createAccount({ name: 'Wallet', type: 'asset', subtype: 'debit', balance: 500000 })
    const checking = engine.createAccount({ name: 'Checking', type: 'asset', subtype: 'debit', balance: 80000 })
    const efectivo = engine.createAccount({ name: 'Efectivo', type: 'asset', subtype: 'cash', balance: 10000 })
    const ccVisa = engine.createAccount({ name: 'CC Visa', type: 'liability', subtype: 'credit_card', balance: -50000, creditLimit: 1500000 })

    // Sin transaccion de apertura, el delta es != 0
    const beforeSetup = engine.getReconciliationStatus()
    expect(beforeSetup.position).toBe(500000 + 80000 + 10000 + (-50000))
    expect(beforeSetup.accumulated).toBe(0)
    expect(beforeSetup.isBalanced).toBe(false)

    // Apertura limpia: registra balance sin mover cuentas
    engine.createOpeningBalance(mp.id)
    engine.createOpeningBalance(checking.id)
    engine.createOpeningBalance(efectivo.id)
    engine.createOpeningBalance(ccVisa.id)

    const afterSetup = engine.getReconciliationStatus()
    expect(afterSetup.delta).toBe(0)
    expect(afterSetup.isBalanced).toBe(true)
  })

  it('no permite nombres de cuenta duplicados', () => {
    engine.createAccount({ name: 'Wallet', type: 'asset', subtype: 'debit' })
    expect(() => engine.createAccount({ name: 'Wallet', type: 'asset', subtype: 'debit' }))
      .toThrow('already exists')
  })

  it('cuentas off-budget no afectan reconciliacion', () => {
    engine.createAccount({ name: 'Wallet', type: 'asset', subtype: 'debit', balance: 1000000 })
    engine.createAccount({ name: 'Broker', type: 'asset', subtype: 'investment', balance: 14500000, onBudget: false })

    // Transaccion de apertura solo por el on-budget
    engine.createOpeningBalance('id_1')

    const status = engine.getReconciliationStatus()
    expect(status.position).toBe(1000000) // solo Wallet, no Broker
    expect(status.delta).toBe(0)
  })
})

// ============================================================
// 2. TRANSACCIONES SIMPLES
// ============================================================

describe('Transacciones simples', () => {
  beforeEach(() => {
    engine.createAccount({ name: 'Wallet', type: 'asset', subtype: 'debit', balance: 1000000 })
    engine.createOpeningBalance('id_1')
  })

  it('gasto reduce balance y acumulado', () => {
    engine.createTransaction({ amount: -50000, category: 'necesidad.bencina', accountId: 'id_1', description: 'Bencina' })

    expect(engine.accounts[0].balance).toBe(950000)
    const status = engine.getReconciliationStatus()
    expect(status.position).toBe(950000)
    expect(status.accumulated).toBe(950000) // 1M apertura - 50K gasto
    expect(status.delta).toBe(0)
  })

  it('ingreso aumenta balance y acumulado', () => {
    engine.createTransaction({ amount: 2000000, category: 'ingreso.sueldo', accountId: 'id_1', description: 'Sueldo' })

    expect(engine.accounts[0].balance).toBe(3000000)
    const status = engine.getReconciliationStatus()
    expect(status.delta).toBe(0)
  })

  it('gasto con TC aumenta deuda y reduce acumulado', () => {
    engine.createAccount({ name: 'CC Mastercard', type: 'liability', subtype: 'credit_card', balance: 0, creditLimit: 1500000 })

    engine.createTransaction({ amount: -30000, category: 'consumo.comida', accountId: 'id_3', description: 'Almuerzo' })

    expect(engine.accounts[1].balance).toBe(-30000) // TC ahora debe 30K
    const status = engine.getReconciliationStatus()
    expect(status.position).toBe(1000000 + (-30000)) // Wallet + TC
    expect(status.accumulated).toBe(1000000 + (-30000)) // apertura + gasto
    expect(status.delta).toBe(0)
  })

  it('multiples gastos e ingresos mantienen delta en 0', () => {
    engine.createTransaction({ amount: 2000000, accountId: 'id_1', description: 'Sueldo' })
    engine.createTransaction({ amount: -150000, accountId: 'id_1', description: 'Bencina' })
    engine.createTransaction({ amount: -50000, accountId: 'id_1', description: 'Aseo' })
    engine.createTransaction({ amount: 225000, accountId: 'id_1', description: 'Arriendo' })

    expect(engine.accounts[0].balance).toBe(1000000 + 2000000 - 150000 - 50000 + 225000)
    expect(engine.getReconciliationStatus().delta).toBe(0)
  })
})

// ============================================================
// 3. COMPRAS EN CUOTAS (CORE)
// ============================================================

describe('Compras en cuotas', () => {
  beforeEach(() => {
    engine.createAccount({ name: 'Wallet', type: 'asset', subtype: 'debit', balance: 1000000 })
    engine.createAccount({ name: 'CC Mastercard', type: 'liability', subtype: 'credit_card', balance: 0, creditLimit: 1500000 })
    // Apertura
    engine.createOpeningBalance('id_1')
  })

  it('compra en 6 cuotas: patrimonio baja por total, delta = 0', () => {
    const { debt, transaction } = engine.createInstallmentPurchase({
      amount: -180000,
      installments: 6,
      category: 'consumo.ropa',
      accountId: 'id_2', // CC Mastercard
      description: 'Demo Purchase',
    })

    // Debt creada correctamente
    expect(debt.totalAmount).toBe(-180000)
    expect(debt.installmentAmount).toBe(-30000)
    expect(debt.installments).toBe(6)
    expect(debt.installmentsPaid).toBe(0)
    expect(debt.remainingAmount).toBe(-180000)
    expect(debt.status).toBe('active')

    // Transaction es expense por el TOTAL
    expect(transaction.type).toBe('expense')
    expect(transaction.amount).toBe(-180000)

    // TC balance movio por el total
    expect(engine.accounts[1].balance).toBe(-180000)

    // RECONCILIACION: delta = 0
    const status = engine.getReconciliationStatus()
    expect(status.position).toBe(1000000 + (-180000)) // Wallet + TC
    expect(status.accumulated).toBe(1000000 + (-180000)) // apertura + expense total
    expect(status.delta).toBe(0)
    expect(status.isBalanced).toBe(true)
  })

  it('pago de cuota mensual NO afecta delta', () => {
    engine.createInstallmentPurchase({
      amount: -180000,
      installments: 6,
      accountId: 'id_2',
      description: 'Demo Purchase',
    })

    const debtId = engine.debts[0].id

    // Pagar cuota 1
    const { transaction, debt } = engine.payDebtInstallment(debtId, '2026-05-01')
    expect(transaction.type).toBe('debt_payment')
    expect(transaction.amount).toBe(-30000)
    expect(debt.installmentsPaid).toBe(1)
    expect(debt.remainingAmount).toBe(-150000)

    // Delta sigue en 0 (debt_payment no afecta accumulated)
    const status = engine.getReconciliationStatus()
    expect(status.delta).toBe(0)
  })

  it('pagar todas las cuotas: deuda queda pagada, remaining = 0', () => {
    engine.createInstallmentPurchase({
      amount: -180000,
      installments: 6,
      accountId: 'id_2',
      description: 'Demo Purchase',
    })
    const debtId = engine.debts[0].id

    for (let i = 0; i < 6; i++) {
      engine.payDebtInstallment(debtId)
    }

    const debt = engine.debts[0]
    expect(debt.installmentsPaid).toBe(6)
    expect(debt.remainingAmount).toBe(0)
    expect(debt.status).toBe('paid')

    // No se puede pagar mas
    expect(() => engine.payDebtInstallment(debtId)).toThrow('not found or already paid')
  })

  it('flujo mensual muestra cuota, no el total', () => {
    engine.createInstallmentPurchase({
      amount: -180000,
      installments: 6,
      accountId: 'id_2',
      description: 'Demo Purchase',
      date: '2026-03-15',
    })

    engine.payDebtInstallment(engine.debts[0].id, '2026-04-15')

    const marchSummary = engine.getMonthlySummary('2026-03')
    const aprilSummary = engine.getMonthlySummary('2026-04')

    // Marzo: el expense total aparece
    expect(marchSummary.expenses).toBe(-180000)

    // Abril: solo el debt_payment (no es expense)
    expect(aprilSummary.expenses).toBe(0)
    expect(aprilSummary.debtPayments).toBe(-30000)
  })
})

// ============================================================
// 4. REDONDEO DE CUOTAS
// ============================================================

describe('Redondeo de cuotas', () => {
  beforeEach(() => {
    engine.createAccount({ name: 'TC', type: 'liability', subtype: 'credit_card', balance: 0 })
  })

  it('$100,000 en 3 cuotas: ultima cuota absorbe residuo', () => {
    engine.createInstallmentPurchase({
      amount: -100000,
      installments: 3,
      accountId: 'id_1',
      description: 'Test',
    })

    const debt = engine.debts[0]
    expect(debt.installmentAmount).toBe(-33333) // truncated
    expect(debt.lastInstallmentAmount).toBe(-33334) // absorbe el peso extra
    expect(debt.installmentAmount * 2 + debt.lastInstallmentAmount).toBe(-100000)
  })

  it('pagar 3 cuotas con redondeo: remaining llega a 0 exacto', () => {
    engine.createInstallmentPurchase({
      amount: -100000,
      installments: 3,
      accountId: 'id_1',
      description: 'Test',
    })

    const debtId = engine.debts[0].id
    engine.payDebtInstallment(debtId) // cuota 1: -33333
    engine.payDebtInstallment(debtId) // cuota 2: -33333
    engine.payDebtInstallment(debtId) // cuota 3: -33334 (last)

    expect(engine.debts[0].remainingAmount).toBe(0)
    expect(engine.debts[0].status).toBe('paid')
  })

  it('$1 en 3 cuotas: edge case extremo', () => {
    engine.createInstallmentPurchase({
      amount: -1,
      installments: 3,
      accountId: 'id_1',
      description: 'Micro',
    })

    const debt = engine.debts[0]
    expect(debt.installmentAmount).toBe(0) // trunc(-1/3) = 0
    expect(debt.lastInstallmentAmount).toBe(-1) // -1 - (0 * 2) = -1
  })

  it('cuotas exactas: no hay residuo', () => {
    engine.createInstallmentPurchase({
      amount: -120000,
      installments: 6,
      accountId: 'id_1',
      description: 'Exact',
    })

    const debt = engine.debts[0]
    expect(debt.installmentAmount).toBe(-20000)
    expect(debt.lastInstallmentAmount).toBe(-20000)
  })
})

// ============================================================
// 5. TRANSFERENCIAS
// ============================================================

describe('Transferencias', () => {
  beforeEach(() => {
    engine.createAccount({ name: 'Checking', type: 'asset', subtype: 'debit', balance: 500000 })
    engine.createAccount({ name: 'Efectivo', type: 'asset', subtype: 'cash', balance: 10000 })
    engine.createAccount({ name: 'CC Visa', type: 'liability', subtype: 'credit_card', balance: -200000, creditLimit: 1500000 })
    // Apertura
    engine.createOpeningBalance('id_1')
    engine.createOpeningBalance('id_2')
    engine.createOpeningBalance('id_3')
  })

  it('retiro ATM: Checking baja, Efectivo sube, delta no cambia', () => {
    engine.createTransfer({
      fromAccountId: 'id_1', // Checking
      toAccountId: 'id_2', // Efectivo
      amount: 100000,
      description: 'Retiro ATM',
    })

    expect(engine.accounts[0].balance).toBe(400000) // Checking
    expect(engine.accounts[1].balance).toBe(110000) // Efectivo
    expect(engine.getReconciliationStatus().delta).toBe(0)
  })

  it('pago TC: Checking baja, TC sube, delta no cambia', () => {
    engine.createTransfer({
      fromAccountId: 'id_1', // Checking
      toAccountId: 'id_3', // CC Visa
      amount: 200000,
      description: 'Pago TC',
    })

    expect(engine.accounts[0].balance).toBe(300000) // Checking
    expect(engine.accounts[2].balance).toBe(0) // CC Visa saldada
    expect(engine.getReconciliationStatus().delta).toBe(0)
  })

  it('transfer no aparece como gasto ni ingreso', () => {
    engine.createTransfer({
      fromAccountId: 'id_1',
      toAccountId: 'id_2',
      amount: 100000,
      description: 'Retiro',
    })

    const summary = engine.getMonthlySummary('2026-04')
    expect(summary.income).toBe(0)
    expect(summary.expenses).toBe(0)
  })

  it('monto 0 o negativo lanza error', () => {
    expect(() => engine.createTransfer({
      fromAccountId: 'id_1', toAccountId: 'id_2', amount: 0, description: 'Bad',
    })).toThrow('positive')

    expect(() => engine.createTransfer({
      fromAccountId: 'id_1', toAccountId: 'id_2', amount: -100, description: 'Bad',
    })).toThrow('positive')
  })
})

// ============================================================
// 6. REFUNDS
// ============================================================

describe('Refunds', () => {
  beforeEach(() => {
    engine.createAccount({ name: 'TC', type: 'liability', subtype: 'credit_card', balance: 0 })
    engine.createOpeningBalance('id_1')
  })

  it('refund reduce deuda TC y sube acumulado, delta = 0', () => {
    // Compra
    engine.createTransaction({ amount: -50000, category: 'consumo.ropa', accountId: 'id_1', description: 'Ropa' })
    expect(engine.accounts[0].balance).toBe(-50000)

    // Devolucion
    engine.createRefund({ amount: 50000, category: 'consumo.ropa', accountId: 'id_1', description: 'Devolucion ropa' })
    expect(engine.accounts[0].balance).toBe(0)

    const status = engine.getReconciliationStatus()
    expect(status.delta).toBe(0)
  })

  it('refund no aparece como ingreso en monthly summary', () => {
    engine.createTransaction({ amount: -50000, accountId: 'id_1', description: 'Compra' })
    engine.createRefund({ amount: 50000, accountId: 'id_1', description: 'Devolucion' })

    const summary = engine.getMonthlySummary('2026-04')
    expect(summary.income).toBe(0) // refund NO es ingreso
    expect(summary.expenses).toBe(-50000 + 50000) // gasto neto = 0
  })

  it('refund parcial mantiene delta en 0', () => {
    engine.createTransaction({ amount: -100000, accountId: 'id_1', description: 'Compra' })
    engine.createRefund({ amount: 30000, accountId: 'id_1', description: 'Devolucion parcial' })

    expect(engine.accounts[0].balance).toBe(-70000)
    expect(engine.getReconciliationStatus().delta).toBe(0)
  })
})

// ============================================================
// 7. ARCHIVAR CUENTAS
// ============================================================

describe('Archivar cuentas', () => {
  it('no permite archivar cuenta con deudas activas', () => {
    const tc = engine.createAccount({ name: 'TC', type: 'liability', subtype: 'credit_card', balance: 0 })
    engine.createInstallmentPurchase({
      amount: -100000, installments: 3, accountId: tc.id, description: 'Test',
    })

    expect(() => engine.archiveAccount(tc.id)).toThrow('active debts')
  })

  it('permite archivar cuenta sin deudas activas', () => {
    const tc = engine.createAccount({ name: 'TC', type: 'liability', subtype: 'credit_card', balance: 0 })
    engine.archiveAccount(tc.id)
    expect(engine.accounts[0].isArchived).toBe(true)
  })

  it('cuenta archivada no participa en reconciliacion', () => {
    const mp = engine.createAccount({ name: 'Wallet', type: 'asset', subtype: 'debit', balance: 500000 })
    const checking = engine.createAccount({ name: 'Checking', type: 'asset', subtype: 'debit', balance: 200000 })

    engine.archiveAccount(checking.id)

    const status = engine.getReconciliationStatus()
    expect(status.position).toBe(500000) // solo Wallet
  })
})

// ============================================================
// 8. CREDIT CARD STATUS
// ============================================================

describe('Credit card status', () => {
  it('muestra estado de cuenta + cuotas futuras + cupo disponible', () => {
    const tc = engine.createAccount({
      name: 'CC Mastercard', type: 'liability', subtype: 'credit_card',
      balance: 0, creditLimit: 1500000,
    })

    // Compra al contado
    engine.createTransaction({ amount: -50000, accountId: tc.id, description: 'Almuerzo' })

    // Compra en cuotas
    engine.createInstallmentPurchase({
      amount: -180000, installments: 6, accountId: tc.id, description: 'Demo Purchase',
    })

    const ccStatus = engine.getCreditCardStatus(tc.id)
    expect(ccStatus.statementBalance).toBe(-50000 + -180000) // -230000
    expect(ccStatus.futureInstallments).toBe(-180000) // toda la deuda aun pendiente
    expect(ccStatus.totalUsed).toBe(230000 + 180000) // abs values
    expect(ccStatus.available).toBe(1500000 + (-230000) + (-180000))
  })
})

// ============================================================
// 9. SNAPSHOTS
// ============================================================

describe('Snapshots', () => {
  it('snapshot cuadrado cuando delta = 0', () => {
    const mp = engine.createAccount({ name: 'Wallet', type: 'asset', subtype: 'debit', balance: 1000000 })
    engine.createOpeningBalance(mp.id)

    engine.createTransaction({ amount: -50000, accountId: mp.id, description: 'Gasto' })

    const snapshot = engine.createSnapshot('2026-04-01')
    expect(snapshot.status).toBe('balanced')
    expect(snapshot.delta).toBe(0)
    expect(snapshot.netWorth).toBe(950000)
  })

  it('no permite dos snapshots en la misma fecha', () => {
    engine.createAccount({ name: 'Wallet', type: 'asset', subtype: 'debit', balance: 0 })
    engine.createSnapshot('2026-04-01')
    expect(() => engine.createSnapshot('2026-04-01')).toThrow('already exists')
  })

  it('snapshot incluye cuentas off-budget en net_worth pero no en delta', () => {
    engine.createAccount({ name: 'Wallet', type: 'asset', subtype: 'debit', balance: 1000000 })
    engine.createAccount({ name: 'Broker', type: 'asset', subtype: 'investment', balance: 14500000, onBudget: false })

    engine.createOpeningBalance('id_1')

    const snapshot = engine.createSnapshot('2026-04-01')
    expect(snapshot.totalAssets).toBe(1000000 + 14500000) // incluye todo
    expect(snapshot.netWorth).toBe(15500000)

    // Reconciliacion solo on-budget
    const status = engine.getReconciliationStatus()
    expect(status.position).toBe(1000000) // solo Wallet
    expect(status.delta).toBe(0)
  })
})

// ============================================================
// 10. ESCENARIO COMPLETO: MES DE FRANCISCO
// ============================================================

describe('Escenario completo: mes del usuario', () => {
  it('simula un mes completo y verifica que todo cuadra', () => {
    // Setup: cuentas iniciales
    const mp = engine.createAccount({ name: 'Wallet', type: 'asset', subtype: 'debit', balance: 500000 })
    const checking = engine.createAccount({ name: 'Checking', type: 'asset', subtype: 'debit', balance: 80000 })
    const efectivo = engine.createAccount({ name: 'Efectivo', type: 'asset', subtype: 'cash', balance: 10000 })
    const ccVisa = engine.createAccount({ name: 'CC Visa', type: 'liability', subtype: 'credit_card', balance: -50000, creditLimit: 1500000 })
    const ccMaster = engine.createAccount({ name: 'CC Mastercard', type: 'liability', subtype: 'credit_card', balance: -30000, creditLimit: 1500000 })

    // Apertura
    engine.createOpeningBalance(mp.id)
    engine.createOpeningBalance(checking.id)
    engine.createOpeningBalance(efectivo.id)
    engine.createOpeningBalance(ccVisa.id)
    engine.createOpeningBalance(ccMaster.id)

    expect(engine.getReconciliationStatus().delta).toBe(0)

    // Ingresos del mes
    engine.createTransaction({ amount: 2000000, category: 'ingreso.sueldo', accountId: mp.id, description: 'Sueldo Client Corp', date: '2026-04-05' })
    engine.createTransaction({ amount: 225000, category: 'ingreso.arriendo', accountId: mp.id, description: 'Arriendo', date: '2026-04-01' })

    expect(engine.getReconciliationStatus().delta).toBe(0)

    // Gastos del mes
    engine.createTransaction({ amount: -150000, category: 'necesidad.bencina', accountId: checking.id, description: 'Bencina', date: '2026-04-10' })
    engine.createTransaction({ amount: -80000, category: 'consumo.libre', accountId: efectivo.id, description: 'Gastos varios', date: '2026-04-15' })

    expect(engine.getReconciliationStatus().delta).toBe(0)

    // Compra en cuotas con TC
    engine.createInstallmentPurchase({
      amount: -180000,
      installments: 6,
      category: 'consumo.ropa',
      accountId: ccMaster.id,
      description: 'Demo Purchase',
      date: '2026-04-20',
    })

    expect(engine.getReconciliationStatus().delta).toBe(0)

    // Pago de CC Visa (transferencia)
    engine.createTransfer({
      fromAccountId: checking.id,
      toAccountId: ccVisa.id,
      amount: 50000,
      description: 'Pago CC Visa',
      date: '2026-04-25',
    })

    expect(engine.getReconciliationStatus().delta).toBe(0)
    expect(engine.accounts.find(a => a.name === 'CC Visa')!.balance).toBe(0) // TC saldada

    // Refund de una compra
    engine.createRefund({
      amount: 30000,
      category: 'consumo.ropa',
      accountId: ccMaster.id,
      description: 'Demo Partial Refund',
      date: '2026-04-28',
    })

    expect(engine.getReconciliationStatus().delta).toBe(0)

    // Snapshot de cierre
    const snapshot = engine.createSnapshot('2026-04-30')
    expect(snapshot.status).toBe('balanced')
    expect(snapshot.delta).toBe(0)

    // Resumen del mes
    const summary = engine.getMonthlySummary('2026-04')
    expect(summary.income).toBe(2000000 + 225000)
    expect(summary.expenses).toBe(-150000 + -80000 + -180000 + 30000) // incluye refund como reduccion
  })
})

// ============================================================
// 11. EDGE CASES CRITICOS
// ============================================================

describe('Edge cases', () => {
  it('compra en cuotas + pago TC + cuota mensual: todo cuadra', () => {
    engine.createAccount({ name: 'Checking', type: 'asset', subtype: 'debit', balance: 500000 })
    engine.createAccount({ name: 'TC', type: 'liability', subtype: 'credit_card', balance: 0, creditLimit: 1000000 })
    engine.createOpeningBalance('id_1')

    // Comprar en 3 cuotas
    engine.createInstallmentPurchase({
      amount: -90000, installments: 3, accountId: 'id_2', description: 'Compra',
    })
    expect(engine.getReconciliationStatus().delta).toBe(0)

    // Pagar TC (transferencia Checking -> TC)
    engine.createTransfer({ fromAccountId: 'id_1', toAccountId: 'id_2', amount: 90000, description: 'Pago TC' })
    expect(engine.accounts[1].balance).toBe(0) // TC saldada este mes
    expect(engine.getReconciliationStatus().delta).toBe(0)

    // Mes siguiente: cuota 1
    engine.payDebtInstallment(engine.debts[0].id, '2026-05-01')
    expect(engine.getReconciliationStatus().delta).toBe(0)

    // Mes siguiente: cuota 2
    engine.payDebtInstallment(engine.debts[0].id, '2026-06-01')
    expect(engine.getReconciliationStatus().delta).toBe(0)

    // Mes siguiente: cuota 3 (ultima)
    engine.payDebtInstallment(engine.debts[0].id, '2026-07-01')
    expect(engine.debts[0].status).toBe('paid')
    expect(engine.debts[0].remainingAmount).toBe(0)
    expect(engine.getReconciliationStatus().delta).toBe(0)
  })

  it('multiples deudas en la misma TC mantienen delta = 0', () => {
    engine.createAccount({ name: 'TC', type: 'liability', subtype: 'credit_card', balance: 0 })

    engine.createInstallmentPurchase({ amount: -120000, installments: 6, accountId: 'id_1', description: 'Deuda 1' })
    engine.createInstallmentPurchase({ amount: -60000, installments: 3, accountId: 'id_1', description: 'Deuda 2' })
    engine.createInstallmentPurchase({ amount: -45000, installments: 3, accountId: 'id_1', description: 'Deuda 3' })

    expect(engine.accounts[0].balance).toBe(-225000) // total de las 3 compras
    expect(engine.getReconciliationStatus().delta).toBe(0)

    // Pagar cuotas de cada deuda
    engine.payDebtInstallment(engine.debts[0].id)
    engine.payDebtInstallment(engine.debts[1].id)
    engine.payDebtInstallment(engine.debts[2].id)

    expect(engine.getReconciliationStatus().delta).toBe(0)
  })

  it('transferencia SpA -> Personal no cambia patrimonio total', () => {
    engine.createAccount({ name: 'SpA Checking', type: 'asset', subtype: 'debit', balance: 5000000, entity: 'spa' })
    engine.createAccount({ name: 'Wallet', type: 'asset', subtype: 'debit', balance: 1000000 })

    const totalBefore = engine.accounts.reduce((s, a) => s + a.balance, 0)

    engine.createTransfer({
      fromAccountId: 'id_1', // SpA Checking
      toAccountId: 'id_2', // Wallet
      amount: 2000000,
      description: 'Sueldo',
    })

    const totalAfter = engine.accounts.reduce((s, a) => s + a.balance, 0)
    expect(totalAfter).toBe(totalBefore) // patrimonio total no cambia
    expect(engine.accounts[0].balance).toBe(3000000)
    expect(engine.accounts[1].balance).toBe(3000000)
  })
})
