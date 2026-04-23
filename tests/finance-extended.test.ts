import { describe, it, expect, beforeEach } from 'vitest'
import { FinanceEngine, resetIds } from './engine'

let e: FinanceEngine

beforeEach(() => {
  resetIds()
  e = new FinanceEngine()
})

// Helper: setup standard accounts and apertura
function setupStandard() {
  const mp = e.createAccount({ name: 'Wallet', type: 'asset', subtype: 'debit', balance: 3000000 })
  const checking = e.createAccount({ name: 'Checking', type: 'asset', subtype: 'debit', balance: 500000 })
  const efectivo = e.createAccount({ name: 'Efectivo', type: 'asset', subtype: 'cash', balance: 50000 })
  const ccVisa = e.createAccount({ name: 'CC Visa', type: 'liability', subtype: 'credit_card', balance: 0, creditLimit: 2000000 })
  const ccMaster = e.createAccount({ name: 'CC Mastercard', type: 'liability', subtype: 'credit_card', balance: 0, creditLimit: 1500000 })

  // Apertura limpia: no mueve balances, solo registra en acumulado
  e.createOpeningBalance(mp.id)
  e.createOpeningBalance(checking.id)
  e.createOpeningBalance(efectivo.id)
  // TC con balance 0 no necesita apertura (ya cuadra)

  return { mp, checking, efectivo, ccVisa, ccMaster }
}

// ============================================================
// FLUJO 1: SETUP INICIAL — VARIANTES
// ============================================================

describe('Flujo 1: Setup inicial — variantes', () => {
  it('setup con cuentas por cobrar (receivables)', () => {
    const mp = e.createAccount({ name: 'Wallet', type: 'asset', subtype: 'debit', balance: 1000000 })
    const friendA = e.createReceivable({ name: 'Friend A', amount: 470000 })
    const friendB = e.createReceivable({ name: 'Friend B', amount: 300000 })

    const total = 1000000 + 470000 + 300000
    e.createTransaction({ amount: total, accountId: mp.id, description: 'Apertura', type: 'adjustment' })
    e.updateAccountBalance(mp.id, 1000000)

    expect(e.getReconciliationStatus().delta).toBe(0)
    expect(e.getReconciliationStatus().position).toBe(total)
  })

  it('setup con TC con deuda preexistente', () => {
    const mp = e.createAccount({ name: 'Wallet', type: 'asset', subtype: 'debit', balance: 1000000 })
    const tc = e.createAccount({ name: 'TC', type: 'liability', subtype: 'credit_card', balance: -200000, creditLimit: 1500000 })

    const total = 1000000 + (-200000)
    e.createTransaction({ amount: total, accountId: mp.id, description: 'Apertura', type: 'adjustment' })
    e.updateAccountBalance(mp.id, 1000000)

    expect(e.getReconciliationStatus().delta).toBe(0)
  })

  it('setup con inversiones off-budget no descuadra', () => {
    const mp = e.createAccount({ name: 'Wallet', type: 'asset', subtype: 'debit', balance: 500000 })
    e.createAccount({ name: 'Broker', type: 'asset', subtype: 'investment', balance: 14500000, onBudget: false })
    e.createAccount({ name: '50% PropertyA', type: 'asset', subtype: 'property', balance: 35000000, onBudget: false })

    e.createTransaction({ amount: 500000, accountId: mp.id, description: 'Apertura', type: 'adjustment' })
    e.updateAccountBalance(mp.id, 500000)

    const status = e.getReconciliationStatus()
    expect(status.position).toBe(500000) // solo on-budget
    expect(status.delta).toBe(0)
  })

  it('setup con deuda a terceros (payable)', () => {
    const mp = e.createAccount({ name: 'Wallet', type: 'asset', subtype: 'debit', balance: 1000000 })
    const cama = e.createAccount({ name: 'Deuda Cama', type: 'liability', subtype: 'payable', balance: -308000 })

    const total = 1000000 + (-308000)
    e.createTransaction({ amount: total, accountId: mp.id, description: 'Apertura', type: 'adjustment' })
    e.updateAccountBalance(mp.id, 1000000)

    expect(e.getReconciliationStatus().delta).toBe(0)
  })
})

// ============================================================
// FLUJO 2: TRANSACCIONES DIA A DIA — EXHAUSTIVO
// ============================================================

describe('Flujo 2: Transacciones dia a dia', () => {
  beforeEach(() => setupStandard())

  it('gasto con debito reduce balance y mantiene delta', () => {
    e.createTransaction({ amount: -150000, category: 'necesidad.bencina', accountId: 'id_2', description: 'Bencina', date: '2026-04-10' })
    expect(e.accounts[1].balance).toBe(350000)
    expect(e.getReconciliationStatus().delta).toBe(0)
  })

  it('gasto con efectivo reduce cash', () => {
    e.createTransaction({ amount: -30000, category: 'consumo.comida', accountId: 'id_3', description: 'Almuerzo', date: '2026-04-10' })
    expect(e.accounts[2].balance).toBe(20000)
    expect(e.getReconciliationStatus().delta).toBe(0)
  })

  it('gasto con TC al contado', () => {
    e.createTransaction({ amount: -45000, category: 'consumo.comida', accountId: 'id_4', description: 'Restaurant', date: '2026-04-12' })
    expect(e.accounts[3].balance).toBe(-45000) // CC Visa
    expect(e.getReconciliationStatus().delta).toBe(0)
  })

  it('ingreso de sueldo', () => {
    e.createTransaction({ amount: 2000000, category: 'ingreso.sueldo', accountId: 'id_1', description: 'Sueldo Client Corp', date: '2026-04-05' })
    expect(e.accounts[0].balance).toBe(5000000)
    expect(e.getReconciliationStatus().delta).toBe(0)
  })

  it('ingreso de arriendo', () => {
    e.createTransaction({ amount: 225000, category: 'ingreso.arriendo', accountId: 'id_1', description: 'Arriendo', date: '2026-04-01' })
    expect(e.getReconciliationStatus().delta).toBe(0)
  })

  it('ingreso freelance en otra cuenta', () => {
    e.createTransaction({ amount: 315000, category: 'ingreso.freelance', accountId: 'id_2', description: 'Freelance', date: '2026-04-15' })
    expect(e.accounts[1].balance).toBe(815000)
    expect(e.getReconciliationStatus().delta).toBe(0)
  })

  it('multiples gastos en un dia mantienen delta', () => {
    e.createTransaction({ amount: -15000, accountId: 'id_3', description: 'Cafe' })
    e.createTransaction({ amount: -8000, accountId: 'id_3', description: 'Colacion' })
    e.createTransaction({ amount: -3500, accountId: 'id_3', description: 'Micro' })
    expect(e.accounts[2].balance).toBe(50000 - 15000 - 8000 - 3500)
    expect(e.getReconciliationStatus().delta).toBe(0)
  })

  it('gasto con fecha pasada se registra correctamente', () => {
    e.createTransaction({ amount: -100000, accountId: 'id_1', description: 'Gasto olvidado', date: '2026-03-28' })
    const marchTxs = e.transactions.filter(t => t.date.startsWith('2026-03'))
    expect(marchTxs.length).toBe(1)
    expect(e.getReconciliationStatus().delta).toBe(0)
  })
})

