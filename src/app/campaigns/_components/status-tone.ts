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
