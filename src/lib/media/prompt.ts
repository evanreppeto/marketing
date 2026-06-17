/**
 * Prompt hardening for AI image generation — business-agnostic, applied to every
 * tenant. Two universal problems with raw image prompts: (1) models invent text,
 * logos, watermarks, and fake brand signage that can't be trusted and look wrong;
 * (2) bare prompts drift toward staged, low-quality output. We always strip the
 * former and nudge quality, while leaving the creative direction (medium, mood) to
 * the caller via an optional `style` so this works for any industry, not just one.
 */

/** Never let the model render text/branding into the pixels — it's unreliable and
 *  real logos/copy get composited in design, not generated. Universal. */
const NO_TEXT_DIRECTIVE =
  "Do not render any text, words, letters, captions, headlines, logos, watermarks, signage, or brand names anywhere in the image.";

/** Generic, medium-neutral quality nudge (works for photo, illustration, 3D, etc.). */
const QUALITY_DIRECTIVE = "High-quality, clean, professional composition.";

export type HardenImageOptions = {
  /** Caller-chosen visual direction, e.g. "candid documentary photograph, natural lighting".
   *  Left to the agent/tenant so this stays business-agnostic. */
  style?: string;
};

/** Compose the final prompt sent to the provider: the caller's intent + an optional
 *  style + the universal no-text and quality directives. */
export function hardenImagePrompt(prompt: string, opts: HardenImageOptions = {}): string {
  const style = opts.style?.trim();
  return [prompt.trim(), style ? `Style: ${style}.` : "", NO_TEXT_DIRECTIVE, QUALITY_DIRECTIVE]
    .filter(Boolean)
    .join("\n\n");
}
