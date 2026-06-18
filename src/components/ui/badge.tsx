import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const badgeVariants = cva(
  "inline-flex items-center rounded-[3px] border px-2 py-0.5 text-[11px] font-semibold tracking-[0.01em] transition-colors focus:outline-none focus:ring-2 focus:ring-ring/45 focus:ring-offset-0",
  {
    variants: {
      variant: {
        default:
          "border-[var(--accent-border-strong)] bg-primary text-primary-foreground shadow-none hover:bg-[var(--accent-hover)]",
        secondary:
          "border-[var(--border-hairline)] bg-secondary text-secondary-foreground hover:bg-[var(--surface-raised)]",
        destructive:
          "border-[var(--priority-border)] bg-destructive text-destructive-foreground shadow-none hover:bg-[var(--priority-hover)]",
        outline: "border-[var(--border-strong)] bg-transparent text-foreground",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <div className={cn(badgeVariants({ variant }), className)} {...props} />
  )
}

export { Badge, badgeVariants }
