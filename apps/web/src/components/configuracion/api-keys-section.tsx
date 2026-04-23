import { useState } from 'react'
import { Link } from '@tanstack/react-router'
import { useApiKeys, useCreateApiKey, useRevokeApiKey } from '@/hooks/use-api-keys'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60_000)
  if (mins < 1) return 'ahora'
  if (mins < 60) return `hace ${mins}m`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `hace ${hours}h`
  const days = Math.floor(hours / 24)
  return `hace ${days}d`
}

export function ApiKeysSection() {
  const keys = useApiKeys()
  const createMut = useCreateApiKey()
  const revokeMut = useRevokeApiKey()
  const [adding, setAdding] = useState(false)
  const [name, setName] = useState('')
  const [newKey, setNewKey] = useState<string | null>(null)

  const allKeys = keys.data ?? []
  const activeKeys = allKeys.filter((k) => k.is_active)
  const revokedKeys = allKeys.filter((k) => !k.is_active)

  function handleCreate() {
    if (!name.trim()) return
    createMut.mutate(
      { name: name.trim() },
      {
        onSuccess: (rawKey) => {
          setNewKey(rawKey)
          setAdding(false)
          setName('')
          toast.success('API key creada')
        },
        onError: (e) => toast.error(e.message),
      },
    )
  }

  function handleRevoke(id: string, keyName: string) {
    if (!confirm(`Revocar "${keyName}"? Esta accion no se puede deshacer.`)) return
    revokeMut.mutate(id, {
      onSuccess: () => toast.success('Key revocada'),
      onError: (e) => toast.error(e.message),
    })
  }

  function handleCopy(key: string) {
    navigator.clipboard.writeText(key)
    toast.success('Key copiada')
  }

  return (
    <div className="rounded-md border border-border bg-card">
      <div className="flex items-center justify-between border-b border-border px-5 py-3">
        <div>
          <h2 className="font-semibold">API Keys</h2>
          <p className="text-xs text-muted-foreground">Acceso para bots y CLI · <Link to="/api" className="underline hover:text-foreground">Ver documentación API</Link></p>
        </div>
        <Button size="sm" variant="outline" onClick={() => { setAdding(true); setNewKey(null) }}>
          + Crear
        </Button>
      </div>

      <div className="divide-y divide-border">
        {newKey && (
          <div className="space-y-2 px-5 py-4">
            <div className="flex items-center gap-2 rounded bg-muted p-3">
              <code className="flex-1 break-all font-mono text-sm">{newKey}</code>
              <Button size="sm" variant="outline" onClick={() => handleCopy(newKey)}>
                Copiar
              </Button>
            </div>
            <p className="text-xs text-amber-600 dark:text-amber-400">
              Guarda esta key — no podras verla de nuevo.
            </p>
            <Button size="sm" variant="ghost" onClick={() => setNewKey(null)}>
              Cerrar
            </Button>
          </div>
        )}

        {adding && (
          <form
            className="flex items-center gap-2 bg-muted/30 px-5 py-3"
            onSubmit={(e) => { e.preventDefault(); handleCreate() }}
          >
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Nombre de la key (ej: bot-telegram)"
              className="flex-1 rounded-sm border border-input bg-background px-2 py-1 text-sm focus:border-ring focus:ring-1 focus:ring-ring/20 focus:outline-none"
              autoFocus
            />
            <Button size="sm" type="submit" disabled={createMut.isPending || !name.trim()}>
              Crear
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setAdding(false)}>
              Cancelar
            </Button>
          </form>
        )}

        {activeKeys.length === 0 && !adding && !newKey && (
          <p className="px-5 py-4 text-sm text-muted-foreground">Sin API keys</p>
        )}

        {activeKeys.map((key) => (
          <div key={key.id} className="flex flex-col gap-1 px-4 py-3 sm:flex-row sm:items-center sm:gap-3 md:px-5">
            <div className="flex-1 min-w-0">
              <span className="font-mono text-sm truncate">{key.key_prefix}...</span>
              <span className="ml-2 text-sm">{key.name}</span>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-xs text-muted-foreground">
                {key.last_used_at ? `Usado ${timeAgo(key.last_used_at)}` : 'Nunca usado'}
              </span>
              <span className="text-xs text-muted-foreground">
                {timeAgo(key.created_at)}
              </span>
              <button
                type="button"
                onClick={() => handleRevoke(key.id, key.name)}
                disabled={revokeMut.isPending}
                className="text-xs text-destructive hover:underline disabled:opacity-50"
              >
                Revocar
              </button>
            </div>
          </div>
        ))}

        {revokedKeys.length > 0 && (
          <div className="px-5 py-3">
            <p className="text-xs font-medium text-muted-foreground">Revocadas ({revokedKeys.length})</p>
            {revokedKeys.map((key) => (
              <p key={key.id} className="mt-1 text-xs text-muted-foreground line-through">
                {key.key_prefix}... · {key.name}
              </p>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
