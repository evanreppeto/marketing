"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import CircularProgress from "@mui/material/CircularProgress";
import {
  Fragment,
  isValidElement,
  useCallback,
  useEffect,
  useRef,
  useState,
  useTransition,
} from "react";
import {
  ArrowRight,
  ArrowUp,
  AtSign,
  Bookmark,
  Brain,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Circle,
  ClipboardCheck,
  Copy,
  Database,
  FileText,
  LoaderCircle,
  LayoutTemplate,
  Link2,
  LockKeyhole,
  Mail,
  Menu,
  Megaphone,
  MessageSquareText,
  PanelRightClose,
  PanelRightOpen,
  Paperclip,
  PencilLine,
  Pin,
  Plus,
  Search,
  Share2,
  ShieldCheck,
  Slash,
  Smartphone,
  Square,
  Target,
  ThumbsDown,
  ThumbsUp,
  Users,
  Wrench,
  X,
  Zap,
} from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";

import type {
  ArcActionCard,
  ArcAssetStatus,
  ArcMention,
  ArcMode,
  ArcQuestion,
  ArcRecall,
  ArcRoute,
  SharePermission,
  ShareVisibility,
} from "@/domain";
import { CONTEXT_WINDOW_TOKENS, contextUsage } from "@/lib/arc-chat/context-usage";
import type {
  ArcAttachment,
  ArcMessage,
  ArcStep,
  ArcToolCall,
} from "@/lib/arc-chat/persistence";
import type { MentionGroup } from "@/lib/arc-chat/mention-search";
import type { ArcThreadGroupVM } from "@/lib/arc-chat/read-model";
import { filterThreadGroups } from "@/lib/arc-chat/thread-filter";
import { buildArcRunContract, type ArcRunContract } from "@/lib/arc-chat/run-contract";
import { buildArcRunProfile } from "@/lib/arc-chat/run-profile";

import {
  cancelArcRunAction,
  decideArcDraftAction,
  requestArcDraftRevisionAction,
  saveArcMessageAction,
  sendArcMessageAction,
  setArcMessageFeedbackAction,
  uploadArcAttachmentAction,
} from "../actions";
import {
  getChatSharingStateAction,
  setChatSharingAction,
  shareChatWithMemberAction,
  unshareChatMemberAction,
  type ChatSharingState,
} from "../sharing-actions";

const DEMO_THREADS = [
  {
    group: "Today",
    items: [
      { id: "storm", title: "Storm-damage homeowners", when: "9:38 AM", active: true, pinned: true },
      { id: "past", title: "Past-customer outreach", when: "8:12 AM", active: false, pinned: false },
    ],
  },
  {
    group: "Yesterday",
    items: [
      { id: "property", title: "Property-manager list", when: "4:46 PM", active: false, pinned: false },
      { id: "noaa", title: "NOAA hail report read", when: "2:10 PM", active: false, pinned: false },
    ],
  },
  {
    group: "Previous 7 days",
    items: [
      { id: "inspection", title: "Inspection page rewrite", when: "Jul 10", active: false, pinned: false },
      { id: "adjuster", title: "Adjuster follow-ups", when: "Jul 8", active: false, pinned: false },
    ],
  },
] satisfies ArcThreadGroupVM[];

const DEMO_STEPS: ArcStep[] = [
  { label: "Read the Naperville storm brief", status: "done", at: "9:38 AM", kind: "think" },
  { label: "Matched recent hail exposure to CRM properties", status: "done", at: "9:38 AM", kind: "match" },
  { label: "Ranked homeowners by inspection urgency", status: "done", at: "9:38 AM", kind: "search" },
  { label: "Prepared a review-safe campaign package", status: "done", at: "9:38 AM", kind: "draft" },
];

const DEMO_TOOLS: ArcToolCall[] = [
  { name: "weather.lookup", status: "complete", output: "Naperville hail swath" },
  { name: "crm.search", status: "complete", output: "142 matched properties" },
  { name: "audience.score", status: "complete", output: "$1.4M estimated opportunity" },
];

const DEMO_BREAKDOWN_MD = `Here's how the 142 homes break down, and the tracking I'd attach so we can attribute booked jobs back to this run:

| Segment | Homes | Est. value | Top signal |
| --- | --: | --: | --- |
| Insured · fresh damage | 64 | $612K | No inspection booked |
| Aging roof · out-of-pocket | 41 | $455K | Roof age 8y+ |
| Property manager · multi-unit | 37 | $333K | Prior claim activity |

Every link gets tagged so attribution is clean:

\`\`\`text
?utm_source=arc&utm_medium=email&utm_campaign=naperville_storm&segment={persona}
\`\`\`
`;

const DEMO_DRAFT_CARD: ArcActionCard = {
  kind: "draft",
  title: "Inspection follow-up email",
  channel: "Email",
  format: "64-home segment",
  status: "draft",
  preview:
    "Hi {first_name}, the recent Naperville hailstorm hit your block harder than most. We're offering a free, no-pressure inspection this week — and if there's claimable damage, we can help coordinate the insurance process.",
  rows: [
    { name: "Audience", meta: "64 insured · fresh damage" },
    { name: "Subject", meta: "Your roof may have hidden hail damage" },
  ],
  flags: [
    { tone: "ok", label: "Brand voice" },
    { tone: "ok", label: "Claims-safe" },
  ],
  approval: { kind: "campaign", campaignId: "demo-campaign", assetId: "demo-asset-email" },
};

const DEMO_SOURCES: ArcMention[] = [
  { type: "property", id: "demo-prop", label: "142 storm-zone properties", href: "/crm/properties" },
  { type: "campaign", id: "demo-camp", label: "Storm Rapid Response", href: "/campaigns" },
  { type: "company", id: "demo-co", label: "Naperville homeowners", href: "/crm/companies" },
];

const DEMO_RECALL: ArcRecall[] = [
  { label: "Inspection-first beats discount-led", confidence: 0.86, nodeId: "demo-node-inspection" },
  { label: "Insured segment books fastest", confidence: 0.72, nodeId: "demo-node-insured" },
];

type DemoTurn = { id: string; role: "operator" | "arc"; body: string; outcome?: "complete" | "canceled"; mode?: ArcMode; command?: string | null };
type ComposerMenu = "tools" | "model" | "mode" | "context" | "mentions" | "commands" | null;
type ArtifactTab = "audience" | "email" | "sms" | "social" | "landing";
type ArtifactReviewState = "ready" | "revising" | "approved";
type RunKind = "think" | "search" | "match" | "draft" | "media" | "tool";
type RunRow = {
  id: string;
  label: string;
  detail?: string;
  result?: string;
  isTool?: boolean;
  status: "queued" | "running" | "done" | "error";
  kind: RunKind;
};

const MODEL_OPTIONS: Array<{ id: ArcRoute; label: string; description: string }> = [
  { id: "fast", label: "Fast", description: "Quick answers and everyday work" },
  { id: "standard", label: "Deep", description: "Complex planning and careful reasoning" },
];

const ARTIFACT_TABS: Array<{ id: ArtifactTab; label: string; icon: typeof Target }> = [
  { id: "audience", label: "Audience", icon: Target },
  { id: "email", label: "Email", icon: Mail },
  { id: "sms", label: "SMS", icon: Smartphone },
  { id: "social", label: "Social", icon: Megaphone },
  { id: "landing", label: "Landing page", icon: LayoutTemplate },
];

const MODE_OPTIONS: Array<{ id: ArcMode; label: string; description: string }> = [
  { id: "ask", label: "Ask", description: "Answer without changing workspace data" },
  { id: "draft", label: "Draft", description: "Prepare work and keep it behind approval" },
  { id: "act", label: "Act", description: "Use workspace tools; outbound remains locked" },
];

const CONTEXT_OPTIONS = [
  { id: "workspace", label: "Workspace knowledge", icon: Brain },
  { id: "brand", label: "Brand profile", icon: Bookmark },
  { id: "crm", label: "CRM records", icon: Users },
  { id: "campaigns", label: "Campaigns and assets", icon: MessageSquareText },
] as const;

const COMMAND_OPTIONS: Array<{ id: string; label: string; description: string; mode: ArcMode }> = [
  { id: "find-leads", label: "Find leads", description: "Search and rank opportunities", mode: "act" },
  { id: "draft-email", label: "Draft email", description: "Prepare an approval-safe email", mode: "draft" },
  { id: "draft-campaign", label: "Draft campaign", description: "Build a multi-channel package", mode: "draft" },
  { id: "summarize", label: "Summarize", description: "Condense the selected context", mode: "ask" },
];

function formatToolName(name: string) {
  return name.replace(/[._-]+/g, " ").replace(/\b\w/g, (character) => character.toUpperCase());
}

function getToolKind(name: string): RunKind {
  const normalized = name.toLowerCase();
  if (/(image|video|media|render|asset|thumbnail)/.test(normalized)) return "media";
  if (/(search|lookup|weather|browse|fetch)/.test(normalized)) return "search";
  if (/(crm|audience|score|match|record|database)/.test(normalized)) return "match";
  if (/(draft|compose|campaign|email|sms|update)/.test(normalized)) return "draft";
  return "tool";
}

