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
