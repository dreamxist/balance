import { Link, useRouterState } from "@tanstack/react-router"
import { useAuth } from "@/lib/auth"
import { Button } from "@/components/ui/button"
import { ThemeToggle } from "@/components/layout/theme-toggle"
import { cn } from "@/lib/utils"

const tabs = [
  { label: "Cuadrar", to: "/" as const },
  { label: "Movimientos", to: "/movimientos" as const },
  { label: "Deudas", to: "/deudas" as const },
  { label: "SpA", to: "/spa" as const },
  { label: "Patrimonio", to: "/patrimonio" as const },
] as const

export function TabNav() {
  const { user, signOut } = useAuth()
  const routerState = useRouterState()
  const currentPath = routerState.location.pathname

  const initials = user?.email
    ? user.email.slice(0, 2).toUpperCase()
    : "??"

  return (
    <header className="border-b border-border">
      {/* Desktop: single row */}
      <div className="mx-auto flex h-14 max-w-7xl items-center gap-6 px-6 max-md:hidden">
        <span className="text-lg font-bold text-foreground">Balance</span>

        <nav className="flex h-full flex-1 items-center justify-center gap-1">
          {tabs.map((tab) => {
            const isActive =
              tab.to === "/"
                ? currentPath === "/"
                : currentPath.startsWith(tab.to)

            return (
              <Link
                key={tab.to}
                to={tab.to}
                className={cn(
                  "relative flex h-full items-center px-3 text-sm transition-colors",
                  isActive
                    ? "text-foreground"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {tab.label}
                {isActive && (
                  <span className="absolute inset-x-0 bottom-0 h-0.5 bg-foreground" />
                )}
              </Link>
            )
          })}
        </nav>

        <div className="flex items-center gap-2">
          <ThemeToggle />
          <Link
            to={"/configuracion" as string}
            className={cn(
              "flex size-8 items-center justify-center rounded-full text-xs font-medium transition-colors",
              currentPath === "/configuracion"
                ? "bg-foreground text-background"
                : "bg-muted text-muted-foreground hover:bg-muted/80",
            )}
            title="Configuración"
          >
            {initials}
          </Link>
          <Button variant="ghost" size="sm" onClick={() => void signOut()}>
            Salir
          </Button>
        </div>
      </div>

      {/* Mobile: two rows */}
      <div className="md:hidden">
        <div className="flex h-12 items-center justify-between px-4">
          <span className="text-lg font-bold text-foreground">Balance</span>
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <div className="flex size-8 items-center justify-center rounded-full bg-muted text-xs font-medium text-muted-foreground">
              {initials}
            </div>
          </div>
        </div>
        <nav className="flex h-11 items-center gap-0.5 px-2">
          {tabs.map((tab) => {
            const isActive =
              tab.to === "/"
                ? currentPath === "/"
                : currentPath.startsWith(tab.to)

            return (
              <Link
                key={tab.to}
                to={tab.to}
                className={cn(
                  "relative flex h-full flex-1 items-center justify-center px-1 text-[13px] font-medium transition-colors",
                  isActive
                    ? "text-foreground"
                    : "text-muted-foreground",
                )}
              >
                {tab.label}
                {isActive && (
                  <span className="absolute inset-x-0 bottom-0 h-[2px] rounded-full bg-foreground" />
                )}
              </Link>
            )
          })}
        </nav>
      </div>
    </header>
  )
}
