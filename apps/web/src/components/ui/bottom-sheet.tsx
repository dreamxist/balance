import type { ReactNode } from 'react'
import { Drawer } from 'vaul'

interface BottomSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title?: string
  children: ReactNode
}

export function BottomSheet({ open, onOpenChange, title, children }: BottomSheetProps) {
  return (
    <Drawer.Root open={open} onOpenChange={onOpenChange}>
      <Drawer.Portal>
        <Drawer.Overlay className="fixed inset-0 z-50 bg-black/30" />
        <Drawer.Content className="fixed inset-x-0 bottom-0 z-50 max-h-[85vh] overflow-auto rounded-t-xl bg-card">
          <Drawer.Handle className="mx-auto mb-4 mt-2 h-1 w-8 rounded-full bg-muted" />
          {title && (
            <Drawer.Title className="px-4 text-lg font-semibold">
              {title}
            </Drawer.Title>
          )}
          <div className="px-4 pb-6">{children}</div>
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  )
}
