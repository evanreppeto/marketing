import { describe, expect, it } from "vitest";

import { searchWebWithGemini } from "./gemini-web-search";

describe("searchWebWithGemini", () => {
  it("returns grounded text, citations, and executed search queries", async () => {
    const interactions = {
      create: async () => ({
        output_text: "Found three Chicago property manager lead sources.",
        steps: [
          {
            type: "google_search_call",
            arguments: { queries: ["Chicago property management associations"] },
          },
          {
            type: "model_output",
            content: [
              {
                type: "text",
                text: "Found three Chicago property manager lead sources.",
                annotations: [
                  {
                    type: "url_citation",
                    url: "https://example.com/list",
                    title: "Example list",
                    start_index: 0,
                    end_index: 12,
                  },
                ],
              },
            ],
          },
        ],
      }),
    };

    const result = await searchWebWithGemini({
      query: "Find property management lead sources in Chicago",
      apiKey: "test-key",
      model: "gemini-2.5-flash",
      createClient: () => ({ interactions }),
    });

    expect(result).toEqual({
      model: "gemini-2.5-flash",
      text: "Found three Chicago property manager lead sources.",
      citations: [
        {
          title: "Example list",
          url: "https://example.com/list",
          startIndex: 0,
          endIndex: 12,
        },
      ],
      searchQueries: ["Chicago property management associations"],
    });
  });

  it("rejects empty queries before calling Gemini", async () => {
    let called = false;

    await expect(
      searchWebWithGemini({
        query: " ",
        apiKey: "test-key",
        createClient: () => {
          called = true;
          return {};
        },
      }),
    ).rejects.toThrow("query is required");

    expect(called).toBe(false);
  });
});
