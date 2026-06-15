"use client";

import { cx } from "@/app/_components/theme";
import { Persona, type PersonaState } from "@/components/ai-elements/persona";

import { MarkOrb } from "./mark-orb";

export function MarkPersona({
  size = 42,
  state = "idle",
  className,
}: {
  size?: number;
  state?: PersonaState;
  className?: string;
}) {
  return (
    <span
      aria-hidden
      className={cx(
        "relative block shrink-0 overflow-hidden rounded-full bg-[var(--surface-inset)] shadow-[inset_0_0_0_1px_var(--border-strong)]",
        state === "thinking" ? "motion-safe:[animation:mark-ring_2.6s_cubic-bezier(.4,0,.2,1)_infinite]" : "",
        className,
      )}
      style={{ width: size, height: size }}
    >
      <MarkOrb size={size} className="absolute inset-0 opacity-95" />
      <Persona state={state} variant="halo" className="absolute inset-0 !size-full opacity-95" />
    </span>
  );
}

/** Mark's identity avatar, backed by the official AI Elements Persona visual. */
export function MarkAvatar({
  size = 32,
  pending = false,
  state,
  className,
}: {
  size?: number;
  pending?: boolean;
  state?: PersonaState;
  className?: string;
}) {
  const personaState = state ?? (pending ? "thinking" : "idle");

  return <MarkPersona size={size} state={personaState} className={className} />;
}
