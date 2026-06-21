import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const root = process.cwd();

function read(relativePath: string) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

describe("product backend boundary smoke checks", () => {
  it("requires Arc API routes that move workspace data to resolve and pass tenant scope", () => {
    const scopedRoutes = [
      "src/app/api/v1/arc/tasks/route.ts",
      "src/app/api/v1/arc/tasks/[id]/route.ts",
      "src/app/api/v1/arc/tasks/[id]/claim/route.ts",
      "src/app/api/v1/arc/tasks/[id]/complete/route.ts",
      "src/app/api/v1/arc/tasks/[id]/log/route.ts",
      "src/app/api/v1/arc/approvals/route.ts",
      "src/app/api/v1/arc/approvals/[id]/route.ts",
      "src/app/api/v1/arc/campaigns/route.ts",
      "src/app/api/v1/arc/campaigns/[id]/route.ts",
      "src/app/api/v1/arc/campaigns/draft-asset/route.ts",
      "src/app/api/v1/arc/drafts/route.ts",
    ];

    for (const route of scopedRoutes) {
      const source = read(route);
      expect(source, `${route} should call arcGuard`).toContain("arcGuard(request)");
      expect(source, `${route} should use the resolved Arc workspace scope`).toContain("allowed.scope");
    }
  });

  it("keeps Arc task reads and writes scoped by organization and workspace", () => {
    const source = read("src/lib/arc-api/tasks.ts");
    expect(source).toContain('.eq("org_id", scope.orgId)');
    expect(source).toContain('.eq("workspace_id", scope.workspaceId)');
    expect(source).toContain("org_id: scope.orgId");
    expect(source).toContain("workspace_id: scope.workspaceId");
  });

  it("keeps workspace membership administration behind admin/owner safeguards", () => {
    const source = read("src/lib/auth/workspace-invites.ts");
    expect(source).toContain("Only workspace owners and admins can issue invites.");
    expect(source).toContain("Only workspace owners and admins can change member roles.");
    expect(source).toContain("Only workspace owners and admins can remove members.");
    expect(source).toContain("You cannot change your own workspace role.");
    expect(source).toContain("You cannot remove yourself from the workspace.");
    expect(source).toContain("Owner access cannot be changed here.");
    expect(source).toContain("Owner access cannot be removed here.");
  });
});
