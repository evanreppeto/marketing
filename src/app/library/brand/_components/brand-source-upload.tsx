"use client";

import { useActionState, useRef, useState } from "react";
import Link from "next/link";
import {
  BookOpenCheck,
  CheckCircle2,
  ClipboardCheck,
  FileText,
  FileUp,
  Globe2,
  Link2,
  MessageSquareText,
  RefreshCw,
  Send,
  Sparkles,
  TriangleAlert,
  UploadCloud,
} from "lucide-react";

import { buttonClasses, StatusPill } from "@/app/_components/page-header";
import { cx } from "@/app/_components/theme";
import {
  importAndAnalyzeBrandNotesAction,
  importAndAnalyzeBrandUrlAction,
  importAndAnalyzeBrandWebsiteAction,
  type BrandNotesActionState,
  type BrandUploadActionState,
  type BrandUrlImportActionState,
  type BrandWebsiteImportActionState,
  uploadAndAnalyzeBrandSourcesAction,
} from "@/app/library/brand/actions";

type IntakeMode = "chat" | "upload" | "website" | "review";

const initialState: BrandUploadActionState = null;
const initialNotesState: BrandNotesActionState = null;
const initialUrlState: BrandUrlImportActionState = null;
const initialWebsiteState: BrandWebsiteImportActionState = null;

const intakeModes: Array<{
  id: IntakeMode;
  label: string;
  detail: string;
  icon: React.ReactNode;
}> = [
  {
    id: "chat",
    label: "Talk",
    detail: "Paste messy brand context.",
    icon: <MessageSquareText aria-hidden />,
  },
  {
    id: "upload",
    label: "Files",
    detail: "Brand docs, logos, proof.",
    icon: <UploadCloud aria-hidden />,
  },
  {
    id: "website",
    label: "Website",
    detail: "Import URLs or key pages.",
    icon: <Globe2 aria-hidden />,
  },
  {
    id: "review",
    label: "Review",
    detail: "Approve what Arc learned.",
    icon: <ClipboardCheck aria-hidden />,
  },
];

function resultTone(state: BrandUploadActionState) {
  if (!state) return "gray";
  return state.ok ? "green" : "red";
}

export function BrandSourceUpload({ placement = "inline" }: { placement?: "hero" | "inline" }) {
  const [activeMode, setActiveMode] = useState<IntakeMode>("chat");
  const [notesState, notesAction, notesPending] = useActionState(importAndAnalyzeBrandNotesAction, initialNotesState);
  const [state, action, pending] = useActionState(uploadAndAnalyzeBrandSourcesAction, initialState);
  const [urlState, urlAction, urlPending] = useActionState(importAndAnalyzeBrandUrlAction, initialUrlState);
  const [websiteState, websiteAction, websitePending] = useActionState(importAndAnalyzeBrandWebsiteAction, initialWebsiteState);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [selectedFiles, setSelectedFiles] = useState<string[]>([]);
  const isHero = placement === "hero";
  const hasFiles = selectedFiles.length > 0;
  const buttonLabel = pending ? "Analyzing..." : hasFiles ? "Upload and analyze" : "Choose files";
  const selectedLabel =
    selectedFiles.length === 0
      ? null
      : selectedFiles.length === 1
        ? selectedFiles[0]
        : `${selectedFiles.length} files selected`;

  function handlePrimaryClick() {
    if (!hasFiles) inputRef.current?.click();
  }

  return (
    <section
      className={cx(
        "relative overflow-hidden bg-[linear-gradient(180deg,color-mix(in_srgb,var(--surface-panel)_96%,transparent),color-mix(in_srgb,var(--surface-inset)_88%,transparent))]",
        isHero ? "self-start p-5 sm:p-6" : "border-b border-[var(--border-hairline)] p-5",
      )}
    >
      <div aria-hidden className="absolute inset-x-6 top-0 h-px bg-[linear-gradient(90deg,transparent,color-mix(in_srgb,var(--accent)_72%,transparent),transparent)]" />
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="signal-eyebrow">Brand intake</div>
          <h3 className="mt-1 text-xl font-bold tracking-[-0.02em] text-[var(--text-primary)]">Teach Arc from source material</h3>
          <p className="mt-2 max-w-[72ch] text-sm leading-6 text-[var(--text-secondary)]">
            Start by telling Arc what matters, then attach the files and websites that prove it.
          </p>
        </div>
        <div className="inline-flex w-fit items-center gap-2 rounded-full border border-[var(--accent-border)] bg-[var(--surface-inset)] px-3.5 py-2 text-xs font-semibold text-[var(--accent-contrast)] shadow-[inset_0_1px_0_rgba(255,255,255,0.055)]">
          <Sparkles aria-hidden className="h-4 w-4" />
          Guided intake
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(16rem,0.55fr)_minmax(0,1fr)]">
        <div className="grid content-start gap-2 rounded-[14px] border border-[var(--border-hairline)] bg-[color-mix(in_srgb,var(--surface-inset)_68%,transparent)] p-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
          {intakeModes.map((mode) => (
            <button
              aria-pressed={activeMode === mode.id}
              className={cx(
                "group flex w-full items-start gap-3 rounded-[10px] border px-3 py-3 text-left transition duration-200 ease-out active:scale-[0.99]",
                activeMode === mode.id
                  ? "border-[var(--accent-border)] bg-[var(--surface-panel)] text-[var(--text-primary)] shadow-[var(--elev-panel)]"
                  : "border-transparent text-[var(--text-secondary)] hover:border-[var(--border-hairline)] hover:bg-[var(--surface-soft)] hover:text-[var(--text-primary)]",
              )}
              key={mode.id}
              onClick={() => setActiveMode(mode.id)}
              type="button"
            >
              <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-[9px] border border-[var(--border-hairline)] bg-[var(--surface-inset)] text-[var(--accent)] [&>svg]:h-4 [&>svg]:w-4">
                {mode.icon}
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-bold">{mode.label}</span>
                <span className="mt-0.5 block text-xs leading-5 text-[var(--text-muted)]">{mode.detail}</span>
              </span>
            </button>
          ))}
        </div>

        <div className="min-w-0 rounded-[14px] border border-[var(--border-hairline)] bg-[color-mix(in_srgb,var(--surface-inset)_72%,transparent)] p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] sm:p-5">
          {activeMode === "chat" ? <NotesMode action={notesAction} pending={notesPending} state={notesState} /> : null}
          {activeMode === "upload" ? (
            <UploadMode
              action={action}
              buttonLabel={buttonLabel}
              hasFiles={hasFiles}
              inputRef={inputRef}
              onPrimaryClick={handlePrimaryClick}
              pending={pending}
              selectedLabel={selectedLabel}
              setSelectedFiles={setSelectedFiles}
              state={state}
            />
          ) : null}
          {activeMode === "website" ? (
            <WebsiteMode
              urlAction={urlAction}
              urlPending={urlPending}
              urlState={urlState}
              websiteAction={websiteAction}
              websitePending={websitePending}
              websiteState={websiteState}
            />
          ) : null}
          {activeMode === "review" ? <ReviewMode /> : null}
        </div>
      </div>
    </section>
  );
}