function formatMessageTime(iso: string) {
  const value = new Date(iso);
  if (!Number.isFinite(value.getTime())) return "";
  return value.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

function RunIcon({ kind, size = 15 }: { kind: RunKind; size?: number }) {
  if (kind === "search") return <Search size={size} />;
  if (kind === "match") return <Database size={size} />;
  if (kind === "draft") return <FileText size={size} />;
  if (kind === "media") return <LayoutTemplate size={size} />;
  if (kind === "tool") return <Wrench size={size} />;
  return <Brain size={size} />;
}

function formatWorkingTime(seconds: number) {
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return remainder > 0 ? `${minutes}m ${remainder}s` : `${minutes}m`;
}

function buildDemoLiveWork(request?: string | null): { commentary: string; rows: RunRow[] } {
  const normalized = request?.trim().toLowerCase() ?? "";

  if (/(email|sms|campaign|draft|write|create|landing)/.test(normalized)) {
    return {
      commentary: "I’m reading the approved Storm Rapid Response package and brand profile before I draft. I’ll keep the message inspection-first, use only approved claims, and leave outbound locked for review.",
      rows: [
        { id: "demo-campaign", label: "Read Storm Rapid Response campaign package", detail: "4 approved channel assets", status: "queued", kind: "draft" },
        { id: "demo-brand", label: "Loaded Big Shoulders brand voice", detail: "Approved proof points and messaging rules", status: "queued", kind: "tool" },
        { id: "demo-audience", label: "Reading the 142-home approved audience", detail: "Naperville hailstorm segment", status: "queued", kind: "match" },
        { id: "demo-draft", label: "Drafting the inspection-first message", detail: "Outbound remains locked", status: "queued", kind: "draft" },
      ],
    };
  }

  if (/(search|find|look up|research|which|who|audience|lead)/.test(normalized)) {
    return {
      commentary: "I’m checking the selected workspace sources against the request now. I’ll show each source as it is used and separate confirmed matches from anything that still needs review.",
      rows: [
        { id: "demo-crm", label: "Searching CRM property records", detail: "Naperville storm footprint", status: "queued", kind: "search" },
        { id: "demo-weather", label: "Reading the hail exposure model", detail: "Severity and address confidence", status: "queued", kind: "search" },
        { id: "demo-history", label: "Checking inspection and claim history", detail: "Approved workspace records", status: "queued", kind: "match" },
        { id: "demo-rank", label: "Ranking matching homeowners", detail: "Urgency and data confidence", status: "queued", kind: "match" },
      ],
    };
  }

  return {
    commentary: "I’m reading the active campaign, audience, and conversation context so I can answer from the current workspace instead of guessing. I’ll keep each source and action visible as I use it.",
    rows: [
      { id: "demo-context", label: "Reading active campaign context", detail: "Storm Rapid Response", status: "queued", kind: "think" },
      { id: "demo-sources", label: "Loading selected workspace sources", detail: "Brand, CRM, and campaigns", status: "queued", kind: "tool" },
      { id: "demo-answer", label: "Preparing a source-backed response", status: "queued", kind: "draft" },
    ],
  };
}

/**
 * Smoothly reveal streamed text. The runner posts partial reply bodies that the
 * client only re-fetches on a poll (~1–2.5s apart), so without smoothing the
 * answer lands in visible chunks. This reveals the target at a steady,
 * backlog-aware cadence so it reads as continuous typing — a bigger backlog
 * reveals faster, so a fresh chunk catches up in a beat instead of dumping — and
 * snaps to full the instant streaming ends or reduced-motion is requested.
 */
function useSmoothStream(target: string, streaming: boolean): string {
  const reduceMotion = useReducedMotion();
  const [count, setCount] = useState(streaming ? 0 : target.length);
  const rafRef = useRef<number | null>(null);
  const lastRef = useRef<number | null>(null);

  useEffect(() => {
    // No animation when not streaming or motion is reduced — the render below
    // derives the full text directly, so there's nothing to advance here.
    if (!streaming || reduceMotion) return;
    const tick = (now: number) => {
      const last = lastRef.current ?? now;
      lastRef.current = now;
      const dt = Math.min(now - last, 120); // clamp gaps (backgrounded tab)
      setCount((current) => {
        const remaining = target.length - current;
        if (remaining <= 0) return Math.min(current, target.length); // clamp on reset
        // Reveal faster when the backlog is larger so a ~1.5s chunk catches up in
        // well under a second of smooth typing, then settles to a calm cadence.
        const cps = Math.max(45, remaining * 5);
        const advance = Math.max(1, Math.round((cps * dt) / 1000));
        return Math.min(target.length, current + advance);
      });
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
      lastRef.current = null;
    };
  }, [streaming, reduceMotion, target]);

  const revealed = streaming && !reduceMotion ? Math.min(count, target.length) : target.length;
  return target.slice(0, revealed);
}

/** Flatten a rendered markdown node back to its raw text (for the copy button). */
function nodeText(node: React.ReactNode): string {
  if (typeof node === "string") return node;
  if (typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(nodeText).join("");
  if (isValidElement(node)) return nodeText((node.props as { children?: React.ReactNode }).children);
  return "";
}

/** A fenced code block with a language label and a copy button — the premium
 *  code affordance. Intentionally no multi-hue syntax highlighting (off-brand for
 *  the calm obsidian/gold system); clean mono on an inset surface instead. */
function CodeBlock({ children }: { children?: React.ReactNode }) {
  const [copied, setCopied] = useState(false);
  const codeChild = Array.isArray(children) ? children.find((child) => isValidElement(child)) : children;
  const className = isValidElement(codeChild) ? String((codeChild.props as { className?: string }).className ?? "") : "";
  const language = /language-([\w+-]+)/.exec(className)?.[1] ?? "";
  const raw = nodeText(children).replace(/\n$/, "");
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(raw);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard blocked — no-op */
    }
  };
  return (
    <div className="arc-code">
      <div className="arc-code-head">
        <span>{language || "code"}</span>
        <button type="button" onClick={copy} aria-label={copied ? "Copied" : "Copy code"}>
          {copied ? <Check size={13} /> : <Copy size={13} />}
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <pre>{children}</pre>
    </div>
  );
}

/** Shared markdown component overrides — rich code blocks and scroll-safe tables.
 *  Used by every Arc markdown surface so answers, streaming text, and reasoning
 *  all render the same way. */
const MARKDOWN_COMPONENTS: Components = {
  pre: ({ children }) => <CodeBlock>{children}</CodeBlock>,
  table: ({ children }) => (
    <div className="arc-table-wrap">
      <table>{children}</table>
    </div>
  ),
};

/** Markdown that types itself out while `streaming`, with a trailing caret (the
 *  caret is a CSS `::after` on the last rendered block — see `.arc-stream`). */
function StreamingMarkdown({ text, streaming, className }: { text: string; streaming: boolean; className?: string }) {
  const shown = useSmoothStream(text, streaming);
  return (
    <div className={`arc-stream${streaming ? " is-streaming" : ""}${className ? ` ${className}` : ""}`}>
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={MARKDOWN_COMPONENTS}>{shown}</ReactMarkdown>
    </div>
  );
}

/** The live "Thinking" stream — reasoning as it forms, kept in a calm fixed-height
 *  window that auto-scrolls to the newest line so a long transcript never sprawls.
 *  Snaps to full (no caret) once the answer starts. */
function LiveReasoning({ text, streaming }: { text: string; streaming: boolean }) {
  const shown = useSmoothStream(text, streaming);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [shown]);
  return (
    <div className="arc-live-reasoning">
      <span className="arc-live-reasoning-label"><Brain size={12} /> Thinking</span>
      <div className="arc-live-reasoning-scroll" ref={scrollRef}>
        <div className={`arc-stream${streaming ? " is-streaming" : ""} arc-markdown`}>
          <ReactMarkdown remarkPlugins={[remarkGfm]} components={MARKDOWN_COMPONENTS}>{shown}</ReactMarkdown>
        </div>
      </div>
    </div>
  );
}

