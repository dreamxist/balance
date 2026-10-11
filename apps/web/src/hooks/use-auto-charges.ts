import { useRecurringStatus } from './use-recurring'
import { useDebts } from './use-debts'

interface PendingCharge {
  id: string
  name: string
  amount: number
  day: number
  category: string
  accountId: string
  type: 'recurring' | 'debt'
  charged: boolean
  /** Past its day this month and not paid yet. */
  due: boolean
  autoCharge: boolean
}

export function useAutoCharges() {
  const recurring = useRecurringStatus()
  const debts = useDebts()

  const today = new Date()
  const currentDay = today.getDate()

  const allCharges: PendingCharge[] = []

  for (const charge of recurring.data ?? []) {
    allCharges.push({
      id: charge.id,
      name: charge.name,
      amount: charge.amount,
      day: charge.day_of_month,
      category: charge.category,
      accountId: charge.account_id,
      type: 'recurring',
      charged: charge.status === 'charged',
      due: charge.status === 'due',
      autoCharge: charge.auto_charge,
    })
  }

  const debtDay = 17
  for (const debt of debts.data ?? []) {
    if (debt.installments_paid >= debt.installments) continue
    allCharges.push({
      id: debt.id,
      name: `Cuota ${debt.description ?? ''}`,
      amount: debt.installment_amount,
      day: debtDay,
      category: `deuda.${(debt.description ?? '').toLowerCase()}`,
      accountId: debt.account_id ?? '',
      type: 'debt',
      charged: debtDay <= currentDay,
      due: false,
      autoCharge: true,
    })
  }

  allCharges.sort((a, b) => a.day - b.day)

  const totalComprometido = allCharges.reduce((s, c) => s + c.amount, 0)
  const totalCobrado = allCharges.filter((c) => c.charged).reduce((s, c) => s + c.amount, 0)
  const totalPendiente = totalComprometido - totalCobrado

  return {
    charges: allCharges,
    totalComprometido,
    totalCobrado,
    totalPendiente,
    currentDay,
    isLoading: recurring.isLoading || debts.isLoading,
  }
}
