"use client";

import { cx } from "@/app/_components/theme";

import { MarkSphere } from "./mark-sphere";

/** Mark's identity avatar — the shared WebGL sphere with an optional "thinking"
 *  ring. Single source of truth for chat AND board. */
export function MarkAvatar({
  size = 32,
  pending = false,
  className,
}: {
  size?: number;
  pending?: boolean;
  className?: string;
}) {
  return (
    <span
      aria-hidden
      className={cx(
        "relative flex shrink-0 items-center justify-center rounded-full",
        pending ? "motion-safe:[animation:mark-ring_2.6s_cubic-bezier(.4,0,.2,1)_infinite]" : "",
        className,
      )}
      style={{ width: size, height: size }}
    >
      <MarkSphere size={size} className="shadow-[inset_0_0_0_1px_var(--border-strong)]" />
    </span>
  );
}
