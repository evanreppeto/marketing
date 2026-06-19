import { fail, guard, ok } from "@/app/api/v1/arc/_lib/http";
import { getVaultNote, getVaultNotes } from "@/lib/vault/read-model";

/**
 * Arc's vault knowledge. List all notes, or one note via ?slug=.
 *   GET /api/v1/arc/vault            ->  { ok, notes }
 *   GET /api/v1/arc/vault?slug=foo   ->  { ok, note } | 404
 */
export async function GET(request: Request) {
  const denied = await guard(request);
  if (denied) return denied;
  const slug = new URL(request.url).searchParams.get("slug");
  try {
    if (slug) {
      const note = await getVaultNote(slug);
      if (!note) return fail("not_found", `No vault note for slug "${slug}".`, 404);
      return ok({ note });
    }
    const model = await getVaultNotes();
    return ok({ notes: model.notes });
  } catch (error) {
    return fail("failed", error instanceof Error ? error.message : "Failed to read the vault.", 502);
  }
}
