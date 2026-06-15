"use server";

import { revalidatePath } from "next/cache";

import { type EdgeRelation } from "@/domain";
import { getOperatorActor, requireOperator } from "@/lib/auth/operator";
import { isSupabaseAdminConfigured } from "@/lib/supabase/server";
import { archiveNode, createEdge, createNode, decideNode, setNodeKind, setNodeTags, updateNode } from "@/lib/knowledge-graph/persistence";

export type ActionResult = { ok: true } | { ok: false; error: string };

const NOT_CONFIGURED = "Supabase is not configured.";

export async function approveNodeAction(nodeId: string): Promise<ActionResult> {
  await requireOperator();
  if (!isSupabaseAdminConfigured()) return { ok: false, error: NOT_CONFIGURED };
  const result = await decideNode(nodeId, "approve", { actor: getOperatorActor() });
  if (!result.ok) return result;
  revalidatePath("/brain");
  return { ok: true };
}

export async function rejectNodeAction(nodeId: string): Promise<ActionResult> {
  await requireOperator();
  if (!isSupabaseAdminConfigured()) return { ok: false, error: NOT_CONFIGURED };
  const result = await decideNode(nodeId, "reject", { actor: getOperatorActor() });
  if (!result.ok) return result;
  revalidatePath("/brain");
  return { ok: true };
}

export async function createNodeAction(input: {
  kind: string;
  label: string;
  body?: string;
  summary?: string;
  persona?: string;
  tags?: string[];
}): Promise<ActionResult> {
  await requireOperator();
  if (!isSupabaseAdminConfigured()) return { ok: false, error: NOT_CONFIGURED };
  const result = await createNode(
    {
      kind: input.kind,
      label: input.label,
      body: input.body ?? null,
      summary: input.summary ?? null,
      persona: input.persona ?? null,
      tags: input.tags ?? [],
    },
    { createdBy: "operator", actor: getOperatorActor() },
  );
  if (!result.ok) return result;
  revalidatePath("/brain");
  return { ok: true };
}

export async function updateNodeAction(
  nodeId: string,
  fields: { label?: string; body?: string | null },
): Promise<ActionResult> {
  await requireOperator();
  if (!isSupabaseAdminConfigured()) return { ok: false, error: NOT_CONFIGURED };
  const result = await updateNode(nodeId, fields, { actor: getOperatorActor() });
  if (!result.ok) return result;
  revalidatePath("/brain");
  return { ok: true };
}

export async function createEdgeAction(input: {
  fromNodeId: string;
  toNodeId: string;
  relation: EdgeRelation;
}): Promise<ActionResult> {
  await requireOperator();
  if (!isSupabaseAdminConfigured()) return { ok: false, error: NOT_CONFIGURED };
  const result = await createEdge(input, { createdBy: "operator", actor: getOperatorActor() });
  if (!result.ok) return result;
  revalidatePath("/brain");
  return { ok: true };
}

export async function setNodeKindAction(nodeId: string, kind: string): Promise<ActionResult> {
  await requireOperator();
  if (!isSupabaseAdminConfigured()) return { ok: false, error: NOT_CONFIGURED };
  const result = await setNodeKind(nodeId, kind, { actor: getOperatorActor() });
  if (!result.ok) return result;
  revalidatePath("/brain");
  return { ok: true };
}

export async function setNodeTagsAction(nodeId: string, tags: string[]): Promise<ActionResult> {
  await requireOperator();
  if (!isSupabaseAdminConfigured()) return { ok: false, error: NOT_CONFIGURED };
  const result = await setNodeTags(nodeId, tags, { actor: getOperatorActor() });
  if (!result.ok) return result;
  revalidatePath("/brain");
  return { ok: true };
}

export async function archiveNodeAction(nodeId: string): Promise<ActionResult> {
  await requireOperator();
  if (!isSupabaseAdminConfigured()) return { ok: false, error: NOT_CONFIGURED };
  const result = await archiveNode(nodeId, { actor: getOperatorActor() });
  if (!result.ok) return result;
  revalidatePath("/brain");
  return { ok: true };
}
