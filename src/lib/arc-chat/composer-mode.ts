import type { ArcMode } from "@/domain";

import { inferArcRunIntent } from "./run-profile";

const EXPLICIT_READ_ONLY_REQUESTS = [
  /\bread[-\s]?only\b/i,
  /\bask mode\b/i,
  /\bdo not (?:create|edit|update|change)(?:[^.\n]{0,60})(?:create|edit|update|change|send)\b/i,
  /\bdon['’]?t (?:create|edit|update|change)(?:[^.\n]{0,60})(?:create|edit|update|change|send)\b/i,
];

export type ArcComposerModePreference = "auto" | "ask" | "act";

/**
 * Arc is an action-capable workspace agent by default. The old composer inferred
 * `ask` for ordinary chat and research, silently putting the runner into a
 * read-only tool set even though there is no longer a mode control in the UI.
 * Keep drafting explicit for the right work framing; everything else uses the
 * approval-gated action mode and still cannot send externally.
 */
export function resolveArcComposerMode(input: {
  request: string;
  commandMode?: ArcMode;
  preference?: ArcComposerModePreference;
}): ArcMode {
  if (input.commandMode === "draft") return "draft";
  if (input.preference === "ask") return "ask";
  if (input.preference === "act") return "act";
  if (EXPLICIT_READ_ONLY_REQUESTS.some((pattern) => pattern.test(input.request))) return "ask";
  return inferArcRunIntent({ request: input.request }) === "create" ? "draft" : "act";
}
