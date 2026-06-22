import { describe, expect, it } from "vitest";
import { buildAppTitle } from "./page-title";

describe("buildAppTitle", () => {
  it("signed out → default is just the brand", () => {
    expect(buildAppTitle({ brand: "Arc", workspaceDisplayName: null })).toEqual({
      default: "Arc",
      template: "%s · Arc",
    });
  });
  it("signed in → default is '{workspace} · brand'", () => {
    expect(buildAppTitle({ brand: "Arc", workspaceDisplayName: "Big Shoulders Restoration" })).toEqual({
      default: "Big Shoulders Restoration · Arc",
      template: "%s · Arc",
    });
  });
  it("respects a custom brand (renamed assistant)", () => {
    expect(buildAppTitle({ brand: "Nova", workspaceDisplayName: null })).toEqual({
      default: "Nova",
      template: "%s · Nova",
    });
  });
  it("treats blank workspace name as signed-out", () => {
    expect(buildAppTitle({ brand: "Arc", workspaceDisplayName: "  " }).default).toBe("Arc");
  });
});
