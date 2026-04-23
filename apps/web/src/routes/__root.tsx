import { useState } from 'react'
import { createRootRoute, Outlet, useNavigate } from '@tanstack/react-router'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Toaster } from 'sonner'
import { AuthProvider } from '@/lib/auth'
import { CommandPalette } from '@/components/command-palette'
import { useKeyboardShortcuts } from '@/hooks/use-keyboard-shortcuts'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      gcTime: 5 * 60_000,
      refetchOnWindowFocus: true,
    },
  },
})

export const Route = createRootRoute({
  component: RootLayout,
})

function RootLayout() {
  const [paletteOpen, setPaletteOpen] = useState(false)
  const navigate = useNavigate()

  useKeyboardShortcuts({
    onTogglePalette: () => setPaletteOpen(prev => !prev),
    navigate,
  })

  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <div className="min-h-screen overflow-x-hidden bg-background text-foreground font-sans">
          <Outlet />
        </div>
        <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} />
        <Toaster />
      </AuthProvider>
    </QueryClientProvider>
  )
}
