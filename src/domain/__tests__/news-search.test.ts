import { describe, expect, it } from "vitest";

import {
  formatNewsQueriesInput,
  isNewsSearchConfigured,
  parseNewsQueryConfig,
  parseNewsQueriesInput,
} from "@/domain";

describe("parseNewsQueriesInput", () => {
  it("reads one term per line with an optional kind prefix", () => {
    const { queries, invalid } = parseNewsQueriesInput("brand: Big Shoulders Restoration\ncompetitor: ServPro\nChicago storm damage");
    expect(invalid).toEqual([]);
    expect(queries).toEqual([
      { query: "Big Shoulders Restoration", kind: "brand" },
      { query: "ServPro", kind: "competitor" },
      { query: "Chicago storm damage", kind: "industry" },
    ]);
  });

  it("keeps spaces in the term (a query is not a URL)", () => {
    expect(parseNewsQueriesInput("water damage restoration near me").queries[0].query).toBe("water damage restoration near me");
  });

  it("de-duplicates case-insensitively and ignores blank lines", () => {
    const { queries } = parseNewsQueriesInput("\nAcme\n\nacme\n");
    expect(queries).toHaveLength(1);
  });

  it("flags a line that is only a prefix with no term", () => {
    const { queries, invalid } = parseNewsQueriesInput("competitor:   \nAcme");
    expect(queries.map((q) => q.query)).toEqual(["Acme"]);
    expect(invalid).toEqual(["competitor:"]);
  });

  it("round-trips through formatNewsQueriesInput", () => {
    const text = "Chicago storm damage\ncompetitor: ServPro";
    expect(formatNewsQueriesInput(parseNewsQueriesInput(text).queries)).toBe(text);
  });

  it("parseNewsQueryConfig + isNewsSearchConfigured reflect the config", () => {
    expect(isNewsSearchConfigured(parseNewsQueryConfig({}))).toBe(false);
    expect(isNewsSearchConfigured(parseNewsQueryConfig({ queries: "Acme" }))).toBe(true);
  });
});