function NotesMode({
  action,
  pending,
  state,
}: {
  action: (formData: FormData) => void;
  pending: boolean;
  state: BrandNotesActionState;
}) {
  return (
    <form action={action} className="grid gap-4">
      <div>
        <div className="signal-eyebrow">Talk to Arc</div>
        <h4 className="mt-1 text-lg font-bold tracking-[-0.02em] text-[var(--text-primary)]">Tell Arc everything messy</h4>
        <p className="mt-1 text-sm leading-6 text-[var(--text-secondary)]">
          Paste positioning, personas, ideals, proof, claims to avoid, tone notes, services, or anything a brand guide would normally cover.
        </p>
      </div>
      <label className="grid gap-2" htmlFor="brand-intake-notes">
        <span className="text-sm font-bold text-[var(--text-primary)]">Brand context</span>
        <textarea
          className="min-h-56 w-full resize-y rounded-[12px] border border-[var(--border-hairline)] bg-[var(--surface-soft)] px-3.5 py-3 text-sm leading-6 text-[var(--text-primary)] outline-none transition placeholder:text-[var(--text-muted)] focus:border-[var(--accent)] focus:ring-4 focus:ring-[var(--accent-soft)]"
          id="brand-intake-notes"
          name="brandNotes"
          placeholder="Example: We help homeowners after water damage. Our tone is calm and direct. Main personas are stressed homeowners and insurance adjusters. Avoid guaranteed outcome language. Proof: licensed team, 24/7 response, insurance documentation."
        />
      </label>
      <div className="grid gap-2 sm:grid-cols-4">
        {["Personas", "Voice", "Proof", "Rules"].map((item) => (
          <span
            className="rounded-md border border-[var(--border-hairline)] bg-[var(--surface-soft)] px-2 py-1.5 text-center text-[10px] font-semibold uppercase tracking-[0.1em] text-[var(--text-muted)]"
            key={item}
          >
            {item}
          </span>
        ))}
      </div>
      <button className={buttonClasses({ variant: "primary", size: "sm", className: "min-h-11 justify-center px-5" })} disabled={pending} type="submit">
        {pending ? <RefreshCw aria-hidden className="h-4 w-4 animate-spin" /> : <Send aria-hidden className="h-4 w-4" />}
        {pending ? "Reading notes..." : "Save notes to Brand"}
      </button>
      {state ? <ResultPanel state={state} /> : null}
    </form>
  );
}

