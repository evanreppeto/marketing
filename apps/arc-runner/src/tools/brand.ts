import { tool } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";

import type { ArcClient } from "../arc-client";
import type { ArcActionCard } from "../types";
import { runTool, textResult, type StepFn } from "./helpers";

/**
 * Brand-learning tools (draft mode). `analyze_website` reads a public site for
 * brand signal; `propose_brand_profile` writes a DRAFT business profile and
 * surfaces a review card. Arc never activates a profile — the operator does that
 * in Settings. Read + draft only; nothing goes outbound.
 */
export function brandTools(client: ArcClient, step: StepFn, collectCard: (card: ArcActionCard) => void) {
  const analyzeWebsite = tool(
    "analyze_website",
    "Fetch a company's public website and extract brand signal (title, description, favicon, readable text) so you can learn their brand. Use when the operator gives you a URL or asks you to learn/onboard a brand. Read-only and safe. After reading, ask 1-3 short follow-up questions for anything the site didn't cover (personas, banned phrases, compliance limits), then call propose_brand_profile.",
    { url: z.string().describe("The company's website URL (http or https).") },
    async (args) =>
      runTool(step, "Reading website", () =>
        client.apiPost("/api/v1/arc/brand/analyze-website", { url: args.url }),
      ),
  );

  const analyzeBrandDesign = tool(
    "analyze_brand_design",
    "Fetch a company's public website and detect their visual brand design — best logo candidate, brand colors (as hex), and heading/body fonts. Use when the operator asks you to pull or match their brand look from their site. Read-only and safe. After calling it, pass the palette + fonts (and logoUrl) into propose_brand_profile so the operator can review and activate them.",
    { url: z.string().describe("The company's website URL (http or https).") },
    async (args) =>
      runTool(step, "Reading brand design", () =>
        client.apiPost("/api/v1/arc/brand/design", { url: args.url }),
      ),
  );

  const proposeBrandProfile = tool(
    "propose_brand_profile",
    "Save a DRAFT brand profile for the operator to review and activate. Provide every field you can infer from the website + the operator's answers. You CANNOT activate it — say so, and tell the operator to review and switch it to Active in Settings. Do not include any status field; it is always saved as a draft.",
    {
      displayName: z.string().describe("The business name."),
      tagline: z.string().optional(),
      description: z.string().optional(),
      industry: z.string().optional(),
      websiteUrl: z.string().optional(),
      logoUrl: z.string().optional(),
      faviconUrl: z.string().optional(),
      accent: z.string().optional().describe("Brand accent color, hex (e.g. #C8A24B)."),
      brandPalette: z
        .object({
          primary: z.string().optional(),
          secondary: z.string().optional(),
          accent: z.string().optional(),
          dark: z.string().optional(),
          light: z.string().optional(),
        })
        .optional()
        .describe("Brand colors as 6-digit hex (e.g. #C8A24B)."),
      headingFont: z.string().optional().describe("Heading font family name."),
      bodyFont: z.string().optional().describe("Body font family name."),
      tone: z.string().optional().describe("Brand voice tone, e.g. 'calm, expert'."),
      voiceGuidance: z.string().optional(),
      services: z.array(z.string()).optional(),
      serviceAreas: z.array(z.string()).optional(),
      preferredPhrases: z.array(z.string()).optional(),
      bannedPhrases: z.array(z.string()).optional(),
      proofPoints: z
        .array(z.object({ kind: z.enum(["testimonial", "certification", "stat"]), label: z.string(), detail: z.string().optional() }))
        .optional(),
      guardrails: z
        .object({ disallowedClaims: z.array(z.string()).optional(), complianceNotes: z.string().optional() })
        .optional(),
    },
    async (args) => {
      const label = "Proposing brand profile";
      await step(label, "running");
      try {
        await client.apiPut("/api/v1/arc/brand/profile", { ...args });
        await step(label, "done");
        const rows = [
          { name: "Name", meta: args.displayName },
          ...(args.tone ? [{ name: "Tone", meta: args.tone }] : []),
          ...(args.services?.length ? [{ name: "Services", meta: args.services.join(", ") }] : []),
          ...(args.bannedPhrases?.length ? [{ name: "Never use", meta: args.bannedPhrases.join(", ") }] : []),
        ];
        collectCard({
          kind: "draft",
          title: `Proposed Brand Kit: ${args.displayName}`,
          rows,
          flags: [{ tone: "warn", label: "Draft — review & activate in Settings" }],
          href: "/settings",
        });
        return textResult(
          JSON.stringify({ status: "draft saved", note: "Tell the operator to review and activate it in Settings — you cannot activate it yourself." }),
        );
      } catch (error) {
        await step(label, "done");
        return textResult(`${label} failed: ${error instanceof Error ? error.message : "unknown error"}`);
      }
    },
  );

  return [analyzeWebsite, analyzeBrandDesign, proposeBrandProfile];
}
