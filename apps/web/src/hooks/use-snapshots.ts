import { useQuery, type UseQueryResult } from '@tanstack/react-query'
import { getSnapshotHistory } from '@balance/core'
import { supabase } from '@/lib/supabase'

export type Snapshot = Awaited<ReturnType<typeof getSnapshotHistory>>[number]

export function useSnapshots(limit?: number): UseQueryResult<Snapshot[]> {
  return useQuery({
    queryKey: ['snapshots', limit],
    queryFn: () => getSnapshotHistory(supabase, limit),
    staleTime: 60_000,
  })
}