function RunContract({ contract, pending, outcome = "complete" }: { contract: ArcRunContract; pending: boolean; outcome?: "complete" | "failed" | "canceled" }) {
  const title = pending ? "Run plan" : outcome === "canceled" ? "Canceled receipt" : outcome === "failed" ? "Failed receipt" : "Run receipt";
  const sourceLabel = contract.readScopes.length === 1 ? "1 source" : `${contract.readScopes.length} sources`;
  const contractGrid = (
    <div className="arc-run-contract-grid">
      <div><span>Reads</span><b>{contract.readScopes.length > 0 ? contract.readScopes.join(" · ") : "Conversation only"}</b></div>
      <div><span>Workspace effect</span><b>{contract.workspaceEffect}</b></div>
      <div><span>External effect</span><b>{contract.externalEffect}</b></div>
      <div><span>{pending ? "Approval" : "Recorded output"}</span><b>{pending ? contract.approval : contract.outputSummary}</b></div>
    </div>
  );

  if (pending) {
    return (
      <details className="arc-run-contract arc-run-contract-compact" data-state="planned">
        <summary>
          <ShieldCheck size={14} />
          <span><b>{contract.modeLabel}</b><small>{sourceLabel} · Outbound locked</small></span>
          <ChevronDown size={14} />
        </summary>
        {contractGrid}
      </details>
    );
  }

  return (
    <div className="arc-run-contract" data-state={outcome}>
      <div className="arc-run-contract-head">
        {outcome === "complete" ? <ClipboardCheck size={15} /> : <X size={15} />}
        <span><b>{title}</b><small>{contract.modeLabel} · {contract.modelLabel}</small></span>
        {contract.receiptId ? <code>#{contract.receiptId}</code> : null}
      </div>
      {contractGrid}
    </div>
  );
}

function RunTrace({
  pending,
  liveText,
  reasoning,
  steps = [],
  toolCalls = [],
  contract,
  onStop,
  stopping = false,
  outcome = "complete",
  demoRows = [],
  thoughtSeconds,
}: {
  pending: boolean;
  liveText?: string | null;
  reasoning?: string | null;
  steps?: ArcStep[];
  toolCalls?: ArcToolCall[];
  contract?: ArcRunContract;
  onStop?: () => void;
  stopping?: boolean;
  outcome?: "complete" | "failed" | "canceled";
  demoRows?: RunRow[];
  /** Measured wall-clock of the run, rendered as "Thought for Ns" on the
   *  collapsed summary (Claude-style). Omitted when unknown. */
  thoughtSeconds?: number;
}) {
  const reduceMotion = useReducedMotion();
  const [activeIndex, setActiveIndex] = useState(0);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const sourceRows: RunRow[] = [
    ...steps.map((step, index) => ({
      id: `step-${index}`,
      label: step.label,
      detail: step.detail?.join(" · "),
      status: step.status === "done" ? "done" as const : "running" as const,
      kind: (step.kind ?? "think") as RunKind,
    })),
    ...toolCalls.map((tool, index) => ({
      id: `tool-${index}`,
      label: tool.name,
      detail: tool.input ?? `Running ${formatToolName(tool.name).toLowerCase()}`,
      result: tool.output,
      isTool: true,
      status: tool.status === "complete" ? "done" as const : tool.status === "error" ? "error" as const : "running" as const,
      kind: getToolKind(tool.name),
    })),
  ];
  const rows = sourceRows.length > 0 ? sourceRows : demoRows;

  useEffect(() => {
    if (!pending || reduceMotion || sourceRows.length > 0 || demoRows.length === 0) return;
    const interval = window.setInterval(() => {
      setActiveIndex((current) => Math.min(current + 1, rows.length - 1));
    }, 1350);
    return () => window.clearInterval(interval);
  }, [demoRows.length, pending, reduceMotion, rows.length, sourceRows.length]);

  useEffect(() => {
    if (!pending) return;
    const startedAt = Date.now();
    const interval = window.setInterval(() => {
      setElapsedSeconds(Math.floor((Date.now() - startedAt) / 1000));
    }, 1000);
    return () => window.clearInterval(interval);
  }, [pending]);

  if (!pending) {
    if (!reasoning && sourceRows.length === 0 && !contract) return null;
    const completeCount = sourceRows.filter((row) => row.status === "done").length;
    const activityCount = sourceRows.length;
    const activityLabel = activityCount === 1 ? "activity" : "activities";
    const durationLabel = thoughtSeconds && thoughtSeconds > 0 ? formatWorkingTime(Math.round(thoughtSeconds)) : null;
    const summaryLabel = outcome === "canceled"
      ? activityCount > 0 ? `Stopped after ${activityCount} ${activityLabel}` : "Run stopped"
      : outcome === "failed"
        ? activityCount > 0 ? `Failed after ${activityCount} ${activityLabel}` : "Run failed"
        : durationLabel
          ? `Thought for ${durationLabel}${activityCount > 0 ? ` · ${completeCount || activityCount} ${activityLabel}` : ""}`
          : activityCount > 0 ? `Completed ${completeCount || activityCount} ${activityLabel}` : "Run complete";
    return (
      <details className="arc-run-summary" data-outcome={outcome}>
        <summary>
          <span className="arc-run-summary-main">{outcome === "complete" ? <CheckCircle2 size={15} /> : outcome === "canceled" ? <Square size={13} /> : <X size={15} />}{summaryLabel}</span>
          <span className="arc-run-summary-meta">View details <ChevronRight size={14} /></span>
        </summary>
        <div className="arc-run-details">
          {contract ? <RunContract contract={contract} pending={false} outcome={outcome} /> : null}
          {reasoning ? (
            <div className="arc-reasoning-summary">
              <Brain size={15} />
              <div><b>Thinking</b><p>{reasoning}</p></div>
            </div>
          ) : null}
          <div className="arc-run-rows">
            {sourceRows.map((row) => (
              <div className={`arc-run-row is-${row.status}`} key={row.id}>
                <span className="arc-run-kind"><RunIcon kind={row.kind} /></span>
                <span className="arc-run-copy"><b>{row.label}</b>{row.detail || row.result ? <small>{[row.detail, row.result].filter(Boolean).join(" · ")}</small> : null}</span>
                {row.status === "error" ? <X size={14} className="arc-run-state" aria-label="Failed" /> : <Check size={14} className="arc-run-state" aria-label="Complete" />}
              </div>
            ))}
          </div>
        </div>
      </details>
    );
  }

  const liveRows = rows.map((row, index) => {
    if (sourceRows.length > 0) return row;
    if (index < activeIndex) return { ...row, status: "done" as const };
    if (index === activeIndex) return { ...row, status: "running" as const };
    return row;
  }).filter((row) => sourceRows.length > 0 || row.status !== "queued");
  const hasError = liveRows.some((row) => row.status === "error");
  const hasReportedWork = liveRows.length > 0 || Boolean(liveText?.trim()) || Boolean(reasoning?.trim());
  const elapsedLabel = formatWorkingTime(elapsedSeconds);

  return (
    <motion.div
      className="arc-run-live"
      initial={reduceMotion ? false : { opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      data-state={stopping ? "stopping" : hasError ? "error" : "running"}
    >
      <div className="arc-run-live-head">
        <span className="arc-run-spinner arc-luma" aria-hidden="true"><span /><span /></span>
        <span><b aria-hidden="true" className={!stopping && !hasError ? "arc-shimmer" : undefined}>{stopping ? "Stopping safely…" : hasError ? `Needs attention after ${elapsedLabel}` : liveText?.trim() ? `Responding · ${elapsedLabel}` : `Thinking · ${elapsedLabel}`}</b><span className="sr-only" role="status" aria-live="polite">{stopping ? "Arc is stopping safely" : hasError ? "Arc needs attention" : "Arc is working"}</span></span>
        <button type="button" className="arc-stop" aria-label="Stop Arc" onClick={onStop} disabled={!onStop || stopping}><Square size={11} /> {stopping ? "Stopping…" : "Stop"}</button>
      </div>
      <div className="arc-run-divider" />
      <div className="arc-live-worklog">
        {reasoning?.trim() ? (
          <motion.div initial={reduceMotion ? false : { opacity: 0 }} animate={{ opacity: 1 }}>
            <LiveReasoning text={reasoning} streaming={!liveText?.trim()} />
          </motion.div>
        ) : null}
        {liveText?.trim() ? (
          <motion.div initial={reduceMotion ? false : { opacity: 0 }} animate={{ opacity: 1 }}>
            <StreamingMarkdown className="arc-live-commentary arc-markdown" text={liveText} streaming />
          </motion.div>
        ) : null}
        <div className="arc-live-events" role="list" aria-label="Live activity">
        {!hasReportedWork ? (
          <div className="arc-live-event is-running" role="listitem" aria-current="step">
            <span className="arc-live-event-icon"><LoaderCircle size={15} /></span>
            <span className="arc-live-event-copy"><b>Starting the run…</b><small>Waiting for the first reported activity</small></span>
          </div>
        ) : null}
        {liveRows.map((row, index) => (
          <motion.div
            className={`arc-live-event is-${row.status}`}
            key={row.id}
            initial={reduceMotion ? false : { opacity: 0, y: 5 }}
            animate={{ opacity: row.status === "queued" ? 0.62 : 1, y: 0 }}
            transition={{ delay: reduceMotion ? 0 : index * 0.08 }}
            role="listitem"
            aria-current={row.status === "running" ? "step" : undefined}
          >
            <span className="arc-live-event-icon"><RunIcon kind={row.kind} size={15} /></span>
            <span className="arc-live-event-copy">
              <b data-tool={row.isTool ? "true" : undefined}>{row.label}</b>
              {row.detail ? <small>{row.detail}</small> : null}
              {row.result ? <small className="arc-live-event-result">{row.result}</small> : null}
            </span>
            <span className="arc-live-event-state">
              {row.status === "done" ? <Check size={14} aria-label="Complete" /> : null}
              {row.status === "running" ? <LoaderCircle size={15} aria-label="Active" /> : null}
              {row.status === "queued" ? <Circle size={10} aria-label="Queued" /> : null}
              {row.status === "error" ? <X size={14} aria-label="Needs attention" /> : null}
            </span>
          </motion.div>
        ))}
        </div>
      </div>
      {contract ? <RunContract contract={contract} pending /> : null}
    </motion.div>
  );
}

function ArcAvatar() {
  return (
    <span className="arc-avatar">
      <Image src="/brand/arc-mark.png" alt="" width={30} height={30} priority />
    </span>
  );
}

function OperatorMessage({ body, time }: { body: string; time?: string }) {
  const reduceMotion = useReducedMotion();
  return (
    <motion.div
      className="arc-operator-message"
      initial={reduceMotion ? false : { opacity: 0, y: 7 }}
      animate={{ opacity: 1, y: 0 }}
    >
      {time ? <span className="arc-message-time">{time}</span> : null}
      <div>{body}</div>
    </motion.div>
  );
}

function AssistantMessage({
  time,
  children,
}: {
  time?: string;
  children: React.ReactNode;
}) {
  const reduceMotion = useReducedMotion();
  return (
    <motion.article
      className="arc-assistant-message"
      initial={reduceMotion ? false : { opacity: 0, y: 9 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.36, ease: [0.16, 1, 0.3, 1] }}
    >
      <ArcAvatar />
      <div className="arc-assistant-content">
        <div className="arc-assistant-meta"><b>Arc</b>{time ? <span>{time}</span> : null}</div>
        {children}
      </div>
    </motion.article>
  );
}

function CampaignPackageCard({ onReview, reviewState }: { onReview: () => void; reviewState: ArtifactReviewState }) {
  const channels = ["Email", "SMS", "Paid Social", "Landing Page"];
  const status = reviewState === "approved" ? "Approved" : reviewState === "revising" ? "Revising" : "Ready";
  const action = reviewState === "approved" ? "View approved" : reviewState === "revising" ? "View progress" : "Review package";
  return (
    <div className="arc-package" data-status={reviewState}>
      <div className="arc-package-kicker">Campaign package</div>
      <div className="arc-package-row">
        <span className="arc-package-icon"><MessageSquareText size={18} /></span>
        <span className="arc-package-title"><b>Storm Rapid Response</b><small>4 assets · Naperville, IL</small></span>
        <div className="arc-package-channels">
          {channels.map((channel) => <span key={channel}><i />{channel}<small>{status}</small></span>)}
        </div>
        <button type="button" className="arc-review-button" data-arc-campaign-trigger="true" onClick={onReview}>
          {action} <PanelRightOpen size={15} />
        </button>
      </div>
      <div className="arc-package-sources">Sources · Hail model · CRM properties · Inspection history · Prior claim activity</div>
    </div>
  );
}

function ArtifactWorkspace({
  activeTab,
  reviewState,
  notice,
  busy,
  onSelect,
  onApprove,
  onSubmitRevision,
  onClose,
}: {
  activeTab: ArtifactTab;
  reviewState: ArtifactReviewState;
  notice: string | null;
  busy: boolean;
  onSelect: (tab: ArtifactTab) => void;
  onApprove: () => void;
  onSubmitRevision: (request: string, tab: ArtifactTab) => void;
  onClose: () => void;
}) {
  const reduceMotion = useReducedMotion();
  const [revisionOpen, setRevisionOpen] = useState(false);
  const [revisionRequest, setRevisionRequest] = useState("");
  const approved = reviewState === "approved";
  const revising = reviewState === "revising";
  const activeLabel = ARTIFACT_TABS.find((tab) => tab.id === activeTab)?.label ?? "asset";
  const submitRevision = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const request = revisionRequest.trim();
    if (!request || busy) return;
    onSubmitRevision(request, activeTab);
    setRevisionRequest("");
    setRevisionOpen(false);
  };
  return (
    <motion.aside
      className="arc-artifact-workspace"
      aria-label="Campaign workspace"
      initial={reduceMotion ? false : { opacity: 0, x: 24 }}
      animate={{ opacity: 1, x: 0 }}
      exit={reduceMotion ? undefined : { opacity: 0, x: 18 }}
      transition={{ duration: 0.24, ease: [0.16, 1, 0.3, 1] }}
    >
      <header className="arc-artifact-header">
        <div><span>Campaign workspace</span><h2>Storm Rapid Response</h2><p>4 assets · Naperville, IL</p></div>
        <button type="button" onClick={onClose} aria-label="Close campaign workspace"><PanelRightClose size={17} /></button>
      </header>
      <div className="arc-artifact-shell">
        <div className="arc-artifact-tabs" role="tablist" aria-label="Campaign artifacts">
          {ARTIFACT_TABS.map((tab) => {
            const Icon = tab.icon;
            return <button type="button" role="tab" id={`arc-artifact-tab-${tab.id}`} aria-controls="arc-artifact-panel" aria-selected={activeTab === tab.id} key={tab.id} className={activeTab === tab.id ? "is-active" : ""} onClick={() => onSelect(tab.id)}><Icon size={17} /><span>{tab.label}</span></button>;
          })}
        </div>
        <div className="arc-artifact-content">
          <div className="arc-artifact-status" aria-live="polite"><span className={approved ? "is-approved" : revising ? "is-revising" : ""}><CheckCircle2 size={14} />{approved ? "Approved" : revising ? `Revising ${activeLabel}` : "Ready for review"}</span><span><LockKeyhole size={13} />Outbound locked</span></div>
          <AnimatePresence mode="wait" initial={false}>
            <motion.div key={activeTab} id="arc-artifact-panel" role="tabpanel" aria-labelledby={`arc-artifact-tab-${activeTab}`} className="arc-artifact-view" initial={reduceMotion ? false : { opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} exit={reduceMotion ? undefined : { opacity: 0, y: -4 }} transition={{ duration: 0.16 }}>
              {activeTab === "audience" ? <AudienceArtifact /> : null}
              {activeTab === "email" ? <EmailArtifact /> : null}
              {activeTab === "sms" ? <SmsArtifact /> : null}
              {activeTab === "social" ? <SocialArtifact /> : null}
              {activeTab === "landing" ? <LandingArtifact /> : null}
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
      <footer className="arc-artifact-footer" aria-busy={busy || revising}>
        {revisionOpen ? (
          <form className="arc-revision-form" onSubmit={submitRevision}>
            <label htmlFor="arc-revision-request">What should Arc change in the {activeLabel.toLowerCase()}?</label>
            <textarea id="arc-revision-request" autoFocus value={revisionRequest} onChange={(event) => setRevisionRequest(event.target.value)} placeholder="Describe the change…" rows={2} />
            <div><button type="button" onClick={() => { setRevisionOpen(false); setRevisionRequest(""); }}>Cancel</button><button type="submit" className="is-primary" disabled={!revisionRequest.trim() || busy}>Send revision</button></div>
          </form>
        ) : (
          <>
            <div role="status" aria-live="polite">{notice ?? (approved ? "Approved for use. Outbound remains locked until send approval." : revising ? "Arc is updating the selected asset. Nothing can send while it works." : "Review the assets, request changes, or approve them for use. Sending stays locked.")}</div>
            <button type="button" onClick={() => setRevisionOpen(true)} disabled={busy || revising}>Revise</button>
            <button type="button" className="is-primary" onClick={onApprove} disabled={approved || busy || revising}><Check size={14} />{approved ? "Approved" : revising ? "Revising…" : "Approve ready"}</button>
          </>
        )}
      </footer>
    </motion.aside>
  );
}

function AudienceArtifact() {
  const segments = [
    ["Insured · fresh damage", "64 homes", 45],
    ["Aging roof · out-of-pocket", "41 homes", 29],
    ["Property manager · multi-unit", "37 homes", 26],
  ] as const;
  return <><div className="arc-artifact-title"><span>Audience</span><h3>142 priority homes</h3><p>Ranked from hail exposure, inspection status, roof age, and prior claim activity.</p></div><div className="arc-audience-stats"><div><b>142</b><span>target homes</span></div><div><b>$1.4M</b><span>estimated value</span></div><div><b>23%</b><span>of storm zone</span></div></div><section className="arc-artifact-section"><h4>Persona mix</h4>{segments.map(([name, count, pct]) => <div className="arc-audience-row" key={name}><div><b>{name}</b><span>{count}</span></div><div className="arc-audience-bar"><i style={{ width: `${pct}%` }} /></div></div>)}</section><section className="arc-artifact-note"><Brain size={15} /><div><b>Why this audience</b><p>No inspection booked after the storm, with older-roof and claim signals weighted highest.</p></div></section></>;
}

function EmailArtifact() {
  return <><div className="arc-artifact-title"><span>Email</span><h3>Inspection follow-up</h3><p>Approval-safe draft for the highest-priority homeowners.</p></div><div className="arc-email-preview"><div><span>From</span><b>Big Shoulders Restoration</b></div><div><span>Subject</span><b>Your roof may have hidden hail damage</b></div><p>Hi {"{first_name}"}, the recent Naperville hailstorm hit your block harder than most. We’re offering a free, no-pressure inspection this week—and if there’s claimable damage, we can help coordinate the insurance process.</p></div><ArtifactChecks /> </>;
}

function SmsArtifact() {
  return <><div className="arc-artifact-title"><span>SMS</span><h3>Warm inspection check-in</h3><p>152 characters · one segment · personalized at send time</p></div><div className="arc-sms-preview"><p>Hi {"{first_name}"} — it’s the BSR crew. We’re checking roofs near you after the Naperville hail, no charge and no pressure. Want us to stop by?</p><span>152 / 160</span></div><ArtifactChecks /></>;
}

function SocialArtifact() {
  return <><div className="arc-artifact-title"><span>Paid social</span><h3>Naperville storm awareness</h3><p>Localized lead campaign · homeowner audience</p></div><div className="arc-copy-preview"><label>Primary text</label><p>Naperville got hit hard. Hidden hail damage can become a much bigger repair if it sits—book a free roof inspection while our crews are nearby.</p><label>Headline</label><b>See what the storm left behind</b><label>Call to action</label><b>Book now</b></div><ArtifactChecks /></>;
}

function LandingArtifact() {
  return <><div className="arc-artifact-title"><span>Landing page</span><h3>Storm inspection page</h3><p>Campaign-matched destination · mobile ready</p></div><div className="arc-landing-preview"><span>Naperville storm zone</span><h4>Free roof inspection for storm-hit homes</h4><p>See whether your roof has claimable damage before the next storm rolls through.</p><button type="button">Book a free inspection</button></div><ArtifactChecks /></>;
}

function ArtifactChecks() {
  return <section className="arc-artifact-section"><h4>Checks</h4><div className="arc-check-grid"><span><CheckCircle2 size={14} />Brand voice</span><span><CheckCircle2 size={14} />Claims language</span><span><CheckCircle2 size={14} />Audience match</span><span><CheckCircle2 size={14} />Outbound locked</span></div></section>;
}

const DRAFT_STATUS_META: Record<ArcAssetStatus | "review", { label: string; tone: string }> = {
  review: { label: "Needs review", tone: "muted" },
  draft: { label: "Needs review", tone: "muted" },
  revision: { label: "Revising", tone: "accent" },
  approved: { label: "Approved", tone: "ok" },
  rejected: { label: "Declined", tone: "red" },
};

/**
 * An Arc-drafted deliverable, in-flow: title + channel + status, the draft preview
 * (so it never reads empty when an asset exists), structured detail, guardrail
 * checks, an always-on "Outbound locked" badge, and — when the card is
 * approval-gated — Approve / Revise / Decline wired to the real campaign decision
 * flow. Cards without an approval hook fall back to a compact deep-link.
 */
function ArcDraftCard({ card }: { card: ArcActionCard }) {
  const [status, setStatus] = useState<ArcAssetStatus | null>(card.status ?? null);
  const [reviseOpen, setReviseOpen] = useState(false);
  const [reviseText, setReviseText] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, start] = useTransition();
  const approval = card.approval;
  const destination = card.appState?.href ?? card.href;
  const meta = DRAFT_STATUS_META[status ?? "review"] ?? DRAFT_STATUS_META.review;
  const decided = status === "approved" || status === "rejected";

  const decide = (decision: "approved" | "declined") => {
    if (!approval || busy) return;
    setNotice(null);
    start(async () => {
      const result = await decideArcDraftAction({ campaignId: approval.campaignId, assetId: approval.assetId, decision });
      if (!result.ok) return setNotice(result.error);
      setStatus(decision === "approved" ? "approved" : "rejected");
      setNotice(result.persisted ? (decision === "approved" ? "Approved · outbound stays locked" : "Declined") : "Preview — decision not saved");
    });
  };

  const submitRevision = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const instruction = reviseText.trim();
    if (!approval || !instruction || busy) return;
    setNotice(null);
    start(async () => {
      const result = await requestArcDraftRevisionAction({ campaignId: approval.campaignId, assetId: approval.assetId, instruction });
      if (!result.ok) return setNotice(result.error);
      setStatus("revision");
      setReviseOpen(false);
      setReviseText("");
      setNotice(result.persisted ? "Revision requested — Arc is updating it" : "Preview — revision not saved");
    });
  };

  return (
    <div className="arc-draft" data-status={status ?? "review"}>
      <div className="arc-draft-head">
        <span className="arc-draft-icon"><FileText size={16} /></span>
        <span className="arc-draft-title"><b>{card.title}</b>{card.channel || card.format ? <small>{[card.channel, card.format].filter(Boolean).join(" · ")}</small> : null}</span>
        <span className={`arc-draft-status is-${meta.tone}`}><i />{meta.label}</span>
      </div>
      {card.preview ? <p className="arc-draft-preview">{card.preview}</p> : null}
      {card.rows.length > 0 ? (
        <div className="arc-draft-rows">
          {card.rows.slice(0, 4).map((row, index) => (
            <div key={`${row.name}-${index}`}><b>{row.name}</b>{row.meta ? <span>{row.meta}</span> : null}{row.badge ? <em>{row.badge}</em> : null}</div>
          ))}
        </div>
      ) : null}
      {card.flags.length > 0 ? <div className="arc-draft-flags">{card.flags.slice(0, 3).map((flag, index) => <span key={`${flag.label}-${index}`} className={`arc-action-flag is-${flag.tone}`}>{flag.label}</span>)}</div> : null}
      {reviseOpen ? (
        <form className="arc-draft-revise" onSubmit={submitRevision}>
          <textarea autoFocus rows={2} value={reviseText} onChange={(event) => setReviseText(event.target.value)} placeholder={`What should Arc change in the ${(card.channel ?? "draft").toLowerCase()}?`} />
          <div>
            <button type="button" onClick={() => { setReviseOpen(false); setReviseText(""); }}>Cancel</button>
            <button type="submit" className="is-primary" disabled={!reviseText.trim() || busy}>Send revision</button>
          </div>
        </form>
      ) : (
        <div className="arc-draft-foot">
          <span className="arc-draft-lock"><LockKeyhole size={13} /> Outbound locked</span>
          {notice ? <span className="arc-draft-notice" role="status" aria-live="polite">{notice}</span> : null}
          <div className="arc-draft-actions">
            {destination?.startsWith("/") ? <Link className="arc-draft-open" href={destination}>Open <ArrowRight size={13} /></Link> : null}
            {approval ? (
              <>
                <button type="button" className="arc-draft-btn" onClick={() => setReviseOpen(true)} disabled={busy || decided}><PencilLine size={13} /> Revise</button>
                <button type="button" className="arc-draft-btn" onClick={() => decide("declined")} disabled={busy || decided}><X size={13} /> Decline</button>
                <button type="button" className="arc-draft-btn is-approve" onClick={() => decide("approved")} disabled={busy || decided}><Check size={14} /> {status === "approved" ? "Approved" : "Approve"}</button>
              </>
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
}

/** A source/citation icon keyed to the mentioned record's type. */
function MentionIcon({ type }: { type: ArcMention["type"] }) {
  const size = 12;
  if (type === "campaign") return <Megaphone size={size} />;
  if (type === "vault") return <Bookmark size={size} />;
  if (type === "property" || type === "job" || type === "outcome") return <Database size={size} />;
  if (type === "company" || type === "contact" || type === "lead" || type === "persona") return <Users size={size} />;
  return <FileText size={size} />;
}

/** "Sources Arc used" — the records Arc referenced for this reply, each a clickable
 *  deep-link to the record. Makes the evidence behind an answer navigable. */
function SourcesRow({ mentions }: { mentions: ArcMention[] }) {
  if (mentions.length === 0) return null;
  return (
    <div className="arc-sources">
      <span><Link2 size={13} /> Sources</span>
      {mentions.slice(0, 8).map((mention, index) => (
        mention.href?.startsWith("/")
          ? <Link key={`${mention.type}-${mention.id}-${index}`} href={mention.href} className="arc-source"><MentionIcon type={mention.type} />{mention.label}</Link>
          : <span key={`${mention.type}-${mention.id}-${index}`} className="arc-source is-static"><MentionIcon type={mention.type} />{mention.label}</span>
      ))}
    </div>
  );
}

/** Recalled Brain memory used for this reply — each chip links to its node in the
 *  Brain (via `?node=`), so a citation lands on the exact fact. */
function RecallRow({ recall }: { recall: ArcRecall[] }) {
  if (recall.length === 0) return null;
  return (
    <div className="arc-recall">
      <span><Brain size={14} /> Recalled</span>
      {recall.map((item, index) => {
        const inner = <>{item.label}{item.confidence != null ? <small>{Math.round(item.confidence * 100)}%</small> : null}</>;
        return item.nodeId
          ? <Link key={`${item.label}-${index}`} href={`/brain?node=${encodeURIComponent(item.nodeId)}`} className="arc-recall-chip">{inner}</Link>
          : <span key={`${item.label}-${index}`} className="arc-recall-chip is-static">{inner}</span>;
      })}
    </div>
  );
}

function QuestionPrompt({ question, onChoose, onDismiss }: { question: ArcQuestion; onChoose: (value: string) => void; onDismiss: () => void }) {
  return (
    <div className="arc-question">
      <ArcAvatar />
      <div><b>{question.prompt}</b><div className="arc-question-options">{question.options.map((option, index) => <button type="button" key={`${option}-${index}`} onClick={() => onChoose(option)}>{option}</button>)}</div></div>
      <button type="button" className="arc-icon-button" onClick={onDismiss} aria-label="Dismiss question"><X size={15} /></button>
    </div>
  );
}

function MessageActions({ message }: { message: ArcMessage }) {
  const [feedback, setFeedback] = useState<"up" | "down" | null>(message.feedback);
  const [saved, setSaved] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, startAction] = useTransition();

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(message.body);
      setNotice("Copied");
    } catch {
      setNotice("Copy failed");
    }
  };

  const rate = (value: "up" | "down") => {
    const previous = feedback;
    const next = feedback === value ? null : value;
    setFeedback(next);
    setNotice(null);
    startAction(async () => {
      const result = await setArcMessageFeedbackAction({ messageId: message.id, value: next });
      if (!result.ok) {
        setFeedback(previous);
        setNotice(result.error);
      } else {
        setNotice(next ? "Feedback saved" : "Feedback cleared");
      }
    });
  };

  const save = () => startAction(async () => {
    const result = await saveArcMessageAction(message.id);
    setSaved(result.ok);
    setNotice(result.ok ? "Saved to your Arc library" : result.error);
  });

  return (
    <div className="arc-message-action-row">
      <div className="arc-message-actions">
        <button type="button" aria-label="Copy response" title="Copy response" onClick={copy}><Copy size={15} /></button>
        <button type="button" aria-label="Good response" title="Good response" aria-pressed={feedback === "up"} className={feedback === "up" ? "is-active" : ""} onClick={() => rate("up")} disabled={busy}><ThumbsUp size={15} /></button>
        <button type="button" aria-label="Bad response" title="Bad response" aria-pressed={feedback === "down"} className={feedback === "down" ? "is-active" : ""} onClick={() => rate("down")} disabled={busy}><ThumbsDown size={15} /></button>
        <button type="button" aria-label={saved ? "Response saved" : "Save response"} title={saved ? "Saved" : "Save response"} aria-pressed={saved} className={saved ? "is-active" : ""} onClick={save} disabled={busy || saved}><Bookmark size={15} /></button>
      </div>
      <span className="arc-message-action-notice" role="status" aria-live="polite">{notice}</span>
    </div>
  );
}

function operatorMessageBefore(messages: ArcMessage[], index: number): ArcMessage | null {
  for (let cursor = index - 1; cursor >= 0; cursor -= 1) {
    if (messages[cursor]?.role === "operator") return messages[cursor] ?? null;
  }
  return null;
}

function LiveConversation({
  messages,
  brandName,
  onSuggestion,
  onCancelRun,
  stoppingTaskId,
}: {
  messages: ArcMessage[];
  brandName: string;
  onSuggestion: (value: string) => void;
  onCancelRun: (taskId: string, conversationId: string) => void;
  stoppingTaskId: string | null;
}) {
  if (messages.length === 0) {
    return (
      <div className="arc-empty-chat">
        <ArcAvatar />
        <h2>How can I help, {brandName}?</h2>
        <p>Ask me to find an audience, draft a campaign, or check a signal. I’ll show the work that matters, and nothing goes out until you approve it.</p>
      </div>
    );
  }

  return (
    <>
      {messages.map((message, index) => {
        if (message.role === "operator") return <OperatorMessage key={message.id} body={message.body} time={formatMessageTime(message.createdAt)} />;
        const pending = message.status === "pending" || (message.role === "arc" && !message.body.trim());
        const operatorMessage = operatorMessageBefore(messages, index);
        // Wall-clock of the run, from the operator's turn to this reply landing —
        // rendered as "Thought for Ns" on the collapsed summary. Clamped so a clock
        // skew or a very long gap never prints an absurd value.
        const gapSeconds = operatorMessage
          ? (new Date(message.createdAt).getTime() - new Date(operatorMessage.createdAt).getTime()) / 1000
          : 0;
        const thoughtSeconds = !pending && gapSeconds > 0 && gapSeconds < 900 ? gapSeconds : undefined;
        const contract = buildArcRunContract({
          mode: operatorMessage?.mode,
          route: operatorMessage?.route,
          contextScopes: operatorMessage?.contextScopes,
          actionCount: message.actions.length,
          toolCount: message.toolCalls?.length ?? 0,
          agentTaskId: message.agentTaskId,
        });
        return (
          <AssistantMessage key={message.id} time={formatMessageTime(message.createdAt)}>
            <RunTrace pending={pending} liveText={pending ? message.body : null} reasoning={message.reasoning} steps={message.steps} toolCalls={message.toolCalls} contract={contract} thoughtSeconds={thoughtSeconds} onStop={pending && message.agentTaskId ? () => onCancelRun(message.agentTaskId as string, message.conversationId) : undefined} stopping={stoppingTaskId === message.agentTaskId} outcome={message.status === "failed" ? (message.body.startsWith("Stopped by you") ? "canceled" : "failed") : "complete"} />
            {!pending ? <div className="arc-markdown"><ReactMarkdown remarkPlugins={[remarkGfm]} components={MARKDOWN_COMPONENTS}>{message.body}</ReactMarkdown></div> : null}
            {!pending && message.mentions.length ? <SourcesRow mentions={message.mentions} /> : null}
            {!pending && message.recall?.length ? <RecallRow recall={message.recall} /> : null}
            {!pending && message.actions.length ? <div className="arc-action-list">{message.actions.map((card, index) => <ArcDraftCard card={card} key={`${card.title}-${index}`} />)}</div> : null}
            {!pending && message.suggestions.length ? <div className="arc-suggestions">{message.suggestions.map((suggestion, index) => <button type="button" key={`${suggestion}-${index}`} onClick={() => onSuggestion(suggestion)}>{suggestion}</button>)}</div> : null}
            {!pending ? <MessageActions message={message} /> : null}
          </AssistantMessage>
        );
      })}
    </>
  );
}

function DemoConversation({
  turns,
  pending,
  reviewState,
  pendingContract,
  onReviewPackage,
  onStop,
}: {
  turns: DemoTurn[];
  pending: boolean;
  reviewState: ArtifactReviewState;
  pendingContract: ArcRunContract;
  onReviewPackage: () => void;
  onStop: () => void;
}) {
  const pendingTurn = [...turns].reverse().find((turn) => turn.role === "operator");
  const demoLiveWork = buildDemoLiveWork(pendingTurn?.body);

  return (
    <>
      <div className="arc-day"><span>July 14, 2026</span></div>
      <OperatorMessage time="9:35 AM" body="Which homeowners should we reach first after the Naperville hailstorm?" />
      <AssistantMessage time="9:38 AM">
        <div className="arc-answer">
          <h2>142 homes took the heaviest hail and still haven’t booked an inspection.</h2>
          <p>That’s 23% of the storm zone and about $1.4M in estimated restoration work. The clearest urgency signals across them:</p>
          <ul><li>Sit in the <b>worst-hit hail swath</b>, with no inspection on file — <b>3.1× more likely</b> to have hidden damage</li><li>No inspection booked in the six days since the storm</li><li>Roof age 8+ years or prior claim history</li></ul>
        </div>
        <RunTrace pending={false} thoughtSeconds={8} reasoning="I combined the storm footprint with property condition and recent CRM activity, then favored an inspection-first message because it performed better than discount-led outreach." steps={DEMO_STEPS} toolCalls={DEMO_TOOLS} contract={buildArcRunContract({ mode: "ask", route: "standard", contextScopes: ["workspace", "crm", "campaigns"], toolCount: DEMO_TOOLS.length, agentTaskId: "DEMO-142-HOMES" })} />
        <SourcesRow mentions={DEMO_SOURCES} />
        <RecallRow recall={DEMO_RECALL} />
      </AssistantMessage>
      <AssistantMessage time="9:40 AM">
        <div className="arc-markdown"><ReactMarkdown remarkPlugins={[remarkGfm]} components={MARKDOWN_COMPONENTS}>{DEMO_BREAKDOWN_MD}</ReactMarkdown></div>
      </AssistantMessage>
      <AssistantMessage time="9:42 AM">
        <div className="arc-answer"><p>I built the Storm Rapid Response package for the 142 highest-urgency homes.</p></div>
        <CampaignPackageCard onReview={onReviewPackage} reviewState={reviewState} />
      </AssistantMessage>
      <OperatorMessage time="9:44 AM" body="Looks good. Draft the email." />
      <AssistantMessage time="9:45 AM">
        <div className="arc-answer"><p>Here’s the inspection email for the 64 insured, fresh-damage homes. Approve it when it looks right — it stays locked until you do.</p></div>
        <div className="arc-action-list"><ArcDraftCard card={DEMO_DRAFT_CARD} /></div>
      </AssistantMessage>
      {turns.map((turn, index) => {
        if (turn.role === "operator") return <OperatorMessage key={turn.id} body={turn.body} />;
        const operatorTurn = [...turns.slice(0, index)].reverse().find((candidate) => candidate.role === "operator");
        const turnContract = buildArcRunContract({ mode: turn.mode, route: "fast", contextScopes: ["workspace", "brand", "crm", "campaigns"], agentTaskId: turn.id });
        const turnProfile = buildArcRunProfile({ request: operatorTurn?.body, mode: turn.mode, command: turn.command, sources: turnContract.readScopes });
        const completedSteps: ArcStep[] = turn.outcome === "canceled"
          ? [{ label: "Stopped before remaining work was applied", status: "done", at: "now", kind: "think" }]
          : turnProfile.phases.map((phase) => ({ label: phase.label, detail: [phase.detail], status: "done", at: "now", kind: phase.kind }));
        return (
          <AssistantMessage key={turn.id} time="now">
            <RunTrace
              pending={false}
              thoughtSeconds={turn.outcome === "canceled" ? undefined : 5}
              outcome={turn.outcome ?? "complete"}
              reasoning={turn.outcome === "canceled" ? "The run ended at your request. Completed work remains visible, and no outbound action was taken." : turnProfile.completedSummary}
              steps={completedSteps}
              contract={turnContract}
            />
            <div className="arc-answer"><p>{turn.body}</p></div>
          </AssistantMessage>
        );
      })}
      {pending ? <AssistantMessage time="now"><RunTrace pending reasoning={demoLiveWork.commentary} demoRows={demoLiveWork.rows} contract={pendingContract} onStop={onStop} /></AssistantMessage> : null}
    </>
  );
}

function ThreadDrawer({
  live,
  groups,
  activeConversationId,
  selectedDemoId,
  onSelectDemo,
  onClose,
}: {
  live: boolean;
  groups: ArcThreadGroupVM[];
  activeConversationId: string | null;
  selectedDemoId: string;
  onSelectDemo: (id: string) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const sourceGroups = live ? groups : DEMO_THREADS;
  const visibleGroups = filterThreadGroups(sourceGroups, query);

  useEffect(() => {
    const focusSearch = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLocaleLowerCase() === "k") {
        event.preventDefault();
        searchInputRef.current?.focus();
      }
    };
    window.addEventListener("keydown", focusSearch);
    return () => window.removeEventListener("keydown", focusSearch);
  }, []);

  return (
    <motion.aside className="arc-history" initial={{ x: -24, opacity: 0 }} animate={{ x: 0, opacity: 1 }} exit={{ x: -24, opacity: 0 }} transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }} aria-label="Conversation history">
      <div className="arc-history-head"><div><h2>Conversations</h2><p>Pick up where you left off.</p></div><button type="button" className="arc-icon-button" onClick={onClose} aria-label="Close history"><X size={17} /></button></div>
      {live ? <Link href="/arc?new=1" className="arc-new-chat"><Plus size={16} /> New conversation</Link> : <button type="button" className="arc-new-chat" onClick={() => onSelectDemo("new")}><Plus size={16} /> New conversation</button>}
      <label className="arc-history-search"><Search size={15} /><input ref={searchInputRef} autoFocus type="search" aria-label="Search conversations" placeholder="Search conversations" value={query} onChange={(event) => setQuery(event.target.value)} /><kbd aria-hidden="true">⌘K</kbd></label>
      <div className="arc-history-list">
        {visibleGroups.map((group) => (
          <div className="arc-history-group" key={group.group}>
            <h3>{group.group}</h3>
            {group.items.map((thread) => {
              const active = live ? thread.id === activeConversationId : thread.id === selectedDemoId;
              const content = <><span><b>{thread.title}</b><small>{thread.when}</small></span>{thread.pinned ? <Pin size={13} /> : null}</>;
              return live ? <Link href={`/arc?c=${thread.id}`} className={active ? "is-active" : ""} key={thread.id} onClick={onClose}>{content}</Link> : <button type="button" className={active ? "is-active" : ""} key={thread.id} onClick={() => onSelectDemo(thread.id)}>{content}</button>;
            })}
          </div>
        ))}
        {visibleGroups.length === 0 ? <div className="arc-history-empty"><Search size={17} /><b>No conversations found</b><span>Try a different title or date.</span></div> : null}
      </div>
    </motion.aside>
  );
}

