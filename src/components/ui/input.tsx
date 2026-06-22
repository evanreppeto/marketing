import * as React from "react"

import { cn } from "@/lib/utils"

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        "h-10 w-full min-w-0 rounded-[8px] border border-[var(--border-hairline)] bg-[linear-gradient(180deg,color-mix(in_srgb,var(--surface-raised)_36%,transparent),var(--surface-inset))] px-3 py-1 text-base font-medium text-[var(--text-primary)] shadow-[inset_0_1px_0_rgba(255,255,255,0.035)] transition-[color,box-shadow,border-color,background-color] outline-none selection:bg-primary selection:text-primary-foreground file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm dark:bg-input/30",
        "hover:border-[var(--border-strong)] focus-visible:border-[var(--accent-border-strong)] focus-visible:bg-[var(--surface-raised)] focus-visible:ring-[3px] focus-visible:ring-[color-mix(in_srgb,var(--accent)_18%,transparent)]",
        "aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40",
        className
      )}
      {...props}
    />
  )
}

export { Input }
