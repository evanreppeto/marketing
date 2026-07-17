import type { ArcRoute } from "@/domain";

import { inferArcRunIntent } from "./run-profile";

export type ArcModelPreference = ArcRoute | "auto";

/** Resolve the composer's friendly model choice to the runner's existing route. */
export function resolveArcModelRoute(input: {
  preference: ArcModelPreference;
  request?: string | null;
  command?: string | null;
}): ArcRoute {
  if (input.preference !== "auto") return input.preference;

  const intent = inferArcRunIntent({ request: input.request, command: input.command });
  return intent === "chat" ? "fast" : "standard";
}
