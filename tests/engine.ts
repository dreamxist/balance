// In-memory financial engine that mirrors the DB functions from architecture.md
// This allows testing ALL financial logic without a database.

export type EntityType = 'personal' | 'spa'
export type AccountType = 'asset' | 'liability'
export type AccountSubtype = 'debit' | 'cash' | 'credit_card' | 'receivable' | 'payable' | 'investment' | 'property'
export type TransactionType = 'income' | 'expense' | 'refund' | 'transfer' | 'debt_payment' | 'adjustment'
export type DebtStatus = 'active' | 'paid' | 'archived'
export type SnapshotStatus = 'balanced' | 'unbalanced'

export interface Account {
  id: string
  name: string
  type: AccountType
  subtype: AccountSubtype
  entity: EntityType
  currency: string
  balance: number
  creditLimit?: number
  onBudget: boolean
  isArchived: boolean
}

export interface Transaction {
  id: string
  accountId: string
  type: TransactionType
  amount: number
  description: string
  category?: string
  entity: EntityType
  date: string
  debtId?: string
  transferTo?: string
}

export interface Debt {
  id: string
  accountId: string
  description: string
  totalAmount: number
  installments: number
  installmentAmount: number
  lastInstallmentAmount: number
  installmentsPaid: number
  remainingAmount: number
  category?: string
  status: DebtStatus
  startDate: string
  firstPaymentDate?: string
  nextPaymentDate?: string
}

export interface Snapshot {
  id: string
  date: string
  totalAssets: number
  totalLiabilities: number
  netWorth: number
  accumulated: number
  delta: number
  status: SnapshotStatus
}

export interface ReconciliationStatus {
  position: number
  accumulated: number
  delta: number
  isBalanced: boolean
}

let idCounter = 0
function genId(): string {
  return `id_${++idCounter}`
}

export function resetIds() {
  idCounter = 0
}

export class FinanceEngine {
  accounts: Account[] = []
  transactions: Transaction[] = []
  debts: Debt[] = []
  snapshots: Snapshot[] = []

  // === Account management ===

  createAccount(params: {
    name: string
    type: AccountType
    subtype: AccountSubtype
    entity?: EntityType
    currency?: string
    balance?: number
    creditLimit?: number
    onBudget?: boolean
  }): Account {
    const existing = this.accounts.find(a => a.name === params.name && !a.isArchived)
    if (existing) throw new Error(`Account "${params.name}" already exists`)

    const account: Account = {
      id: genId(),
      name: params.name,
      type: params.type,
      subtype: params.subtype,
      entity: params.entity ?? 'personal',
      currency: params.currency ?? 'CLP',
      balance: params.balance ?? 0,
      creditLimit: params.creditLimit,
      onBudget: params.onBudget ?? true,
      isArchived: false,
    }
    this.accounts.push(account)
    return account
  }

  archiveAccount(accountId: string): void {
    const account = this.accounts.find(a => a.id === accountId)
    if (!account) throw new Error('Account not found')
    const activeDebts = this.debts.filter(d => d.accountId === accountId && d.status === 'active')
    if (activeDebts.length > 0) {
      throw new Error('Cannot archive account with active debts')
    }
    account.isArchived = true
  }

  updateAccountBalance(accountId: string, newBalance: number): void {
    const account = this.accounts.find(a => a.id === accountId)
    if (!account) throw new Error('Account not found')
    account.balance = newBalance
  }

  // === Primitives (mirror DB _functions) ===

  private _insertTransaction(params: {
    accountId: string
    type: TransactionType
    amount: number
    description: string
    category?: string
    entity: EntityType
    date: string
    debtId?: string
    transferTo?: string
  }): Transaction {
    const tx: Transaction = { id: genId(), ...params }
    this.transactions.push(tx)
    return tx
  }

  private _updateAccountBalance(accountId: string, delta: number): void {
    const account = this.accounts.find(a => a.id === accountId)
    if (!account) throw new Error(`Account ${accountId} not found`)
    account.balance += delta
  }

