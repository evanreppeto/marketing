import { type MediaKind } from "@/domain";

export type BrandSourceCategory =
  | "brand_guidelines"
  | "voice_messaging"
  | "proof"
  | "offerings"
  | "visual_identity"
  | "company_profile"
  | "source_document";

export type BrandSourceConfidence = "high" | "medium" | "low";

export type BrandSourceClassification = {
  category: BrandSourceCategory;
  label: string;
  confidence: BrandSourceConfidence;
  reason: string;
};

type BrandSourceCandidate = {
  fileName: string;
  kind: MediaKind;
  source: string;
  tags?: string[];
};

const RULES: Array<{
  category: BrandSourceCategory;
  label: string;
  keywords: string[];
}> = [
  {
    category: "brand_guidelines",
    label: "Brand guide",
    keywords: ["brand guide", "brand guidelines", "brand book", "brand kit", "brand standards", "style guide"],
  },
  {
    category: "voice_messaging",
    label: "Voice and messaging",
    keywords: ["voice", "tone", "messaging", "positioning", "tagline", "copy guide", "message house"],
  },
  {
    category: "proof",
    label: "Proof source",
    keywords: [
      "case study",
      "case studies",
      "testimonial",
      "testimonials",
      "review",
      "reviews",
      "proof",
      "results",
      "certification",
      "certifications",
      "credential",
      "credentials",
      "award",
      "awards",
    ],
  },
  {
    category: "offerings",
    label: "Offerings source",
    keywords: ["capabilities", "one pager", "one-pager", "services", "products", "offers", "pricing", "menu", "catalog"],
  },
  {
    category: "visual_identity",
    label: "Visual identity",
    keywords: ["logo", "logos", "colors", "color palette", "typography", "font", "visual identity", "identity"],
  },
  {
    category: "company_profile",
    label: "Company profile",
    keywords: ["about", "company", "overview", "profile", "boilerplate", "faq", "factsheet", "fact sheet"],
  },
];

function normalizeTitle(value: string) {
  return value
    .replace(/\.[a-z0-9]{2,8}$/i, "")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function hasKeyword(text: string, keyword: string) {
  const normalized = normalizeTitle(keyword);
  return new RegExp(`(^|\\b)${normalized.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(\\b|$)`, "i").test(text);
}

export function classifyBrandSource(candidate: BrandSourceCandidate): BrandSourceClassification {
  const title = normalizeTitle(candidate.fileName);
  const tags = (candidate.tags ?? []).map(normalizeTitle).join(" ");
  const searchable = `${title} ${tags}`.trim();

  for (const rule of RULES) {
    if (rule.keywords.some((keyword) => hasKeyword(searchable, keyword))) {
      return {
        category: rule.category,
        label: rule.label,
        confidence: "high",
        reason: `Matched "${rule.label.toLowerCase()}" language in the title or tags.`,
      };
    }
  }

  if (candidate.source === "google_drive" || candidate.kind === "document") {
    return {
      category: "source_document",
      label: "Source document",
      confidence: "medium",
      reason: "Imported as a document or Drive file; review the title to confirm the brand role.",
    };
  }

  return {
    category: "source_document",
    label: "Reference asset",
    confidence: "low",
    reason: "No brand-specific title signal yet.",
  };
}

export function brandSourceSortScore(classification: BrandSourceClassification, availableToArc: boolean) {
  const confidenceScore = classification.confidence === "high" ? 0 : classification.confidence === "medium" ? 1 : 2;
  return confidenceScore * 10 + (availableToArc ? 0 : 1);
}
