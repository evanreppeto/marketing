import { GoogleGenAI } from "@google/genai";

import { NEUTRAL_DEFAULTS, type BrandColor, type BusinessProfile, type KnowledgeNodeInput, type ProofPoint } from "@/domain";

import { type BrandKnowledgeAsset } from "./brain-sync";

type ParsedBrandKnowledgeNode = {
  kind: "brand_fact" | "messaging_angle" | "proof_point" | "cta" | "persona";
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

export type BrandProfileUpdate = {
  displayName?: string | null;
  legalName?: string | null;
  tagline?: string | null;
  description?: string | null;
  industry?: string | null;
  websiteUrl?: string | null;
  serviceAreas?: string[];
  tone?: string | null;
  voiceGuidance?: string | null;
  preferredPhrases?: string[];
  bannedPhrases?: string[];
  services?: string[];
  proofPoints?: string[];
  brandColors?: BrandColor[];
  disallowedClaims?: string[];
  complianceNotes?: string | null;
};

export type BrandKnowledgeExtraction = {
  nodes: KnowledgeNodeInput[];
  profile: BrandProfileUpdate | null;
};

const ALLOWED_KINDS = new Set<ParsedBrandKnowledgeNode["kind"]>([
  "brand_fact",
  "messaging_angle",
  "proof_point",
  "cta",
  "persona",
]);

const DEFAULT_TEXT_MODEL = "gemini-2.5-flash-lite";

function cleanText(value: unknown, maxLength: number) {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, maxLength).trim() : "";
}

function cleanOptionalText(value: string | null | undefined) {
  return value?.replace(/\s+/g, " ").trim() || null;
}

function cleanArray(value: unknown, maxLength = 120) {
  if (!Array.isArray(value)) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const item of value) {
    const cleaned = cleanText(item, maxLength);
    if (!cleaned) continue;
    const key = cleaned.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(cleaned);
    if (out.length >= 20) break;
  }
  return out;
}

function cleanBrandColors(value: unknown): BrandColor[] {
  if (!Array.isArray(value)) return [];
  const out: BrandColor[] = [];
  const seen = new Set<string>();
  for (const raw of value) {
    if (!raw || typeof raw !== "object") continue;
    const item = raw as Record<string, unknown>;
    const hex = cleanText(item.hex, 12).toUpperCase();
    if (!/^#[0-9A-F]{6}$/.test(hex) || seen.has(hex)) continue;
    seen.add(hex);
    out.push({
      hex,
      label: cleanText(item.label, 48) || `Color ${out.length + 1}`,
      source: cleanText(item.source, 120) || "Brand source",
    });
    if (out.length >= 8) break;
  }
  return out;
}

function mergeList(current: string[], incoming: string[] | undefined) {
  const out = [...current];
  const seen = new Set(out.map((item) => item.toLowerCase()));
  for (const raw of incoming ?? []) {
    const item = cleanOptionalText(raw);
    if (!item) continue;
    const key = item.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}

function mergeBrandColors(current: BrandColor[], incoming: BrandColor[] | undefined) {
  const out = [...current];
  const seen = new Set(out.map((color) => color.hex.toUpperCase()));
  for (const color of incoming ?? []) {
    const hex = color.hex.toUpperCase();
    if (seen.has(hex)) continue;
    seen.add(hex);
    out.push({ ...color, hex });
    if (out.length >= 8) break;
  }
  return out;
}

function mergeProofPoints(current: ProofPoint[], incoming: string[] | undefined) {
  const out = [...current];
  const seen = new Set(out.map((point) => point.label.toLowerCase()));
  for (const raw of incoming ?? []) {
    const label = cleanOptionalText(raw);
    if (!label) continue;
    const key = label.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ kind: "stat", label });
  }
  return out;
}

function keepOrFill(current: string | null | undefined, incoming: string | null | undefined) {
  const currentValue = cleanOptionalText(current);
  return currentValue ?? cleanOptionalText(incoming);
}

function mergeText(current: string | null | undefined, incoming: string | null | undefined) {
  const currentValue = cleanOptionalText(current);
  const incomingValue = cleanOptionalText(incoming);
  if (!incomingValue) return currentValue;
  if (!currentValue) return incomingValue;
  if (currentValue.toLowerCase().includes(incomingValue.toLowerCase())) return currentValue;
  return `${currentValue}\n\n${incomingValue}`;
}

export function mergeBrandProfileUpdate(current: BusinessProfile, update: BrandProfileUpdate): BusinessProfile {
  const tone = cleanOptionalText(update.tone);

  return {
    ...current,
    displayName: keepOrFill(current.displayName, update.displayName) ?? current.displayName,
    legalName: keepOrFill(current.legalName, update.legalName),
    tagline: keepOrFill(current.tagline, update.tagline),
    description: mergeText(current.description, update.description),
    industry: keepOrFill(current.industry, update.industry),
    websiteUrl: keepOrFill(current.websiteUrl, update.websiteUrl),
    serviceAreas: mergeList(current.serviceAreas, update.serviceAreas),
    tone: current.tone === NEUTRAL_DEFAULTS.tone && tone ? tone : current.tone,
    voiceGuidance: mergeText(current.voiceGuidance, update.voiceGuidance),
    preferredPhrases: mergeList(current.preferredPhrases, update.preferredPhrases),
    bannedPhrases: mergeList(current.bannedPhrases, update.bannedPhrases),
    services: mergeList(current.services, update.services),
    proofPoints: mergeProofPoints(current.proofPoints, update.proofPoints),
    brandColors: mergeBrandColors(current.brandColors, update.brandColors),
    guardrails: {
      disallowedClaims: mergeList(current.guardrails.disallowedClaims, update.disallowedClaims),
      complianceNotes: mergeText(current.guardrails.complianceNotes, update.complianceNotes) ?? "",
    },
  };
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
  return parseBrandKnowledgeExtractionJson(value).nodes;
}