  private _createDebt(params: {
    accountId: string
    description: string
    totalAmount: number
    installments: number
    category?: string
    startDate: string
    firstPaymentDate?: string
  }): Debt {
    const rawInstallment = Math.trunc(params.totalAmount / params.installments)
    const installmentAmount = Object.is(rawInstallment, -0) ? 0 : rawInstallment
    const rawLast = params.totalAmount - (installmentAmount * (params.installments - 1))
    const lastInstallmentAmount = Object.is(rawLast, -0) ? 0 : rawLast
    const firstPay = params.firstPaymentDate ?? params.startDate

    const debt: Debt = {
      id: genId(),
      accountId: params.accountId,
      description: params.description,
      totalAmount: params.totalAmount,
      installments: params.installments,
      installmentAmount,
      lastInstallmentAmount,
      installmentsPaid: 0,
      remainingAmount: params.totalAmount,
      category: params.category,
      status: 'active',
      startDate: params.startDate,
      firstPaymentDate: firstPay,
      nextPaymentDate: firstPay,
    }
    this.debts.push(debt)
    return debt
  }

  private _advanceDebtPayment(debtId: string): Debt {
    const debt = this.debts.find(d => d.id === debtId)
    if (!debt) throw new Error('Debt not found')

    const isLastPayment = debt.installmentsPaid + 1 === debt.installments
    const paymentAmount = isLastPayment ? debt.lastInstallmentAmount : debt.installmentAmount

    debt.installmentsPaid += 1
    debt.remainingAmount -= paymentAmount
    debt.status = debt.installmentsPaid >= debt.installments ? 'paid' : 'active'
    return debt
  }

  // === Setup ===

  /**
   * Creates an opening adjustment that makes accumulated match position.
   * Unlike createTransaction, this does NOT move the account balance
   * (the account already has the correct balance from createAccount).
   */
  createOpeningBalance(accountId: string): Transaction {
    const account = this.accounts.find(a => a.id === accountId)
    if (!account) throw new Error('Account not found')

    return this._insertTransaction({
      accountId,
      type: 'adjustment',
      amount: account.balance,
      description: `Apertura: ${account.name}`,
      entity: account.entity,
      date: '2026-01-01',
    })
  }

  // === Business operations ===

  createTransaction(params: {
    amount: number
    category?: string
    accountId: string
    description: string
    type?: TransactionType
    date?: string
  }): Transaction {
    const account = this.accounts.find(a => a.id === params.accountId)
    if (!account) throw new Error('Account not found')

    const type = params.type ?? (params.amount >= 0 ? 'income' : 'expense')
    const tx = this._insertTransaction({
      accountId: params.accountId,
      type,
      amount: params.amount,
      description: params.description,
      category: params.category,
      entity: account.entity,
      date: params.date ?? '2026-04-01',
    })
    this._updateAccountBalance(params.accountId, params.amount)
    return tx
  }

  createInstallmentPurchase(params: {
    amount: number
    installments: number
    category?: string
    accountId: string
    description: string
    date?: string
    firstPaymentDate?: string
  }): { debt: Debt; transaction: Transaction } {
    const account = this.accounts.find(a => a.id === params.accountId)
    if (!account) throw new Error('Account not found')

    const date = params.date ?? '2026-04-01'

    // 1. Create debt
    const debt = this._createDebt({
      accountId: params.accountId,
      description: params.description,
      totalAmount: params.amount,
      installments: params.installments,
      category: params.category,
      startDate: date,
      firstPaymentDate: params.firstPaymentDate,
    })

    // 2. Register FULL amount as expense (Approach A)
    const tx = this._insertTransaction({
      accountId: params.accountId,
      type: 'expense',
      amount: params.amount, // full total (negative)
      description: `${params.description} (${params.installments} cuotas)`,
      category: params.category,
      entity: account.entity,
      date,
      debtId: debt.id,
    })

    // 3. TC balance moves by full amount
    this._updateAccountBalance(params.accountId, params.amount)

    return { debt, transaction: tx }
  }