// ============================================================
// FLUJO 3: CUADRAR (RECONCILIACION)
// ============================================================

describe('Flujo 3: Cuadrar', () => {
  it('delta > 0: ingreso no registrado', () => {
    const mp = e.createAccount({ name: 'Wallet', type: 'asset', subtype: 'debit', balance: 1000000 })
    e.createTransaction({ amount: 1000000, accountId: mp.id, description: 'Apertura', type: 'adjustment' })
    e.updateAccountBalance(mp.id, 1000000)

    // Alguien deposito 50K sin registrar
    e.updateAccountBalance(mp.id, 1050000)

    const status = e.getReconciliationStatus()
    expect(status.delta).toBe(50000) // position > accumulated
    expect(status.isBalanced).toBe(false)

    // Registrar ajuste para cuadrar
    e.createTransaction({ amount: 50000, accountId: mp.id, description: 'Ingreso no registrado', type: 'adjustment' })
    e.updateAccountBalance(mp.id, 1050000)

    expect(e.getReconciliationStatus().delta).toBe(0)
  })

  it('delta < 0: gasto no registrado', () => {
    const mp = e.createAccount({ name: 'Wallet', type: 'asset', subtype: 'debit', balance: 1000000 })
    e.createTransaction({ amount: 1000000, accountId: mp.id, description: 'Apertura', type: 'adjustment' })
    e.updateAccountBalance(mp.id, 1000000)

    // Gasto de 30K sin registrar
    e.updateAccountBalance(mp.id, 970000)

    const status = e.getReconciliationStatus()
    expect(status.delta).toBe(-30000)

    // Ajuste
    e.createTransaction({ amount: -30000, accountId: mp.id, description: 'Gasto no registrado', type: 'adjustment' })
    e.updateAccountBalance(mp.id, 970000)

    expect(e.getReconciliationStatus().delta).toBe(0)
  })

  it('snapshot cuadrado', () => {
    const mp = e.createAccount({ name: 'Wallet', type: 'asset', subtype: 'debit', balance: 500000 })
    e.createTransaction({ amount: 500000, accountId: mp.id, description: 'Apertura', type: 'adjustment' })
    e.updateAccountBalance(mp.id, 500000)

    const snap = e.createSnapshot('2026-04-30')
    expect(snap.status).toBe('balanced')
    expect(snap.delta).toBe(0)
  })

  it('snapshot descuadrado se permite pero queda marcado', () => {
    const mp = e.createAccount({ name: 'Wallet', type: 'asset', subtype: 'debit', balance: 500000 })
    e.createTransaction({ amount: 400000, accountId: mp.id, description: 'Apertura incompleta', type: 'adjustment' })
    e.updateAccountBalance(mp.id, 500000)

    const snap = e.createSnapshot('2026-04-30')
    expect(snap.status).toBe('unbalanced')
    expect(snap.delta).toBe(100000)
  })

  it('dos snapshots en fechas distintas OK', () => {
    e.createAccount({ name: 'Wallet', type: 'asset', subtype: 'debit', balance: 0 })
    e.createSnapshot('2026-03-31')
    e.createSnapshot('2026-04-30')
    expect(e.snapshots.length).toBe(2)
  })
})

// ============================================================
// FLUJO 4: CUOTAS — TODOS LOS CASOS
// ============================================================

