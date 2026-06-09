"use client";

import { forwardRef, type ButtonHTMLAttributes } from "react";

import { cx } from "@/app/_components/theme";

type IconButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  /** Required for icon-only buttons (a11y). */
  label: string;
  /** Visually emphasize as destructive on hover. */
  tone?: "default" | "danger";
};

/** Small square icon button shared by the message toolbar, header, and thread menu.
 *  Keeps focus-visible + hit-area consistent; backs onto theme tokens. */
export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { label, tone = "default", className, type = "button", ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      aria-label={label}
      title={label}
      className={cx(
        "inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-[var(--text-muted)] transition",
        "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--accent)]",
        tone === "danger"
          ? "hover:bg-[var(--priority-soft)] hover:text-[var(--priority-bright)]"
          : "hover:bg-[var(--surface-inset)] hover:text-[var(--text-primary)]",
        className,
      )}
      {...rest}
    />
  );
});
