import { useEffect } from 'react'
import type { UseNavigateResult } from '@tanstack/react-router'

const IGNORED_TAGS = new Set(['INPUT', 'TEXTAREA', 'SELECT'])

const TAB_ROUTES: Record<string, string> = {
  '1': '/',
  '2': '/movimientos',
  '3': '/deudas',
  '4': '/spa',
  '5': '/patrimonio',
}

interface UseKeyboardShortcutsOptions {
  onTogglePalette: () => void
  navigate: UseNavigateResult<string>
}

export function useKeyboardShortcuts({ onTogglePalette, navigate }: UseKeyboardShortcutsOptions) {
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      const mod = e.metaKey || e.ctrlKey
      const target = e.target as HTMLElement | null
      const isTyping = target != null && IGNORED_TAGS.has(target.tagName)

      // Cmd+K always works, even in inputs
      if (mod && e.key === 'k') {
        e.preventDefault()
        onTogglePalette()
        return
      }

      // Remaining shortcuts only when not typing
      if (isTyping) return

      // Cmd+1-5: navigate tabs
      if (mod && e.key in TAB_ROUTES) {
        e.preventDefault()
        void navigate({ to: TAB_ROUTES[e.key] })
        return
      }

      // Cmd+N: new transaction
      if (mod && e.key === 'n') {
        e.preventDefault()
        void navigate({ to: '/movimientos', search: { new: 'true' } })
        return
      }

      // TODO: j/k list navigation — best implemented per-list with focus context
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [onTogglePalette, navigate])
}