describe('Flujo 4: Cuotas — exhaustivo', () => {
  beforeEach(() => setupStandard())

  it('compra en cuotas con TC: ciclo completo de 12 cuotas', () => {
    e.createInstallmentPurchase({
      amount: -462000, installments: 12, category: 'consumo.muebles',
      accountId: 'id_5', description: 'Cama',
    })

    expect(e.getReconciliationStatus().delta).toBe(0)

    const debt = e.debts[0]
    expect(debt.installmentAmount).toBe(-38500)
    expect(debt.lastInstallmentAmount).toBe(-38500) // 462000 / 12 = exact
    expect(debt.remainingAmount).toBe(-462000)

    // Pagar las 12 cuotas
    for (let i = 0; i < 12; i++) {
      e.payDebtInstallment(debt.id, `2026-${String(5 + i).padStart(2, '0')}-01`)
      expect(e.getReconciliationStatus().delta).toBe(0)
    }

    expect(e.debts[0].status).toBe('paid')
    expect(e.debts[0].remainingAmount).toBe(0)
  })

  it('multiples compras en cuotas en la misma TC', () => {
    const tcId = 'id_5' // CC Mastercard

    e.createInstallmentPurchase({ amount: -120000, installments: 6, accountId: tcId, description: 'Demo Purchase 2' })
    e.createInstallmentPurchase({ amount: -60000, installments: 3, accountId: tcId, description: 'Libro' })
    e.createInstallmentPurchase({ amount: -90000, installments: 3, accountId: tcId, description: 'Perfume' })

    expect(e.accounts[4].balance).toBe(-270000) // total de las 3
    expect(e.getReconciliationStatus().delta).toBe(0)

    const ccStatus = e.getCreditCardStatus(tcId)
    expect(ccStatus.totalUsed).toBe(270000 + 270000) // balance + remaining (all are remaining since 0 paid)
    expect(ccStatus.available).toBe(1500000 - 270000 - 270000)
  })

  it('grace period: primera cuota el mes siguiente', () => {
    e.createInstallmentPurchase({
      amount: -180000, installments: 6, accountId: 'id_5', description: 'Demo Purchase',
      date: '2026-04-15', firstPaymentDate: '2026-05-15',
    })

    const debt = e.debts[0]
    expect(debt.firstPaymentDate).toBe('2026-05-15')
    expect(debt.nextPaymentDate).toBe('2026-05-15')
    expect(debt.installmentsPaid).toBe(0) // no se pago aun

    // El gasto completo ya se registro
    expect(e.getReconciliationStatus().delta).toBe(0)
  })

  it('pago anticipado (lump sum)', () => {
    e.createInstallmentPurchase({
      amount: -180000, installments: 6, accountId: 'id_5', description: 'Demo Purchase',
    })

    // Pagar 2 cuotas normales
    e.payDebtInstallment(e.debts[0].id)
    e.payDebtInstallment(e.debts[0].id)
    expect(e.debts[0].remainingAmount).toBe(-120000)

    // Pago anticipado del resto
    e.payOffDebt(e.debts[0].id)
    expect(e.debts[0].status).toBe('paid')
    expect(e.debts[0].remainingAmount).toBe(0)
    expect(e.getReconciliationStatus().delta).toBe(0)
  })

  it('pago anticipado con descuento', () => {
    e.createInstallmentPurchase({
      amount: -180000, installments: 6, accountId: 'id_5', description: 'Demo Purchase',
    })

    // Pagar 2 cuotas
    e.payDebtInstallment(e.debts[0].id)
    e.payDebtInstallment(e.debts[0].id)

    // Pago anticipado con descuento: solo pagan 110K de los 120K restantes
    e.payOffDebt(e.debts[0].id, -110000)

    expect(e.debts[0].status).toBe('paid')
    expect(e.debts[0].remainingAmount).toBe(0)
    // El descuento de 10K se registra como adjustment
    const adjustments = e.transactions.filter(t => t.type === 'adjustment' && t.description.includes('Discount'))
    expect(adjustments.length).toBe(1)
    expect(adjustments[0].amount).toBe(10000) // devuelve 10K
    expect(e.getReconciliationStatus().delta).toBe(0)
  })

  it('redondeo con montos grandes: $999,999 en 7 cuotas', () => {
    e.createInstallmentPurchase({
      amount: -999999, installments: 7, accountId: 'id_5', description: 'Grande',
    })

    const debt = e.debts[0]
    const regularTotal = debt.installmentAmount * 6
    expect(regularTotal + debt.lastInstallmentAmount).toBe(-999999)

    // Pagar todo
    for (let i = 0; i < 7; i++) e.payDebtInstallment(debt.id)
    expect(debt.remainingAmount).toBe(0)
    expect(debt.status).toBe('paid')
  })

  it('compra en 1 cuota (al contado via debt system)', () => {
    e.createInstallmentPurchase({
      amount: -50000, installments: 1, accountId: 'id_5', description: 'Compra unica',
    })

    const debt = e.debts[0]
    expect(debt.installmentAmount).toBe(-50000)
    expect(debt.lastInstallmentAmount).toBe(-50000)

    e.payDebtInstallment(debt.id)
    expect(debt.status).toBe('paid')
    expect(debt.remainingAmount).toBe(0)
  })
})

// ============================================================
// FLUJO 5: CUENTAS POR COBRAR
// ============================================================

describe('Flujo 5: Cuentas por cobrar', () => {
  beforeEach(() => setupStandard())

  it('crear receivable y recibir pago parcial', () => {
    const friendA = e.createReceivable({ name: 'Friend A', amount: 470000 })
    e.createOpeningBalance(friendA.id)

    // Friend A paga 50K
    e.receivePartialPayment(friendA.id, 50000, 'id_1', '2026-04-15') // a Wallet
    expect(e.accounts.find(a => a.name === 'Friend A')!.balance).toBe(420000)
    expect(e.accounts[0].balance).toBe(3050000) // Wallet subio
    expect(e.getReconciliationStatus().delta).toBe(0) // transfer no afecta
  })

  it('pagar receivable completo lo deja en 0', () => {
    const friendB = e.createReceivable({ name: 'Friend B', amount: 300000 })
    e.createOpeningBalance(friendB.id)

    e.receivePartialPayment(friendB.id, 300000, 'id_1')
    expect(e.accounts.find(a => a.name === 'Friend B')!.balance).toBe(0)
    expect(e.getReconciliationStatus().delta).toBe(0)
  })

  it('multiples pagos parciales suman correctamente', () => {
    const friendA = e.createReceivable({ name: 'Friend A', amount: 620000 })
    e.createOpeningBalance(friendA.id)

    e.receivePartialPayment(friendA.id, 50000, 'id_1')
    e.receivePartialPayment(friendA.id, 100000, 'id_1')
    e.receivePartialPayment(friendA.id, 70000, 'id_2') // a Checking

    expect(e.accounts.find(a => a.name === 'Friend A')!.balance).toBe(400000)
    expect(e.getReconciliationStatus().delta).toBe(0)
  })
})