function ShareDialog({ conversationId, onClose }: { conversationId: string | null; onClose: () => void }) {
  const [state, setState] = useState<ChatSharingState | null>(null);
  const [visibility, setVisibility] = useState<ShareVisibility>("private");
  const [permission, setPermission] = useState<SharePermission>("view");
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, start] = useTransition();
  const reload = useCallback(() => {
    if (!conversationId) return;
    getChatSharingStateAction(conversationId).then((next) => {
      setState(next);
      setVisibility(next.visibility);
      setPermission(next.workspacePermission);
    });
  }, [conversationId]);
  useEffect(() => { reload(); }, [reload]);

  const save = () => conversationId && start(async () => {
    const result = await setChatSharingAction({ conversationId, visibility, workspacePermission: permission });
    setNotice(result.ok ? "Sharing updated" : result.error);
  });
  const add = (userId: string, nextPermission: SharePermission) => conversationId && start(async () => {
    await shareChatWithMemberAction({ conversationId, userId, permission: nextPermission });
    reload();
  });
  const remove = (userId: string) => conversationId && start(async () => {
    await unshareChatMemberAction({ conversationId, userId });
    reload();
  });

  return (
    <motion.div className="arc-modal-scrim" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} role="presentation">
      <motion.div className="arc-share-dialog" initial={{ opacity: 0, y: 12, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 8, scale: 0.99 }} role="dialog" aria-modal="true" aria-labelledby="arc-share-title" onClick={(event) => event.stopPropagation()}>
        <div className="arc-share-head"><div><h2 id="arc-share-title">Share conversation</h2><p>Private by default. Choose who can view or collaborate.</p></div><button type="button" className="arc-icon-button" onClick={onClose} aria-label="Close share dialog"><X size={17} /></button></div>
        {!conversationId ? <p className="arc-share-empty">Start a real conversation before sharing it.</p> : null}
        <fieldset disabled={busy || !conversationId}><legend>Who can access</legend><div className="arc-segment"><button type="button" className={visibility === "private" ? "is-active" : ""} onClick={() => setVisibility("private")}>Private</button><button type="button" className={visibility === "workspace" ? "is-active" : ""} onClick={() => setVisibility("workspace")}>Workspace</button></div></fieldset>
        {visibility === "workspace" ? <fieldset disabled={busy || !conversationId}><legend>Workspace permission</legend><div className="arc-segment"><button type="button" className={permission === "view" ? "is-active" : ""} onClick={() => setPermission("view")}>Can view</button><button type="button" className={permission === "collaborate" ? "is-active" : ""} onClick={() => setPermission("collaborate")}>Can collaborate</button></div></fieldset> : null}
        <button type="button" className="arc-primary-button" onClick={save} disabled={busy || !conversationId}>{busy ? "Saving…" : "Save access"}</button>
        <div className="arc-share-people"><h3>People with access</h3>{state?.shared.length ? state.shared.map((member) => <div key={member.userId}><span><Users size={15} /><b>{member.email ?? member.userId}</b><small>{member.permission}</small></span><button type="button" onClick={() => remove(member.userId)}>Remove</button></div>) : <p>No one has been added yet.</p>}{state?.addable.slice(0, 3).map((member) => <div key={member.userId}><span><Users size={15} /><b>{member.email ?? member.userId}</b></span><button type="button" onClick={() => add(member.userId, "view")}>Add</button></div>)}</div>
        {notice ? <p className="arc-share-notice">{notice}</p> : null}
      </motion.div>
    </motion.div>
  );
}

