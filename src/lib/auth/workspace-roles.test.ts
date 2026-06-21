import { describe, expect, it } from "vitest";

import {
  ASSIGNABLE_WORKSPACE_ROLES,
  WORKSPACE_ROLES,
  isAssignableRole,
  isWorkspaceAdminRole,
  roleLabel,
} from "./workspace-roles";

describe("workspace roles", () => {
  it("covers all six membership roles", () => {
    expect(WORKSPACE_ROLES.map((info) => info.role)).toEqual([
      "owner",
      "admin",
      "marketer",
      "reviewer",
      "member",
      "viewer",
    ]);
  });

  it("never lets owner be an assignable invite/member role", () => {
    expect(ASSIGNABLE_WORKSPACE_ROLES).not.toContain("owner");
    expect(isAssignableRole("owner")).toBe(false);
    expect(isAssignableRole("admin")).toBe(true);
    expect(isAssignableRole("nonsense")).toBe(false);
  });

  it("treats owner and admin as workspace admins", () => {
    expect(isWorkspaceAdminRole("owner")).toBe(true);
    expect(isWorkspaceAdminRole("admin")).toBe(true);
    expect(isWorkspaceAdminRole("marketer")).toBe(false);
  });

  it("labels known roles and falls back gracefully", () => {
    expect(roleLabel("marketer")).toBe("Marketer");
    expect(roleLabel("custom")).toBe("Custom");
  });
});
