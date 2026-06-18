"use client"

import * as React from "react"

import { cn } from "@/lib/utils"

type HoverBorderGradientProps<T extends React.ElementType = "button"> = {
  as?: T
  className?: string
  containerClassName?: string
  children: React.ReactNode
} & Omit<React.ComponentPropsWithoutRef<T>, "as" | "className" | "children">

function HoverBorderGradient<T extends React.ElementType = "button">({
  as,
  children,
  className,
  containerClassName,
  ...props
}: HoverBorderGradientProps<T>) {
  const Component = as ?? "button"

  return (
    <span className={cn("inline-flex", containerClassName)}>
      <Component className={cn("arc-hover-border-gradient", className)} {...props}>
        {children}
      </Component>
    </span>
  )
}

export { HoverBorderGradient }
