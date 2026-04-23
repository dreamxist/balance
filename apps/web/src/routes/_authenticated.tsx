import { createFileRoute, Outlet, Navigate } from '@tanstack/react-router'
import { useAuth } from '@/lib/auth'
import { useProfile } from '@/hooks/use-profile'
import { AppShell } from '@/components/layout/app-shell'
import { SkeletonCard } from '@/components/ui/skeleton'

export const Route = createFileRoute('/_authenticated')({
  component: AuthenticatedLayout,
})

function AuthenticatedLayout() {
  const { user, loading } = useAuth()
  const profile = useProfile()

  if (loading || profile.isLoading) {
    return (
      <AppShell>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
        </div>
      </AppShell>
    )
  }

  if (!user) {
    return <Navigate to="/login" />
  }

  if (profile.data && !profile.data.is_onboarded) {
    return <Navigate to="/onboarding" />
  }

  return (
    <AppShell>
      <Outlet />
    </AppShell>
  )
}
