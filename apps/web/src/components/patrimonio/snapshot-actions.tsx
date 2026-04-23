import { useMutation, useQueryClient } from '@tanstack/react-query'
import { createSnapshot } from '@balance/core'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'

export function SnapshotActions() {
  const queryClient = useQueryClient()

  const mutation = useMutation({
    mutationFn: () => createSnapshot(supabase),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['snapshots'] })
      void queryClient.invalidateQueries({ queryKey: ['reconciliation'] })
      toast.success('Snapshot guardado')
    },
    onError: (error: Error) => {
      toast.error(`Error al guardar snapshot: ${error.message}`)
    },
  })

  return (
    <div className="flex justify-end">
      <Button
        onClick={() => mutation.mutate()}
        disabled={mutation.isPending}
      >
        {mutation.isPending ? 'Guardando...' : 'Guardar snapshot'}
      </Button>
    </div>
  )
}
