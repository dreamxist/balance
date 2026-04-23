import { useQuery, type UseQueryResult } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

interface MonthlyBreakdown {
  income: number
  necesidades: number
  consumo: number
  ahorro: number
  delta: number
}

export function useMonthlyBreakdown(): UseQueryResult<MonthlyBreakdown> {
  return useQuery({
    queryKey: ['monthly-breakdown'],
    queryFn: async () => {
      const now = new Date()
      const startOfMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`
      const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0)
      const endStr = `${endOfMonth.getFullYear()}-${String(endOfMonth.getMonth() + 1).padStart(2, '0')}-${String(endOfMonth.getDate()).padStart(2, '0')}`

      const { data, error } = await supabase
        .from('transactions')
        .select('type, amount, category')
        .gte('date', startOfMonth)
        .lte('date', endStr)
        .in('type', ['income', 'expense', 'refund'])

      if (error) throw error

      let income = 0
      let necesidades = 0
      let consumo = 0
      let ahorro = 0

      for (const tx of data ?? []) {
        const amt = tx.amount ?? 0
        if (tx.type === 'income') {
          income += amt
        } else if (tx.type === 'expense' || tx.type === 'refund') {
          // refund is money coming back (product return), so it reduces
          // the gastado for the matching category instead of adding to it
          const sign = tx.type === 'refund' ? -1 : 1
          const delta = amt * sign
          const cat = (tx.category ?? '').toLowerCase()
          if (cat.startsWith('necesidad')) {
            necesidades += delta
          } else if (cat.startsWith('consumo')) {
            consumo += delta
          } else if (cat.startsWith('ahorro')) {
            ahorro += delta
          } else {
            consumo += delta
          }
        }
      }

      const gastado = necesidades + consumo + ahorro
      const delta = income - gastado

      return { income, necesidades, consumo, ahorro, delta }
    },
    staleTime: 30_000,
  })
}
