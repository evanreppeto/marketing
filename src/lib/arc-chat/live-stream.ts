import type { ArcStep } from "./persistence";

export type ArcStreamFrame = {
  messageId: string;
  body?: string;
  reasoning?: string | null;
  steps?: ArcStep[];
};

export type ArcStreamOverlay = {
  id: string;
  body: string;
  reasoning: string | null;
  steps: ArcStep[];
};

/**
 * The server sends cumulative snapshots, not token deltas. React must replace
 * the prior snapshot so reconnects or repeated frames can never duplicate text.
 */
export function applyArcStreamFrame(current: ArcStreamOverlay | null, frame: ArcStreamFrame): ArcStreamOverlay | null {
  if (!frame.messageId) return current;
  return {
    id: frame.messageId,
    body: frame.body ?? "",
    reasoning: frame.reasoning ?? null,
    steps: Array.isArray(frame.steps) ? frame.steps : [],
  };
}