function UploadMode({
  action,
  buttonLabel,
  hasFiles,
  inputRef,
  onPrimaryClick,
  pending,
  selectedLabel,
  setSelectedFiles,
  state,
}: {
  action: (formData: FormData) => void;
  buttonLabel: string;
  hasFiles: boolean;
  inputRef: React.RefObject<HTMLInputElement | null>;
  onPrimaryClick: () => void;
  pending: boolean;
  selectedLabel: string | null;
  setSelectedFiles: (value: string[]) => void;
  state: BrandUploadActionState;
}) {
  return (
    <form action={action} className="grid gap-3.5">
      <label className="group relative grid min-h-[18rem] cursor-pointer place-items-center overflow-hidden rounded-[14px] border border-dashed border-[var(--accent-border-strong)] bg-[linear-gradient(180deg,color-mix(in_srgb,var(--accent-soft)_26%,var(--surface-soft)),var(--surface-inset))] p-6 text-center shadow-[inset_0_1px_0_rgba(255,255,255,0.055)] transition duration-200 ease-out hover:-translate-y-0.5 hover:border-[var(--accent)] hover:bg-[linear-gradient(180deg,color-mix(in_srgb,var(--accent-soft)_36%,var(--surface-soft)),var(--surface-inset))] sm:min-h-[20rem] sm:p-7">
        <span className="absolute inset-x-8 top-0 h-px bg-[linear-gradient(90deg,transparent,var(--accent),transparent)]" />
        <span className="flex h-16 w-16 items-center justify-center rounded-[14px] border border-[var(--accent-border)] bg-[var(--surface-panel)] text-[var(--accent)] shadow-[var(--elev-panel)] transition duration-200 ease-out group-hover:-translate-y-1">
          <UploadCloud aria-hidden className="h-6 w-6" />
        </span>
        <span className="mt-5 block text-lg font-bold tracking-[-0.01em] text-[var(--text-primary)]">Upload brand files</span>
        <span className="mt-2 block max-w-[42ch] text-sm leading-6 text-[var(--text-secondary)]">
          Brand guides, voice docs, offerings, proof, rules, logos, photos, moodboards, or reference media.
        </span>
        <span className="mt-5 inline-flex max-w-full items-center gap-2 rounded-full border border-[var(--border-hairline)] bg-[var(--surface-panel)] px-3.5 py-2 text-xs font-bold text-[var(--text-primary)] shadow-[inset_0_1px_0_rgba(255,255,255,0.045)]">
          <FileText aria-hidden className="h-4 w-4 text-[var(--accent)]" />
          <span className="truncate">{selectedLabel || "Attach files"}</span>
        </span>
        <input
          accept="application/pdf,image/*,image/svg+xml,.svg,.ico"
          className="sr-only"
          multiple
          name="files"
          onChange={(event) => {
            setSelectedFiles(Array.from(event.currentTarget.files ?? []).map((file) => file.name));
          }}
          ref={inputRef}
          type="file"
        />
      </label>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {["Docs", "Images", "Logos", "Proof"].map((item) => (
          <span
            className="rounded-md border border-[var(--border-hairline)] bg-[var(--surface-inset)] px-2 py-1.5 text-center text-[10px] font-semibold uppercase tracking-[0.1em] text-[var(--text-muted)]"
            key={item}
          >
            {item}
          </span>
        ))}
      </div>
      <button
        className={buttonClasses({ variant: "primary", size: "sm", className: "min-h-11 justify-center px-5" })}
        disabled={pending}
        onClick={onPrimaryClick}
        type={hasFiles ? "submit" : "button"}
      >
        {pending ? <RefreshCw aria-hidden className="h-4 w-4 animate-spin" /> : <FileUp aria-hidden className="h-4 w-4" />}
        {buttonLabel}
      </button>
      {state ? <ResultPanel state={state} /> : null}
    </form>
  );
}

