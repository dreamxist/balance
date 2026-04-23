import { createFileRoute } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'

interface ApiDocsData {
  info: { title: string; description: string; version: string }
  auth: { description: string; endpoint: string }
  servers: Array<{ url: string }>
  paths: Record<string, Record<string, { parameters?: Array<{ name: string; in: string; type: string; description?: string; required?: boolean }>; description?: string }>>
  definitions: Record<string, { properties?: Record<string, { type?: string; format?: string; description?: string; default?: unknown }> }>
  notes: {
    money: string
    transactions: string
    types: Record<string, string[]>
    reconciliation: string
  }
}

export const Route = createFileRoute('/_authenticated/api')({
  component: ApiPage,
})

function useApiDocs() {
  return useQuery<ApiDocsData>({
    queryKey: ['api-docs'],
    queryFn: async () => {
      const url = import.meta.env.VITE_SUPABASE_URL
      const res = await fetch(`${url}/functions/v1/api-docs`)
      if (!res.ok) throw new Error('Failed to fetch API docs')
      return res.json()
    },
    staleTime: 3600_000,
  })
}

function copyText(text: string) {
  navigator.clipboard.writeText(text)
  toast.success('Copiado')
}

function CodeBlock({ children, copyable = true }: { children: string; copyable?: boolean }) {
  return (
    <div className="group relative rounded-md bg-muted p-3">
      <pre className="overflow-x-auto font-mono text-xs leading-relaxed">{children}</pre>
      {copyable && (
        <button
          type="button"
          onClick={() => copyText(children)}
          className="absolute top-2 right-2 rounded-sm bg-background px-2 py-0.5 text-xs opacity-0 transition-opacity group-hover:opacity-100"
        >
          Copiar
        </button>
      )}
    </div>
  )
}

function SectionCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-md border border-border bg-card">
      <div className="border-b border-border px-5 py-3">
        <h2 className="font-semibold">{title}</h2>
      </div>
      <div className="px-5 py-4 space-y-3">{children}</div>
    </div>
  )
}

function EndpointRow({ method, path, description }: { method: string; path: string; description?: string }) {
  const colors: Record<string, string> = {
    GET: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400',
    POST: 'bg-blue-500/15 text-blue-700 dark:text-blue-400',
    PATCH: 'bg-amber-500/15 text-amber-700 dark:text-amber-400',
    DELETE: 'bg-red-500/15 text-red-700 dark:text-red-400',
  }
  return (
    <div className="flex items-center gap-3 py-1.5">
      <span className={`inline-flex w-14 justify-center rounded px-1.5 py-0.5 font-mono text-[10px] font-bold ${colors[method] ?? 'bg-muted text-muted-foreground'}`}>
        {method}
      </span>
      <code className="font-mono text-sm">{path}</code>
      {description && <span className="text-xs text-muted-foreground">{description}</span>}
    </div>
  )
}

