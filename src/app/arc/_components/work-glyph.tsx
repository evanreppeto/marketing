import type { ReactNode } from "react";

import type { ArcStepKind } from "@/domain";

/** One inline glyph per Arc work-type. Stroke uses currentColor so callers set
 *  the tone (muted by default, accent when live). */
const GLYPHS: Record<ArcStepKind, ReactNode> = {
  search: (
    <>
      <circle cx="9" cy="9" r="5.5" />
      <path d="m17 17-3.5-3.5" />
    </>
  ),
  match: (
    <path d="M10 2.5c.4 3.2 1.4 4.2 4.6 4.6-3.2.4-4.2 1.4-4.6 4.6-.4-3.2-1.4-4.2-4.6-4.6 3.2-.4 4.2-1.4 4.6-4.6Z" />
  ),
  draft: (
    <>
      <path d="M4 16l1-4 8-8 3 3-8 8z" />
      <path d="M12.5 5.5l2 2" />
    </>
  ),
  media: (
    <>
      <rect x="3" y="4.5" width="14" height="11" rx="2" />
      <circle cx="7.5" cy="8.5" r="1.4" />
      <path d="M4 13.5l4-3.5 3 2.5 2-2 4 3.5" />
    </>
  ),
  tool: (
    <>
      <path d="M14 7H4" />
      <path d="M16 13H6" />
      <circle cx="16" cy="7" r="2.3" />
      <circle cx="8" cy="13" r="2.3" />
    </>
  ),
  think: <circle cx="10" cy="10" r="2.6" />,
};

export function WorkGlyph({ kind, className }: { kind: ArcStepKind; className?: string }) {
  return (
    <svg
      viewBox="0 0 20 20"
      aria-hidden
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {GLYPHS[kind]}
    </svg>
  );
}