// ============================================================
// FLUJO 6: TRANSACCIONES USD
// ============================================================

describe('Flujo 6: Multi-currency', () => {
  it('cuenta en USD con conversion a CLP', () => {
    const mp = e.createAccount({ name: 'Wallet', type: 'asset', subtype: 'debit', balance: 1000000 })
    e.createTransaction({ amount: 1000000, accountId: mp.id, description: 'Apertura', type: 'adjustment' })
    e.updateAccountBalance(mp.id, 1000000)

    // Client SaaS en USD (saldo en CLP convertido)
    const clientSaas = e.createReceivable({ name: 'clientSaas', amount: 521246 })

    e.createOpeningBalance(clientSaas.id)

    expect(e.getReconciliationStatus().position).toBe(1521246)
    expect(e.getReconciliationStatus().delta).toBe(0)

    // Cobro parcial de clientSaas
    e.receivePartialPayment(clientSaas.id, 186000, mp.id) // ~$200 USD * 930
    expect(e.accounts.find(a => a.name === 'clientSaas')!.balance).toBe(335246)
    expect(e.getReconciliationStatus().delta).toBe(0)
  })

  it('gasto en USD con TC internacional', () => {
    const mp = e.createAccount({ name: 'Wallet', type: 'asset', subtype: 'debit', balance: 500000 })
    const tc = e.createAccount({ name: 'CC Visa', type: 'liability', subtype: 'credit_card', balance: 0 })
    e.createTransaction({ amount: 500000, accountId: mp.id, description: 'Apertura', type: 'adjustment' })
    e.updateAccountBalance(mp.id, 500000)

    // Compra $39 USD * 930 = 36270 CLP
    e.createTransaction({ amount: -36270, category: 'necesidad.suscripciones', accountId: tc.id, description: 'Claude API ($39 USD @ 930)' })

    expect(e.getReconciliationStatus().delta).toBe(0)
  })
})

// ============================================================
// FLUJO 7: SpA
// ============================================================

describe('Flujo 7: SpA', () => {
  it('facturar, cobrar, pagar sueldo — ciclo completo', () => {
    const spaBank = e.createAccount({ name: 'SpA Checking', type: 'asset', subtype: 'debit', balance: 0, entity: 'spa' })
    const mp = e.createAccount({ name: 'Wallet', type: 'asset', subtype: 'debit', balance: 1000000 })

    // Apertura
    e.createTransaction({ amount: 0, accountId: spaBank.id, description: 'Apertura SpA', type: 'adjustment' })
    e.createTransaction({ amount: 1000000, accountId: mp.id, description: 'Apertura', type: 'adjustment' })
    e.updateAccountBalance(mp.id, 1000000)

    // Cliente paga factura (ingreso SpA)
    e.createTransaction({ amount: 2380000, category: 'ingreso.facturacion', accountId: spaBank.id, description: 'Client Corp Abril' })

    const spaStatus = e.getEntityReconciliation('spa')
    expect(spaStatus.position).toBe(2380000)
    expect(spaStatus.delta).toBe(0)

    // Gastos SpA
    e.createTransaction({ amount: -45000, category: 'gasto.servicios', accountId: spaBank.id, description: 'Claude' })
    e.createTransaction({ amount: -12000, category: 'gasto.servicios', accountId: spaBank.id, description: 'Render' })

    // Transferencia SpA -> Personal (sueldo)
    e.createTransfer({
      fromAccountId: spaBank.id, toAccountId: mp.id, amount: 2000000, description: 'Sueldo Abril',
    })

    expect(e.accounts.find(a => a.name === 'SpA Checking')!.balance).toBe(2380000 - 45000 - 12000 - 2000000)
    expect(e.accounts.find(a => a.name === 'Wallet')!.balance).toBe(3000000)

    // Patrimonio total no cambio por la transferencia
    const totalBalance = e.accounts.reduce((s, a) => s + a.balance, 0)
    expect(totalBalance).toBe(1000000 + 2380000 - 45000 - 12000) // solo ingresos - gastos reales
  })

  it('reconciliacion por entidad funciona por separado', () => {
    const spaBank = e.createAccount({ name: 'SpA Checking', type: 'asset', subtype: 'debit', balance: 0, entity: 'spa' })
    const mp = e.createAccount({ name: 'Wallet', type: 'asset', subtype: 'debit', balance: 0 })

    e.createTransaction({ amount: 0, accountId: spaBank.id, description: 'Apertura', type: 'adjustment' })
    e.createTransaction({ amount: 0, accountId: mp.id, description: 'Apertura', type: 'adjustment' })

    e.createTransaction({ amount: 2000000, accountId: spaBank.id, description: 'Factura' })
    e.createTransaction({ amount: 500000, accountId: mp.id, description: 'Freelance' })

    const spaStatus = e.getEntityReconciliation('spa')
    expect(spaStatus.position).toBe(2000000)
    expect(spaStatus.delta).toBe(0)

    const personalStatus = e.getEntityReconciliation('personal')
    expect(personalStatus.position).toBe(500000)
    expect(personalStatus.delta).toBe(0)
  })
})

// ============================================================
// FLUJO 8: CIERRE DE MES
// ============================================================

