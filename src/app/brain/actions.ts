"use server";

import { revalidatePath } from "next/cache";

import { type EdgeRelation } from "@/domain";
import { getOperatorActor, requireOperator } from "@/lib/auth/operator";
import { resyncCampaignsIntoBrain, resyncCrmIntoBrain, resyncMediaIntoBrain, resyncPerformanceIntoBrain } from "@/lib/brain-ingestion/sync";
import { isSupabaseAdminConfigured } from "@/lib/supabase/server";
import { archiveNode, createEdge, createNode, decideNode, setNodeKind, setNodeTags, updateNode } from "@/lib/knowledge-graph/persistence";

export type ActionResult = { ok: true } | { ok: false; error: string };

const NOT_CONFIGURED = "Supabase is not configured.";

function revalidateBrainSurfaces() {
  revalidatePath("/brain");
  revalidatePath("/library/brand");
}

export async function approveNodeAction(nodeId: string): Promise<ActionResult> {
  await requireOperator();
  if (!isSupabaseAdminConfigured()) return { ok: false, error: NOT_CONFIGURED };
  const result = await decideNode(nodeId, "approve", { actor: await getOperatorActor() });
  if (!result.ok) return result;
  revalidateBrainSurfaces();
  return { ok: true };
}

export async function rejectNodeAction(nodeId: string): Promise<ActionResult> {
  await requireOperator();
  if (!isSupabaseAdminConfigured()) return { ok: false, error: NOT_CONFIGURED };
  const result = await decideNode(nodeId, "reject", { actor: await getOperatorActor() });
  if (!result.ok) return result;
  revalidateBrainSurfaces();
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
    { createdBy: "operator", actor: await getOperatorActor() },
  );
  if (!result.ok) return result;
  revalidateBrainSurfaces();
  return { ok: true };
}

export async function updateNodeAction(
  nodeId: string,
  fields: { label?: string; body?: string | null },
): Promise<ActionResult> {
  await requireOperator();
  if (!isSupabaseAdminConfigured()) return { ok: false, error: NOT_CONFIGURED };
  const result = await updateNode(nodeId, fields, { actor: await getOperatorActor() });
  if (!result.ok) return result;
  revalidateBrainSurfaces();
  return { ok: true };
}

export async function createEdgeAction(input: {
  fromNodeId: string;
  toNodeId: string;
  relation: EdgeRelation;
}): Promise<ActionResult> {
  await requireOperator();
  if (!isSupabaseAdminConfigured()) return { ok: false, error: NOT_CONFIGURED };
  const result = await createEdge(input, { createdBy: "operator", actor: await getOperatorActor() });
  if (!result.ok) return result;
  revalidateBrainSurfaces();
  return { ok: true };
}

export async function setNodeKindAction(nodeId: string, kind: string): Promise<ActionResult> {
  await requireOperator();
  if (!isSupabaseAdminConfigured()) return { ok: false, error: NOT_CONFIGURED };
  const result = await setNodeKind(nodeId, kind, { actor: await getOperatorActor() });
  if (!result.ok) return result;
  revalidateBrainSurfaces();
  return { ok: true };
}

export async function setNodeTagsAction(nodeId: string, tags: string[]): Promise<ActionResult> {
  await requireOperator();
  if (!isSupabaseAdminConfigured()) return { ok: false, error: NOT_CONFIGURED };
  const result = await setNodeTags(nodeId, tags, { actor: await getOperatorActor() });
  if (!result.ok) return result;
  revalidateBrainSurfaces();
  return { ok: true };
}

export async function archiveNodeAction(nodeId: string): Promise<ActionResult> {
  await requireOperator();
  if (!isSupabaseAdminConfigured()) return { ok: false, error: NOT_CONFIGURED };
  const result = await archiveNode(nodeId, { actor: await getOperatorActor() });
  if (!result.ok) return result;
  revalidateBrainSurfaces();
  return { ok: true };
}

/** Operator-triggered backfill: mirror CRM, campaigns, media, and performance into the Brain. */
export async function resyncCrmIntoBrainAction(): Promise<{ ok: boolean; message: string }> {
  await requireOperator();
  // CRM and campaigns first so persona/CRM/campaign nodes exist before performance
  // links `learned_from` edges to them.
  const crm = await resyncCrmIntoBrain();
  const campaigns = await resyncCampaignsIntoBrain();
  const media = await resyncMediaIntoBrain();
  const performance = await resyncPerformanceIntoBrain();
  revalidateBrainSurfaces();

  const sources = [crm, campaigns, media, performance];
  const synced = sources.reduce((n, s) => n + s.synced, 0);
  const linked = sources.reduce((n, s) => n + s.linked, 0);
  const errors = sources.reduce((n, s) => n + s.errors, 0);
  const truncated = sources.some((s) => s.truncated);

  if (!synced && !errors) {
    return { ok: false, message: "Nothing to sync — Supabase isn't configured or there are no records yet." };
  }
  const parts = [`Synced ${synced} record${synced === 1 ? "" : "s"} into the Brain`];
  if (linked) parts.push(`linked ${linked} relationship${linked === 1 ? "" : "s"}`);
  if (errors) parts.push(`${errors} skipped`);
  if (truncated) parts.push("some tables hit the row limit — run again to finish");
  return { ok: sources.every((s) => s.ok), message: `${parts.join("; ")}.` };
}
