import type { MarkMode } from "@/domain";

export type SlashCommand = {
  cmd: string;            // e.g. "/find-leads"
  label: string;          // menu title
  hint: string;           // menu subtitle
  prompt: string;         // inserted into the draft on select
  mode?: MarkMode;        // optional stance to preset
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
