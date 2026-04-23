import type { ReactNode } from "react"
import { TabNav } from "@/components/layout/tab-nav"
import { cn } from "@/lib/utils"

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col">
      <TabNav />
      <main className="mx-auto w-full max-w-7xl flex-1 px-6 py-6 pb-24 max-md:px-4 max-md:py-4 max-md:pb-24">
        {children}
      </main>
    </div>
  )
}

export function BentoGrid({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        "grid grid-cols-1 gap-3 md:gap-4 md:grid-cols-2 lg:grid-cols-4",
        className,
      )}
    >
      {children}
    </div>
  )
}
