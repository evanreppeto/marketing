export type PillTone = "amber" | "green" | "red" | "blue" | "gray" | "dark";

/** Map a humanized status label to a StatusPill tone. */
export function statusTone(status: string): PillTone {
  const s = status.toLowerCase();
  if (s.includes("approved")) return "green";
  if (s.includes("blocked") || s.includes("declined") || s.includes("rejected")) return "red";
  if (s.includes("revision") || s.includes("compliance") || s.includes("pending") || s.includes("needs")) return "amber";
  if (s.includes("draft")) return "gray";
  return "blue";
}

/** Map a roll-up state to a StatusPill tone. */
export function rollupTone(state: string): PillTone {
  if (state === "needs_review") return "amber";
  if (state === "changes_requested") return "red";
  if (state === "ready") return "green";
  if (state === "in_progress") return "blue";
  return "gray"; // drafting, empty
}

/** Map a humanized risk level ("Low" / "Medium" / "High") to a pill tone. */
export function riskTone(risk: string): PillTone {
  const r = risk.toLowerCase();
  if (r.includes("high") || r.includes("critical")) return "red";
  if (r.includes("medium") || r.includes("moderate")) return "amber";
  if (r.includes("low")) return "green";
  return "gray";
}

/** Shared regex for "this approval has been decided" across components. */
export function isDecidedStatus(status: string): boolean {
  return /approved|declined|archived|rejected/i.test(status);
}

/** Decision-aware display status for a deliverable: the gating approval's
 *  status when one exists, otherwise "Draft" (no approval item = no pending
 *  decision), consistent with the campaign roll-up's decision-centric model. */
export function assetDecisionStatus(asset: { approval: { id: string; status: string } | null }): {
  label: string;
  tone: PillTone;
} {
  if (asset.approval) {
    return { label: asset.approval.status, tone: statusTone(asset.approval.status) };
  }
  return { label: "Draft", tone: "gray" };
}
