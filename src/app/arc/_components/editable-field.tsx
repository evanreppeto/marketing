"use client";

import { useEffect, useRef } from "react";

import { cx } from "@/app/_components/theme";

type EditableFieldProps = {
  value: string;
  onChange: (next: string) => void;
  multiline: boolean;
  placeholder: string;
  maxLength?: number;
  ariaLabel: string;
  /** Visual treatment of the rendered text (defaults to body copy). */
  className?: string;
};

/**
 * Inline-editable text. Looks like plain styled text; on focus it is a real input
 * with a gold ring. Auto-grows for multiline. The parent holds state + Save — this
 * never persists on its own.
 */
export function EditableField({
  value,
  onChange,
  multiline,
  placeholder,
  maxLength,
  ariaLabel,
  className,
}: EditableFieldProps) {
  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el || !multiline) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [value, multiline]);

  const base =
    "w-full resize-none bg-transparent outline-none placeholder:text-[var(--text-muted)] " +
    "rounded-[6px] -mx-1 px-1 transition focus:bg-[var(--surface-inset)] " +
    "focus:shadow-[inset_0_0_0_1px_var(--accent-border-strong)]";

  if (multiline) {
    return (
      <textarea
        ref={ref}
        aria-label={ariaLabel}
        value={value}
        placeholder={placeholder}
        maxLength={maxLength}
        onChange={(e) => onChange(e.target.value)}
        rows={1}
        className={cx(base, "block leading-6", className)}
      />
    );
  }

  return (
    <input
      type="text"
      aria-label={ariaLabel}
      value={value}
      placeholder={placeholder}
      maxLength={maxLength}
      onChange={(e) => onChange(e.target.value)}
      className={cx(base, "block", className)}
    />
  );
}