  payDebtInstallment(debtId: string, date?: string): { transaction: Transaction; debt: Debt } {
    const debt = this.debts.find(d => d.id === debtId && d.status === 'active')
    if (!debt) throw new Error('Debt not found or already paid')

    const isLast = debt.installmentsPaid + 1 === debt.installments
    const paymentAmount = isLast ? debt.lastInstallmentAmount : debt.installmentAmount

    const account = this.accounts.find(a => a.id === debt.accountId)!

    // debt_payment: does NOT affect accumulated
    const tx = this._insertTransaction({
      accountId: debt.accountId,
      type: 'debt_payment',
      amount: paymentAmount,
      description: `${debt.description} (cuota ${debt.installmentsPaid + 1}/${debt.installments})`,
      category: debt.category,
      entity: account.entity,
      date: date ?? '2026-04-01',
      debtId,
    })

    const updatedDebt = this._advanceDebtPayment(debtId)
    return { transaction: tx, debt: updatedDebt }
  }

  createTransfer(params: {
    fromAccountId: string
    toAccountId: string
    amount: number
    description: string
    date?: string
  }): { fromTx: Transaction; toTx: Transaction } {
    if (params.amount <= 0) throw new Error('Transfer amount must be positive')

    const from = this.accounts.find(a => a.id === params.fromAccountId)!
    const to = this.accounts.find(a => a.id === params.toAccountId)!
    const date = params.date ?? '2026-04-01'

    const fromTx = this._insertTransaction({
      accountId: params.fromAccountId,
      type: 'transfer',
      amount: -params.amount,
      description: `${params.description} → ${to.name}`,
      entity: from.entity,
      date,
      transferTo: params.toAccountId,
    })

    const toTx = this._insertTransaction({
      accountId: params.toAccountId,
      type: 'transfer',
      amount: params.amount,
      description: `${params.description} ← ${from.name}`,
      entity: to.entity,
      date,
      transferTo: params.fromAccountId,
    })

    this._updateAccountBalance(params.fromAccountId, -params.amount)
    this._updateAccountBalance(params.toAccountId, params.amount)

    return { fromTx, toTx }
  }

  createRefund(params: {
    amount: number
    category?: string
    accountId: string
    description: string
    date?: string
  }): Transaction {
    if (params.amount <= 0) throw new Error('Refund amount must be positive')
    const account = this.accounts.find(a => a.id === params.accountId)!

    const tx = this._insertTransaction({
      accountId: params.accountId,
      type: 'refund',
      amount: params.amount,
      description: params.description,
      category: params.category,
      entity: account.entity,
      date: params.date ?? '2026-04-01',
    })
    this._updateAccountBalance(params.accountId, params.amount)
    return tx
  }

  undoTransaction(transactionId: string): Transaction {
    const original = this.transactions.find(t => t.id === transactionId)
    if (!original) throw new Error('Transaction not found')

    const reversalAmount = -original.amount
    const tx = this._insertTransaction({
      accountId: original.accountId,
      type: 'adjustment',
      amount: reversalAmount,
      description: `Reversal: ${original.description}`,
      category: original.category,
      entity: original.entity,
      date: original.date,
      debtId: original.debtId,
    })

    this._updateAccountBalance(original.accountId, reversalAmount)

    if (original.debtId) {
      const debt = this.debts.find(d => d.id === original.debtId)
      if (debt) {
        debt.installmentsPaid = Math.max(0, debt.installmentsPaid - 1)
        debt.remainingAmount += Math.abs(original.amount)
        debt.status = 'active'
      }
    }

    return tx
  }

  /**
   * Archive a debt. Only archives — doesn't create transactions.
   * In real life, when you return a product bought in installments:
   *   1. The store refunds to the TC → use createRefund()
   *   2. The bank cancels future installments → user archives the debt here
   *   3. The user updates TC balance when reconciling → use updateAccountBalance()
   * No magic — the user does each step explicitly like in the real world.
   */
  archiveDebt(debtId: string): void {
    const debt = this.debts.find(d => d.id === debtId && d.status === 'active')
    if (!debt) throw new Error('Debt not found or not active')
    debt.status = 'archived'
    debt.remainingAmount = 0
  }

