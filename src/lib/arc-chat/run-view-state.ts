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
} {
  const rows = input.rows ?? [];
  const completed = rows.filter((row) => row.status === "done").length;
  const failed = rows.filter((row) => row.status === "error").length;
  const progressLabel = rows.length > 0 ? `${completed}/${rows.length} activities` : null;

  if (input.outcome === "canceled") {
    return { state: "canceled", label: "Run canceled", heading: "Work stopped safely", progressLabel };
  }

  if (input.outcome === "failed" || input.messageStatus === "failed" || failed > 0) {
    return { state: "failed", label: "Needs attention", heading: "A step needs attention", progressLabel };
  }

  if (input.pending || input.messageStatus === "pending" || rows.some((row) => row.status === "running" || row.status === "queued")) {
    return { state: "working", label: "Arc is working", heading: "Working through the request", progressLabel };
  }

  if (input.outcome === "complete" || input.messageStatus === "complete" || input.hasContent || rows.length > 0) {
    return { state: "complete", label: "Run complete", heading: "How Arc approached this", progressLabel };
  }

  return { state: "idle", label: "Ready", heading: "Ready for the next request", progressLabel: null };
}
