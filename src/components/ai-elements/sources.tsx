"use client";

import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";
import { ChevronDownIcon } from "lucide-react";
import type { ComponentProps } from "react";

// AI Elements `sources`, rethemed onto the Signal (Command Charcoal) tokens so
// it sits cohesively in the Mark chat surface instead of the shadcn neutral
// palette. API is unchanged (drop-in), only the default classNames differ.

export type SourcesProps = ComponentProps<typeof Collapsible>;

export const Sources = ({ className, ...props }: SourcesProps) => (
  <Collapsible className={cn("not-prose", className)} {...props} />
);

export type SourcesTriggerProps = ComponentProps<typeof CollapsibleTrigger> & {
  count: number;
};

export const SourcesTrigger = ({
  className,
  count,
  children,
  ...props
}: SourcesTriggerProps) => (
  <CollapsibleTrigger
    className={cn(
      "group flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--text-muted)] transition hover:text-[var(--text-secondary)]",
      className
    )}
    {...props}
  >
    {children ?? (
      <>
        <span>{count} sources</span>
        <ChevronDownIcon className="h-3 w-3 text-[var(--text-muted)] transition-transform group-data-[state=open]:rotate-180" />
      </>
    )}
  </CollapsibleTrigger>
);

export type SourcesContentProps = ComponentProps<typeof CollapsibleContent>;

export const SourcesContent = ({
  className,
  ...props
}: SourcesContentProps) => (
  <CollapsibleContent
    className={cn(
      "mt-2 flex flex-wrap gap-1.5",
      "data-[state=closed]:fade-out-0 data-[state=closed]:slide-out-to-top-1 data-[state=open]:slide-in-from-top-1 outline-none data-[state=closed]:animate-out data-[state=open]:animate-in",
      className
    )}
    {...props}
  />
);

export type SourceProps = ComponentProps<"a">;

export const Source = ({ href, title, children, className, ...props }: SourceProps) => (
  <a
    className={cn(
      "inline-flex items-center gap-1 rounded-md bg-[var(--surface-inset)] px-2 py-0.5 text-xs font-medium text-[var(--text-secondary)] shadow-[inset_0_0_0_1px_var(--border-strong)] transition hover:text-[var(--accent)]",
      className
    )}
    href={href}
    rel="noreferrer"
    target="_blank"
    {...props}
  >
    {children ?? <span className="block">{title}</span>}
  </a>
);
