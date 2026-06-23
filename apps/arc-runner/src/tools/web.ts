import { tool } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";

import type { ArcClient } from "../arc-client";
import { runTool, type StepFn } from "./helpers";

/**
 * Web access for Arc, available in every mode (reading the web is not a
 * mutation). Both delegate to app routes that own the secret + SSRF guard. If
 * web access isn't configured the route returns not_configured and Arc says so.
 */
export function webTools(client: ArcClient, step: StepFn) {
  const webSearch = tool(
    "web_search",
    "Search the public web for current information (businesses, prices, news, competitors). Returns title/url/snippet results. Use to find prospects or ground a decision, then cite_sources what you used. To turn a found business into a lead, call create_lead with review_status:'proposed'.",
    {
      query: z.string().describe("The search query"),
      max_results: z.number().optional().describe("1-10, default 5"),
    },
    async (args) =>
      runTool(step, `Searching the web: ${args.query}`, async () =>
        client.apiPost("/api/v1/arc/web/search", { query: args.query, max_results: args.max_results }),
      ),
  );

  const webFetch = tool(
    "web_fetch",
    "Read a public web page (http/https) and get its readable text + title. Use to read a promising search result or directory listing and extract details (business name, phone, address). Internal only — never contacts anyone.",
    { url: z.string().describe("The page URL (http or https)") },
    async (args) =>
      runTool(step, "Reading a web page", async () =>
        client.apiPost("/api/v1/arc/web/fetch", { url: args.url }),
      ),
  );

  return [webSearch, webFetch];
}
