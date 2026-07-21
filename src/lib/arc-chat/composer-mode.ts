import type { ArcMode } from "@/domain";

import { inferArcRunIntent } from "./run-profile";

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
}): ArcMode {
  if (input.commandMode === "draft") return "draft";
  return inferArcRunIntent({ request: input.request }) === "create" ? "draft" : "act";
}
