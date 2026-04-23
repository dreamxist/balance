import { useState } from 'react'
import { Button } from '@/components/ui/button'

type ProfileData = {
  displayName?: string
  features?: Record<string, boolean>
}

const FEATURE_FLAGS = [
  { key: 'spa', label: 'Tengo empresa (SpA/EIRL)' },
  { key: 'investments', label: 'Tengo inversiones' },
  { key: 'rentals', label: 'Recibo arriendo' },
  { key: 'taxes', label: 'Pago impuestos (IVA/PPM)' },
] as const

export function StepProfile({
  onComplete,
  onSkip,
}: {
  onComplete: (profile: ProfileData) => void
  onSkip: () => void
}) {
  const [displayName, setDisplayName] = useState('')
  const [features, setFeatures] = useState<Record<string, boolean>>({
    spa: false,
    investments: false,
    rentals: false,
    taxes: false,
  })

  function toggleFeature(key: string) {
    setFeatures((prev) => ({ ...prev, [key]: !prev[key] }))
  }

  function handleComplete() {
    onComplete({
      displayName: displayName.trim() || undefined,
      features,
    })
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Tu perfil</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Opcional — puedes configurar esto despues
        </p>
      </div>

      <div className="rounded-xl border border-border bg-card p-5 space-y-4">
        <div className="space-y-1.5">
          <label htmlFor="display-name" className="text-sm text-muted-foreground">
            Nombre
          </label>
          <input
            id="display-name"
            type="text"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            className="w-full rounded-sm border border-input bg-background px-3 py-2 text-sm focus:border-ring focus:ring-2 focus:ring-ring/20 focus:outline-none"
            placeholder="Como te llamas?"
          />
        </div>

        <div className="space-y-3 pt-2">
          <p className="text-sm font-medium">Que usas?</p>
          {FEATURE_FLAGS.map(({ key, label }) => (
            <label key={key} className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={features[key] ?? false}
                onChange={() => toggleFeature(key)}
                className="size-4 rounded border-input accent-primary"
              />
              <span className="text-sm">{label}</span>
            </label>
          ))}
        </div>
      </div>

      <div className="flex gap-3">
        <Button onClick={onSkip} variant="ghost" className="flex-1" size="lg">
          Omitir
        </Button>
        <Button onClick={handleComplete} className="flex-1" size="lg">
          Completar
        </Button>
      </div>
    </div>
  )
}
