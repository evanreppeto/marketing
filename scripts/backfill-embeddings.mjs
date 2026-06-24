// Backfill Gemini text-embedding-004 vectors for knowledge_nodes that have
// no embedding yet. Safe to re-run: only touches rows where embedding IS NULL.
// Only processes trusted + observed tiers (proposed/archived/rejected excluded).
//
// Usage:
//   pnpm backfill:embeddings
//   # or: NEXT_PUBLIC_SUPABASE_URL=… SUPABASE_SERVICE_ROLE_KEY=… GEMINI_API_KEY=… node scripts/backfill-embeddings.mjs
//
// After running the migration (20260621130000_knowledge_node_embeddings.sql),
// execute this once against prod to populate existing nodes.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createClient } from "@supabase/supabase-js";

// ---------------------------------------------------------------------------
// Env loading (mirrors seed-brain.mjs pattern)
// ---------------------------------------------------------------------------
function loadLocalEnv() {
  const envPath = join(process.cwd(), ".env.local");
  let envText;
  try {
    envText = readFileSync(envPath, "utf8");
  } catch {
    // .env.local may not exist in CI / prod runners — fall through to system env
    return;
  }
  for (const line of envText.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const separatorIndex = trimmed.indexOf("=");
    if (separatorIndex === -1) continue;
    const key = trimmed.slice(0, separatorIndex).trim();
    const value = trimmed.slice(separatorIndex + 1).trim();
    // Don't overwrite env vars already set (system env takes priority)
    if (!process.env[key]) process.env[key] = value;
  }
}

function getSupabase() {
  loadLocalEnv();
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY. " +
        "Set them in .env.local or as system env vars.",
    );
  }
  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

// ---------------------------------------------------------------------------
// Gemini embedContent (inlined — scripts/ can't import TS src/)
// ---------------------------------------------------------------------------
const EMBEDDING_DIMS = 768;
const EMBEDDING_MODEL = "text-embedding-004";

async function embedText(text) {
  const key = process.env.GEMINI_API_KEY?.trim();
  const input = text?.trim();
  if (!key || !input) return null;
  try {
    // Dynamic import so the script doesn't error when @google/genai is absent
    const { GoogleGenAI } = await import("@google/genai");
    const ai = new GoogleGenAI({ apiKey: key });
    const res = await ai.models.embedContent({ model: EMBEDDING_MODEL, contents: input });
    const values = res?.embeddings?.[0]?.values;
    return Array.isArray(values) && values.length === EMBEDDING_DIMS ? values : null;
  } catch (err) {
    console.warn("embedText error:", err?.message ?? String(err));
    return null;
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
const BATCH_SIZE = 50;
const ELIGIBLE_TIERS = ["trusted", "observed"];

async function main() {
  loadLocalEnv();

  if (!process.env.GEMINI_API_KEY?.trim()) {
    console.warn("GEMINI_API_KEY is not set — embeddings will be null for every row. Exiting.");
    process.exit(1);
  }

  const supabase = getSupabase();

  console.log("Fetching knowledge_nodes with no embedding (trusted + observed)…");

  let totalProcessed = 0;
  let totalEmbedded = 0;
  let totalErrors = 0;

  // Always pull the FIRST BATCH_SIZE still-null rows — do NOT advance an offset.
  // Each successful embed drops the row out of the `embedding IS NULL` set, so the
  // next "first N null rows" are fresh. Advancing an offset while the set shrinks
  // under us skips rows (it steps past the rows that just became non-null). We
  // stop when a batch embeds nothing new, i.e. only un-embeddable rows remain
  // (empty label/summary/body, or a persistent embed failure) — otherwise those
  // rows would be re-fetched forever.
  while (true) {
    const { data: rows, error } = await supabase
      .from("knowledge_nodes")
      .select("id, label, summary, body, org_id, trust_tier")
      .is("embedding", null)
      .in("trust_tier", ELIGIBLE_TIERS)
      .order("created_at", { ascending: true })
      .range(0, BATCH_SIZE - 1);

    if (error) {
      console.error("Failed to fetch batch:", error.message);
      process.exit(1);
    }

    if (!rows || rows.length === 0) break;

    console.log(`Processing batch of ${rows.length} still-unembedded rows…`);

    let batchEmbedded = 0;
    for (const row of rows) {
      totalProcessed++;
      try {
        const text = [row.label, row.summary, row.body].filter(Boolean).join("\n").trim();
        const embedding = await embedText(text);
        if (!embedding) {
          console.warn(`  [skip] ${row.id} — embedText returned null`);
          continue;
        }
        const { error: updateError } = await supabase
          .from("knowledge_nodes")
          .update({ embedding: JSON.stringify(embedding) })
          .eq("id", row.id)
          .eq("org_id", row.org_id);
        if (updateError) {
          console.warn(`  [error] ${row.id} — update failed: ${updateError.message}`);
          totalErrors++;
        } else {
          totalEmbedded++;
          batchEmbedded++;
          if (totalEmbedded % 10 === 0) {
            console.log(`  Embedded ${totalEmbedded} nodes so far…`);
          }
        }
      } catch (err) {
        console.warn(`  [error] ${row.id} — unexpected: ${err?.message ?? String(err)}`);
        totalErrors++;
      }
    }

    // No progress this pass → only un-embeddable rows remain. Stop rather than
    // re-fetch the same rows forever.
    if (batchEmbedded === 0) {
      console.warn(`Stopping: ${rows.length} row(s) remain but none could be embedded this pass.`);
      break;
    }
  }

  console.log(
    `\nBackfill complete. Processed: ${totalProcessed} | Embedded: ${totalEmbedded} | Errors: ${totalErrors}`,
  );
}

main().catch((err) => {
  console.error("Backfill failed:", err?.message ?? String(err));
  process.exit(1);
});
