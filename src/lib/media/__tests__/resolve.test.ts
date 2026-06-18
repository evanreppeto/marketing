import { describe, expect, it } from "vitest";
import { resolveModel } from "../index";

describe("resolveModel (stored -> env -> default)", () => {
  it("stored wins when set", () => {
    expect(resolveModel("imagen-4.0-ultra-generate-001", "imagen-4.0-generate-001", "x")).toBe("imagen-4.0-ultra-generate-001");
  });
  it("env used when stored empty/undefined", () => {
    expect(resolveModel("", "env-model", "def")).toBe("env-model");
    expect(resolveModel(undefined, "env-model", "def")).toBe("env-model");
  });
  it("default when both empty", () => {
    expect(resolveModel("", "", "def")).toBe("def");
    expect(resolveModel(undefined, undefined, "def")).toBe("def");
  });
  it("trims whitespace-only to fall through", () => {
    expect(resolveModel("   ", "env", "def")).toBe("env");
  });
});
