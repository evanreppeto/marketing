/** Pure, deterministic lifecycle for the board's client-side demo card.
 *  Writes no data — drives a visual-only simulation in the Kanban board. */

export const DEMO_SEQUENCE = ["queued", "running", "needs_approval", "completed"] as const;

export type DemoStatus = (typeof DEMO_SEQUENCE)[number];

export type DemoFrame = {
  step: number;
  status: DemoStatus;
  working: boolean;
};

function frameForStep(step: number): DemoFrame {
  const status = DEMO_SEQUENCE[step];
  return { step, status, working: status === "running" };
}

export function initialDemoFrame(): DemoFrame {
  return frameForStep(0);
}

/** Given the current step index, return the next frame (wraps, normalizes input).
 *  Out-of-range or non-integer values are clamped to [0, len-1] before advancing. */
export function nextDemoFrame(prevStep: number): DemoFrame {
  const len = DEMO_SEQUENCE.length;
  const truncated = Math.trunc(prevStep);
  // Clamp to valid range; negatives and values >= len all map to 0
  const current = truncated >= 0 && truncated < len ? truncated : 0;
  const step = (current + 1) % len;
  return frameForStep(step);
}
