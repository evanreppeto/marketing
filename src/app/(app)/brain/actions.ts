"use server";

import { revalidatePath } from "next/cache";

import { requireOperator } from "@/lib/auth/operator";
import { getCurrentOrgId } from "@/lib/auth/org";
import {
  backfillMissingEmbeddings,
  resyncCampaignsIntoBrain,
  resyncCrmIntoBrain,
  resyncMediaIntoBrain,
} from "@/lib/brain-ingestion/sync";
import { embedText } from "@/lib/embeddings/gemini-embeddings";
import { isSupabaseAdminConfigured } from "@/lib/supabase/server";

export type RebuildBrainResult = { ok: boolean; synced: number; embedded: number; message: string };

/**
 * Operator-triggered Brain refresh: re-ingest CRM/campaigns/media into the graph,
 * then backfill semantic embeddings for any node missing one. The backfill is the
 * key part after setting GEMINI_API_KEY — it flips recall from keyword to semantic.
 * The result message tells the operator when embeddings were skipped (no key), so
 * the "why is recall keyword-only" state is self-explaining in the UI.
 */
export async function rebuildBrainMemoryAction(): Promise<RebuildBrainResult> {
  await requireOperator();
  if (!isSupabaseAdminConfigured()) {
    return { ok: false, synced: 0, embedded: 0, message: "Brain refresh needs a connected backend." };
  }
  try {
    const orgId = await getCurrentOrgId();
    const [crm, camp, media] = [
      await resyncCrmIntoBrain({ orgId }),
      await resyncCampaignsIntoBrain({ orgId }),
      await resyncMediaIntoBrain({ orgId }),
    ];
    const synced = crm.synced + camp.synced + media.synced;

    // Self-diagnosing: is the embeddings key reaching THIS runtime, and does it work?
    // This is what makes recall semantic vs keyword-only — surface the exact state.
    const keyPresent = Boolean((process.env.GEMINI_API_KEY ?? "").trim());
    if (!keyPresent) {
      revalidatePath("/brain");
      return {
        ok: true,
        synced,
        embedded: 0,
        message: `Refreshed ${synced} records. Semantic recall is OFF — GEMINI_API_KEY is not set in this (production) runtime.`,
      };
    }
    const probe = await embedText("brain embedding connectivity probe");
    if (!probe) {
      revalidatePath("/brain");
      return {
        ok: true,
        synced,
        embedded: 0,
        message: `Refreshed ${synced} records. GEMINI_API_KEY is set but the embedding call failed — check the key's Gemini API access, billing, and text-embedding-004 availability.`,
      };
    }

    const embed = await backfillMissingEmbeddings({ orgId });
    revalidatePath("/brain");
    return {
      ok: true,
      synced,
      embedded: embed.embedded,
      message:
        embed.embedded > 0
          ? `Refreshed ${synced} records · embedded ${embed.embedded} nodes. Semantic recall is ON.`
          : `Refreshed ${synced} records. Semantic recall is ON — all nodes were already embedded.`,
    };
  } catch (error) {
    return { ok: false, synced: 0, embedded: 0, message: error instanceof Error ? error.message : "Brain refresh failed." };
  }
}
