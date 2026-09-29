import { describe, expect, it } from 'vitest'
import { renderSyncIssues } from './balance'

describe('renderSyncIssues', () => {
  it('names each broken source with its last success and error', () => {
    const out = renderSyncIssues([
      {
        source: 'gmail',
        lastSuccessAt: '2026-07-20T11:00:04Z',
        error: 'Gmail token refresh failed: 401 {\n  "error": "deleted_client"\n}',
        hoursSinceSuccess: 1700,
      },
      { source: 'fintoc', lastSuccessAt: null, error: null, hoursSinceSuccess: null },
    ]).join('\n')
    expect(out).toContain('2 fuente(s) con problemas')
    expect(out).toContain('Gmail')
    expect(out).toContain('último sync OK 2026-07-20 (hace 1700 h)')
    expect(out).toContain('Gmail token refresh failed: 401 { "error": "deleted_client" }')
    expect(out).toContain('Fintoc')
    expect(out).toContain('nunca sincronizó OK')
  })
})
