/** Currency helpers. Money is stored as integers (CLP in pesos). */

/** Convert a USD amount to integer CLP pesos at a given exchange rate. */
export function usdToClp(usd: number, exchangeRate: number): number {
  if (!Number.isFinite(usd) || !Number.isFinite(exchangeRate)) {
    throw new Error(`invalid usdToClp inputs: usd=${usd} tc=${exchangeRate}`)
  }
  if (exchangeRate <= 0) throw new Error(`exchange rate must be positive: ${exchangeRate}`)
  return Math.round(usd * exchangeRate)
}

/** Parse a USD amount string that may carry cents ("8.49" or "8,49"). Positive only. */
export function parseUsdAmount(raw: string): number {
  const n = Number(raw.trim().replace(',', '.'))
  if (!Number.isFinite(n) || n <= 0) throw new Error(`invalid USD amount: ${raw}`)
  return n
}
