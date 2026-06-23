/**
 * Collapses a flat list of Arc thinking steps into runs, so the chat UI can show
 * a calm "Creating leads · 46" instead of 46 near-identical breadcrumb chips
 * (the ChatGPT/Claude register). Pure + deterministic. Consecutive steps that
 * share a work-kind and leading verb fold into one counted group; the original
 * steps ride along for the expandable spine.
 */
import { stepGlyphKind, type ArcStepKind } from "./arc-step-kind";

type StepInput = { label: string; status: "running" | "done"; kind?: ArcStepKind };

export type ArcStepGroup<T extends StepInput = StepInput> = {
  kind: ArcStepKind;
  /** Leading verb of the run, original case (e.g. "Creating"). */
  verb: string;
  /** Human group title: the labels' common prefix (connector-trimmed) when the
   *  run collapses, otherwise the single step's full label. */
  title: string;
  count: number;
  /** The most recent step's full label — for a subtle "now: …" line. */
  latestLabel: string;
  status: "running" | "done";
  steps: T[];
};

export type StepSummary<T extends StepInput = StepInput> = {
  groups: ArcStepGroup<T>[];
  totalSteps: number;
  doneCount: number;
};

// Trailing words trimmed off a collapsed group's common-prefix title so it reads
// as a phrase ("Creating lead") rather than a dangling connector ("Creating lead for").
const TRAILING_CONNECTORS = new Set(["for", "the", "a", "an", "to", "of", "with", "in", "on", "—", "-", ":"]);

function firstWord(label: string): string {
  return label.trim().split(/\s+/)[0] ?? "";
}

/** Longest leading run of words shared by every label (case-insensitive compare,
 *  casing taken from the first label). */
function commonPrefixWords(labels: string[]): string[] {
  if (labels.length === 0) return [];
  const wordLists = labels.map((l) => l.trim().split(/\s+/));
  const first = wordLists[0];
  const result: string[] = [];
  for (let i = 0; i < first.length; i++) {
    const word = first[i];
    if (wordLists.every((words) => words[i]?.toLowerCase() === word.toLowerCase())) {
      result.push(word);
    } else {
      break;
    }
  }
  return result;
}

function groupTitle<T extends StepInput>(steps: T[], verb: string): string {
  if (steps.length === 1) return steps[0].label.trim();
  const prefix = commonPrefixWords(steps.map((s) => s.label));
  while (prefix.length > 0 && TRAILING_CONNECTORS.has(prefix[prefix.length - 1].toLowerCase())) {
    prefix.pop();
  }
  return prefix.length > 0 ? prefix.join(" ") : verb;
}

export function summarizeSteps<T extends StepInput>(steps: T[]): StepSummary<T> {
  const groups: ArcStepGroup<T>[] = [];
  let doneCount = 0;

  for (const step of steps) {
    if (step.status === "done") doneCount++;
    const kind = stepGlyphKind(step);
    const verb = firstWord(step.label);
    const key = `${kind}|${verb.toLowerCase()}`;
    const last = groups[groups.length - 1];
    if (last && `${last.kind}|${last.verb.toLowerCase()}` === key) {
      last.steps.push(step);
    } else {
      groups.push({ kind, verb, title: "", count: 0, latestLabel: "", status: "done", steps: [step] });
    }
  }

  for (const group of groups) {
    group.count = group.steps.length;
    group.latestLabel = group.steps[group.steps.length - 1].label;
    group.status = group.steps.some((s) => s.status === "running") ? "running" : "done";
    group.title = groupTitle(group.steps, group.verb);
  }

  return { groups, totalSteps: steps.length, doneCount };
}
