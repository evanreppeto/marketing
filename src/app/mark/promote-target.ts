import { OFFICIAL_PERSONA_MAPPINGS, RESTORATION_FOCUS_VALUES } from "@/domain";

/**
 * Promote-target shape and validation. Pure (no I/O), so it lives outside the
 * `"use server"` actions module — a server-actions file may only export async
 * functions, and this is a synchronous validator imported by both the action
 * and its unit test.
 */
export type PromoteTarget =
  | { mode: "existing"; campaignId: string }
  | { mode: "new"; name: string; persona: string; restorationFocus: string };

export function validatePromoteTarget(target: PromoteTarget): { ok: true } | { ok: false; message: string } {
  if (target.mode === "existing") {
    return target.campaignId ? { ok: true } : { ok: false, message: "Pick a campaign." };
  }
  if (!target.name.trim()) return { ok: false, message: "Name the campaign." };
  if (!(OFFICIAL_PERSONA_MAPPINGS as readonly string[]).includes(target.persona)) return { ok: false, message: "Choose a persona." };
  if (!(RESTORATION_FOCUS_VALUES as readonly string[]).includes(target.restorationFocus)) return { ok: false, message: "Choose a restoration focus." };
  return { ok: true };
}
