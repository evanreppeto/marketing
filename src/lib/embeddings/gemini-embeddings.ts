import { GoogleGenAI } from "@google/genai";

export const EMBEDDING_DIMS = 768;

// Overridable via env so the embedding model can be switched WITHOUT a redeploy
// (e.g. to "gemini-embedding-001" if a key doesn't have access to
// text-embedding-004). The Brain "Refresh memory" probe reports exactly which
// model/dimension works, so this can be set decisively. Whatever model is used,
// outputDimensionality is pinned to EMBEDDING_DIMS so the vector always matches
// the pgvector column — gemini-embedding-001 defaults to 3072 otherwise.
const EMBEDDING_MODEL = process.env.GEMINI_EMBEDDING_MODEL?.trim() || "text-embedding-004";

/**
 * Embed text with Gemini (768-dim). Returns null when the key is missing, the
 * text is empty, the call fails, or the vector is the wrong size — so every
 * caller degrades gracefully (recall falls back to keyword/graph). For the
 * "why did embedding fail" question, use probeEmbedding() which surfaces the
 * real error instead of collapsing it to null.
 */
export async function embedText(text: string): Promise<number[] | null> {
  const key = process.env.GEMINI_API_KEY?.trim();
  const input = text?.trim();
  if (!key || !input) return null;
  try {
    const ai = new GoogleGenAI({ apiKey: key });
    const res = await ai.models.embedContent({
      model: EMBEDDING_MODEL,
      contents: input,
      config: { outputDimensionality: EMBEDDING_DIMS },
    });
    const values = res?.embeddings?.[0]?.values;
    return Array.isArray(values) && values.length === EMBEDDING_DIMS ? (values as number[]) : null;
  } catch {
    return null;
  }
}

export type EmbedProbeResult =
  | { ok: true; model: string; dims: number }
  | { ok: false; model: string; error: string };

/**
 * Connectivity probe used by the Brain "Refresh memory" flow. Unlike embedText,
 * it returns the ACTUAL failure — the Gemini error message/status, a wrong
 * dimensionality, or "no key" — so the operator sees why semantic recall is off
 * (bad key, model not enabled for this key, quota, billing) rather than a
 * generic "embedding call failed". Never used in the hot backfill path.
 */
export async function probeEmbedding(): Promise<EmbedProbeResult> {
  const key = process.env.GEMINI_API_KEY?.trim();
  if (!key) return { ok: false, model: EMBEDDING_MODEL, error: "GEMINI_API_KEY is not set in this runtime." };
  try {
    const ai = new GoogleGenAI({ apiKey: key });
    const res = await ai.models.embedContent({
      model: EMBEDDING_MODEL,
      contents: "brain embedding connectivity probe",
      config: { outputDimensionality: EMBEDDING_DIMS },
    });
    const values = res?.embeddings?.[0]?.values;
    if (!Array.isArray(values)) return { ok: false, model: EMBEDDING_MODEL, error: `no embedding returned for model "${EMBEDDING_MODEL}"` };
    if (values.length !== EMBEDDING_DIMS) {
      return { ok: false, model: EMBEDDING_MODEL, error: `model "${EMBEDDING_MODEL}" returned ${values.length} dims, need ${EMBEDDING_DIMS}` };
    }
    return { ok: true, model: EMBEDDING_MODEL, dims: values.length };
  } catch (e) {
    return { ok: false, model: EMBEDDING_MODEL, error: describeGeminiError(e) };
  }
}

/** Pull the useful signal (HTTP status + message) out of a thrown Gemini/SDK error. */
function describeGeminiError(e: unknown): string {
  const anyE = (e ?? null) as { status?: number | string; code?: number | string; message?: string } | null;
  const status = anyE?.status ?? anyE?.code;
  const parts = [status != null ? `status ${status}` : null, anyE?.message ?? (e instanceof Error ? e.message : String(e))];
  return parts.filter(Boolean).join(" — ").slice(0, 400) || "unknown embedding error";
}
