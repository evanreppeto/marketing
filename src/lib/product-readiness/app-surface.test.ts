import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const root = process.cwd();

function read(relativePath: string) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

function exists(relativePath: string) {
  return fs.existsSync(path.join(root, relativePath));
}

describe("product app surface smoke checks", () => {
  it("keeps the core auth, workspace, Arc, campaign, and library routes present", () => {
    const expectedFiles = [
      "src/app/login/page.tsx",
      "src/app/sign-up/page.tsx",
      "src/app/onboarding/page.tsx",
      "src/app/settings/page.tsx",
      "src/app/arc/page.tsx",
      "src/app/campaigns/page.tsx",
      "src/app/library/page.tsx",
      "src/app/api/auth/sign-in/route.ts",
      "src/app/api/auth/sign-up/route.ts",
      "src/app/api/auth/workspace-invites/route.ts",
      "src/app/api/auth/workspace-members/route.ts",
      "src/app/api/v1/arc/health/route.ts",
      "src/app/api/v1/arc/tasks/route.ts",
    ];

    for (const file of expectedFiles) {
      expect(exists(file), `${file} should exist`).toBe(true);
    }
  });

  it("keeps auth pages and API routes out of the page-protection proxy matcher", () => {
    const source = read("src/proxy.ts");
    expect(source).toContain("login");
    expect(source).toContain("sign-in");
    expect(source).toContain("sign-up");
    expect(source).toContain("api");
    expect(source).toContain("getWorkspaceAccessDecision");
  });

  it("exposes one-command local verification scripts", () => {
    const pkg = JSON.parse(read("package.json")) as { scripts: Record<string, string> };
    expect(pkg.scripts.typecheck).toBe("tsc --noEmit --pretty false");
    expect(pkg.scripts["test:smoke"]).toContain("product-readiness");
    expect(pkg.scripts["smoke:http"]).toBe("node scripts/smoke-http.mjs");
    expect(pkg.scripts["health:supabase"]).toBe("node scripts/check-supabase-health.mjs");
    expect(pkg.scripts["health:constraints"]).toBe("node scripts/check-agent-task-constraints.mjs");
    expect(pkg.scripts.verify).toBe("node scripts/verify-product.mjs");
    expect(pkg.scripts["verify:live"]).toContain("node scripts/check-supabase-health.mjs");
    expect(pkg.scripts["verify:live"]).toContain("node scripts/check-agent-task-constraints.mjs");
  });
});
