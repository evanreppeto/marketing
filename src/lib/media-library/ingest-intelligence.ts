import { deriveMediaIngestTags, type ExternalMediaProvenance } from "@/domain";
import { deriveImageRiskFlags } from "@/lib/media/risk";

/**
 * The intelligence pass every ingested asset gets, regardless of which tool
 * made it — upload, Drive import, URL import, or the public media API. Arc's
 * own generations were already risk-flagged at creation; this closes the gap
 * where outside media entered with no scrutiny at all. Deterministic (filename
 * heuristics + declared provenance), so it runs identically everywhere; deeper
 * model-driven review can layer on later without changing the write path.
 */

export type MediaIngestScan = {
  riskFlags: string[];
  tags: string[];
};

export function scanMediaIngest(input: {
  fileName: string;
  kind: string;
  provenance?: ExternalMediaProvenance;
}): MediaIngestScan {
  const provenance = input.provenance ?? {};
  const riskFlags: string[] = [];

  // Visual media only — the filename heuristics talk about scenes, faces, and
  // embedded text; a .docx brand doc would false-positive on all of them.
  if (input.kind === "image" || input.kind === "video") {
    const readableName = input.fileName.replace(/\.[a-zA-Z0-9]+$/, "").replace(/[^a-zA-Z]+/g, " ");
    riskFlags.push(...deriveImageRiskFlags(readableName));
    // The prompt is lineage AND review material: when a generative tool is
    // declared with its prompt, scan the prompt exactly like Arc's own
    // generations; when it's declared without one, say so — the reviewer is
    // approving output they can't trace.
    if (provenance.prompt) {
      for (const flag of deriveImageRiskFlags(provenance.prompt)) {
        if (!riskFlags.includes(flag)) riskFlags.push(flag);
      }
    } else if (provenance.tool || provenance.model) {
      riskFlags.push("unverified AI provenance");
    }
  }

  return {
    riskFlags,
    tags: deriveMediaIngestTags({ fileName: input.fileName, tool: provenance.tool ?? null }),
  };
}