describe('Flujo 8: Cierre de mes completo', () => {
  it('mes completo: ingresos, gastos, cuotas, transferencias, snapshot', () => {
    const { mp, checking, efectivo, ccVisa, ccMaster } = setupStandard()

    // Ingresos
    e.createTransaction({ amount: 2000000, category: 'ingreso.sueldo', accountId: mp.id, description: 'Sueldo', date: '2026-04-05' })
    e.createTransaction({ amount: 225000, category: 'ingreso.arriendo', accountId: mp.id, description: 'Arriendo', date: '2026-04-01' })
    e.createTransaction({ amount: 45000, category: 'ingreso.junaeb', accountId: mp.id, description: 'Junaeb', date: '2026-04-10' })

    // Gastos necesidades
    e.createTransaction({ amount: -122099, category: 'necesidad.cargos', accountId: ccVisa.id, description: 'Cargos mensuales', date: '2026-04-01' })
    e.createTransaction({ amount: -150000, category: 'necesidad.bencina', accountId: checking.id, description: 'Bencina', date: '2026-04-08' })
    e.createTransaction({ amount: -80000, category: 'necesidad.casa', accountId: checking.id, description: 'Supermercado', date: '2026-04-12' })

    // Gastos consumo
    e.createTransaction({ amount: -38500, category: 'consumo.libre', accountId: efectivo.id, description: 'Varios', date: '2026-04-15' })
    e.createTransaction({ amount: -30000, category: 'consumo.ropa', accountId: ccMaster.id, description: 'Polera', date: '2026-04-18' })

    // Compra en cuotas
    e.createInstallmentPurchase({
      amount: -180000, installments: 6, category: 'consumo.ropa',
      accountId: ccMaster.id, description: 'Demo Purchase', date: '2026-04-20',
    })

    // Pago de TC
    e.createTransfer({
      fromAccountId: checking.id, toAccountId: ccVisa.id,
      amount: 122099, description: 'Pago CC Visa', date: '2026-04-25',
    })

    // Verificar delta antes del snapshot
    expect(e.getReconciliationStatus().delta).toBe(0)

    // Snapshot
    const snap = e.createSnapshot('2026-04-30')
    expect(snap.status).toBe('balanced')

    // Resumen del mes
    const summary = e.getMonthlySummary('2026-04')
    expect(summary.income).toBe(2000000 + 225000 + 45000)
    expect(summary.expenses).toBe(-122099 - 150000 - 80000 - 38500 - 30000 - 180000)
  })
})

// ============================================================
// FLUJO 10: GESTION DE CUENTAS
// ============================================================

describe('Flujo 10: Gestion de cuentas', () => {
  it('crear cuenta con todos los campos', () => {
    const tc = e.createAccount({
      name: 'CC Visa', type: 'liability', subtype: 'credit_card',
      entity: 'personal', currency: 'CLP', balance: -50000,
      creditLimit: 2000000, onBudget: true,
    })
    expect(tc.name).toBe('CC Visa')
    expect(tc.creditLimit).toBe(2000000)
    expect(tc.isArchived).toBe(false)
  })

  it('dos TC del mismo banco con nombres distintos', () => {
    e.createAccount({ name: 'CC Visa', type: 'liability', subtype: 'credit_card' })
    e.createAccount({ name: 'CC Mastercard 2', type: 'liability', subtype: 'credit_card' })
    expect(e.accounts.length).toBe(2)
  })

  it('renombrar cuenta', () => {
    const acc = e.createAccount({ name: 'Vieja', type: 'asset', subtype: 'debit' })
    e.renameAccount(acc.id, 'Nueva')
    expect(e.accounts[0].name).toBe('Nueva')
  })

  it('renombrar a nombre existente lanza error', () => {
    e.createAccount({ name: 'A', type: 'asset', subtype: 'debit' })
    const b = e.createAccount({ name: 'B', type: 'asset', subtype: 'debit' })
    expect(() => e.renameAccount(b.id, 'A')).toThrow('already exists')
  })

  it('archivar cuenta sin deudas OK', () => {
    const acc = e.createAccount({ name: 'Vieja TC', type: 'liability', subtype: 'credit_card', balance: 0 })
    e.archiveAccount(acc.id)
    expect(acc.isArchived).toBe(true)
  })

  it('archivar cuenta con deudas FALLA', () => {
    const tc = e.createAccount({ name: 'TC', type: 'liability', subtype: 'credit_card', balance: 0 })
    e.createInstallmentPurchase({ amount: -60000, installments: 3, accountId: tc.id, description: 'Test' })
    expect(() => e.archiveAccount(tc.id)).toThrow('active debts')
  })

  it('archivar despues de pagar todas las deudas OK', () => {
    const tc = e.createAccount({ name: 'TC', type: 'liability', subtype: 'credit_card', balance: 0 })
    e.createInstallmentPurchase({ amount: -60000, installments: 3, accountId: tc.id, description: 'Test' })

    // Pagar todo
    for (let i = 0; i < 3; i++) e.payDebtInstallment(e.debts[0].id)

    e.archiveAccount(tc.id) // ahora si
    expect(tc.isArchived).toBe(true)
  })

  it('cuenta archivada no aparece en reconciliacion', () => {
    const mp = e.createAccount({ name: 'Wallet', type: 'asset', subtype: 'debit', balance: 1000000 })
    const old = e.createAccount({ name: 'Old Checking', type: 'asset', subtype: 'debit', balance: 500000 })

    e.archiveAccount(old.id)

    const status = e.getReconciliationStatus()
    expect(status.position).toBe(1000000) // solo Wallet
  })
})

// ============================================================
// FLUJO 11: TRANSFERENCIAS — EXHAUSTIVO
// ============================================================

