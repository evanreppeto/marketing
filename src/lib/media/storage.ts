import { getSupabaseAdminClient } from "@/lib/supabase/server";

/**
 * Storage for Arc-generated media. Reuses the public `campaign-media` Supabase
 * Storage bucket (same bucket operator photos + social-ad images use), so a
 * generated image gets a permanent public URL — no signed-URL expiry, no second
 * cloud account. Mirrors the upload pattern in `src/lib/campaigns/create.ts`.
 */
const CAMPAIGN_MEDIA_BUCKET = "campaign-media";

/** Upload generated media bytes (image or video); returns a permanent public URL. */
export async function storeGeneratedMedia(objectPath: string, bytes: Buffer, contentType: string): Promise<string> {
  const client = getSupabaseAdminClient();
  const { error } = await client.storage
    .from(CAMPAIGN_MEDIA_BUCKET)
    .upload(objectPath, bytes, { contentType, upsert: true });
  if (error) throw new Error(`media upload failed: ${error.message}`);
  return client.storage.from(CAMPAIGN_MEDIA_BUCKET).getPublicUrl(objectPath).data.publicUrl;
}

/** @deprecated use storeGeneratedMedia */
export const storeGeneratedImage = storeGeneratedMedia;
