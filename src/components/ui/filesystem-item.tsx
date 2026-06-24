"use client";

import Link from "next/link";
import { type CSSProperties, useState } from "react";
import { ChevronRight, File, Folder } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";

import { cn } from "@/lib/utils";

export type FilesystemNode = {
  id: string;
  name: string;
  kind: "folder" | "file";
  href?: string;
  count?: number;
  directCount?: number;
  meta?: string;
  accent?: string;
  soft?: string;
  border?: string;
  isActive?: boolean;
  defaultOpen?: boolean;
  description?: string;
  nodes?: FilesystemNode[];
};

interface FilesystemItemProps {
  node: FilesystemNode;
  animated?: boolean;
  depth?: number;
}

export function FilesystemItem({ node, animated = false, depth = 0 }: FilesystemItemProps) {
  const hasChildren = Boolean(node.nodes?.length);
  const [isOpen, setIsOpen] = useState(Boolean(node.defaultOpen));
  const style = {
    "--folder-accent": node.accent ?? "#9CA3AF",
    "--folder-soft": node.soft ?? "rgba(156, 163, 175, 0.12)",
    "--folder-border": node.border ?? "rgba(156, 163, 175, 0.24)",
  } as CSSProperties;

  const label = (
    <span
      className={cn(
        "group flex min-w-0 flex-1 items-center gap-2 rounded-md px-1.5 py-1 text-left text-sm transition",
        node.isActive
          ? "text-[var(--text-primary)]"
          : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]",
      )}
    >
      <span
        className={cn(
          "inline-flex h-7 w-7 shrink-0 items-center justify-center",
          node.kind === "folder" ? "text-[var(--folder-accent)]" : "text-[var(--text-muted)]",
        )}
      >
        {node.kind === "folder" ? (
          <Folder className="size-5 stroke-[2.1]" />
        ) : (
          <File className="size-4 stroke-[1.8]" />
        )}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate font-medium leading-5" title={node.description ?? undefined}>{node.name}</span>
        {node.meta ? <span className="block truncate text-[10.5px] leading-3 text-[var(--text-muted)]">{node.meta}</span> : null}
      </span>
      {typeof node.count === "number" ? (
        <span className="inline-flex min-w-7 justify-center rounded-full px-2 py-0.5 text-xs font-semibold text-[var(--text-muted)] group-hover:text-[var(--text-primary)]">
          {node.count}
        </span>
      ) : null}
    </span>
  );

  const children = node.nodes?.map((child) => (
    <FilesystemItem animated={animated} depth={depth + 1} key={child.id} node={child} />
  ));

  return (
    <li style={style}>
      <div className="flex items-start gap-1" style={{ paddingLeft: `${depth * 16}px` }}>
        {hasChildren ? (
          <button
            type="button"
            aria-label={isOpen ? `Collapse ${node.name}` : `Expand ${node.name}`}
            aria-expanded={isOpen}
            onClick={() => setIsOpen((open) => !open)}
            className="mt-0.5 inline-flex size-7 shrink-0 items-center justify-center rounded-md text-[var(--text-muted)] transition hover:text-[var(--folder-accent)]"
          >
            {animated ? (
              <motion.span
                animate={{ rotate: isOpen ? 90 : 0 }}
                transition={{ type: "spring", bounce: 0, duration: 0.28 }}
                className="flex"
              >
                <ChevronRight className="size-4" />
              </motion.span>
            ) : (
              <ChevronRight className={cn("size-4 transition-transform", isOpen ? "rotate-90" : "")} />
            )}
          </button>
        ) : (
          <span aria-hidden className="size-7 shrink-0" />
        )}

        {node.href ? (
          <Link href={node.href} aria-current={node.isActive ? "page" : undefined} className="min-w-0 flex-1">
            {label}
          </Link>
        ) : (
          <span className="min-w-0 flex-1">{label}</span>
        )}
      </div>

      {animated ? (
        <AnimatePresence initial={false}>
          {isOpen && children?.length ? (
            <motion.ul
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ type: "spring", bounce: 0, duration: 0.28 }}
              className="mt-1 space-y-1 overflow-hidden"
            >
              {children}
            </motion.ul>
          ) : null}
        </AnimatePresence>
      ) : isOpen && children?.length ? (
        <ul className="mt-1 space-y-1">{children}</ul>
      ) : null}
    </li>
  );
}
