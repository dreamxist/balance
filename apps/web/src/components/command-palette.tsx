import { Command } from 'cmdk'
import { useNavigate } from '@tanstack/react-router'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { createSnapshot } from '@balance/core'
import { supabase } from '@/lib/supabase'
import { toast } from 'sonner'

const isMac = typeof navigator !== 'undefined' && /Mac|iPod|iPhone|iPad/.test(navigator.platform)

function Kbd({ children }: { children: string }) {
  return (
    <kbd className="ml-auto text-xs text-muted-foreground font-mono">
      {children}
    </kbd>
  )
}

function formatShortcut(key: string): string {
  const mod = isMac ? '\u2318' : 'Ctrl+'
  return `${mod}${key}`
}

interface CommandPaletteProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function CommandPalette({ open, onOpenChange }: CommandPaletteProps) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const snapshotMutation = useMutation({
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

  function close() {
    onOpenChange(false)
  }

  function handleNavigate(to: string, search?: Record<string, string>) {
    void navigate({ to, search })
    close()
  }

  function handleSnapshot() {
    snapshotMutation.mutate()
    close()
  }

  return (
    <Command.Dialog
      open={open}
      onOpenChange={onOpenChange}
      label="Command palette"
      className="fixed inset-0 z-50"
    >
      {/* Overlay */}
      <div
        className="fixed inset-0 bg-black/50 backdrop-blur-sm"
        onClick={() => close()}
        aria-hidden="true"
      />

      {/* Panel */}
      <div className="relative mx-auto mt-[20vh] max-w-lg rounded-lg border bg-card shadow-lg">
        <Command.Input
          placeholder="Buscar o ejecutar..."
          className="w-full border-0 bg-transparent px-4 py-3 text-lg outline-none placeholder:text-muted-foreground"
        />

        <Command.List className="max-h-80 overflow-y-auto border-t px-2 pb-2">
          <Command.Empty className="py-6 text-center text-sm text-muted-foreground">
            Sin resultados
          </Command.Empty>

          <Command.Group
            heading="Navegacion"
            className="[&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wider [&_[cmdk-group-heading]]:text-muted-foreground"
          >
            <Command.Item
              onSelect={() => handleNavigate('/')}
              className="flex items-center rounded-sm px-3 py-2 text-sm cursor-pointer aria-selected:bg-muted"
            >
              Ir a Cuadrar
              <Kbd>{formatShortcut('1')}</Kbd>
            </Command.Item>
            <Command.Item
              onSelect={() => handleNavigate('/movimientos')}
              className="flex items-center rounded-sm px-3 py-2 text-sm cursor-pointer aria-selected:bg-muted"
            >
              Ir a Movimientos
              <Kbd>{formatShortcut('2')}</Kbd>
            </Command.Item>
            <Command.Item
              onSelect={() => handleNavigate('/deudas')}
              className="flex items-center rounded-sm px-3 py-2 text-sm cursor-pointer aria-selected:bg-muted"
            >
              Ir a Deudas
              <Kbd>{formatShortcut('3')}</Kbd>
            </Command.Item>
            <Command.Item
              onSelect={() => handleNavigate('/spa')}
              className="flex items-center rounded-sm px-3 py-2 text-sm cursor-pointer aria-selected:bg-muted"
            >
              Ir a SpA
              <Kbd>{formatShortcut('4')}</Kbd>
            </Command.Item>
            <Command.Item
              onSelect={() => handleNavigate('/patrimonio')}
              className="flex items-center rounded-sm px-3 py-2 text-sm cursor-pointer aria-selected:bg-muted"
            >
              Ir a Patrimonio
              <Kbd>{formatShortcut('5')}</Kbd>
            </Command.Item>
          </Command.Group>

          <Command.Separator className="mx-2 my-1 h-px bg-border" />

          <Command.Group
            heading="Acciones"
            className="[&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wider [&_[cmdk-group-heading]]:text-muted-foreground"
          >
            <Command.Item
              onSelect={() => handleNavigate('/movimientos', { new: 'true' })}
              className="flex items-center rounded-sm px-3 py-2 text-sm cursor-pointer aria-selected:bg-muted"
            >
              Registrar movimiento
              <Kbd>{formatShortcut('N')}</Kbd>
            </Command.Item>
            <Command.Item
              onSelect={handleSnapshot}
              className="flex items-center rounded-sm px-3 py-2 text-sm cursor-pointer aria-selected:bg-muted"
            >
              Guardar snapshot
            </Command.Item>
            <Command.Item
              onSelect={() => handleNavigate('/deudas', { new: 'true' })}
              className="flex items-center rounded-sm px-3 py-2 text-sm cursor-pointer aria-selected:bg-muted"
            >
              Nueva compra en cuotas
            </Command.Item>
          </Command.Group>
        </Command.List>
      </div>
    </Command.Dialog>
  )
}
