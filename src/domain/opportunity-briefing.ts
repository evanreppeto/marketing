/**
 * Pure builder for the "message" handed to Arc when drafting from an opportunity.
 * There is no chat history on an opportunity-draft turn — this briefing IS the
 * prompt. No I/O.
 */
export type OpportunityBriefingInput = {
  title: string;
  summary: string;
  urgency: "low" | "medium" | "high";
  confidence: number;
  recommendedAction: string;
  persona: string;
  leadHref: string;
};

export function buildOpportunityBriefing(input: OpportunityBriefingInput): string {
  return [
    `Proactive opportunity to act on (you found this — now draft an approval-gated campaign package for it).`,
    `Opportunity: ${input.title}`,
    `Context: ${input.summary}`,
    `Urgency: ${input.urgency} · confidence ${input.confidence}%`,
    `Target persona: ${input.persona}`,
    `Source record: ${input.leadHref}`,
    `Recommended action: ${input.recommendedAction}`,
    ``,
    `Draft a re-engagement package now: create one or more approval-gated draft assets (e.g. an email and an SMS) tailored to this persona with a clear angle, hook, proof, and CTA. Cite the source record. Nothing goes outbound — everything awaits the operator's approval.`,
  ].join("\n");
}
