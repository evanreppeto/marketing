import type { ArcMode } from "@/domain";

export type SlashCommand = {
  cmd: string;            // e.g. "/find-leads"
  label: string;          // menu title
  hint: string;           // menu subtitle
  prompt: string;         // inserted into the draft on select
  mode?: ArcMode;        // optional stance to preset
};

export const SLASH_COMMANDS: SlashCommand[] = [
  { cmd: "/find-leads", label: "Find leads", hint: "Search & propose new leads", prompt: "Find new leads for @" },
  { cmd: "/draft-campaign", label: "Draft a campaign", hint: "Draft for a persona — for your approval", prompt: "Draft a campaign for @", mode: "draft" },
  { cmd: "/whats-pending", label: "What's pending", hint: "Everything awaiting approval", prompt: "What's awaiting my approval right now, and the risk on each?" },
  { cmd: "/summarize", label: "Summarize", hint: "Summarize a campaign or thread", prompt: "Summarize my latest campaign — status, pending approvals, and what's next." },
];

/** When `text` is a leading `/query` (no spaces yet), return matching commands;
 *  otherwise null (popover closed). Matches against cmd and label. */
export function matchSlash(text: string): SlashCommand[] | null {
  const m = /^\/([\w-]*)$/.exec(text);
  if (!m) return null;
  const q = m[1].toLowerCase();
  if (!q) return SLASH_COMMANDS;
  return SLASH_COMMANDS.filter((c) => c.cmd.slice(1).includes(q) || c.label.toLowerCase().includes(q));
}

/** Case-insensitive subsequence test: do all chars of `q` appear in `text` in order? */
function isSubsequence(q: string, text: string): boolean {
  let i = 0;
  for (let j = 0; j < text.length && i < q.length; j++) {
    if (text[j] === q[i]) i++;
  }
  return i === q.length;
}

/** Palette filter: fuzzy (subsequence) match over cmd + label + hint.
 *  Empty query returns every command. Used by the ⌘K command palette. */
export function filterCommands(query: string): SlashCommand[] {
  const q = query.trim().toLowerCase();
  if (!q) return SLASH_COMMANDS;
  return SLASH_COMMANDS.filter((c) => {
    const hay = `${c.cmd} ${c.label} ${c.hint}`.toLowerCase();
    return hay.includes(q) || isSubsequence(q, hay.replace(/[^a-z0-9]/g, ""));
  });
}