  payOffDebt(debtId: string, actualAmountPaid?: number): { transactions: Transaction[]; debt: Debt } {
    const debt = this.debts.find(d => d.id === debtId && d.status === 'active')
    if (!debt) throw new Error('Debt not found or not active')

    const account = this.accounts.find(a => a.id === debt.accountId)!
    const transactions: Transaction[] = []

    const remaining = debt.remainingAmount

    if (actualAmountPaid !== undefined && Math.abs(actualAmountPaid) < Math.abs(remaining)) {
      // discount is the forgiven amount (positive = money returned to balance)
      const discount = -(remaining - actualAmountPaid) // e.g. -(-120000 - (-110000)) = -(-10000) = 10000
      const adjTx = this._insertTransaction({
        accountId: debt.accountId,
        type: 'adjustment',
        amount: discount,
        description: `Discount on payoff: ${debt.description}`,
        category: debt.category,
        entity: account.entity,
        date: '2026-04-01',
        debtId,
      })
      this._updateAccountBalance(debt.accountId, discount)
      transactions.push(adjTx)
    }

    const paymentAmount = actualAmountPaid ?? remaining
    const payTx = this._insertTransaction({
      accountId: debt.accountId,
      type: 'debt_payment',
      amount: paymentAmount,
      description: `Payoff: ${debt.description}`,
      category: debt.category,
      entity: account.entity,
      date: '2026-04-01',
      debtId,
    })
    transactions.push(payTx)

    debt.installmentsPaid = debt.installments
    debt.remainingAmount = 0
    debt.status = 'paid'

    return { transactions, debt }
  }

  createReceivable(params: {
    name: string
    amount: number
    entity?: EntityType
    note?: string
  }): Account {
    const account = this.createAccount({
      name: params.name,
      type: 'asset',
      subtype: 'receivable',
      entity: params.entity ?? 'personal',
      balance: params.amount,
      onBudget: true,
    })
    return account
  }

  receivePartialPayment(
    receivableAccountId: string,
    amount: number,
    destinationAccountId: string,
    date?: string,
  ): { fromTx: Transaction; toTx: Transaction } {
    if (amount <= 0) throw new Error('Payment amount must be positive')

    const receivable = this.accounts.find(a => a.id === receivableAccountId)
    if (!receivable) throw new Error('Receivable account not found')

    const destination = this.accounts.find(a => a.id === destinationAccountId)
    if (!destination) throw new Error('Destination account not found')

    const txDate = date ?? '2026-04-01'

    const fromTx = this._insertTransaction({
      accountId: receivableAccountId,
      type: 'transfer',
      amount: -amount,
      description: `Payment received → ${destination.name}`,
      entity: receivable.entity,
      date: txDate,
      transferTo: destinationAccountId,
    })

    const toTx = this._insertTransaction({
      accountId: destinationAccountId,
      type: 'transfer',
      amount,
      description: `Payment received ← ${receivable.name}`,
      entity: destination.entity,
      date: txDate,
      transferTo: receivableAccountId,
    })

    this._updateAccountBalance(receivableAccountId, -amount)
    this._updateAccountBalance(destinationAccountId, amount)

    return { fromTx, toTx }
  }

  getEntityReconciliation(entity: EntityType): ReconciliationStatus {
    const position = this.accounts
      .filter(a => !a.isArchived && a.onBudget && a.entity === entity)
      .reduce((sum, a) => sum + a.balance, 0)

    const accumulated = this.transactions
      .filter(t => ['income', 'expense', 'refund', 'adjustment'].includes(t.type) && t.entity === entity)
      .reduce((sum, t) => sum + t.amount, 0)

    return {
      position,
      accumulated,
      delta: position - accumulated,
      isBalanced: position === accumulated,
    }
  }

