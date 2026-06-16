"use client";

import { cx } from "@/app/_components/theme";
import { Persona, type PersonaState } from "@/components/ai-elements/persona";

const ARC_PERSONA_COLORS: Record<PersonaState, readonly [number, number, number]> = {
  asleep: [174, 181, 194],
  idle: [200, 162, 74],
  listening: [127, 184, 154],
  speaking: [216, 182, 94],
  thinking: [216, 182, 94],
};

export function ArcPersona({
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
      data-state={state}
      className={cx(
        "arc-persona block shrink-0",
        className,
      )}
      style={{ width: size, height: size }}
    >
      <Persona
        className="arc-persona-rive"
        modelColor={ARC_PERSONA_COLORS[state]}
        state={state}
        variant="obsidian"
      />
    </span>
  );
}

/** Arc's identity avatar, backed by the official AI Elements obsidian persona bubble. */
export function ArcAvatar({
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

  return <ArcPersona size={size} state={personaState} className={className} />;
}
