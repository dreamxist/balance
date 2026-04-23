import { createFileRoute } from '@tanstack/react-router'
import { useProfile, hasFeature } from '@/hooks/use-profile'
import { SpaDashboard } from '@/components/spa/spa-dashboard'
import { EmptyState } from '@/components/ui/empty-state'

export const Route = createFileRoute('/_authenticated/spa')({
  component: SpaPage,
})

function SpaPage() {
  const { data: profile, isLoading } = useProfile()

  if (isLoading) {
    return (
      <div className="grid gap-4 md:grid-cols-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-32 animate-pulse rounded-md border bg-card" />
        ))}
      </div>
    )
  }

  if (!hasFeature(profile, 'spa')) {
    return (
      <EmptyState
        title="Modulo SpA deshabilitado"
        description="Activa el modulo empresa en tu perfil para usar esta seccion"
      />
    )
  }

  return <SpaDashboard />
}