describe('Flujo 11: Transferencias', () => {
  beforeEach(() => setupStandard())

  it('retiro ATM: debito -> efectivo', () => {
    e.createTransfer({ fromAccountId: 'id_2', toAccountId: 'id_3', amount: 200000, description: 'ATM' })
    expect(e.accounts[1].balance).toBe(300000) // Checking
    expect(e.accounts[2].balance).toBe(250000) // Efectivo
    expect(e.getReconciliationStatus().delta).toBe(0)
  })

  it('pago TC: debito -> TC', () => {
    // Hacer una compra con TC primero
    e.createTransaction({ amount: -100000, accountId: 'id_4', description: 'Compra' })

    e.createTransfer({ fromAccountId: 'id_1', toAccountId: 'id_4', amount: 100000, description: 'Pago CC Visa' })
    expect(e.accounts[3].balance).toBe(0) // TC saldada
    expect(e.getReconciliationStatus().delta).toBe(0)
  })

  it('mover plata entre cuentas debito', () => {
    e.createTransfer({ fromAccountId: 'id_1', toAccountId: 'id_2', amount: 1000000, description: 'Mover a Checking' })
    expect(e.accounts[0].balance).toBe(2000000)
    expect(e.accounts[1].balance).toBe(1500000)
    expect(e.getReconciliationStatus().delta).toBe(0)
  })

  it('transferencia SpA -> Personal', () => {
    const spa = e.createAccount({ name: 'SpA Checking', type: 'asset', subtype: 'debit', balance: 5000000, entity: 'spa' })
    e.createTransaction({ amount: 5000000, accountId: spa.id, description: 'Apertura SpA', type: 'adjustment' })
    e.updateAccountBalance(spa.id, 5000000)

    const totalBefore = e.accounts.reduce((s, a) => s + a.balance, 0)
    e.createTransfer({ fromAccountId: spa.id, toAccountId: 'id_1', amount: 2000000, description: 'Sueldo' })
    const totalAfter = e.accounts.reduce((s, a) => s + a.balance, 0)

    expect(totalAfter).toBe(totalBefore) // patrimonio total igual
    expect(e.accounts.find(a => a.name === 'SpA Checking')!.balance).toBe(3000000)
    expect(e.accounts[0].balance).toBe(5000000) // Wallet + 2M
  })

  it('transferencia no es gasto ni ingreso en summary', () => {
    e.createTransfer({ fromAccountId: 'id_1', toAccountId: 'id_2', amount: 100000, description: 'Move' })

    const summary = e.getMonthlySummary('2026-04')
    expect(summary.income).toBe(0)
    expect(summary.expenses).toBe(0)
    expect(summary.net).toBe(0)
  })
})

// ============================================================
// FLUJO 12: REFUNDS — EXHAUSTIVO
// ============================================================

describe('Flujo 12: Refunds y devoluciones', () => {
  beforeEach(() => setupStandard())

  it('devolucion completa en TC', () => {
    e.createTransaction({ amount: -80000, category: 'consumo.ropa', accountId: 'id_5', description: 'Polera' })
    e.createRefund({ amount: 80000, category: 'consumo.ropa', accountId: 'id_5', description: 'Devolucion polera' })

    expect(e.accounts[4].balance).toBe(0) // CC Mastercard saldada
    expect(e.getReconciliationStatus().delta).toBe(0)

    const summary = e.getMonthlySummary('2026-04')
    expect(summary.income).toBe(0) // refund no es ingreso
    expect(summary.expenses).toBe(-80000 + 80000) // neto = 0
  })

  it('devolucion parcial', () => {
    e.createTransaction({ amount: -100000, category: 'consumo.tech', accountId: 'id_5', description: 'Audifonos' })
    e.createRefund({ amount: 30000, category: 'consumo.tech', accountId: 'id_5', description: 'Devolucion parcial' })

    expect(e.accounts[4].balance).toBe(-70000)
    expect(e.getReconciliationStatus().delta).toBe(0)
  })

  it('cancelar deuda por devolucion de compra en cuotas', () => {
    e.createInstallmentPurchase({
      amount: -180000, installments: 6, category: 'consumo.ropa',
      accountId: 'id_5', description: 'Demo Purchase',
    })

    // Pagar 2 cuotas
    e.payDebtInstallment(e.debts[0].id)
    e.payDebtInstallment(e.debts[0].id)

    // Store refunds full amount to TC
    e.createRefund({ amount: 180000, category: 'consumo.ropa', accountId: 'id_5', description: 'Demo Refund' })

    // Archive the debt (bank cancels future installments)
    e.archiveDebt(e.debts[0].id)

    expect(e.debts[0].status).toBe('archived')
    // TC: -180K(purchase) + 180K(refund) = 0
    expect(e.getReconciliationStatus().delta).toBe(0)
  })

  it('undo de transaccion simple', () => {
    const tx = e.createTransaction({ amount: -50000, category: 'consumo.comida', accountId: 'id_1', description: 'Error' })

    e.undoTransaction(tx.id)

    const adjustments = e.transactions.filter(t => t.type === 'adjustment' && t.description.includes('Reversal'))
    expect(adjustments.length).toBe(1)
    expect(adjustments[0].amount).toBe(50000) // reverso
    expect(e.accounts[0].balance).toBe(3000000) // restaurado
    expect(e.getReconciliationStatus().delta).toBe(0)
  })
})

// ============================================================
// FLUJO 9: PATRIMONIO Y NET WORTH
// ============================================================

describe('Flujo 9: Patrimonio', () => {
  it('net worth incluye todo (on-budget + off-budget)', () => {
    e.createAccount({ name: 'Wallet', type: 'asset', subtype: 'debit', balance: 3000000 })
    e.createAccount({ name: 'TC', type: 'liability', subtype: 'credit_card', balance: -200000 })
    e.createAccount({ name: 'Broker', type: 'asset', subtype: 'investment', balance: 14500000, onBudget: false })
    e.createAccount({ name: 'PropertyA', type: 'asset', subtype: 'property', balance: 35000000, onBudget: false })

    const snapshot = e.createSnapshot('2026-04-30')
    expect(snapshot.totalAssets).toBe(3000000 + 14500000 + 35000000)
    expect(snapshot.totalLiabilities).toBe(200000)
    expect(snapshot.netWorth).toBe(52300000)
  })

  it('snapshots sucesivos muestran tendencia', () => {
    const mp = e.createAccount({ name: 'Wallet', type: 'asset', subtype: 'debit', balance: 1000000 })
    e.createTransaction({ amount: 1000000, accountId: mp.id, description: 'Apertura', type: 'adjustment' })
    e.updateAccountBalance(mp.id, 1000000)

    e.createSnapshot('2026-01-31')

    e.createTransaction({ amount: 500000, accountId: mp.id, description: 'Ingreso' })
    e.createSnapshot('2026-02-28')

    e.createTransaction({ amount: -200000, accountId: mp.id, description: 'Gasto' })
    e.createSnapshot('2026-03-31')

    expect(e.snapshots[0].netWorth).toBe(1000000)
    expect(e.snapshots[1].netWorth).toBe(1500000)
    expect(e.snapshots[2].netWorth).toBe(1300000)
  })
})

