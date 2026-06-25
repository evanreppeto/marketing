import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import { resolveFontRole, type BrandTokens } from "@/domain";

/** A font entry in the shape `ImageResponse` expects. */
export type LoadedFont = { name: string; data: Buffer; weight: 400 | 700; style: "normal" };

/** Read a bundled font. `new URL(..., import.meta.url)` lets Next's file tracer
 *  bundle the `.ttf` for the route at build time (a bare cwd path would not be traced). */
async function readFont(relative: string): Promise<Buffer> {
  return readFile(fileURLToPath(new URL(`./fonts/${relative}`, import.meta.url)));
}

/**
 * Load two logical families — "Heading" (700) and "Body" (400) — choosing the
 * bundled sans or serif file per the brand's requested fonts. Templates always
 * reference fontFamily "Heading" / "Body".
 */
export async function loadCreativeFonts(brand: BrandTokens): Promise<LoadedFont[]> {
  const headingFile = resolveFontRole(brand.headingFont) === "serif" ? "Serif-Bold.ttf" : "Inter-Bold.ttf";
  const bodyFile = resolveFontRole(brand.bodyFont) === "serif" ? "Serif-Regular.ttf" : "Inter-Regular.ttf";
  return [
    { name: "Heading", data: await readFont(headingFile), weight: 700, style: "normal" },
    { name: "Body", data: await readFont(bodyFile), weight: 400, style: "normal" },
  ];
}