function SchemaTable({ name, properties }: { name: string; properties: Record<string, { type?: string; format?: string; description?: string; default?: unknown }> }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="border-b border-border last:border-0">
      <button type="button" onClick={() => setOpen(!open)} className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-muted/50">
        <span className="text-xs text-muted-foreground">{open ? '▼' : '▶'}</span>
        <code className="font-mono text-sm font-medium">{name}</code>
        <span className="text-xs text-muted-foreground">({Object.keys(properties).length} cols)</span>
      </button>
      {open && (
        <div className="px-3 pb-3">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-left text-muted-foreground">
                <th className="pb-1 pr-4 font-medium">Columna</th>
                <th className="pb-1 pr-4 font-medium">Tipo</th>
                <th className="pb-1 font-medium">Default</th>
              </tr>
            </thead>
            <tbody className="font-mono">
              {Object.entries(properties).map(([col, spec]) => (
                <tr key={col} className="border-t border-border/50">
                  <td className="py-1 pr-4">{col}</td>
                  <td className="py-1 pr-4 text-muted-foreground">{spec.format ?? spec.type ?? '—'}</td>
                  <td className="py-1 text-muted-foreground">{spec.default !== undefined ? String(spec.default) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function ApiPage() {
  const { data, isLoading, error } = useApiDocs()

  if (isLoading) return <div className="p-6 text-muted-foreground">Cargando documentación...</div>
  if (error || !data) return <div className="p-6 text-destructive">Error cargando docs</div>

  const baseUrl = data.servers?.[0]?.url ?? ''
  const tables = Object.entries(data.paths).filter(([p]) => !p.startsWith('/rpc/'))
  const rpcs = Object.entries(data.paths).filter(([p]) => p.startsWith('/rpc/'))

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-bold">API Reference</h1>
        <p className="mt-1 text-sm text-muted-foreground">{data.info.description}</p>
      </div>

      <SectionCard title="Autenticación">
        <p className="text-sm text-muted-foreground">
          Obtén un JWT usando tu API key. Crea una en <a href="/configuracion" className="underline">Configuración</a>.
        </p>
        <div className="space-y-2">
          <p className="text-xs font-medium">1. Intercambiar API key por token:</p>
          <CodeBlock>{`curl -X POST ${data.auth.endpoint} \\
  -H "x-api-key: bal_tu_key_aqui"`}</CodeBlock>
          <p className="text-xs font-medium">2. Usar el token en las queries:</p>
          <CodeBlock>{`curl ${baseUrl}/accounts \\
  -H "apikey: <publishable_key>" \\
  -H "Authorization: Bearer <access_token>"`}</CodeBlock>
        </div>
        <div className="rounded-md bg-amber-500/10 px-3 py-2">
          <p className="text-xs text-amber-700 dark:text-amber-400">
            El token expira en 1 hora. Usa el <code className="font-mono">refresh_token</code> para renovar via <code className="font-mono">POST /auth/v1/token?grant_type=refresh_token</code>.
          </p>
        </div>
      </SectionCard>

      <SectionCard title="Notas del dominio">
        <div className="space-y-2 text-sm">
          <div><span className="font-medium">Montos:</span> <span className="text-muted-foreground">{data.notes.money}</span></div>
          <div><span className="font-medium">Transacciones:</span> <span className="text-muted-foreground">{data.notes.transactions}</span></div>
          <div><span className="font-medium">Reconciliación:</span> <span className="text-muted-foreground">{data.notes.reconciliation}</span></div>
          <div>
            <span className="font-medium">Tipos:</span>
            <div className="mt-1 space-y-1">
              {Object.entries(data.notes.types).map(([key, values]) => (
                <div key={key} className="flex flex-wrap items-center gap-1">
                  <code className="font-mono text-xs">{key}:</code>
                  {values.map((v) => (
                    <span key={v} className="rounded-full bg-muted px-2 py-0.5 font-mono text-[10px]">{v}</span>
                  ))}
                </div>
              ))}
            </div>
          </div>
        </div>
      </SectionCard>

      <SectionCard title={`Tablas y Vistas (${tables.length})`}>
        <div className="divide-y divide-border">
          {tables.map(([path, methods]) => (
            <div key={path} className="py-1.5">
              <div className="flex flex-wrap gap-1">
                {Object.keys(methods).filter(m => m !== 'parameters').map((m) => (
                  <EndpointRow key={m} method={m.toUpperCase()} path={`${baseUrl}${path}`} />
                ))}
              </div>
            </div>
          ))}
        </div>
      </SectionCard>

      <SectionCard title={`Funciones RPC (${rpcs.length})`}>
        <p className="text-xs text-muted-foreground mb-2">Llamar via POST con JSON body. Toda la lógica de negocio vive aquí.</p>
        <div className="divide-y divide-border">
          {rpcs.map(([path]) => (
            <EndpointRow key={path} method="POST" path={`${baseUrl}${path}`} />
          ))}
        </div>
      </SectionCard>

      <SectionCard title={`Schemas (${Object.keys(data.definitions).length})`}>
        <p className="text-xs text-muted-foreground mb-2">Click para expandir columnas de cada tabla.</p>
        <div className="rounded-md border border-border">
          {Object.entries(data.definitions).map(([name, def]) => (
            <SchemaTable key={name} name={name} properties={def.properties ?? {}} />
          ))}
        </div>
      </SectionCard>

      <div className="text-center">
        <Button variant="outline" size="sm" onClick={() => copyText(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/api-docs`)}>
          Copiar URL del endpoint JSON
        </Button>
      </div>
    </div>
  )
}
