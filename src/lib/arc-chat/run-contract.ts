import type { ArcMode, ArcRoute } from "@/domain";

export const ARC_CONTEXT_SCOPE_LABELS = {
  workspace: "Workspace knowledge",
  brand: "Brand profile",
  crm: "CRM records",
  campaigns: "Campaigns and assets",
} as const;

export type ArcContextScope = keyof typeof ARC_CONTEXT_SCOPE_LABELS;

export type ArcRunContract = {
  mode: ArcMode;
  modeLabel: "Read only" | "Draft only" | "Workspace action";
  modelLabel: "Arc Spark" | "Arc Forge";
  readScopes: string[];
  workspaceEffect: string;
  externalEffect: string;
  approval: string;
  receiptId: string | null;
  outputSummary: string;
};

function uniqueScopes(scopes: string[]): ArcContextScope[] {
  const valid = scopes.filter((scope): scope is ArcContextScope => scope in ARC_CONTEXT_SCOPE_LABELS);
  return [...new Set(valid)];
}

export function buildArcRunContract(input: {
  mode?: ArcMode;
  route?: ArcRoute;
  contextScopes?: string[];
  actionCount?: number;
  toolCount?: number;
  agentTaskId?: string | null;
}): ArcRunContract {
  const mode = input.mode ?? "act";
  const scopes = uniqueScopes(input.contextScopes ?? []);
  const actionCount = Math.max(0, input.actionCount ?? 0);
  const toolCount = Math.max(0, input.toolCount ?? 0);

  const modeLabel = mode === "ask" ? "Read only" : mode === "draft" ? "Draft only" : "Workspace action";
  const workspaceEffect = mode === "ask"
    ? "No workspace changes"
    : actionCount === 0
      ? "No workspace changes recorded"
      : mode === "draft"
        ? `Created ${actionCount} reviewable draft${actionCount === 1 ? "" : "s"}`
        : `Created ${actionCount} reviewable workspace output${actionCount === 1 ? "" : "s"}`;
  const approval = mode === "ask"
    ? "Not needed for read-only work"
    : "Required before any outbound action";

  const outputs: string[] = [];
  if (actionCount > 0) outputs.push(`${actionCount} reviewable output${actionCount === 1 ? "" : "s"}`);
  if (toolCount > 0) outputs.push(`${toolCount} tool call${toolCount === 1 ? "" : "s"}`);

  return {
    mode,
    modeLabel,
    modelLabel: input.route === "standard" ? "Arc Forge" : "Arc Spark",
    readScopes: scopes.map((scope) => ARC_CONTEXT_SCOPE_LABELS[scope]),
    workspaceEffect,
    externalEffect: "No external sends or spend",
    approval,
    receiptId: input.agentTaskId ? input.agentTaskId.slice(0, 8).toUpperCase() : null,
    outputSummary: outputs.length > 0 ? outputs.join(" · ") : "No structured outputs recorded",
  };
}
