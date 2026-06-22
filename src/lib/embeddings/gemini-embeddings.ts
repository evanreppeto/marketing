import { GoogleGenAI } from "@google/genai";

export const EMBEDDING_DIMS = 768;
const EMBEDDING_MODEL = "text-embedding-004";

/**
 * Embed text with Gemini text-embedding-004 (768-dim). Returns null when the
 * key is missing, the text is empty, the call fails, or the vector is the wrong
 * size — so every caller degrades gracefully (recall falls back to keyword/graph).
 */
export async function embedText(text: string): Promise<number[] | null> {
  const key = process.env.GEMINI_API_KEY?.trim();
  const input = text?.trim();
  if (!key || !input) return null;
  try {
    const ai = new GoogleGenAI({ apiKey: key });
    const res = await ai.models.embedContent({ model: EMBEDDING_MODEL, contents: input });
    const values = res?.embeddings?.[0]?.values;
    return Array.isArray(values) && values.length === EMBEDDING_DIMS ? (values as number[]) : null;
  } catch {
    return null;
  }
}
