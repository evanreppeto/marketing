import Link from "next/link";
import ReactArcdown from "react-markdown";
import remarkGfm from "remark-gfm";

import { toRenderableArcdown, type LinkResolutionContext } from "@/domain";

export function NoteBody({ body, ctx }: { body: string; ctx: LinkResolutionContext }) {
  const markdown = toRenderableArcdown(body, ctx);

  return (
    <div className="prose-vault max-w-none text-sm leading-7 text-[var(--text-secondary)]">
      <ReactArcdown
        remarkPlugins={[remarkGfm]}
        components={{
          a({ href, children }) {
            const target = href ?? "";
            if (target.startsWith("unresolved:")) {
              return (
                <span
                  className="cursor-default text-[var(--text-muted)] underline decoration-dotted underline-offset-2"
                  title="Not imported yet"
                >
                  {children}
                </span>
              );
            }
            if (target.startsWith("/")) {
              return (
                <Link className="font-semibold text-[var(--accent)] underline-offset-2 hover:underline" href={target}>
                  {children}
                </Link>
              );
            }
            return (
              <a className="font-semibold text-[var(--accent)] underline-offset-2 hover:underline" href={target} rel="noreferrer" target="_blank">
                {children}
              </a>
            );
          },
          h1: ({ children }) => <h1 className="mt-0 mb-3 font-display text-2xl font-bold tracking-[-0.02em] text-[var(--text-primary)]">{children}</h1>,
          h2: ({ children }) => <h2 className="mt-6 mb-2 font-display text-lg font-semibold text-[var(--text-primary)]">{children}</h2>,
          ul: ({ children }) => <ul className="my-3 list-disc space-y-1 pl-5">{children}</ul>,
          ol: ({ children }) => <ol className="my-3 list-decimal space-y-1 pl-5">{children}</ol>,
          p: ({ children }) => <p className="my-3">{children}</p>,
          code: ({ children }) => <code className="rounded bg-[var(--surface-inset)] px-1.5 py-0.5 text-[0.85em] text-[var(--text-primary)]">{children}</code>,
        }}
      >
        {markdown}
      </ReactArcdown>
    </div>
  );
}
