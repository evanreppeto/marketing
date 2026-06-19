import { GoogleGenAI } from "@google/genai";

import { type KnowledgeNodeInput } from "@/domain";

import { type BrandKnowledgeAsset } from "./brain-sync";

type ParsedBrandKnowledgeNode = {
  kind: "brand_fact" | "messaging_angle" | "proof_point" | "cta";
  label: string;
  body: string | null;
  summary: string | null;
  confidence: number;
  tags: string[];
};

type GeminiDeps = {
  apiKey?: string;
  model?: string;
  generateText?: (prompt: string, asset: BrandKnowledgeAsset) => Promise<string>;
};

const ALLOWED_KINDS = new Set<ParsedBrandKnowledgeNode["kind"]>([
  "brand_fact",
  "messaging_angle",
  "proof_point",
  "cta",
]);

const DEFAULT_TEXT_MODEL = "gemini-2.5-flash-lite";

function cleanText(value: unknown, maxLength: number) {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, maxLength).trim() : "";
}

function cleanTags(value: unknown) {
  if (!Array.isArray(value)) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const item of value) {
    const tag = cleanText(item, 32).toLowerCase();
    if (!tag || seen.has(tag)) continue;
    seen.add(tag);
    out.push(tag);
    if (out.length >= 6) break;
  }
  return out;
}

function clampConfidence(value: unknown) {
  const confidence = Number(value);
  if (!Number.isFinite(confidence)) return 78;
  return Math.min(95, Math.max(65, Math.round(confidence)));
}

function extractJson(value: string) {
  const trimmed = value.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced?.[1]) return fenced[1].trim();
  const first = trimmed.indexOf("{");
  const last = trimmed.lastIndexOf("}");
  return first >= 0 && last > first ? trimmed.slice(first, last + 1) : trimmed;
}

export function parseBrandKnowledgeJson(value: string): ParsedBrandKnowledgeNode[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(extractJson(value));
  } catch {
    return [];
  }

  const rawNodes = parsed && typeof parsed === "object" && "nodes" in parsed ? (parsed as { nodes?: unknown }).nodes : [];
  if (!Array.isArray(rawNodes)) return [];

  const out: ParsedBrandKnowledgeNode[] = [];
  const seen = new Set<string>();
  for (const raw of rawNodes) {
    if (!raw || typeof raw !== "object") continue;
    const item = raw as Record<string, unknown>;
    const kind = cleanText(item.kind, 40) as ParsedBrandKnowledgeNode["kind"];
    const label = cleanText(item.label, 120);
    if (!ALLOWED_KINDS.has(kind) || !label) continue;
    const key = `${kind}:${label.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      kind,
      label,
      body: cleanText(item.body, 900) || null,
      summary: cleanText(item.summary, 240) || null,
      confidence: clampConfidence(item.confidence),
      tags: cleanTags(item.tags),
    });
    if (out.length >= 8) break;
  }
  return out;
}

function slug(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 54)
    .replace(/-+$/g, "") || "brand-note";
}

export function toBrandKnowledgeNodeInputs(
  asset: BrandKnowledgeAsset,
  nodes: ParsedBrandKnowledgeNode[],
): KnowledgeNodeInput[] {
  return nodes.map((node) => ({
    kind: node.kind,
    key: `media_asset:${asset.id}:ai:${slug(node.label)}`,
    label: node.label,
    body: node.body,
    summary: node.summary,
    confidence: node.confidence,
    refTable: "media_assets",
    refId: asset.id,
    source: "brand_source_gemini",
    sourceReference: `media_assets:${asset.id}`,
    tags: ["brand-source", "ai-extracted", node.kind, ...node.tags],
    props: {
      mediaAssetId: asset.id,
      fileName: asset.fileName,
      source: asset.source,
      sourceUrl: asset.url ?? null,
      extractedBy: "gemini",
    },
  }));
}

function buildPrompt(asset: BrandKnowledgeAsset) {
  const text = asset.extractedText?.trim();
  return [
    "Read this brand source and extract only facts Mark can use after human approval.",
    "Return JSON only with this shape:",
    '{"nodes":[{"kind":"brand_fact|messaging_angle|proof_point|cta","label":"short fact","body":"supporting detail","summary":"optional short summary","confidence":80,"tags":["brand"]}]}',
    "Keep it conservative. Do not invent claims. If the source is weak, return an empty nodes array.",
    `File name: ${asset.fileName}`,
    text ? `Document text:\n${text.slice(0, 16000)}` : "Use the attached file content.",
  ].join("\n\n");
}

async function callGemini(prompt: string, asset: BrandKnowledgeAsset, deps: GeminiDeps) {
  const apiKey = deps.apiKey ?? process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) return "";
  const model = deps.model ?? process.env.BRAND_KNOWLEDGE_MODEL?.trim() ?? DEFAULT_TEXT_MODEL;
  const ai = new GoogleGenAI({ apiKey });
  const filePart =
    asset.fileBytes && asset.contentType
      ? {
          inlineData: {
            mimeType: asset.contentType,
            data: Buffer.from(asset.fileBytes).toString("base64"),
          },
        }
      : null;
  const contents = filePart
    ? [{ role: "user", parts: [{ text: prompt }, filePart] }]
    : prompt;

  const response = await ai.models.generateContent({
    model,
    contents,
    config: {
      temperature: 0.1,
      maxOutputTokens: 1800,
      responseMimeType: "application/json",
    },
  });
  return response.text ?? "";
}

export async function extractBrandKnowledgeWithGemini(
  asset: BrandKnowledgeAsset,
  deps: GeminiDeps = {},
): Promise<KnowledgeNodeInput[]> {
  if (!asset.availableToArc) return [];
  if (!asset.extractedText?.trim() && !asset.fileBytes) return [];

  const prompt = buildPrompt(asset);
  const text = deps.generateText ? await deps.generateText(prompt, asset) : await callGemini(prompt, asset, deps);
  return toBrandKnowledgeNodeInputs(asset, parseBrandKnowledgeJson(text));
}