  getActiveDebts(): Array<Debt & { accountName: string; remainingInstallments: number }> {
    return this.debts
      .filter(d => d.status === 'active')
      .map(d => {
        const account = this.accounts.find(a => a.id === d.accountId)!
        return {
          ...d,
          accountName: account.name,
          remainingInstallments: d.installments - d.installmentsPaid,
        }
      })
  }

  renameAccount(accountId: string, newName: string): void {
    const account = this.accounts.find(a => a.id === accountId)
    if (!account) throw new Error('Account not found')

    const existing = this.accounts.find(a => a.name === newName && !a.isArchived && a.id !== accountId)
    if (existing) throw new Error(`Account "${newName}" already exists`)

    account.name = newName
  }

  // === Queries ===

  getReconciliationStatus(): ReconciliationStatus {
    // Position = sum(balance) for on_budget, non-archived accounts
    // (assets positive, liabilities negative — sum gives net)
    const position = this.accounts
      .filter(a => !a.isArchived && a.onBudget)
      .reduce((sum, a) => sum + a.balance, 0)

    // Accumulated = sum(amount) for income, expense, refund, adjustment
    const accumulated = this.transactions
      .filter(t => ['income', 'expense', 'refund', 'adjustment'].includes(t.type))
      .reduce((sum, t) => sum + t.amount, 0)

    return {
      position,
      accumulated,
      delta: position - accumulated,
      isBalanced: position === accumulated,
    }
  }

  getMonthlySummary(month: string): {
    income: number
    expenses: number
    debtPayments: number
    net: number
  } {
    const txs = this.transactions.filter(t => t.date.startsWith(month))
    return {
      income: txs.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0),
      expenses: txs.filter(t => ['expense', 'refund'].includes(t.type)).reduce((s, t) => s + t.amount, 0),
      debtPayments: txs.filter(t => t.type === 'debt_payment').reduce((s, t) => s + t.amount, 0),
      net: txs.filter(t => ['income', 'expense', 'refund'].includes(t.type)).reduce((s, t) => s + t.amount, 0),
    }
  }

  getCreditCardStatus(accountId: string): {
    statementBalance: number
    futureInstallments: number
    totalUsed: number
    creditLimit: number
    available: number
  } {
    const account = this.accounts.find(a => a.id === accountId)!
    const futureInstallments = this.debts
      .filter(d => d.accountId === accountId && d.status === 'active')
      .reduce((sum, d) => sum + d.remainingAmount, 0)

    return {
      statementBalance: account.balance,
      futureInstallments,
      totalUsed: Math.abs(account.balance) + Math.abs(futureInstallments),
      creditLimit: account.creditLimit ?? 0,
      available: (account.creditLimit ?? 0) + account.balance + futureInstallments,
    }
  }

  createSnapshot(date: string): Snapshot {
    const existing = this.snapshots.find(s => s.date === date)
    if (existing) throw new Error(`Snapshot for ${date} already exists`)

    const activeAccounts = this.accounts.filter(a => !a.isArchived)
    const totalAssets = activeAccounts.filter(a => a.type === 'asset').reduce((s, a) => s + a.balance, 0)
    const totalLiabilities = activeAccounts.filter(a => a.type === 'liability').reduce((s, a) => s + Math.abs(a.balance), 0)
    const netWorth = totalAssets - totalLiabilities

    // Delta uses on_budget only (same as reconciliation)
    const onBudgetPosition = activeAccounts
      .filter(a => a.onBudget)
      .reduce((s, a) => s + a.balance, 0)

    const accumulated = this.transactions
      .filter(t => ['income', 'expense', 'refund', 'adjustment'].includes(t.type))
      .reduce((s, t) => s + t.amount, 0)

    const delta = onBudgetPosition - accumulated
    const snapshot: Snapshot = {
      id: genId(),
      date,
      totalAssets,
      totalLiabilities,
      netWorth,
      accumulated,
      delta,
      status: delta === 0 ? 'balanced' : 'unbalanced',
    }
    this.snapshots.push(snapshot)
    return snapshot
  }
}