function parseProfile(value: unknown): BrandProfileUpdate | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const item = value as Record<string, unknown>;
  const profile: BrandProfileUpdate = {
    displayName: cleanText(item.displayName, 120) || null,
    legalName: cleanText(item.legalName, 160) || null,
    tagline: cleanText(item.tagline, 180) || null,
    description: cleanText(item.description, 900) || null,
    industry: cleanText(item.industry, 80) || null,
    websiteUrl: cleanText(item.websiteUrl, 240) || null,
    serviceAreas: cleanArray(item.serviceAreas),
    tone: cleanText(item.tone, 60) || null,
    voiceGuidance: cleanText(item.voiceGuidance, 900) || null,
    preferredPhrases: cleanArray(item.preferredPhrases),
    bannedPhrases: cleanArray(item.bannedPhrases),
    services: cleanArray(item.services),
    proofPoints: cleanArray(item.proofPoints),
    brandColors: cleanBrandColors(item.brandColors),
    disallowedClaims: cleanArray(item.disallowedClaims),
    complianceNotes: cleanText(item.complianceNotes, 900) || null,
  };
  const hasValue = Object.values(profile).some((entry) => (Array.isArray(entry) ? entry.length > 0 : Boolean(entry)));
  return hasValue ? profile : null;
}

export function parseBrandKnowledgeExtractionJson(value: string): {
  nodes: ParsedBrandKnowledgeNode[];
  profile: BrandProfileUpdate | null;
} {
  let parsed: unknown;
  try {
    parsed = JSON.parse(extractJson(value));
  } catch {
    return { nodes: [], profile: null };
  }

  const rawNodes = parsed && typeof parsed === "object" && "nodes" in parsed ? (parsed as { nodes?: unknown }).nodes : [];
  const sourceNodes = Array.isArray(rawNodes) ? rawNodes : [];

  const out: ParsedBrandKnowledgeNode[] = [];
  const seen = new Set<string>();
  for (const raw of sourceNodes) {
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
  return {
    nodes: out,
    profile: parsed && typeof parsed === "object" && "profile" in parsed ? parseProfile((parsed as { profile?: unknown }).profile) : null,
  };
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

export function toBrandKnowledgeExtraction(
  asset: BrandKnowledgeAsset,
  parsed: { nodes: ParsedBrandKnowledgeNode[]; profile: BrandProfileUpdate | null },
): BrandKnowledgeExtraction {
  return {
    nodes: toBrandKnowledgeNodeInputs(asset, parsed.nodes),
    profile: parsed.profile,
  };
}

function buildPrompt(asset: BrandKnowledgeAsset) {
  const text = asset.extractedText?.trim();
  return [
    "Read this brand source and extract only facts Mark can use after human approval.",
    "Return JSON only with this shape:",
    '{"profile":{"displayName":null,"legalName":null,"tagline":null,"description":null,"industry":null,"websiteUrl":null,"serviceAreas":[],"tone":null,"voiceGuidance":null,"preferredPhrases":[],"bannedPhrases":[],"services":[],"proofPoints":[],"brandColors":[{"hex":"#C8A24B","label":"Primary","source":"file"}],"disallowedClaims":[],"complianceNotes":null},"nodes":[{"kind":"brand_fact|messaging_angle|proof_point|cta|persona","label":"short fact","body":"supporting detail","summary":"optional short summary","confidence":80,"tags":["brand"]}]}',
    "Keep it conservative. Do not invent claims. If the source is weak, return an empty nodes array.",
    "Use profile for editable Brand details: company, voice, offerings, proof, and rules.",
    "Use persona nodes for audience/persona definitions, motivations, objections, decision triggers, and preferred messages found in the source.",
    "For logos, photos, moodboards, and reference media, extract visual themes, colors, typography cues, logo usage, style rules, and brand-safe visual guidance.",
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
  return (await extractBrandKnowledgeBundleWithGemini(asset, deps)).nodes;
}

export async function extractBrandKnowledgeBundleWithGemini(
  asset: BrandKnowledgeAsset,
  deps: GeminiDeps = {},
): Promise<BrandKnowledgeExtraction> {
  if (!asset.availableToArc) return { nodes: [], profile: null };
  if (!asset.extractedText?.trim() && !asset.fileBytes) return { nodes: [], profile: null };

  const prompt = buildPrompt(asset);
  const text = deps.generateText ? await deps.generateText(prompt, asset) : await callGemini(prompt, asset, deps);
  return toBrandKnowledgeExtraction(asset, parseBrandKnowledgeExtractionJson(text));
}
