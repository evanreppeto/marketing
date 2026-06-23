import { describe, expect, it } from "vitest";

import { fieldErrorMap } from "./field-errors";

describe("fieldErrorMap", () => {
  it("maps validation codes to friendly field messages", () => {
    const map = fieldErrorMap(["display_name_required", "palette_primary_invalid"]);
    expect(map.displayName).toMatch(/name/i);
    expect(map.primaryHex).toMatch(/hex|color/i);
  });
  it("returns an empty map for no errors", () => {
    expect(fieldErrorMap([])).toEqual({});
  });
  it("ignores unknown codes", () => {
    expect(fieldErrorMap(["mystery_code"])).toEqual({});
  });
});
