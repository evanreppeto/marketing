import * as React from "react"

import { cn } from "@/lib/utils"

function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        "flex field-sizing-content min-h-16 w-full rounded-[8px] border border-[var(--border-hairline)] bg-[linear-gradient(180deg,color-mix(in_srgb,var(--surface-raised)_36%,transparent),var(--surface-inset))] px-3 py-2 text-base font-medium text-[var(--text-primary)] shadow-[inset_0_1px_0_rgba(255,255,255,0.035)] transition-[color,box-shadow,border-color,background-color] outline-none placeholder:text-muted-foreground hover:border-[var(--border-strong)] focus-visible:border-[var(--accent-border-strong)] focus-visible:bg-[var(--surface-raised)] focus-visible:ring-[3px] focus-visible:ring-[color-mix(in_srgb,var(--accent)_18%,transparent)] disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-destructive/20 md:text-sm dark:bg-input/30 dark:aria-invalid:ring-destructive/40",
        className
      )}
      {...props}
    />
  )
}

export { Textarea }
