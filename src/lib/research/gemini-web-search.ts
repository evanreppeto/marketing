import { GoogleGenAI } from "@google/genai";

export type WebSearchCitation = {
  title: string;
  url: string;
  startIndex?: number;
  endIndex?: number;
};

export type GeminiWebSearchResult = {
  model: string;
  text: string;
  citations: WebSearchCitation[];
  searchQueries: string[];
};

type GeminiWebSearchClient = {
  interactions?: {
    create?: (input: {
      model: string;
      input: string;
      tools: Array<{ type: "google_search" }>;
    }) => Promise<unknown>;
  };
};

type SearchWebWithGeminiInput = {
  query: string;
  context?: string;
  apiKey?: string;
  model?: string;
  createClient?: (apiKey: string) => GeminiWebSearchClient;
};

const DEFAULT_MODEL = "gemini-2.5-flash";

function cleanText(value: unknown, maxLength: number): string {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, maxLength).trim() : "";
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function array(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function numberOrUndefined(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function extractSearchQueries(response: unknown): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const step of array(asRecord(response).steps)) {
    const item = asRecord(step);
    if (item.type !== "google_search_call") continue;
    const args = asRecord(item.arguments);
    for (const raw of array(args.queries)) {
      const query = cleanText(raw, 240);
      const key = query.toLowerCase();
      if (!query || seen.has(key)) continue;
      seen.add(key);
      out.push(query);
    }
  }
  return out;
}

function extractModelOutputText(response: unknown): string {
  const root = asRecord(response);
  const direct = cleanText(root.output_text ?? root.outputText, 12000);
  if (direct) return direct;

  for (const step of array(root.steps)) {
    const item = asRecord(step);
    if (item.type !== "model_output") continue;
    const chunks = array(item.content)
      .map((content) => cleanText(asRecord(content).text, 12000))
      .filter(Boolean);
    if (chunks.length > 0) return chunks.join("\n\n");
  }
  return "";
}

function extractCitations(response: unknown): WebSearchCitation[] {
  const out: WebSearchCitation[] = [];
  const seen = new Set<string>();
  for (const step of array(asRecord(response).steps)) {
    const item = asRecord(step);
    if (item.type !== "model_output") continue;
    for (const content of array(item.content)) {
      for (const annotation of array(asRecord(content).annotations)) {
        const citation = asRecord(annotation);
        if (citation.type !== "url_citation") continue;
        const url = cleanText(citation.url, 1000);
        if (!url || seen.has(url)) continue;
        seen.add(url);
        out.push({
          title: cleanText(citation.title, 180) || url,
          url,
          startIndex: numberOrUndefined(citation.start_index ?? citation.startIndex),
          endIndex: numberOrUndefined(citation.end_index ?? citation.endIndex),
        });
      }
    }
  }
  return out;
}

function buildInput(query: string, context?: string): string {
  const parts = [
    "Research this for Arc, a marketing operations agent. Return practical findings and cite sources.",
    "Focus on lead discovery, local market context, competitor signals, source-backed opportunities, or campaign research when relevant.",
    `Research request: ${query}`,
  ];
  const cleanContext = cleanText(context, 4000);
  if (cleanContext) parts.push(`Business/app context: ${cleanContext}`);
  return parts.join("\n\n");
}

export async function searchWebWithGemini(input: SearchWebWithGeminiInput): Promise<GeminiWebSearchResult> {
  const query = cleanText(input.query, 1000);
  if (!query) throw new Error("query is required");

  const apiKey = input.apiKey ?? process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) throw new Error("GEMINI_API_KEY is required");

  const model = cleanText(input.model ?? process.env.GEMINI_WEB_SEARCH_MODEL, 120) || DEFAULT_MODEL;
  const client = input.createClient ? input.createClient(apiKey) : new GoogleGenAI({ apiKey });
  const create = client.interactions?.create;
  if (!create) throw new Error("Gemini interactions API is unavailable in @google/genai");

  const response = await create({
    model,
    input: buildInput(query, input.context),
    tools: [{ type: "google_search" }],
  });
  const text = extractModelOutputText(response);
  if (!text) throw new Error("Gemini returned no research text");

  return {
    model,
    text,
    citations: extractCitations(response),
    searchQueries: extractSearchQueries(response),
  };
}
