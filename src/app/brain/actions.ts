"use server";

import { revalidatePath } from "next/cache";

import { type NodeKind, type EdgeRelation } from "@/domain";
import { getOperatorActor, requireOperator } from "@/lib/auth/operator";
import { isSupabaseAdminConfigured } from "@/lib/supabase/server";
import { archiveNode, createEdge, createNode, decideNode } from "@/lib/knowledge-graph/persistence";

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
  kind: NodeKind;
  label: string;
  body?: string;
  persona?: string;
}): Promise<ActionResult> {
  await requireOperator();
  if (!isSupabaseAdminConfigured()) return { ok: false, error: NOT_CONFIGURED };
  const result = await createNode(
    { kind: input.kind, label: input.label, body: input.body ?? null, persona: input.persona ?? null },
    { createdBy: "operator", actor: getOperatorActor() },
  );
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

export async function archiveNodeAction(nodeId: string): Promise<ActionResult> {
  await requireOperator();
  if (!isSupabaseAdminConfigured()) return { ok: false, error: NOT_CONFIGURED };
  const result = await archiveNode(nodeId, { actor: getOperatorActor() });
  if (!result.ok) return result;
  revalidatePath("/brain");
  return { ok: true };
}