export function ArcView({
  brandName,
  live = false,
  threadGroups = [],
  messages = [],
  activeConversationId = null,
  mentionGroups = [],
}: {
  brandName: string;
  live?: boolean;
  threadGroups?: ArcThreadGroupVM[];
  messages?: ArcMessage[];
  activeConversationId?: string | null;
  mentionGroups?: MentionGroup[];
}) {
  const router = useRouter();
  const [isSending, startSend] = useTransition();
  const [draft, setDraft] = useState("");
  const [mode, setMode] = useState<ArcMode>("ask");
  const [route, setRoute] = useState<ArcRoute>("fast");
  const [composerMenu, setComposerMenu] = useState<ComposerMenu>(null);
  const [selectedMentions, setSelectedMentions] = useState<ArcMention[]>([]);
  const [attachments, setAttachments] = useState<ArcAttachment[]>([]);
  const [command, setCommand] = useState<string | null>(null);
  const [contextScopes, setContextScopes] = useState<string[]>(["workspace", "brand", "crm", "campaigns"]);
  const [uploading, setUploading] = useState(false);
  const [composerNotice, setComposerNotice] = useState<string | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [workspaceOpen, setWorkspaceOpen] = useState(false);
  const [activeArtifact, setActiveArtifact] = useState<ArtifactTab>("audience");
  const [artifactReviewState, setArtifactReviewState] = useState<ArtifactReviewState>("ready");
  const [artifactNotice, setArtifactNotice] = useState<string | null>(null);
  const [selectedDemoId, setSelectedDemoId] = useState("storm");
  const [dismissedQuestionId, setDismissedQuestionId] = useState<string | null>(null);
  const [demoTurns, setDemoTurns] = useState<DemoTurn[]>([]);
  const [demoPending, setDemoPending] = useState(false);
  const [stoppingTaskId, setStoppingTaskId] = useState<string | null>(null);
  const demoTimer = useRef<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const composerMenuRef = useRef<HTMLDivElement | null>(null);
  const composerMenuTriggerRef = useRef<HTMLButtonElement | null>(null);
  const endRef = useRef<HTMLDivElement | null>(null);
  const scrollRef = useRef<HTMLElement | null>(null);
  const pinnedRef = useRef(true);
  const [showJump, setShowJump] = useState(false);
  // Live reply pushed over SSE (body/reasoning/steps as they land), overlaid onto
  // the pending message for instant streaming without a full server refetch.
  const [streamOverlay, setStreamOverlay] = useState<{ id: string; body: string; reasoning: string | null; steps: ArcStep[] } | null>(null);
  const awaitingReply = live && messages.some((message) => message.status === "pending" || (message.role === "arc" && !message.body.trim()));
  const isStreaming = awaitingReply || demoPending;
  const turnCount = live ? messages.length : demoTurns.length;

  // Default to "instant": the scroll container sets `scroll-behavior: smooth`, so
  // an animated follow would restart a new tween every tick toward a moving
  // bottom and never arrive. Only the explicit jump pill animates.
  const scrollToEnd = useCallback((behavior: ScrollBehavior = "instant") => {
    // Defer a frame so we measure after new content (a fresh turn, a streamed
    // line, a card) has laid out — otherwise we under-scroll and appear stuck.
    requestAnimationFrame(() => {
      const el = scrollRef.current;
      if (el) el.scrollTo({ top: el.scrollHeight, behavior });
    });
  }, []);

  // Subscribe to the live reply over SSE while one is in flight — pushes the
  // growing body/reasoning/steps as they land (no interval polling), then a `done`
  // event triggers a single refetch of the canonical message. The overlay is
  // cleared on teardown, so a completed reply always renders from server state.
  useEffect(() => {
    if (!live || !awaitingReply || !activeConversationId) return;
    const source = new EventSource(`/api/arc/stream/${encodeURIComponent(activeConversationId)}`);
    source.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data) as { messageId: string; body?: string; reasoning?: string | null; steps?: ArcStep[] };
        if (!data.messageId) return;
        setStreamOverlay({
          id: data.messageId,
          body: data.body ?? "",
          reasoning: data.reasoning ?? null,
          steps: Array.isArray(data.steps) ? data.steps : [],
        });
      } catch {
        /* ignore a malformed frame */
      }
    };
    source.addEventListener("done", () => {
      source.close();
      router.refresh(); // pull the final message (body + actions / recall / suggestions)
    });
    // On a transient drop EventSource reconnects on its own; the backstop below
    // covers a hard failure so the bubble can never hang.
    return () => {
      source.close();
      setStreamOverlay(null);
    };
  }, [live, awaitingReply, activeConversationId, router]);

  // Backstop: reconcile with the server on a slow cadence while awaiting, so a
  // blocked or proxy-buffered SSE stream still resolves. Defense in depth, not the
  // primary path — the SSE stream above carries the live updates.
  useEffect(() => {
    if (!awaitingReply) return;
    const startedAt = Date.now();
    const interval = window.setInterval(() => {
      if (Date.now() - startedAt > 120_000) return window.clearInterval(interval);
      router.refresh();
    }, 6000);
    return () => window.clearInterval(interval);
  }, [awaitingReply, router]);

  // Track whether the reader is pinned to the bottom, so we only auto-follow the
  // stream when they haven't scrolled up to read. We unpin on a genuine USER
  // scroll-up (wheel / touch), not on the `scroll` event — streamed content and
  // the row animations fire scroll events constantly, and reading those as intent
  // would unpin us mid-stream. We re-pin when the user returns near the bottom.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    // Tight threshold so a deliberate scroll-up reliably breaks the follow (and
    // isn't immediately re-pinned) — you re-pin only by returning to the bottom.
    const nearBottom = () => el.scrollHeight - el.scrollTop - el.clientHeight < 48;
    const unpin = () => {
      if (pinnedRef.current) {
        pinnedRef.current = false;
        setShowJump(true);
      }
    };
    const onWheel = (event: WheelEvent) => { if (event.deltaY < 0) unpin(); };
    let touchY = 0;
    const onTouchStart = (event: TouchEvent) => { touchY = event.touches[0]?.clientY ?? 0; };
    const onTouchMove = (event: TouchEvent) => {
      const y = event.touches[0]?.clientY ?? 0;
      if (y - touchY > 6) unpin();
      touchY = y;
    };
    const onScroll = () => {
      if (nearBottom()) {
        pinnedRef.current = true;
        setShowJump(false); // no-op re-render when already hidden
      }
    };
    el.addEventListener("wheel", onWheel, { passive: true });
    el.addEventListener("touchstart", onTouchStart, { passive: true });
    el.addEventListener("touchmove", onTouchMove, { passive: true });
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      el.removeEventListener("wheel", onWheel);
      el.removeEventListener("touchstart", onTouchStart);
      el.removeEventListener("touchmove", onTouchMove);
      el.removeEventListener("scroll", onScroll);
    };
  }, []);

  // Follow the answer as it types out — but only while pinned, so a reader who
  // scrolled up to re-read isn't yanked back down.
  useEffect(() => {
    if (!isStreaming) return;
    const interval = window.setInterval(() => {
      if (pinnedRef.current) scrollToEnd();
    }, 120);
    return () => window.clearInterval(interval);
  }, [isStreaming, scrollToEnd]);

  // A new turn (yours or Arc's) re-pins and jumps to the latest. Scrolling to the
  // bottom fires onScroll, which clears the jump pill — so we don't setState here.
  useEffect(() => {
    if (turnCount === 0) return;
    pinnedRef.current = true;
    scrollToEnd();
  }, [turnCount, scrollToEnd]);

  useEffect(() => () => {
    if (demoTimer.current != null) window.clearTimeout(demoTimer.current);
  }, []);

  useEffect(() => {
    if (!composerMenu || !composerMenuTriggerRef.current) return;
    const frame = window.requestAnimationFrame(() => {
      composerMenuRef.current?.querySelector<HTMLButtonElement>('[role="menuitem"], [role="menuitemradio"], [role="menuitemcheckbox"]')?.focus();
    });
    return () => window.cancelAnimationFrame(frame);
  }, [composerMenu]);

  useEffect(() => {
    if (!composerMenu && !workspaceOpen) return;

    const dismissOpenSurface = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Element)) return;

      if (composerMenu && !target.closest(".arc-composer-menu") && !target.closest('[aria-controls="arc-composer-menu"]')) {
        setComposerMenu(null);
      }

      if (workspaceOpen && !target.closest(".arc-artifact-workspace") && !target.closest('[data-arc-campaign-trigger="true"]')) {
        setWorkspaceOpen(false);
      }
    };

    document.addEventListener("pointerdown", dismissOpenSurface);
    return () => document.removeEventListener("pointerdown", dismissOpenSurface);
  }, [composerMenu, workspaceOpen]);

  const activeThread = threadGroups.flatMap((group) => group.items).find((thread) => thread.id === activeConversationId);
  const selectedDemoThread = DEMO_THREADS.flatMap((group) => group.items).find((thread) => thread.id === selectedDemoId);
  const title = live ? activeThread?.title ?? "New conversation" : selectedDemoId === "storm" ? "Storm Rapid Response" : selectedDemoThread?.title ?? "New conversation";
  const latestQuestion = live ? [...messages].reverse().find((message) => message.role === "arc")?.questions?.[0] ?? null : null;
  const visibleQuestion = latestQuestion && latestQuestion.id !== dismissedQuestionId ? latestQuestion : null;
  const contextState = messages.length > 0
    ? contextUsage(messages.map((message) => message.body ?? ""))
    : { tokens: 4_320, pct: 18, level: "ok" as const };
  const mentionItems = mentionGroups.flatMap((group) => group.items.map((item) => ({ ...item, group: group.label }))).slice(0, 12);
  const currentModel = MODEL_OPTIONS.find((option) => option.id === route) ?? MODEL_OPTIONS[0];
  const currentMode = MODE_OPTIONS.find((option) => option.id === mode) ?? MODE_OPTIONS[0];

  const closeComposerMenu = (restoreFocus = false) => {
    setComposerMenu(null);
    if (restoreFocus) window.requestAnimationFrame(() => composerMenuTriggerRef.current?.focus());
  };

  const toggleComposerMenu = (menu: Exclude<ComposerMenu, null>, trigger: HTMLButtonElement) => {
    composerMenuTriggerRef.current = trigger;
    setComposerMenu((current) => current === menu ? null : menu);
    setComposerNotice(null);
  };

  const handleComposerMenuKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const items = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="menuitem"], [role="menuitemradio"], [role="menuitemcheckbox"]')).filter((item) => !item.disabled);
    if (event.key === "Escape") {
      event.preventDefault();
      closeComposerMenu(true);
      return;
    }
    if (event.key === "Enter" || event.key === " ") {
      const activeItem = document.activeElement as HTMLButtonElement | null;
      if (activeItem && items.includes(activeItem)) {
        event.preventDefault();
        activeItem.click();
      }
      return;
    }
    if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key) || items.length === 0) return;
    event.preventDefault();
    const currentIndex = items.indexOf(document.activeElement as HTMLButtonElement);
    const nextIndex = event.key === "Home" ? 0 : event.key === "End" ? items.length - 1 : event.key === "ArrowDown" ? (currentIndex + 1 + items.length) % items.length : (currentIndex - 1 + items.length) % items.length;
    items[nextIndex]?.focus();
  };

  const chooseMention = (mention: ArcMention) => {
    setSelectedMentions((current) => current.some((item) => item.type === mention.type && item.id === mention.id) ? current : [...current, mention]);
    setDraft((current) => current.replace(/@\s*$/, ""));
    closeComposerMenu(true);
  };

  const chooseCommand = (nextCommand: (typeof COMMAND_OPTIONS)[number]) => {
    setCommand(nextCommand.id);
    setMode(nextCommand.mode);
    setDraft((current) => current.replace(/^\s*\/\s*$/, ""));
    closeComposerMenu(true);
  };

  const toggleContextScope = (scope: string) => {
    setContextScopes((current) => current.includes(scope) ? current.filter((item) => item !== scope) : [...current, scope]);
  };

  const handleAttachmentFiles = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    event.target.value = "";
    if (files.length === 0) return;
    setComposerMenu(null);
    setComposerNotice(null);

    if (!live) {
      setAttachments((current) => [
        ...current,
        ...files.map((file, index) => ({
          url: `demo://attachment/${Date.now()}-${index}`,
          objectPath: `demo/${file.name}`,
          contentType: file.type || "application/octet-stream",
          name: file.name,
        })),
      ]);
      return;
    }

    setUploading(true);
    const results = await Promise.all(files.map(async (file) => {
      const formData = new FormData();
      formData.append("file", file);
      return uploadArcAttachmentAction(formData);
    }));
    const uploaded = results.flatMap((result) => result.ok ? [result.attachment] : []);
    const firstError = results.find((result) => !result.ok);
    if (uploaded.length > 0) setAttachments((current) => [...current, ...uploaded]);
    setComposerNotice(firstError && !firstError.ok ? firstError.error : `${uploaded.length} file${uploaded.length === 1 ? "" : "s"} attached`);
    setUploading(false);
  };

  const submitDraft = () => {
    const body = draft.trim();
    if (!body || isSending || demoPending || uploading) return;
    setComposerMenu(null);
    setComposerNotice(null);
    if (!live) {
      const demoContract = buildArcRunContract({ mode, route, contextScopes });
      const demoProfile = buildArcRunProfile({ request: body, mode, command, sources: demoContract.readScopes });
      const operatorTurn: DemoTurn = { id: `operator-${Date.now()}`, role: "operator", body, mode, command };
      setDemoTurns((current) => [...current, operatorTurn]);
      setDraft("");
      setSelectedMentions([]);
      setAttachments([]);
      setCommand(null);
      setDemoPending(true);
      demoTimer.current = window.setTimeout(() => {
        setDemoPending(false);
        setDemoTurns((current) => [...current, {
          id: `arc-${Date.now()}`,
          role: "arc",
          body: demoProfile.completedSummary,
          mode,
          command,
        }]);
      }, 6000);
      return;
    }
    startSend(async () => {
      const result = await sendArcMessageAction({
        conversationId: activeConversationId,
        body,
        mentions: selectedMentions,
        attachments,
        mode,
        route,
        command,
        contextScopes,
      });
      if (!result.ok) {
        setComposerNotice(result.error);
        return;
      }
      setDraft("");
      setSelectedMentions([]);
      setAttachments([]);
      setCommand(null);
      router.push(`/arc?c=${result.conversationId}`);
      router.refresh();
    });
  };

  const selectDemoThread = (id: string) => {
    setSelectedDemoId(id);
    setHistoryOpen(false);
    setWorkspaceOpen(false);
    setDemoTurns([]);
    setDemoPending(false);
    setArtifactReviewState("ready");
    setArtifactNotice(null);
  };

  const openCampaignWorkspace = (tab: ArtifactTab = "audience") => {
    setActiveArtifact(tab);
    setComposerMenu(null);
    setArtifactNotice(null);
    setWorkspaceOpen(true);
  };

  const submitArtifactRevision = (request: string, tab: ArtifactTab) => {
    if (demoPending) return;
    const tabLabel = ARTIFACT_TABS.find((item) => item.id === tab)?.label ?? "asset";
    const now = Date.now();
    setArtifactReviewState("revising");
    setArtifactNotice(`Arc is revising the ${tabLabel.toLowerCase()}. Outbound remains locked.`);
    setDemoTurns((current) => [...current, { id: `operator-revision-${now}`, role: "operator", body: `Revise the ${tabLabel.toLowerCase()}: ${request}`, mode: "draft", command: `draft-${tab}` }]);
    setDemoPending(true);
    demoTimer.current = window.setTimeout(() => {
      setDemoPending(false);
      setArtifactReviewState("ready");
      setArtifactNotice(`${tabLabel} updated and ready for another review. Outbound remains locked.`);
      setDemoTurns((current) => [...current, {
        id: `arc-revision-${Date.now()}`,
        role: "arc",
        body: `I updated the ${tabLabel.toLowerCase()} from your revision request. The new version is ready for review, and outbound is still locked.`,
        mode: "draft",
        command: `draft-${tab}`,
      }]);
    }, 2800);
  };

  const stopDemoRun = () => {
    if (demoTimer.current != null) window.clearTimeout(demoTimer.current);
    demoTimer.current = null;
    setDemoPending(false);
    setDemoTurns((current) => {
      const latestOperator = [...current].reverse().find((turn) => turn.role === "operator");
      return [...current, {
        id: `arc-stopped-${Date.now()}`,
        role: "arc",
        outcome: "canceled",
        body: "Stopped. No remaining work was applied, and nothing was sent.",
        mode: latestOperator?.mode,
        command: latestOperator?.command,
      }];
    });
    setComposerNotice("Run stopped. Its receipt is preserved in this conversation.");
  };

  const stopLiveRun = async (taskId: string, conversationId: string) => {
    if (stoppingTaskId) return;
    setStoppingTaskId(taskId);
    setComposerNotice(null);
    const result = await cancelArcRunAction({ taskId, conversationId });
    setStoppingTaskId(null);
    setComposerNotice(result.ok ? "Run stopped. Its receipt remains in the conversation." : result.error);
    router.refresh();
  };

  // Overlay the SSE-streamed body/reasoning/steps onto the in-flight message, so
  // it types out live. Applied ONLY while that message is still pending — once the
  // server marks it complete, the canonical message (with its structured extras)
  // wins and the overlay is ignored.
  const renderedMessages = streamOverlay
    ? messages.map((message) =>
        message.id === streamOverlay.id && (message.status === "pending" || (message.role === "arc" && !message.body.trim()))
          ? {
              ...message,
              body: streamOverlay.body || message.body,
              reasoning: streamOverlay.reasoning ?? message.reasoning,
              steps: streamOverlay.steps.length ? streamOverlay.steps : message.steps,
            }
          : message,
      )
    : messages;

  return (
    <div className="arc-chat" data-workspace-open={workspaceOpen ? "true" : "false"}>
      <header className="arc-conversation-header">
        <button type="button" className="arc-history-button" onClick={() => setHistoryOpen(true)} aria-label="Open conversation history"><Menu size={17} /><span>History</span></button>
        <div className="arc-conversation-title"><h1>{title}</h1><p>{live ? "Private conversation" : "Storm-damage homeowners · 4 assets · Naperville, IL"}</p></div>
        <div className="arc-conversation-actions">
          {!live && selectedDemoId === "storm" ? <button type="button" className="arc-header-artifact" data-status={artifactReviewState} data-arc-campaign-trigger="true" aria-label={workspaceOpen ? "Close campaign workspace" : "Open campaign workspace"} aria-expanded={workspaceOpen} onClick={() => workspaceOpen ? setWorkspaceOpen(false) : openCampaignWorkspace(activeArtifact)}><MessageSquareText size={15} /><span>Campaign</span><i aria-hidden="true" /></button> : null}
          <button type="button" onClick={() => setShareOpen(true)} disabled={!activeConversationId} title={!activeConversationId ? "Start a real conversation before sharing" : "Share conversation"}><Share2 size={15} /> Share</button>
          <span className="arc-lock"><LockKeyhole size={14} /> Outbound locked</span>
        </div>
      </header>

      <main className="arc-conversation-scroll" ref={scrollRef}>
        <div className="arc-conversation-column">
          {live ? <LiveConversation messages={renderedMessages} brandName={brandName} onSuggestion={setDraft} onCancelRun={stopLiveRun} stoppingTaskId={stoppingTaskId} /> : selectedDemoId === "new" ? <div className="arc-empty-chat"><ArcAvatar /><h2>What should we work on?</h2><p>Start with an audience, a signal, or a draft. Arc will keep the work visible and the send path locked.</p></div> : <DemoConversation turns={demoTurns} pending={demoPending} reviewState={artifactReviewState} pendingContract={buildArcRunContract({ mode, route, contextScopes, agentTaskId: "DEMO-RUNNING" })} onReviewPackage={() => openCampaignWorkspace("email")} onStop={stopDemoRun} />}
          <div ref={endRef} />
        </div>
      </main>

      <footer className="arc-composer-dock">
        <div className="arc-composer-column">
          <AnimatePresence>
            {showJump ? (
              <motion.button
                type="button"
                className="arc-jump"
                onClick={() => { pinnedRef.current = true; setShowJump(false); scrollToEnd("smooth"); }}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 6 }}
                transition={{ duration: 0.16 }}
                aria-label="Jump to latest message"
              >
                <ChevronDown size={15} /> Latest
              </motion.button>
            ) : null}
          </AnimatePresence>
          {visibleQuestion ? <QuestionPrompt question={visibleQuestion} onChoose={(value) => { setDraft(value); setDismissedQuestionId(visibleQuestion.id); }} onDismiss={() => setDismissedQuestionId(visibleQuestion.id)} /> : null}
          <div className="arc-composer" data-busy={isSending || demoPending ? "true" : "false"}>
            <input ref={fileInputRef} type="file" hidden multiple accept="image/png,image/jpeg,image/gif,image/webp,application/pdf,text/plain,text/markdown,text/csv" onChange={handleAttachmentFiles} />

            <AnimatePresence>
              {composerMenu ? (
                <motion.div ref={composerMenuRef} id="arc-composer-menu" className="arc-composer-menu" data-menu={composerMenu} role="menu" aria-label={`${composerMenu} menu`} onKeyDown={handleComposerMenuKeyDown} initial={{ opacity: 0, y: 7, scale: 0.985 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 5, scale: 0.99 }} transition={{ duration: 0.16 }}>
                  {composerMenu === "tools" ? (
                    <>
                      <div className="arc-composer-menu-head"><b>Add to this message</b><button type="button" onClick={() => closeComposerMenu(true)} aria-label="Close message tools"><X size={14} /></button></div>
                      <button type="button" role="menuitem" onClick={() => { closeComposerMenu(); fileInputRef.current?.click(); }}><Paperclip size={16} /><span><b>Upload a file</b><small>Images, PDFs, text, Markdown, or CSV</small></span></button>
                      <button type="button" role="menuitem" onClick={() => setComposerMenu("mentions")}><AtSign size={16} /><span><b>Mention workspace item</b><small>Campaigns, contacts, properties, and more</small></span></button>
                      <button type="button" role="menuitem" onClick={() => setComposerMenu("commands")}><Slash size={16} /><span><b>Use a command</b><small>Start a structured Arc workflow</small></span></button>
                    </>
                  ) : null}

                  {composerMenu === "model" ? (
                    <>
                      <div className="arc-composer-menu-head"><b>Response model</b><small>Choose speed or deeper reasoning</small></div>
                      {MODEL_OPTIONS.map((option) => <button type="button" role="menuitemradio" aria-checked={route === option.id} key={option.id} onClick={() => { setRoute(option.id); closeComposerMenu(true); }}>{option.id === "fast" ? <Zap size={16} /> : <Brain size={16} />}<span><b>{option.label}</b><small>{option.description}</small></span>{route === option.id ? <Check size={15} /> : null}</button>)}
                    </>
                  ) : null}

                  {composerMenu === "mode" ? (
                    <>
                      <div className="arc-composer-menu-head"><b>Mode</b><small>Outbound always stays behind approval</small></div>
                      {MODE_OPTIONS.map((option) => <button type="button" role="menuitemradio" aria-checked={mode === option.id} key={option.id} onClick={() => { setMode(option.id); closeComposerMenu(true); }}><FileText size={16} /><span><b>{option.label}</b><small>{option.description}</small></span>{mode === option.id ? <Check size={15} /> : null}</button>)}
                    </>
                  ) : null}

                  {composerMenu === "context" ? (
                    <>
                      <div className="arc-composer-menu-head"><b>Context</b><small>{contextState.pct}% of this conversation window used</small></div>
                      {CONTEXT_OPTIONS.map((option) => {
                        const Icon = option.icon;
                        const active = contextScopes.includes(option.id);
                        return <button type="button" role="menuitemcheckbox" aria-checked={active} key={option.id} onClick={() => toggleContextScope(option.id)}><Icon size={16} /><span><b>{option.label}</b><small>{active ? "Included for this turn" : "Not included"}</small></span>{active ? <Check size={15} /> : <Circle size={14} />}</button>;
                      })}
                      <div className="arc-composer-menu-foot">≈{(contextState.tokens / 1_000).toFixed(1)}k of {(CONTEXT_WINDOW_TOKENS / 1_000).toFixed(0)}k tokens · {selectedMentions.length} pinned · {attachments.length} attached</div>
                    </>
                  ) : null}

                  {composerMenu === "mentions" ? (
                    <>
                      <div className="arc-composer-menu-head"><b>Mention</b><small>Pin a workspace item to this turn</small></div>
                      {mentionItems.length > 0 ? mentionItems.map((mention) => <button type="button" role="menuitem" key={`${mention.type}-${mention.id}`} onClick={() => chooseMention(mention)}><AtSign size={16} /><span><b>{mention.label}</b><small>{mention.group}</small></span></button>) : <div className="arc-composer-menu-empty">No workspace items are available yet.</div>}
                    </>
                  ) : null}

                  {composerMenu === "commands" ? (
                    <>
                      <div className="arc-composer-menu-head"><b>Commands</b><small>Start a focused workflow</small></div>
                      {COMMAND_OPTIONS.map((option) => <button type="button" role="menuitem" key={option.id} onClick={() => chooseCommand(option)}><Slash size={16} /><span><b>/{option.id}</b><small>{option.description}</small></span></button>)}
                    </>
                  ) : null}
                </motion.div>
              ) : null}
            </AnimatePresence>

            {selectedMentions.length > 0 || attachments.length > 0 || command || composerNotice ? (
              <div className="arc-composer-chips">
                {command ? <span className="arc-composer-chip is-command"><Slash size={12} />{command}<button type="button" onClick={() => setCommand(null)} aria-label={`Remove ${command} command`}><X size={11} /></button></span> : null}
                {selectedMentions.map((mention) => <span className="arc-composer-chip" key={`${mention.type}-${mention.id}`}><AtSign size={12} />{mention.label}<button type="button" onClick={() => setSelectedMentions((current) => current.filter((item) => !(item.type === mention.type && item.id === mention.id)))} aria-label={`Remove ${mention.label}`}><X size={11} /></button></span>)}
                {attachments.map((attachment) => <span className="arc-composer-chip" key={attachment.objectPath}><Paperclip size={12} />{attachment.name}<button type="button" onClick={() => setAttachments((current) => current.filter((item) => item.objectPath !== attachment.objectPath))} aria-label={`Remove ${attachment.name}`}><X size={11} /></button></span>)}
                {composerNotice ? <span className="arc-composer-notice">{composerNotice}</span> : null}
              </div>
            ) : null}

            <textarea aria-label="Message Arc" placeholder={command ? `Tell Arc what to do with /${command}…` : "Message Arc…"} value={draft} rows={2} disabled={isSending || demoPending} onChange={(event) => { const value = event.target.value; setDraft(value); if (value.endsWith("@")) { composerMenuTriggerRef.current = null; setComposerMenu("mentions"); } else if (value.trim() === "/") { composerMenuTriggerRef.current = null; setComposerMenu("commands"); } }} onKeyDown={(event) => { if (event.key === "Escape") closeComposerMenu(); if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); submitDraft(); } }} />
            <div className="arc-composer-toolbar">
              <div className="arc-composer-tools">
                <button type="button" className="arc-composer-add" aria-label="Add attachment, mention, or command" aria-haspopup="menu" aria-controls={composerMenu === "tools" ? "arc-composer-menu" : undefined} aria-expanded={composerMenu === "tools"} onClick={(event) => toggleComposerMenu("tools", event.currentTarget)}><Plus size={18} /></button>
                <button type="button" className="arc-composer-pill arc-model-button" aria-label={`Model: ${currentModel.label}`} aria-haspopup="menu" aria-controls={composerMenu === "model" ? "arc-composer-menu" : undefined} aria-expanded={composerMenu === "model"} onClick={(event) => toggleComposerMenu("model", event.currentTarget)}>{route === "fast" ? <Zap size={14} /> : <Brain size={14} />}<span>{currentModel.label}</span><ChevronDown size={12} /></button>
                <button type="button" className="arc-context-button" data-level={contextState.level} data-tooltip={`Context ${contextState.pct}% used`} aria-label={`Context: ${contextState.pct}% used`} title={`Context · ${contextState.pct}% used`} aria-haspopup="menu" aria-controls={composerMenu === "context" ? "arc-composer-menu" : undefined} aria-expanded={composerMenu === "context"} onClick={(event) => toggleComposerMenu("context", event.currentTarget)}><CircularProgress className="arc-context-progress" variant="determinate" value={contextState.pct} size={30} thickness={2.4} role="presentation" aria-hidden="true" /><Brain size={14} /></button>
              </div>
              <div className="arc-composer-send"><button type="button" className="arc-composer-pill" aria-label={`Mode: ${currentMode.label}`} aria-haspopup="menu" aria-controls={composerMenu === "mode" ? "arc-composer-menu" : undefined} aria-expanded={composerMenu === "mode"} onClick={(event) => toggleComposerMenu("mode", event.currentTarget)}><FileText size={14} /><span>{currentMode.label}</span><ChevronDown size={13} /></button><button type="button" className="arc-send-button" onClick={submitDraft} disabled={!draft.trim() || isSending || demoPending || uploading} aria-label="Send message">{isSending || demoPending || uploading ? <LoaderCircle size={18} className="is-spinning" /> : <ArrowUp size={18} />}</button></div>
            </div>
          </div>
        </div>
      </footer>

      <AnimatePresence>
        {workspaceOpen ? <ArtifactWorkspace key="campaign-workspace" activeTab={activeArtifact} reviewState={artifactReviewState} notice={artifactNotice} busy={demoPending} onSelect={setActiveArtifact} onApprove={() => { setArtifactReviewState("approved"); setArtifactNotice("All campaign assets are approved for use. Outbound remains locked until send approval."); }} onSubmitRevision={submitArtifactRevision} onClose={() => setWorkspaceOpen(false)} /> : null}
        {historyOpen ? <Fragment key="conversation-history"><motion.button type="button" className="arc-drawer-scrim" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setHistoryOpen(false)} aria-label="Close conversation history" /><ThreadDrawer live={live} groups={threadGroups} activeConversationId={activeConversationId} selectedDemoId={selectedDemoId} onSelectDemo={selectDemoThread} onClose={() => setHistoryOpen(false)} /></Fragment> : null}
        {shareOpen ? <ShareDialog key="share-dialog" conversationId={activeConversationId} onClose={() => setShareOpen(false)} /> : null}
      </AnimatePresence>
    </div>
  );
}
