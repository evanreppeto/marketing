import type { ArcMessageStatus } from "./persistence";

export type ArcRunViewState = "idle" | "working" | "complete" | "failed" | "canceled";

export type ArcRunViewRow = {
  status: "queued" | "running" | "done" | "error";
};

export function resolveArcRunViewState(input: {
  pending: boolean;
  messageStatus?: ArcMessageStatus;
  outcome?: "complete" | "failed" | "canceled";
  rows?: ArcRunViewRow[];
  hasContent?: boolean;
}): {
  state: ArcRunViewState;
  label: string;
  heading: string;
  progressLabel: string | null;
  hasWarnings: boolean;
} {
  const rows = input.rows ?? [];
  const completed = rows.filter((row) => row.status === "done").length;
  const failed = rows.filter((row) => row.status === "error").length;
  const progressLabel = rows.length > 0 ? `${completed}/${rows.length} activities` : null;

  if (input.outcome === "canceled") {
    return { state: "canceled", label: "Run canceled", heading: "Work stopped safely", progressLabel, hasWarnings: false };
  }

  // Persisted message outcomes are authoritative. A stale activity row can be
  // left "running" when the task finishes, but it must not reopen a completed
  // run or hide a terminal failure.
  if (input.outcome === "failed" || input.messageStatus === "failed") {
    return { state: "failed", label: "Needs attention", heading: "A step needs attention", progressLabel, hasWarnings: true };
  }

  if (input.outcome === "complete" || input.messageStatus === "complete") {
    return failed > 0
      ? { state: "complete", label: "Completed with limitations", heading: "Completed with some limitations", progressLabel, hasWarnings: true }
      : { state: "complete", label: "Run complete", heading: "How Arc approached this", progressLabel, hasWarnings: false };
  }

  if (input.pending || input.messageStatus === "pending") {
    return { state: "working", label: "Arc is working", heading: "Working through the request", progressLabel, hasWarnings: false };
  }

  if (failed > 0) {
    return { state: "failed", label: "Needs attention", heading: "A step needs attention", progressLabel, hasWarnings: true };
  }

  if (rows.some((row) => row.status === "running" || row.status === "queued")) {
    return { state: "working", label: "Arc is working", heading: "Working through the request", progressLabel, hasWarnings: false };
  }

  if (input.hasContent || rows.length > 0) {
    return { state: "complete", label: "Run complete", heading: "How Arc approached this", progressLabel, hasWarnings: false };
  }

  return { state: "idle", label: "Ready", heading: "Ready for the next request", progressLabel: null, hasWarnings: false };
}
