/**
 * Agent Port configuration. The supervision layer (chat, board, approvals, gate)
 * talks to *an agent* through the webhook/reply contract — never to "Mark/Hermes"
 * by name. These helpers make the attached agent config-driven so a different
 * workspace can point the same UI at their own Hermes agent.
 */

/**
 * Candidate agent keys to attach to. Configurable via `MARK_AGENT_KEY`; falls
 * back to the built-in keys for back-compat with existing workspaces.
 */
export function markAgentKeys(): string[] {
  const configured = process.env.MARK_AGENT_KEY?.trim();
  return configured ? [configured] : ["mark", "hermes"];
}

/** True when an external agent runner endpoint is configured to receive wakes. */
export function isMarkRunnerConfigured(): boolean {
  return Boolean(process.env.MARK_RUNNER_URL ?? process.env.MARK_WEBHOOK_URL);
}

/** Display name for the attached agent — surfaced in the UI from ONE place. */
export function getMarkDisplayName(): string {
  return process.env.MARK_DISPLAY_NAME?.trim() || "Mark";
}
