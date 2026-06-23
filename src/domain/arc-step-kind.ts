/**
 * Work-type of a single Arc thinking step, used to pick a glyph in the chat UI.
 * Optional on the wire (`ArcStep.kind`); when absent we infer it from the label
 * so the glyph works before the runner ever populates it.
 */
export type ArcStepKind = "search" | "match" | "draft" | "media" | "think" | "tool";

// Order matters: the first pattern that matches wins. `media` precedes `search`
// so "Reviewing media" reads as media not "review" → search; `tool` precedes
// `search` so "Calling crm.query tool" reads as a tool call not the "query" hit.
const STEP_KIND_PATTERNS: ReadonlyArray<[ArcStepKind, RegExp]> = [
  ["media", /\b(image|images|video|render|rendering|media|photo|visual|asset|thumbnail|upscal)/i],
  ["tool", /\b(tool|call|calling|api|execute|executing|invoke|invoking)/i],
  ["search", /\b(search|pull|pulled|query|queried|review|reviewing|scan|scanned|find|found|fetch|gather|look)/i],
  ["match", /\b(match|matched|persona|score|scored|segment|rank|classif|map)/i],
  ["draft", /\b(draft|drafting|write|wrote|writing|outreach|compose|composing|angle|copy|email|sms|headline)/i],
];

export function stepGlyphKind(step: { label: string; kind?: ArcStepKind }): ArcStepKind {
  if (step.kind) return step.kind;
  const label = step.label ?? "";
  for (const [kind, re] of STEP_KIND_PATTERNS) {
    if (re.test(label)) return kind;
  }
  return "think";
}