// ============================================================
// EDGE CASES: STRESS TEST
// ============================================================

describe('Stress tests y edge cases', () => {
  it('100 transacciones mantienen delta en 0', () => {
    const mp = e.createAccount({ name: 'Wallet', type: 'asset', subtype: 'debit', balance: 10000000 })
    e.createTransaction({ amount: 10000000, accountId: mp.id, description: 'Apertura', type: 'adjustment' })
    e.updateAccountBalance(mp.id, 10000000)

    for (let i = 0; i < 50; i++) {
      e.createTransaction({ amount: -Math.floor(Math.random() * 100000), accountId: mp.id, description: `Gasto ${i}` })
      e.createTransaction({ amount: Math.floor(Math.random() * 50000), accountId: mp.id, description: `Ingreso ${i}` })
    }

    expect(e.getReconciliationStatus().delta).toBe(0)
    expect(e.transactions.length).toBe(101) // 1 apertura + 100 txs
  })

  it('10 deudas simultaneas en la misma TC', () => {
    const tc = e.createAccount({ name: 'TC', type: 'liability', subtype: 'credit_card', balance: 0, creditLimit: 10000000 })

    for (let i = 0; i < 10; i++) {
      e.createInstallmentPurchase({
        amount: -(50000 + i * 10000),
        installments: 3 + i,
        accountId: tc.id,
        description: `Compra ${i}`,
      })
    }

    expect(e.debts.length).toBe(10)
    expect(e.debts.every(d => d.status === 'active')).toBe(true)
    expect(e.getReconciliationStatus().delta).toBe(0)

    // Pagar todas las cuotas de todas las deudas
    let totalPaid = 0
    for (const debt of e.debts) {
      while (debt.status === 'active') {
        e.payDebtInstallment(debt.id)
        totalPaid++
      }
    }

    expect(e.debts.every(d => d.status === 'paid')).toBe(true)
    expect(e.debts.every(d => d.remainingAmount === 0)).toBe(true)
    expect(e.getReconciliationStatus().delta).toBe(0)
  })

  it('interleaved operations: gastos + cuotas + transferencias + refunds', () => {
    const { mp, checking, ccVisa, ccMaster } = setupStandard()

    // Dia 1: sueldo
    e.createTransaction({ amount: 2000000, accountId: mp.id, description: 'Sueldo', date: '2026-04-01' })

    // Dia 3: compra cuotas
    e.createInstallmentPurchase({ amount: -120000, installments: 4, accountId: ccMaster.id, description: 'Zapatos', date: '2026-04-03' })

    // Dia 5: retiro ATM
    e.createTransfer({ fromAccountId: checking.id, toAccountId: 'id_3', amount: 100000, description: 'ATM', date: '2026-04-05' })

    // Dia 7: gasto en TC
    e.createTransaction({ amount: -45000, accountId: ccVisa.id, description: 'Restaurant', date: '2026-04-07' })

    // Dia 10: refund
    e.createRefund({ amount: 20000, category: 'consumo', accountId: ccVisa.id, description: 'Devolucion', date: '2026-04-10' })

    // Dia 15: pago de cuota
    e.payDebtInstallment(e.debts[0].id, '2026-04-15')

    // Dia 20: pago TC
    e.createTransfer({ fromAccountId: mp.id, toAccountId: ccVisa.id, amount: 25000, description: 'Pago parcial CC Visa', date: '2026-04-20' })

    // Dia 25: otro ingreso
    e.createTransaction({ amount: 225000, accountId: mp.id, description: 'Arriendo', date: '2026-04-25' })

    // Todo debe cuadrar
    expect(e.getReconciliationStatus().delta).toBe(0)

    // Snapshot
    const snap = e.createSnapshot('2026-04-30')
    expect(snap.status).toBe('balanced')
  })

  it('cuenta con saldo 0 participa en reconciliacion sin romper', () => {
    const empty = e.createAccount({ name: 'Empty', type: 'asset', subtype: 'debit', balance: 0 })
    e.createTransaction({ amount: 0, accountId: empty.id, description: 'Apertura', type: 'adjustment' })

    expect(e.getReconciliationStatus().delta).toBe(0)
    expect(e.getReconciliationStatus().position).toBe(0)
  })

  it('montos de 1 peso funcionan correctamente', () => {
    const mp = e.createAccount({ name: 'Wallet', type: 'asset', subtype: 'debit', balance: 100 })
    e.createTransaction({ amount: 100, accountId: mp.id, description: 'Apertura', type: 'adjustment' })
    e.updateAccountBalance(mp.id, 100)

    e.createTransaction({ amount: -1, accountId: mp.id, description: 'Micro gasto' })
    expect(e.accounts[0].balance).toBe(99)
    expect(e.getReconciliationStatus().delta).toBe(0)
  })

  it('montos muy grandes (50M+) no overflow', () => {
    const mp = e.createAccount({ name: 'Wallet', type: 'asset', subtype: 'debit', balance: 100000000 })
    e.createTransaction({ amount: 100000000, accountId: mp.id, description: 'Apertura', type: 'adjustment' })
    e.updateAccountBalance(mp.id, 100000000)

    e.createTransaction({ amount: -35000000, accountId: mp.id, description: 'Inversion grande' })
    expect(e.accounts[0].balance).toBe(65000000)
    expect(e.getReconciliationStatus().delta).toBe(0)
  })
})

