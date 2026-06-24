"use client";

import { useState } from "react";
import { FileUp, MessagesSquare } from "lucide-react";

import { cx } from "@/app/_components/theme";
import { BrandSourceUpload } from "./brand-source-upload";
import { BrandArcChat } from "./brand-arc-chat";

type Mode = "upload" | "chat";

export function TeachArc({ agentName }: { agentName: string }) {
  const [mode, setMode] = useState<Mode>("upload");
  return (
    <section aria-labelledby="teach-arc-heading">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-bold tracking-[-0.02em] text-[var(--text-primary)]" id="teach-arc-heading">
          Teach {agentName}
        </h2>
        <div className="inline-flex rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-inset)] p-1">
          {([["upload", "Upload & links", FileUp], ["chat", "Chat", MessagesSquare]] as const).map(([value, label, Icon]) => (
            <button
              aria-pressed={mode === value}
              className={cx(
                "inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-semibold transition",
                mode === value ? "bg-[var(--surface-panel)] text-[var(--text-primary)] shadow-[var(--elev-panel)]" : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]",
              )}
              key={value}
              onClick={() => setMode(value)}
              type="button"
            >
              <Icon aria-hidden className="h-4 w-4" />
              {label}
            </button>
          ))}
        </div>
      </div>
      {mode === "upload" ? (
        <div className="overflow-hidden rounded-lg border border-[var(--accent-border)] bg-[var(--surface-panel)]">
          <BrandSourceUpload placement="hero" />
        </div>
      ) : (
        <BrandArcChat agentName={agentName} />
      )}
    </section>
  );
}
