import type { ArcBusinessContext } from "./business-context";
import { ARC_PERSONAS } from "./personas";
import type { ArcHistoryTurn, MarkMention } from "./types";

/** Route → model. Fast chat rides Haiku; heavier "standard" work rides Opus. */
export function modelForRoute(route: "fast" | "standard"): string {
  return route === "standard" ? "claude-opus-4-8" : "claude-haiku-4-5";
}

/** Render bounded thread history as a prompt preamble. Empty string when none. */
export function formatHistory(turns: ArcHistoryTurn[] | undefined): string {
  if (!turns || turns.length === 0) return "";
  const lines = turns.map((t) => `${t.role === "arc" ? "Arc" : "Operator"}: ${t.body}`);
  return ["Conversation so far (most recent last):", ...lines].join("\n");
}

export type ArcTurnScope = {
  conversationId: string;
  projectId: string | null;
  campaignId: string | null;
  operator: string;
};

export type ArcTurnContext = {
  business: ArcBusinessContext;
  mode: "ask" | "act" | "draft";
  scope: ArcTurnScope;
  mentions: MarkMention[];
  assistantTone?: string;
  assistantResponseStyle?: string;
  approvalStrictness?: string;
};

function businessBlock(b: ArcBusinessContext): string {
  return [
    `BUSINESS YOU ACT FOR: ${b.businessName}`,
    `Industry: ${b.industry}`,
    `Brand voice: ${b.brandVoice}`,
    `Creative policy: ${b.creativePolicy}`,
    `Compliance: ${b.compliance}`,
  ].join("\n");
}

function personasBlock(): string {
  const lines = ARC_PERSONAS.map((p) => `- ${p.key} — ${p.label}`);
  return ["PERSONA TAXONOMY (use these exact keys when mapping or filtering by persona):", ...lines].join("\n");
}

function modeBlock(mode: "ask" | "act" | "draft"): string {
  if (mode === "ask") {
    return "MODE: ask — read-only. Answer and analyze using read tools only. Do not create, modify, or draft anything.";
  }
  if (mode === "act") {
    return [
      "MODE: act — you may read, log CRM interactions (notes / follow-up tasks / timeline activity) on existing records, and record internal brain observations.",
      "You may NOT create or edit core CRM records, and you may NOT create campaign or asset drafts in this mode.",
    ].join("\n");
  }
  return [
    "MODE: draft — everything in act, plus you may create approval-gated draft campaigns and assets.",
    "Every draft awaits human approval before it can be used. Nothing you do goes outbound.",
  ].join("\n");
}

function styleBlock(ctx: ArcTurnContext): string | null {
  const bits: string[] = [];
  if (ctx.assistantTone) bits.push(`tone: ${ctx.assistantTone}`);
  if (ctx.assistantResponseStyle) bits.push(`response style: ${ctx.assistantResponseStyle}`);
  if (ctx.approvalStrictness) bits.push(`approval strictness: ${ctx.approvalStrictness}`);
  return bits.length ? `OPERATOR PREFERENCES — ${bits.join("; ")}.` : null;
}

function scopeBlock(scope: ArcTurnScope): string {
  const lines = [`You are working in conversation ${scope.conversationId} for operator ${scope.operator}.`];
  if (scope.projectId) {
    lines.push(`This chat belongs to project ${scope.projectId} — its shared assets are relevant context.`);
  }
  if (scope.campaignId) {
    lines.push(`This chat is linked to campaign ${scope.campaignId} — ground your work in that campaign.`);
  }
  return lines.join("\n");
}

function mentionsBlock(mentions: MarkMention[]): string | null {
  if (mentions.length === 0) return null;
  const lines = mentions.map((m) => `- ${m.label} (${m.type}) → ${m.href}`);
  return ["The operator referenced these records — treat them as the focus:", ...lines].join("\n");
}

/** Compose the full system prompt from the base prompt + per-turn context. */
export function buildSystemPrompt(base: string, ctx: ArcTurnContext): string {
  const parts: (string | null)[] = [
    base,
    businessBlock(ctx.business),
    personasBlock(),
    modeBlock(ctx.mode),
    styleBlock(ctx),
    scopeBlock(ctx.scope),
    mentionsBlock(ctx.mentions),
  ];
  return parts.filter((p): p is string => Boolean(p)).join("\n\n");
}
