import { useEffect, useState } from 'react'
import { cn } from '@/lib/utils'

interface FabProps {
  onClick: () => void
  className?: string
}

// Hides while scrolling down so it never sits on top of the amounts being read.
function useHideOnScrollDown(): boolean {
  const [hidden, setHidden] = useState(false)
  useEffect(() => {
    let lastY = window.scrollY
    function onScroll() {
      const y = window.scrollY
      if (Math.abs(y - lastY) < 8) return
      setHidden(y > lastY && y > 80)
      lastY = y
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])
  return hidden
}

export function Fab({ onClick, className }: FabProps) {
  const hidden = useHideOnScrollDown()
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'fixed right-5 bottom-[calc(1.25rem+env(safe-area-inset-bottom))] z-40 md:hidden',
        'flex size-14 items-center justify-center rounded-full',
        'bg-primary text-primary-foreground shadow-lg',
        'transition-transform duration-200 active:scale-95',
        hidden && 'pointer-events-none translate-y-[calc(100%+2rem)]',
        className,
      )}
      aria-label="Accion rapida"
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width="24"
        height="24"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <line x1="12" y1="5" x2="12" y2="19" />
        <line x1="5" y1="12" x2="19" y2="12" />
      </svg>
    </button>
  )
}