function WebsiteMode({
  urlAction,
  urlPending,
  urlState,
  websiteAction,
  websitePending,
  websiteState,
}: {
  urlAction: (formData: FormData) => void;
  urlPending: boolean;
  urlState: BrandUrlImportActionState;
  websiteAction: (formData: FormData) => void;
  websitePending: boolean;
  websiteState: BrandWebsiteImportActionState;
}) {
  return (
    <div className="grid gap-4">
      <form action={urlAction} className="grid gap-3 rounded-[12px] border border-[var(--border-hairline)] bg-[var(--surface-soft)] p-4">
        <label className="grid min-w-0 gap-2">
          <span className="flex items-center gap-2 text-sm font-bold text-[var(--text-primary)]">
            <Link2 aria-hidden className="h-4 w-4 text-[var(--accent)]" />
            Add single page
          </span>
          <input
            className="min-h-11 rounded-[10px] border border-[var(--border-hairline)] bg-[var(--surface-inset)] px-3.5 text-sm text-[var(--text-primary)] outline-none transition placeholder:text-[var(--text-muted)] focus:border-[var(--accent)] focus:ring-4 focus:ring-[var(--accent-soft)]"
            name="url"
            placeholder="https://example.com/about"
            type="url"
          />
        </label>
        <button className={buttonClasses({ variant: "ghost", size: "sm", className: "min-h-10 justify-center" })} disabled={urlPending} type="submit">
          {urlPending ? <RefreshCw aria-hidden className="h-4 w-4 animate-spin" /> : <Link2 aria-hidden className="h-4 w-4" />}
          {urlPending ? "Reading..." : "Import URL"}
        </button>
        {urlState ? <ResultPanel state={urlState} /> : null}
      </form>

      <form action={websiteAction} className="grid gap-3 rounded-[12px] border border-[var(--border-hairline)] bg-[var(--surface-soft)] p-4">
        <label className="grid min-w-0 gap-2">
          <span className="flex items-center gap-2 text-sm font-bold text-[var(--text-primary)]">
            <Globe2 aria-hidden className="h-4 w-4 text-[var(--accent)]" />
            Import key website pages
          </span>
          <input
            className="min-h-11 rounded-[10px] border border-[var(--border-hairline)] bg-[var(--surface-inset)] px-3.5 text-sm text-[var(--text-primary)] outline-none transition placeholder:text-[var(--text-muted)] focus:border-[var(--accent)] focus:ring-4 focus:ring-[var(--accent-soft)]"
            name="websiteUrl"
            placeholder="https://example.com"
            type="url"
          />
        </label>
        <button className={buttonClasses({ variant: "ghost", size: "sm", className: "min-h-10 justify-center" })} disabled={websitePending} type="submit">
          {websitePending ? <RefreshCw aria-hidden className="h-4 w-4 animate-spin" /> : <Globe2 aria-hidden className="h-4 w-4" />}
          {websitePending ? "Crawling..." : "Import site"}
        </button>
        {websiteState ? <ResultPanel state={websiteState} /> : null}
      </form>
    </div>
  );
}

function ReviewMode() {
  const steps = [
    { label: "Add sources", detail: "Talk, upload files, or import website pages.", done: true },
    { label: "Review Brain notes", detail: "Approve proof, personas, voice rules, and claims.", href: "/brain" },
    { label: "Edit profile only when needed", detail: "Use manual edit for corrections and locked brand fields.", href: "#edit-brand" },
  ];

  return (
    <div className="grid gap-4">
      <div>
        <div className="signal-eyebrow">Review queue</div>
        <h4 className="mt-1 text-lg font-bold tracking-[-0.02em] text-[var(--text-primary)]">Keep the brand useful over time</h4>
        <p className="mt-1 text-sm leading-6 text-[var(--text-secondary)]">
          Arc can keep learning, but the clean workflow is source material first, then approve the claims it extracted.
        </p>
      </div>
      <div className="grid gap-3">
        {steps.map((step, index) => (
          <div className="flex gap-3 rounded-[12px] border border-[var(--border-hairline)] bg-[var(--surface-soft)] p-4" key={step.label}>
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[9px] border border-[var(--border-hairline)] bg-[var(--surface-inset)] font-mono text-xs font-semibold text-[var(--accent-contrast)]">
              {step.done ? <CheckCircle2 aria-hidden className="h-4 w-4 text-[var(--ok)]" /> : index + 1}
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-sm font-bold text-[var(--text-primary)]">{step.label}</div>
              <p className="mt-1 text-sm leading-6 text-[var(--text-secondary)]">{step.detail}</p>
              {step.href ? (
                <Link className={buttonClasses({ variant: "ghost", size: "sm", className: "mt-3" })} href={step.href}>
                  <BookOpenCheck aria-hidden className="h-4 w-4" />
                  Open
                </Link>
              ) : null}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function ResultPanel({ state }: { state: NonNullable<BrandUploadActionState> }) {
  return (
    <div className="mt-3 rounded-[10px] border border-[var(--border-hairline)] bg-[var(--surface-soft)] p-4">
      <div className="flex flex-wrap items-center gap-2">
        <StatusPill tone={resultTone(state)}>{state.ok ? "Analyzed" : "Needs attention"}</StatusPill>
        <span className="text-sm font-bold text-[var(--text-primary)]">{state.message}</span>
      </div>
      <ul className="mt-2 grid gap-1.5">
        {state.items.map((item) => (
          <li className="flex gap-2 text-xs leading-5 text-[var(--text-secondary)]" key={item}>
            {state.ok ? (
              <CheckCircle2 aria-hidden className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--ok)]" />
            ) : (
              <TriangleAlert aria-hidden className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--danger)]" />
            )}
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
