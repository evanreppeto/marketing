import type { ArcMode, ArcStepKind } from "@/domain";

export type ArcRunIntent = "chat" | "research" | "analysis" | "create" | "action";

export type ArcRunPhase = {
  id: string;
  label: string;
  detail: string;
  kind: ArcStepKind;
};

export type ArcRunProfile = {
  intent: ArcRunIntent;
  activeLabel: string;
  approach: string;
  completedSummary: string;
  phases: ArcRunPhase[];
};

const CREATE_PATTERN = /\b(draft|write|rewrite|revise|create|make|build|compose|generate|design|edit|email|sms|post|landing page|image|video|ad copy)\b/i;
const ACTION_PATTERN = /\b(update|change|add|remove|archive|approve|schedule|publish|send|sync|assign|move|delete|apply|save)\b/i;
const RESEARCH_PATTERN = /\b(search|find|look up|lookup|research|browse|source|web|competitor|trend|latest|weather|discover|investigate)\b/i;
const ANALYSIS_PATTERN = /\b(analy[sz]e|analysis|compare|rank|score|segment|forecast|why|performance|metric|report|summari[sz]e|evaluate|audit|recommend|opportunit|prioriti[sz]e)\b/i;
const INFORMATIONAL_UPDATE_PATTERN = /\b(update me|give me an update|status update|what(?:'s| is) new)\b/i;

export function inferArcRunIntent(input: {
  request?: string | null;
  mode?: ArcMode;
  command?: string | null;
}): ArcRunIntent {
  const request = input.request?.trim() ?? "";
  const command = input.command?.toLowerCase() ?? "";

  if (command.startsWith("draft-")) return "create";
  if (command === "find-leads") return "research";
  if (command === "summarize") return "analysis";
  if (input.mode === "draft") return "create";
  if (INFORMATIONAL_UPDATE_PATTERN.test(request)) return "research";
  if (ACTION_PATTERN.test(request)) return "action";
  if (CREATE_PATTERN.test(request)) return "create";
  if (RESEARCH_PATTERN.test(request)) return "research";
  if (ANALYSIS_PATTERN.test(request)) return "analysis";
  if (input.mode === "act") return "action";
  return "chat";
}

function sourceText(sources: string[]) {
  return sources.length > 0 ? sources.join(", ") : "the current conversation";
}

export function buildArcRunProfile(input: {
  request?: string | null;
  mode?: ArcMode;
  command?: string | null;
  sources?: string[];
}): ArcRunProfile {
  const intent = inferArcRunIntent(input);
  const sources = sourceText(input.sources ?? []);

  if (intent === "research") {
    return {
      intent,
      activeLabel: "Researching",
      approach: `I’ll turn this into a focused search across ${sources}, compare the strongest evidence, and show what supports the answer.`,
      completedSummary: "I searched the selected sources, compared the evidence, and organized the strongest findings.",
      phases: [
        { id: "shape-search", label: "Shape the search", detail: "Defining the question, signals, and useful sources", kind: "think" },
        { id: "search-sources", label: "Search connected sources", detail: `Looking across ${sources}`, kind: "search" },
        { id: "compare-evidence", label: "Compare the evidence", detail: "Separating strong matches from weak or duplicate signals", kind: "match" },
        { id: "synthesize-findings", label: "Synthesize the findings", detail: "Preparing a concise, source-grounded answer", kind: "draft" },
      ],
    };
  }

  if (intent === "analysis") {
    return {
      intent,
      activeLabel: "Analyzing",
      approach: `I’ll frame the decision, pull the relevant evidence from ${sources}, test the strongest patterns, and make the conclusion easy to inspect.`,
      completedSummary: "I analyzed the relevant records, checked the strongest patterns, and prepared an inspectable recommendation.",
      phases: [
        { id: "frame-decision", label: "Frame the decision", detail: "Identifying the outcome, comparison, and success criteria", kind: "think" },
        { id: "pull-records", label: "Pull relevant records", detail: `Reading the useful evidence from ${sources}`, kind: "search" },
        { id: "analyze-patterns", label: "Analyze patterns and outliers", detail: "Comparing signals, exceptions, and confidence", kind: "match" },
        { id: "validate-conclusion", label: "Validate the conclusion", detail: "Checking the recommendation against the available evidence", kind: "think" },
        { id: "present-recommendation", label: "Present the recommendation", detail: "Organizing the result around the decision", kind: "draft" },
      ],
    };
  }

  if (intent === "create") {
    return {
      intent,
      activeLabel: "Creating",
      approach: `I’ll read the brief, use ${sources} for brand and audience grounding, create a first pass, then check it before placing it behind review.`,
      completedSummary: "I used the brief and selected context to create a review-ready first pass without sending anything externally.",
      phases: [
        { id: "read-brief", label: "Read the creative brief", detail: "Identifying the format, audience, tone, and goal", kind: "think" },
        { id: "gather-creative-context", label: "Gather brand and audience context", detail: `Pulling the useful constraints from ${sources}`, kind: "search" },
        { id: "create-first-pass", label: "Create the first pass", detail: "Building the requested content or asset", kind: "draft" },
        { id: "quality-check", label: "Check tone, accuracy, and safeguards", detail: "Reviewing the work against the brief and source material", kind: "match" },
        { id: "prepare-review", label: "Prepare for review", detail: "Keeping the result editable and outbound locked", kind: "draft" },
      ],
    };
  }

  if (intent === "action") {
    return {
      intent,
      activeLabel: "Working",
      approach: `I’ll inspect the current state in ${sources}, verify the target and permissions, apply only the requested workspace change, and record the result.`,
      completedSummary: "I checked the current workspace state, applied the requested internal change, and recorded the result without external sends.",
      phases: [
        { id: "confirm-target", label: "Confirm target and permissions", detail: "Checking scope, safeguards, and the requested outcome", kind: "think" },
        { id: "inspect-state", label: "Inspect the current workspace state", detail: `Reading the relevant records from ${sources}`, kind: "search" },
        { id: "apply-action", label: "Apply the workspace action", detail: "Running only the requested internal change", kind: "tool" },
        { id: "verify-action", label: "Verify the result", detail: "Confirming the change completed as expected", kind: "match" },
        { id: "record-receipt", label: "Record the receipt", detail: "Preserving the outcome and safeguards in this conversation", kind: "draft" },
      ],
    };
  }

  return {
    intent,
    activeLabel: "Answering",
    approach: `I’ll answer directly, using ${sources} only where it improves accuracy or context.`,
    completedSummary: "I used the conversation and relevant context to prepare a direct answer.",
    phases: [
      { id: "understand-question", label: "Understand the question", detail: "Reading the conversation and identifying the real ask", kind: "think" },
      { id: "recall-context", label: "Recall relevant context", detail: `Checking ${sources} for useful background`, kind: "search" },
      { id: "compose-answer", label: "Compose a direct answer", detail: "Keeping the response focused, clear, and useful", kind: "draft" },
    ],
  };
}
