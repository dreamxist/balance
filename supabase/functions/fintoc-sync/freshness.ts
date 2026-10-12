// Fintoc can keep a Link "active" while it silently stops pulling data from
// the bank (refresh_status "interrupted"). Listing movements then returns
// nothing and every run looks healthy, so staleness is judged by the Link's
// own last_time_refreshed instead.

/** Cron runs every 12 h; bank data older than ~3 runs means Fintoc stopped. */
export const BANK_DATA_STALE_HOURS = 36

export interface LinkFreshness {
  refresh_status?: string | null
  last_time_refreshed?: string | null
}

/** Error to record when Fintoc has not refreshed the bank lately, else null. */
export function staleBankDataError(link: LinkFreshness, now: Date): string | null {
  const refreshed = link.last_time_refreshed ? Date.parse(link.last_time_refreshed) : NaN
  if (!Number.isNaN(refreshed) && now.getTime() - refreshed <= BANK_DATA_STALE_HOURS * 3_600_000) {
    return null
  }
  const since = Number.isNaN(refreshed) ? 'nunca' : `desde ${link.last_time_refreshed!.slice(0, 10)}`
  const status = link.refresh_status ? ` (refresh_status ${link.refresh_status})` : ''
  return `Fintoc no actualiza los datos del banco ${since}${status}`
}

/**
 * Watermark to store after a clean run: never past the day Fintoc last pulled
 * from the bank, so movements it fetches late still fall inside the window.
 */
export function nextWatermark(runDate: string, link: LinkFreshness): string {
  const refreshedDay = link.last_time_refreshed?.slice(0, 10)
  return refreshedDay && refreshedDay < runDate ? refreshedDay : runDate
}
