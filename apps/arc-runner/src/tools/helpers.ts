import type { ArcActionCard, ArcMention, ArcQuestion, DraftForReview } from "../types";

/** Step reporter signature shared by every tool (running -> done live trace). */
export type StepFn = (label: string, status: "running" | "done") => Promise<void>;

/** Per-turn collectors for everything Arc attaches to its reply beyond text. */
export type TurnSink = {
  card: (card: ArcActionCard) => void;
  suggestion: (text: string) => void;
  source: (mention: ArcMention) => void;
  question: (question: ArcQuestion) => void;
  /** Every approval-gated draft the turn created, with its full copy — the
   *  critic's work list. Collected here rather than re-fetched because the
   *  drafting tool already holds the body it just persisted. */
  draft: (draft: DraftForReview) => void;
};

/** SDK tool result shape. */
export type ToolResult = { content: Array<{ type: "text"; text: string }> };

const MAX_TOOL_TEXT = 8000;

/** Wrap a string as an SDK text result, bounded so a huge payload can't blow context. */
export function textResult(text: string): ToolResult {
  return { content: [{ type: "text", text: text.slice(0, MAX_TOOL_TEXT) }] };
}

/**
 * Run a tool's work with the live-trace bookend and uniform error handling:
 * emit `running`, run `fn`, emit `done` (even on error), and return the result
 * as JSON text (or a `<label> failed: <reason>` message). Never throws — the
 * SDK should receive a tool result, not an exception.
 */
export async function runTool(step: StepFn, label: string, fn: () => Promise<unknown>): Promise<ToolResult> {
  await step(label, "running");
  try {
    const data = await fn();
    await step(label, "done");
    return textResult(JSON.stringify(data));
  } catch (error) {
    await step(label, "done");
    const reason = error instanceof Error ? error.message : "unknown error";
    return textResult(`${label} failed: ${reason}`);
  }
}
