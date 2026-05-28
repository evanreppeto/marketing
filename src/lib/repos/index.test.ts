import { describe, expect, it } from "vitest";

import * as repos from "./index";

describe("repos barrel", () => {
  it("re-exports the lead repo functions", () => {
    expect(typeof repos.listLeads).toBe("function");
    expect(typeof repos.getLead).toBe("function");
    expect(typeof repos.countLeads).toBe("function");
  });
});
