import type { ArcMode } from "@/domain";
import { type ArcSkillId, skillIdForArcCommand } from "@/lib/arc-skills/catalog";

export type SlashCommand = {
  cmd: string;            // e.g. "/find-leads"
  label: string;          // menu title
  hint: string;           // menu subtitle
  prompt: string;         // inserted into the draft on select
  mode?: ArcMode;        // optional stance to preset
  skillId?: ArcSkillId;  // optional runner skill that scopes tool access
};

const COMMANDS: Omit<SlashCommand, "skillId">[] = [
  // Discover
  { cmd: "/find-leads", label: "Find leads", hint: "Search & propose new leads", prompt: "Find new leads for @" },
  { cmd: "/opportunities", label: "Opportunity inbox", hint: "Source-backed opportunities to act on", prompt: "Show me the latest source-backed opportunities — evidence, confidence, and the recommended action for each." },
  // Understand
  { cmd: "/score", label: "Score a record", hint: "Lead score, opportunity & next action", prompt: "Score @ — lead score, revenue opportunity, relationship stage, and the next best action." },
  { cmd: "/persona", label: "Map persona", hint: "Primary / secondary persona + angle", prompt: "Map @ to its primary and secondary personas, with confidence and the recommended message angle." },
  // Draft (approval-gated)
  { cmd: "/draft-campaign", label: "Draft a campaign", hint: "Draft for a persona — for your approval", prompt: "Draft a campaign for @", mode: "draft" },
  { cmd: "/draft-email", label: "Draft an email", hint: "Persona-matched outreach — for approval", prompt: "Draft an outreach email for @ — persona-matched angle and proof points, for my approval.", mode: "draft" },
  { cmd: "/follow-up", label: "Follow up", hint: "Re-engage quiet leads — for approval", prompt: "Who has gone quiet and is worth a follow-up? Draft the follow-up for my approval.", mode: "draft" },
  // Assets & review
  { cmd: "/assets", label: "Find assets", hint: "Approved BSR media & recent assets", prompt: "Show approved BSR media and recent assets relevant to @ — source, format, and status." },
  // Learn
  { cmd: "/performance", label: "Performance", hint: "What's working, by channel & persona", prompt: "How are my campaigns performing by channel, persona, and asset — and what should I iterate next?" },
  { cmd: "/signals", label: "Signals", hint: "Weather & competitor signals to watch", prompt: "What weather and competitor signals should we be watching right now, and how should we respond?" },
  // Triage
  { cmd: "/whats-pending", label: "What's pending", hint: "Everything awaiting approval", prompt: "What's awaiting my approval right now, and the risk on each?" },
  { cmd: "/summarize", label: "Summarize", hint: "Summarize a campaign or thread", prompt: "Summarize my latest campaign — status, pending approvals, and what's next." },
];

export const SLASH_COMMANDS: SlashCommand[] = COMMANDS.map((command) => ({
  ...command,
  ...(skillIdForArcCommand(command.cmd) ? { skillId: skillIdForArcCommand(command.cmd)! } : {}),
}));

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
