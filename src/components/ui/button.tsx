import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { Slot } from "radix-ui"

import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "relative isolate inline-flex shrink-0 cursor-pointer items-center justify-center gap-2 overflow-hidden rounded-[8px] border border-transparent text-sm font-semibold tracking-[-0.01em] whitespace-nowrap shadow-[inset_0_1px_0_rgba(255,255,255,0.07),0_10px_24px_rgba(0,0,0,0.22)] transition-all duration-200 ease-out outline-none before:pointer-events-none before:absolute before:inset-x-2 before:top-0 before:h-px before:bg-[linear-gradient(90deg,transparent,rgba(255,255,255,0.42),transparent)] before:content-[''] hover:-translate-y-px hover:shadow-[inset_0_1px_0_rgba(255,255,255,0.10),0_16px_34px_rgba(0,0,0,0.30)] active:translate-y-px active:shadow-[inset_0_1px_0_rgba(255,255,255,0.06),0_8px_18px_rgba(0,0,0,0.22)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)] disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-55 disabled:shadow-none disabled:hover:translate-y-0 aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default:
          "border-[color-mix(in_srgb,var(--accent)_66%,#fff_8%)] bg-[linear-gradient(180deg,var(--accent-hover),var(--accent)_56%,var(--accent-active))] text-[var(--on-accent)] hover:border-[var(--accent-hover)] hover:brightness-[1.03] active:brightness-95",
        primary:
          "border-[color-mix(in_srgb,var(--accent)_66%,#fff_8%)] bg-[linear-gradient(180deg,var(--accent-hover),var(--accent)_56%,var(--accent-active))] text-[var(--on-accent)] hover:border-[var(--accent-hover)] hover:brightness-[1.03] active:brightness-95",
        approve:
          "border-[var(--ok-border)] bg-[linear-gradient(180deg,var(--ok-hover),var(--ok-solid))] text-[var(--on-ok)] hover:border-[var(--ok-hover)]",
        destructive:
          "border-[var(--priority-border)] bg-[linear-gradient(180deg,var(--priority-hover),var(--priority-solid))] text-[var(--on-priority)] hover:border-[var(--priority-bright)] focus-visible:outline-[var(--priority-bright)]",
        outline:
          "border-[var(--border-hairline)] bg-[linear-gradient(180deg,color-mix(in_srgb,var(--surface-raised)_62%,transparent),color-mix(in_srgb,var(--surface-inset)_86%,transparent))] text-[var(--text-primary)] hover:border-[var(--accent-border-strong)] hover:bg-[linear-gradient(180deg,color-mix(in_srgb,var(--surface-raised)_86%,transparent),color-mix(in_srgb,var(--surface-inset)_94%,transparent))] hover:text-[var(--accent-contrast)]",
        secondary:
          "border-[var(--border-hairline)] bg-[linear-gradient(180deg,color-mix(in_srgb,var(--surface-raised)_58%,transparent),color-mix(in_srgb,var(--surface-inset)_90%,transparent))] text-[var(--text-primary)] hover:border-[var(--border-strong)] hover:bg-[var(--surface-raised)]",
        ghost:
          "border-[var(--border-hairline)] bg-[linear-gradient(180deg,color-mix(in_srgb,var(--surface-inset)_50%,transparent),color-mix(in_srgb,var(--surface-soft)_72%,transparent))] text-[var(--text-secondary)] shadow-none before:opacity-40 hover:border-[var(--accent-border-strong)] hover:bg-[var(--surface-inset)] hover:text-[var(--text-primary)]",
        link: "border-transparent bg-transparent text-primary shadow-none hover:translate-y-0 hover:bg-transparent hover:shadow-none hover:underline",
      },
      size: {
        default: "h-10 px-4 py-2 has-[>svg]:px-3",
        xs: "h-7 gap-1 rounded-[7px] px-2 text-xs has-[>svg]:px-1.5 [&_svg:not([class*='size-'])]:size-3",
        sm: "h-9 gap-1.5 rounded-[8px] px-3 has-[>svg]:px-2.5",
        lg: "h-11 rounded-[9px] px-6 has-[>svg]:px-4",
        icon: "size-9",
        "icon-xs": "size-7 rounded-[7px] [&_svg:not([class*='size-'])]:size-3",
        "icon-sm": "size-9",
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
