const FINTUAL_API = 'https://fintual.cl/api/real_assets'

export interface FintualDay {
  date: string
  price: number
}

export async function getFintualPrice(assetId: number): Promise<FintualDay | null> {
  const today = new Date()
  const from = new Date(today)
  from.setDate(from.getDate() - 5) // fetch last 5 days in case weekend

  const fromStr = from.toISOString().slice(0, 10)
  const toStr = today.toISOString().slice(0, 10)

  const res = await fetch(`${FINTUAL_API}/${assetId}/days?from_date=${fromStr}&to_date=${toStr}`)
  if (!res.ok) return null

  const json = await res.json() as { data: Array<{ attributes: { date: string; price: number } }> }
  const days = json.data ?? []
  if (days.length === 0) return null

  // Get most recent day
  const latest = days[days.length - 1]!
  return {
    date: latest.attributes.date,
    price: latest.attributes.price,
  }
}

export function calculateBalance(shares: number, price: number): number {
  return Math.round(shares * price)
}
