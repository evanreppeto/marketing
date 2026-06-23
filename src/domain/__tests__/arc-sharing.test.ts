import { describe, expect, it } from "vitest";

import {
  hasRequiredPermission,
  resolveResourceAccess,
  strongerPermission,
  type ShareableResource,
  type ViewerGrants,
} from "../arc-sharing";

const ownerOnly: ShareableResource = {
  ownerId: "user-owner",
  workspaceId: "ws-1",
  visibility: "private",
  workspacePermission: "view",
};

const noGrants: ViewerGrants = {
  userId: "user-other",
  isWorkspaceMember: true,
  directShare: null,
  inheritedShare: null,
};

describe("resolveResourceAccess", () => {
  it("grants the owner collaborate access", () => {
    expect(resolveResourceAccess(ownerOnly, { ...noGrants, userId: "user-owner" })).toEqual({
      canView: true,
      permission: "collaborate",
    });
  });

  it("denies a non-owner when the resource is private and unshared", () => {
    expect(resolveResourceAccess(ownerOnly, noGrants)).toEqual({ canView: false, permission: null });
  });

  it("grants workspace members the workspace permission when visibility is workspace", () => {
    const resource: ShareableResource = { ...ownerOnly, visibility: "workspace", workspacePermission: "view" };
    expect(resolveResourceAccess(resource, noGrants)).toEqual({ canView: true, permission: "view" });
  });

  it("ignores workspace visibility for non-members", () => {
    const resource: ShareableResource = { ...ownerOnly, visibility: "workspace", workspacePermission: "collaborate" };
    expect(resolveResourceAccess(resource, { ...noGrants, isWorkspaceMember: false })).toEqual({
      canView: false,
      permission: null,
    });
  });

  it("uses the strongest of direct, inherited, and workspace grants", () => {
    const resource: ShareableResource = { ...ownerOnly, visibility: "workspace", workspacePermission: "view" };
    const decision = resolveResourceAccess(resource, { ...noGrants, directShare: "collaborate" });
    expect(decision).toEqual({ canView: true, permission: "collaborate" });
  });

  it("applies an inherited (project cascade) grant when there is no direct grant", () => {
    expect(resolveResourceAccess(ownerOnly, { ...noGrants, inheritedShare: "view" })).toEqual({
      canView: true,
      permission: "view",
    });
  });

  it("treats a null viewer (open/dev mode is handled by callers) as no owner match", () => {
    expect(resolveResourceAccess(ownerOnly, { ...noGrants, userId: null })).toEqual({
      canView: false,
      permission: null,
    });
  });

  it("denies access when the resource has no owner and the viewer is unauthenticated", () => {
    const resource: ShareableResource = { ...ownerOnly, ownerId: null };
    expect(resolveResourceAccess(resource, { ...noGrants, userId: null })).toEqual({
      canView: false,
      permission: null,
    });
  });
});

describe("strongerPermission", () => {
  it("prefers collaborate over view over null", () => {
    expect(strongerPermission("view", "collaborate")).toBe("collaborate");
    expect(strongerPermission("view", null)).toBe("view");
    expect(strongerPermission(null, null)).toBe(null);
  });
});

describe("hasRequiredPermission", () => {
  it("requires the decision to meet or exceed the required permission", () => {
    expect(hasRequiredPermission({ canView: true, permission: "view" }, "view")).toBe(true);
    expect(hasRequiredPermission({ canView: true, permission: "view" }, "collaborate")).toBe(false);
    expect(hasRequiredPermission({ canView: true, permission: "collaborate" }, "collaborate")).toBe(true);
    expect(hasRequiredPermission({ canView: false, permission: null }, "view")).toBe(false);
  });
});
