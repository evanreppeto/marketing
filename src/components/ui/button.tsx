import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { Slot } from "radix-ui"

import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "inline-flex shrink-0 items-center justify-center gap-2 rounded-[4px] border border-transparent text-sm font-semibold whitespace-nowrap shadow-[var(--elev-control)] transition-all duration-200 ease-out outline-none hover:-translate-y-0.5 hover:shadow-[var(--elev-control-hover)] active:translate-y-px active:shadow-[var(--elev-control)] focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/45 disabled:pointer-events-none disabled:opacity-50 disabled:shadow-none disabled:hover:translate-y-0 aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default:
          "arc-hover-border-gradient [--button-bg:var(--accent)] [--button-border-from:rgba(241,237,226,0.34)] [--button-border-via:var(--accent-hover)] [--button-border-to:rgba(127,184,154,0.30)] text-primary-foreground hover:[--button-bg:var(--accent-hover)] active:[--button-bg:var(--accent-active)]",
        primary:
          "arc-hover-border-gradient [--button-bg:var(--accent)] [--button-border-from:rgba(241,237,226,0.34)] [--button-border-via:var(--accent-hover)] [--button-border-to:rgba(127,184,154,0.30)] text-primary-foreground hover:[--button-bg:var(--accent-hover)] active:[--button-bg:var(--accent-active)]",
        approve:
          "arc-hover-border-gradient [--button-bg:var(--ok-solid)] [--button-border-from:rgba(241,237,226,0.26)] [--button-border-via:var(--ok-hover)] [--button-border-to:rgba(200,162,74,0.26)] text-[var(--on-ok)] hover:[--button-bg:var(--ok-hover)]",
        destructive:
          "arc-hover-border-gradient [--button-bg:var(--priority-solid)] [--button-border-from:rgba(255,255,255,0.28)] [--button-border-via:var(--priority-bright)] [--button-border-to:rgba(200,162,74,0.20)] text-white hover:[--button-bg:var(--priority-hover)] focus-visible:ring-destructive/20 dark:focus-visible:ring-destructive/40",
        outline:
          "arc-hover-border-gradient [--button-bg:var(--surface-inset)] [--button-border-from:rgba(255,255,255,0.12)] [--button-border-via:var(--accent-border-strong)] [--button-border-to:rgba(127,184,154,0.18)] text-[var(--text-primary)] shadow-none hover:[--button-bg:var(--surface-raised)] hover:text-[var(--accent-contrast)]",
        secondary:
          "arc-hover-border-gradient [--button-bg:var(--surface-inset)] [--button-border-from:rgba(255,255,255,0.10)] [--button-border-via:var(--border-strong)] [--button-border-to:rgba(200,162,74,0.20)] text-secondary-foreground shadow-none hover:[--button-bg:var(--surface-raised)] hover:text-[var(--text-primary)]",
        ghost:
          "border-transparent bg-transparent text-[var(--text-secondary)] shadow-none hover:border-[var(--border-hairline)] hover:bg-[var(--surface-inset)] hover:text-[var(--text-primary)]",
        link: "border-transparent bg-transparent text-primary shadow-none hover:translate-y-0 hover:bg-transparent hover:shadow-none hover:underline",
      },
      size: {
        default: "h-9 px-4 py-2 has-[>svg]:px-3",
        xs: "h-6 gap-1 rounded-md px-2 text-xs has-[>svg]:px-1.5 [&_svg:not([class*='size-'])]:size-3",
        sm: "h-8 gap-1.5 rounded-md px-3 has-[>svg]:px-2.5",
        lg: "h-10 rounded-md px-6 has-[>svg]:px-4",
        icon: "size-9",
        "icon-xs": "size-6 rounded-md [&_svg:not([class*='size-'])]:size-3",
        "icon-sm": "size-8",
        "icon-lg": "size-10",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

function Button({
  className,
  variant = "default",
  size = "default",
  asChild = false,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean
  }) {
  const Comp = asChild ? Slot.Root : "button"

  return (
    <Comp
      data-slot="button"
      data-variant={variant}
      data-size={size}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
