"use server";

import { revalidatePath } from "next/cache";

import { RevisionInstructionError, validateRevisionInstruction } from "@/domain";
import { requireOperator } from "@/lib/auth/operator";
import { requestAssetRevision } from "@/lib/campaigns/revisions";
import { getSupabaseAdminClient, isSupabaseAdminConfigured } from "@/lib/supabase/server";

export type RevisionActionState = { ok: boolean; message: string } | null;

/**
 * Operator asks Mark to revise a specific campaign asset. Gated by the operator
 * check + Supabase config, validated through the domain, then persisted as a
 * real revision request (outbound stays locked). Shaped for `useActionState`.
 */
export async function requestRevisionAction(
  _previous: RevisionActionState,
  formData: FormData,
): Promise<RevisionActionState> {
  await requireOperator();

  if (!isSupabaseAdminConfigured()) {
    return { ok: false, message: "Supabase isn't configured yet, so Mark can't record the revision." };
  }

  const campaignId = String(formData.get("campaignId") ?? "").trim();
  const assetId = String(formData.get("assetId") ?? "").trim();

  if (!campaignId || !assetId) {
    return { ok: false, message: "Choose an asset for Mark to revise." };
  }

  let instruction: string;
  try {
    instruction = validateRevisionInstruction(formData.get("instruction"));
  } catch (error) {
    if (error instanceof RevisionInstructionError) {
      return { ok: false, message: error.message };
    }
    throw error;
  }

  try {
    await requestAssetRevision({ campaignId, assetId, instruction, operator: "Operator" }, getSupabaseAdminClient());
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "Mark couldn't record the revision." };
  }

  revalidatePath(`/campaigns/${campaignId}`);
  revalidatePath("/campaigns");

  return {
    ok: true,
    message: "Sent to Mark. The asset is now 'revision requested' — outbound stays locked.",
  };
}
