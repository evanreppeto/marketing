export type DemoRunKind = "think" | "search" | "match" | "draft" | "media" | "tool";

export type DemoRunRow = {
  id: string;
  label: string;
  detail?: string;
  status: "queued";
  kind: DemoRunKind;
};

export type DemoLiveWork = {
  commentary: string;
  rows: DemoRunRow[];
};

const SUBJECT_STOP_WORDS = new Set([
  "a",
  "about",
  "an",
  "and",
  "arc",
  "ask",
  "can",
  "could",
  "create",
  "explain",
  "find",
  "for",
  "from",
  "i",
  "in",
  "it",
  "me",
  "of",
  "on",
  "our",
  "please",
  "the",
  "this",
  "to",
  "we",
  "why",
  "with",
  "write",
  "you",
]);

function requestSubject(request: string): string {
  const words = request
    .replace(/^\s*\/[\w-]+\s*/u, "")
    .replace(/[^\p{L}\p{N}'-]+/gu, " ")
    .trim()
    .split(/\s+/u)
    .filter((word) => word.length > 1 && !SUBJECT_STOP_WORDS.has(word.toLowerCase()))
    .slice(0, 6);

  return words.length > 0 ? words.join(" ") : "your request";
}

function sourcePlan(normalized: string): Array<{ id: string; label: string; detail: string; kind: DemoRunKind }> {
  const sources: Array<{ id: string; label: string; detail: string; kind: DemoRunKind }> = [];

  if (/(crm|lead|customer|homeowner|property|company|contact|audience)/u.test(normalized)) {
    sources.push({ id: "crm", label: "Checking the relevant CRM records", detail: "Matches stay tied to workspace data", kind: "match" });
  }
  if (/(campaign|email|sms|landing|social|ad|copy|brand|voice)/u.test(normalized)) {
    sources.push({ id: "brand", label: "Reading campaign and brand guidance", detail: "Claims, voice, and approval rules", kind: "tool" });
  }
  if (/(research|search|find|online|web|source|competitor|market|weather)/u.test(normalized)) {
    sources.push({ id: "research", label: "Searching connected research sources", detail: "Confirmed findings stay separate from inference", kind: "search" });
  }
  if (/(history|remember|previous|conversation|context)/u.test(normalized)) {
    sources.push({ id: "memory", label: "Recalling relevant conversation history", detail: "Using saved workspace memory", kind: "think" });
  }

  if (sources.length === 0) {
    sources.push({ id: "workspace", label: "Reading the relevant workspace context", detail: "Conversation, campaigns, and approved knowledge", kind: "think" });
  }

  return sources.slice(0, 2);
}

function requestedChannel(normalized: string): string {
  if (/\bsms\b|text message/u.test(normalized)) return "SMS draft";
  if (/\bemail\b/u.test(normalized)) return "email draft";
  if (/landing page/u.test(normalized)) return "landing-page draft";
  if (/social|post/u.test(normalized)) return "social draft";
  if (/\bad\b|advert/u.test(normalized)) return "ad draft";
  if (/campaign/u.test(normalized)) return "campaign package";
  return "draft";
}

/**
 * Build a deterministic preview trace from the operator's actual request.
 * This is used only by the no-backend demo, but it deliberately mirrors the
 * live runner's cumulative stream: interpret, ground, then execute.
 */
export function buildDemoLiveWork(request?: string | null): DemoLiveWork {
  const original = request?.trim() ?? "";
  const normalized = original.toLowerCase();
  const subject = requestSubject(original);
  const sources = sourcePlan(normalized);
  const rows: DemoRunRow[] = [
    {
      id: "interpret",
      label: `Interpreting “${subject}”`,
      detail: "Turning the request into a focused work plan",
      status: "queued",
      kind: "think",
    },
    ...sources.map((source) => ({ ...source, status: "queued" as const })),
  ];

  if (/(email|sms|campaign|draft|write|create|landing|social|\bad\b)/u.test(normalized)) {
    const channel = requestedChannel(normalized);
    rows.push({
      id: "produce",
      label: `Preparing the ${channel} for ${subject}`,
      detail: "Review-ready and held behind approval",
      status: "queued",
      kind: "draft",
    });
    return {
      commentary: `I’m preparing a ${channel} for ${subject}. I’ll ground it in the relevant workspace evidence, follow the approved voice and claims, and leave the result ready for review.`,
      rows,
    };
  }

  if (/(search|find|look up|research|which|who|audience|lead|compare)/u.test(normalized)) {
    rows.push({
      id: "synthesize",
      label: `Ranking findings for ${subject}`,
      detail: "Confidence and source quality included",
      status: "queued",
      kind: "match",
    });
    return {
      commentary: `I’m researching ${subject} across the sources that fit this request. I’ll keep confirmed findings distinct from inference and show what supports the result.`,
      rows,
    };
  }

  rows.push({
    id: "answer",
    label: `Preparing a grounded answer about ${subject}`,
    detail: "Concise, source-aware, and specific to this conversation",
    status: "queued",
    kind: "draft",
  });
  return {
    commentary: `I’m working through ${subject} using the active conversation and the most relevant workspace context. I’ll keep the reasoning focused on this request and make any assumptions visible.`,
    rows,
  };
}
