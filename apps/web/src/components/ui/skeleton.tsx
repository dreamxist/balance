import { cn } from "@/lib/utils"

export function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="skeleton"
      className={cn("animate-pulse rounded-md bg-muted", className)}
      {...props}
    />
  )
}

export function SkeletonCard({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      className={cn("rounded-md border bg-card p-5", className)}
      {...props}
    >
      <Skeleton className="h-4 w-24" />
      <Skeleton className="mt-3 h-8 w-40" />
      <Skeleton className="mt-3 h-3 w-32" />
    </div>
  )
}
