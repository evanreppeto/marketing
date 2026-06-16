import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

/**
 * Structural safety guarantee for the Arc Operations API: none of the agent
 * route handlers may import the human decision / launch / dispatch paths. That
 * omission — not a runtime check — is what proves Arc can never approve,
 * launch, send, or publish through these endpoints.
 */

const ARC_DIR = dirname(dirname(fileURLToPath(import.meta.url)));

// Only the NEW agent surfaces this work added.
const AGENT_DIRS = ["tasks", "approvals", "campaigns", "crm", "drafts", "health", "_lib"];

const FORBIDDEN_MODULES = [
  "@/lib/approvals/decisions",
  "@/lib/campaigns/decisions",
  "@/lib/campaigns/revisions",
  "@/lib/campaigns/launch",
];

const FORBIDDEN_SYMBOLS = [
  "decideApprovalItem",
  "decideAsset",
  "reopenAsset",
  "requestAssetRevision",
  "launchCampaign",
  "deployAsset",
];

function collectSourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      out.push(...collectSourceFiles(full));
    } else if (entry.endsWith(".ts") && !entry.endsWith(".test.ts")) {
      out.push(full);
    }
  }
  return out;
}

describe("Arc Operations API outbound safety", () => {
  const files = AGENT_DIRS.flatMap((sub) => {
    try {
      return collectSourceFiles(join(ARC_DIR, sub));
    } catch {
      return [];
    }
  });

  it("scans a non-empty set of route/helper files", () => {
    expect(files.length).toBeGreaterThan(0);
  });

  it.each(FORBIDDEN_MODULES)("never imports the decision/launch module %s", (mod) => {
    const offenders = files.filter((file) => readFileSync(file, "utf8").includes(mod));
    expect(offenders, `Forbidden import of ${mod} in:\n${offenders.join("\n")}`).toEqual([]);
  });

  it.each(FORBIDDEN_SYMBOLS)("never references the outbound symbol %s", (symbol) => {
    const offenders = files.filter((file) => readFileSync(file, "utf8").includes(symbol));
    expect(offenders, `Forbidden reference to ${symbol} in:\n${offenders.join("\n")}`).toEqual([]);
  });
});
