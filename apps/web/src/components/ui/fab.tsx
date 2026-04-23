import { cn } from '@/lib/utils'

interface FabProps {
  onClick: () => void
  className?: string
}

export function Fab({ onClick, className }: FabProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'fixed bottom-6 right-6 z-40 md:hidden',
        'flex size-14 items-center justify-center rounded-full',
        'bg-primary text-primary-foreground shadow-lg',
        'transition-transform active:scale-95',
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
