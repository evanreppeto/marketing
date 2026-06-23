/**
 * Conservative cleanup of Arc's streamed reply body before markdown rendering.
 * The runner sometimes concatenates a preamble and a result with no break
 * ("…in parallel.Excellent!"), which renders as one undifferentiated wall. We
 * repair only an unambiguous run-on — a sentence-ender directly followed by an
 * uppercase letter, with a lowercase/digit before it — and never touch code,
 * decimals, or uppercase abbreviations. Idempotent.
 */

// lowercase/digit + sentence-ender + uppercase, with NO whitespace between.
const SENTENCE_RUNON = /([a-z0-9])([.!?])([A-Z])/g;

function repairProse(segment: string): string {
  return segment.replace(SENTENCE_RUNON, "$1$2\n\n$3");
}

export function normalizeArcBody(text: string): string {
  if (!text) return text;
  // Protect fenced code blocks (odd segments), then inline code, transforming
  // only the prose in between.
  const out = text
    .split(/(```[\s\S]*?```)/)
    .map((block, i) => {
      if (i % 2 === 1) return block; // fenced code — leave verbatim
      return block
        .split(/(`[^`]*`)/)
        .map((seg, j) => (j % 2 === 1 ? seg : repairProse(seg)))
        .join("");
    })
    .join("");
  // Tidy any excessive blank runs down to a single paragraph break.
  return out.replace(/\n{3,}/g, "\n\n");
}