// ============================================================
// INVARIANT: DELTA = 0 SIEMPRE DESPUES DE CADA OPERACION
// ============================================================

describe('Invariant: delta = 0 after every valid operation sequence', () => {
  it('scenario: mes con absolutamente todo', () => {
    // Setup
    const mp = e.createAccount({ name: 'Wallet', type: 'asset', subtype: 'debit', balance: 3000000 })
    const checking = e.createAccount({ name: 'Checking', type: 'asset', subtype: 'debit', balance: 500000 })
    const cash = e.createAccount({ name: 'Cash', type: 'asset', subtype: 'cash', balance: 50000 })
    const tcA = e.createAccount({ name: 'TC-A', type: 'liability', subtype: 'credit_card', balance: 0, creditLimit: 2000000 })
    const tcB = e.createAccount({ name: 'TC-B', type: 'liability', subtype: 'credit_card', balance: 0, creditLimit: 1500000 })
    e.createAccount({ name: 'Broker', type: 'asset', subtype: 'investment', balance: 14500000, onBudget: false })
    const friendA = e.createReceivable({ name: 'Friend A', amount: 470000 })
    const spaBank = e.createAccount({ name: 'SpA Checking', type: 'asset', subtype: 'debit', balance: 2000000, entity: 'spa' })

    // Apertura limpia para cada cuenta on-budget
    e.createOpeningBalance(mp.id)
    e.createOpeningBalance(checking.id)
    e.createOpeningBalance(cash.id)
    e.createOpeningBalance(friendA.id)
    e.createOpeningBalance(spaBank.id)
    expect(e.getReconciliationStatus().delta).toBe(0) // CHECK

    // Ingresos
    e.createTransaction({ amount: 2000000, accountId: mp.id, description: 'Sueldo' })
    expect(e.getReconciliationStatus().delta).toBe(0) // CHECK

    e.createTransaction({ amount: 225000, accountId: mp.id, description: 'Arriendo' })
    expect(e.getReconciliationStatus().delta).toBe(0) // CHECK

    // Ingreso SpA
    e.createTransaction({ amount: 2380000, accountId: spaBank.id, description: 'Factura' })
    expect(e.getReconciliationStatus().delta).toBe(0) // CHECK

    // Gastos varios
    e.createTransaction({ amount: -150000, accountId: checking.id, description: 'Bencina' })
    e.createTransaction({ amount: -80000, accountId: checking.id, description: 'Super' })
    e.createTransaction({ amount: -45000, accountId: tcA.id, description: 'Restaurant' })
    e.createTransaction({ amount: -12000, accountId: cash.id, description: 'Cafe' })
    expect(e.getReconciliationStatus().delta).toBe(0) // CHECK

    // Compras en cuotas
    e.createInstallmentPurchase({ amount: -180000, installments: 6, accountId: tcB.id, description: 'Demo Purchase' })
    e.createInstallmentPurchase({ amount: -60000, installments: 3, accountId: tcA.id, description: 'Libro' })
    expect(e.getReconciliationStatus().delta).toBe(0) // CHECK

    // Pago de cuota
    e.payDebtInstallment(e.debts[0].id)
    expect(e.getReconciliationStatus().delta).toBe(0) // CHECK

    // Transferencias
    e.createTransfer({ fromAccountId: checking.id, toAccountId: cash.id, amount: 100000, description: 'ATM' })
    expect(e.getReconciliationStatus().delta).toBe(0) // CHECK

    e.createTransfer({ fromAccountId: mp.id, toAccountId: tcA.id, amount: 105000, description: 'Pago TC-A' })
    expect(e.getReconciliationStatus().delta).toBe(0) // CHECK

    // Transferencia SpA -> Personal
    e.createTransfer({ fromAccountId: spaBank.id, toAccountId: mp.id, amount: 2000000, description: 'Sueldo SpA' })
    expect(e.getReconciliationStatus().delta).toBe(0) // CHECK

    // Cobro parcial receivable
    e.receivePartialPayment(friendA.id, 100000, mp.id)
    expect(e.getReconciliationStatus().delta).toBe(0) // CHECK

    // Refund
    e.createRefund({ amount: 20000, category: 'consumo', accountId: tcA.id, description: 'Devolucion' })
    expect(e.getReconciliationStatus().delta).toBe(0) // CHECK

    // Undo de una transaccion
    const errorTx = e.createTransaction({ amount: -999999, accountId: mp.id, description: 'Error grave' })
    expect(e.getReconciliationStatus().delta).toBe(0) // CHECK
    e.undoTransaction(errorTx.id)
    expect(e.getReconciliationStatus().delta).toBe(0) // CHECK

    // Gastos SpA
    e.createTransaction({ amount: -45000, accountId: spaBank.id, description: 'Claude' })
    e.createTransaction({ amount: -12000, accountId: spaBank.id, description: 'Render' })
    expect(e.getReconciliationStatus().delta).toBe(0) // CHECK

    // Snapshot final
    const snap = e.createSnapshot('2026-04-30')
    expect(snap.status).toBe('balanced')
    expect(snap.delta).toBe(0) // FINAL CHECK

    // Entity reconciliation: inter-entity transfers create delta per entity
    // (transfer moves position but not accumulated within a single entity)
    // Combined delta should still be 0
    const personalDelta = e.getEntityReconciliation('personal').delta
    const spaDelta = e.getEntityReconciliation('spa').delta
    expect(personalDelta + spaDelta).toBe(0) // they cancel out
  })
})
