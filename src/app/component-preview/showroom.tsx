"use client";

import { motion } from "motion/react";
import {
  Check,
  FileText,
  Megaphone,
  Search,
  Settings2,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import JoyButton from "@mui/joy/Button";
import JoyChip from "@mui/joy/Chip";
import JoySheet from "@mui/joy/Sheet";
import JoyTab from "@mui/joy/Tab";
import JoyTabList from "@mui/joy/TabList";
import JoyTabs from "@mui/joy/Tabs";
import { SparkLineChart } from "@mui/x-charts/SparkLineChart";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ButtonGroup, ButtonGroupText } from "@/components/ui/button-group";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
} from "@/components/ui/command";
import { EtheralShadow } from "@/components/ui/etheral-shadow";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "@/components/ui/input-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cx } from "@/app/_components/theme";

export function ComponentPreviewShowroom() {
  return (
    <div className="mx-auto max-w-[1240px] pb-14">
      <header className="border-b border-[var(--border-hairline)] pb-7">
        <p className="signal-eyebrow mb-3">Component comparison board</p>
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_23rem] xl:items-end">
          <div>
            <h1 className="font-serif text-[clamp(2rem,4vw,3.75rem)] font-semibold leading-[0.96] tracking-[-0.025em] text-[var(--text-primary)]">
              Chosen component system
            </h1>
            <p className="mt-4 max-w-[72ch] text-sm leading-6 text-[var(--text-secondary)]">
              I picked the best package for each job and folded the controls into one product language: shadcn/Radix
              for real controls, Arc-native metadata for rows, and motion only where it earns its keep.
            </p>
          </div>
          <div className="border border-[var(--border-hairline)] bg-[var(--surface-panel)] p-4">
            <div className="text-sm font-semibold text-[var(--text-primary)]">How to judge this</div>
            <div className="mt-3 grid gap-2 text-xs leading-5 text-[var(--text-muted)]">
              <p><span className="font-semibold text-[var(--text-primary)]">Use shadcn/Radix</span> for buttons, inputs, select menus, and command menus.</p>
              <p><span className="font-semibold text-[var(--text-primary)]">Use Arc-native</span> for campaign rows, status text, stats, and dense operator tables.</p>
              <p><span className="font-semibold text-[var(--text-primary)]">Use motion/shaders rarely</span> for brand accents, not everyday UI chrome.</p>
            </div>
          </div>
        </div>
      </header>

      <section className="mt-6 grid gap-4 xl:grid-cols-4">
        <LibraryLane
          name="Arc Native"
          source="current Tailwind tokens"
          verdict="Best for tables, queues, operator work"
          tone="spare, squared, low-decoration"
          choice="Chosen for rows and metadata"
        >
          <ArcNativeSample />
        </LibraryLane>
        <LibraryLane
          name="shadcn / Radix"
          source="src/components/ui"
          verdict="Best for forms, selects, command menus"
          tone="polished primitives, familiar behavior"
          choice="Chosen for controls"
        >
          <ShadcnSample />
        </LibraryLane>
        <LibraryLane
          name="Joy UI"
          source="@mui/joy"
          verdict="Not the core app standard"
          tone="tactile, rounded, component-library obvious"
        >
          <JoySample />
        </LibraryLane>
        <LibraryLane
          name="Motion / Shader"
          source="motion + local shader"
          verdict="Best for accent moments, not the whole app"
          tone="movement, atmosphere, brand texture"
          choice="Use sparingly"
        >
          <MotionShaderSample />
        </LibraryLane>
      </section>

      <ComparisonSection
        title="Buttons"
        detail="Same action set, four component directions. This should make the differences easier to see."
      >
        <CompareCard label="Arc Native" note="Most serious. Least component-library smell.">
          <div className="flex flex-wrap gap-2">
            <button className="min-h-9 rounded-[4px] border border-[var(--accent-border-strong)] bg-[var(--accent)] px-4 text-sm font-semibold text-[var(--on-accent)] shadow-[var(--elev-control)] transition duration-200 ease-out hover:-translate-y-0.5 hover:border-[var(--accent-hover)] hover:bg-[var(--accent-hover)] hover:shadow-[var(--elev-control-hover)] active:translate-y-px">
              Approve
            </button>
            <button className="min-h-9 border border-[var(--border-strong)] px-4 text-sm font-semibold text-[var(--text-primary)]">Revise</button>
            <button className="min-h-9 border-b border-[var(--border-strong)] px-1 text-sm font-semibold text-[var(--text-secondary)]">Archive</button>
          </div>
        </CompareCard>
        <CompareCard label="shadcn Button" note="Good default states. Needs de-rounding for Arc.">
          <div className="flex flex-wrap gap-2">
            <Button>Approve</Button>
            <Button variant="outline">Revise</Button>
            <Button variant="ghost">Archive</Button>
          </div>
        </CompareCard>
        <CompareCard label="Joy Button" note="Very usable, more visibly library-made.">
          <div className="flex flex-wrap gap-2">
            <JoyButton size="sm">Approve</JoyButton>
            <JoyButton size="sm" variant="outlined">Revise</JoyButton>
            <JoyButton size="sm" variant="plain">Archive</JoyButton>
          </div>
        </CompareCard>
        <CompareCard label="Motion Button" note="Same look, but adds physical response.">
          <div className="flex flex-wrap gap-2">
            <motion.button
              whileHover={{ y: -2 }}
              whileTap={{ scale: 0.98 }}
              className="min-h-9 rounded-[4px] border border-[var(--accent-border-strong)] bg-[var(--accent)] px-4 text-sm font-semibold text-[var(--on-accent)] shadow-[var(--elev-control)] transition duration-200 ease-out hover:-translate-y-0.5 hover:border-[var(--accent-hover)] hover:bg-[var(--accent-hover)] hover:shadow-[var(--elev-control-hover)] active:translate-y-px"
            >
              Approve
            </motion.button>
            <motion.button
              whileHover={{ y: -2 }}
              whileTap={{ scale: 0.98 }}
              className="min-h-9 border border-[var(--border-strong)] px-4 text-sm font-semibold text-[var(--text-primary)]"
            >
              Revise
            </motion.button>
          </div>
        </CompareCard>
      </ComparisonSection>

      <ComparisonSection
        title="Tags And Status"
        detail="This is where AI-looking UI usually goes wrong. I included intentionally different treatments."
      >
        <CompareCard label="Plain Text Metadata" note="My pick for campaign rows.">
          <div className="grid gap-3">
            <MetaRow label="Status" value="Review needed" tone="warn" meta="2 assets waiting" />
            <MetaRow label="Launch" value="Ready" tone="ok" meta="email approved" />
          </div>
        </CompareCard>
        <CompareCard label="shadcn Badge" note="Good only when rare.">
          <div className="flex flex-wrap gap-2">
            <Badge>Needs review</Badge>
            <Badge variant="secondary">Drafting</Badge>
            <Badge variant="outline">Live</Badge>
          </div>
        </CompareCard>
        <CompareCard label="Joy Chip" note="Best for filters, not row metadata.">
          <div className="flex flex-wrap gap-2">
            <JoyChip color="warning">Needs review</JoyChip>
            <JoyChip color="success">Live</JoyChip>
            <JoyChip variant="outlined">Drafting</JoyChip>
          </div>
        </CompareCard>
        <CompareCard label="Flag Strip" note="A less bubbly alternative.">
          <div className="grid gap-2">
            <FlagStrip tone="warn" label="Review needed" detail="Outbound locked until approval" />
            <FlagStrip tone="ok" label="Live" detail="Running in market" />
          </div>
        </CompareCard>
      </ComparisonSection>

      <ComparisonSection
        title="Search And Commands"
        detail="These differ a lot in real use: simple underline, shadcn form control, Joy select/control, and command palette."
      >
        <CompareCard label="Arc Underline Search" note="Quietest, best for top toolbars.">
          <div className="flex min-h-10 items-center gap-2 border-b border-[var(--border-strong)]">
            <Search className="h-4 w-4 text-[var(--text-muted)]" />
            <input className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-[var(--text-muted)]" placeholder="Search campaigns" />
          </div>
        </CompareCard>
        <CompareCard label="shadcn InputGroup" note="Best for rich search and shortcuts.">
          <InputGroup>
            <InputGroupAddon>
              <Search size={15} />
            </InputGroupAddon>
            <InputGroupInput placeholder="Search campaigns, contacts, media" />
            <InputGroupAddon align="inline-end">
              <InputGroupButton>⌘K</InputGroupButton>
            </InputGroupAddon>
          </InputGroup>
        </CompareCard>
        <CompareCard label="Radix Select" note="Best for filters with real choices.">
          <Select defaultValue="review">
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="review">Needs review first</SelectItem>
              <SelectItem value="ready">Ready to send</SelectItem>
              <SelectItem value="live">In market</SelectItem>
            </SelectContent>
          </Select>
        </CompareCard>
        <CompareCard label="cmdk Menu" note="Best product-feel upgrade.">
          <Command className="border border-[var(--border-hairline)] bg-[var(--surface-inset)]">
            <CommandInput placeholder="Jump to anything" />
            <CommandList>
              <CommandEmpty>No result.</CommandEmpty>
              <CommandGroup heading="Suggested">
                <CommandItem><Megaphone /> Campaigns needing review <CommandShortcut>G C</CommandShortcut></CommandItem>
                <CommandItem><FileText /> New storm campaign <CommandShortcut>N C</CommandShortcut></CommandItem>
              </CommandGroup>
              <CommandSeparator />
              <CommandGroup heading="Settings">
                <CommandItem><Settings2 /> Approval rules</CommandItem>
              </CommandGroup>
            </CommandList>
          </Command>
        </CompareCard>
      </ComparisonSection>

      <ComparisonSection
        title="Surfaces"
        detail="Cards can feel fake fast. These show when a surface should be plain, componentized, or atmospheric."
      >
        <CompareCard label="Arc Work Row" note="Best for campaign queue/list views.">
          <div className="border-y border-[var(--border-hairline)]">
            {["Emergency Water Response", "Storm Leak Partner Follow-Up", "Spring Flood Recovery"].map((item, index) => (
              <div key={item} className="grid grid-cols-[1fr_auto] gap-3 border-b border-[var(--border-hairline)] py-3 last:border-b-0">
                <div>
                  <div className="text-sm font-semibold text-[var(--text-primary)]">{item}</div>
                  <div className="mt-1 text-[11px] text-[var(--text-muted)]">Jun {17 - index} / {index + 1} pieces</div>
                </div>
                <span className="text-xs font-semibold text-[var(--warn-text)]">{index === 0 ? "Review" : "Ready"}</span>
              </div>
            ))}
          </div>
        </CompareCard>
        <CompareCard label="Joy Sheet" note="Best for settings panels and review packets.">
          <JoySheet variant="outlined" sx={{ p: 2 }}>
            <div className="text-sm font-semibold">Emergency water response</div>
            <div className="mt-1 text-xs opacity-70">Email / Meta / Landing</div>
            <div className="mt-4 grid gap-2">
              <JoyChip size="sm">Audience mapped</JoyChip>
              <JoyChip size="sm" color="warning">Approval needed</JoyChip>
            </div>
          </JoySheet>
        </CompareCard>
        <CompareCard label="Motion Surface" note="Use for important, interactive packets.">
          <motion.div
            whileHover={{ y: -4, borderColor: "var(--accent-border-strong)" }}
            transition={{ duration: 0.16 }}
            className="border border-[var(--border-hairline)] bg-[var(--surface-panel)] p-4"
          >
            <div className="flex items-center justify-between">
              <div className="text-sm font-semibold text-[var(--text-primary)]">Approval checklist</div>
              <ShieldCheck className="h-5 w-5 text-[var(--ok-text)]" />
            </div>
            <div className="mt-4 grid gap-2 text-xs text-[var(--text-secondary)]">
              <span><Check className="mr-2 inline h-3.5 w-3.5 text-[var(--ok-text)]" />Audience mapped</span>
              <span><Check className="mr-2 inline h-3.5 w-3.5 text-[var(--ok-text)]" />Media attached</span>
            </div>
          </motion.div>
        </CompareCard>
        <CompareCard label="Shader Accent" note="Brand/login only. Not app chrome.">
          <div className="relative h-36 overflow-hidden border border-[var(--border-hairline)]">
            <EtheralShadow className="absolute inset-0" />
            <div className="relative z-10 flex h-full items-end p-4">
              <div>
                <div className="text-sm font-semibold text-[var(--text-primary)]">Atmospheric brand field</div>
                <p className="mt-1 text-xs text-[var(--text-secondary)]">Looks distinct, but dangerous if overused.</p>
              </div>
            </div>
          </div>
        </CompareCard>
      </ComparisonSection>

      <ComparisonSection
        title="Tabs And Metrics"
        detail="A final set for campaign detail pages and analytics."
      >
        <CompareCard label="Arc Underline Tabs" note="Best for campaign review.">
          <div className="flex gap-5 border-b border-[var(--border-hairline)]">
            {["Email", "SMS", "Ads", "Landing"].map((item, index) => (
              <button key={item} className={cx("min-h-9 border-b text-sm font-semibold", index === 0 ? "border-[var(--accent)] text-[var(--text-primary)]" : "border-transparent text-[var(--text-muted)]")}>
                {item}
              </button>
            ))}
          </div>
        </CompareCard>
        <CompareCard label="Joy Tabs" note="Componentized version, more built-in behavior.">
          <JoyTabs defaultValue={0}>
            <JoyTabList>
              <JoyTab>Email</JoyTab>
              <JoyTab>SMS</JoyTab>
              <JoyTab>Ads</JoyTab>
            </JoyTabList>
          </JoyTabs>
        </CompareCard>
        <CompareCard label="MUI X Sparkline" note="Good for tiny performance context.">
          <div className="grid gap-4 sm:grid-cols-[1fr_10rem]">
            <div>
              <div className="text-[10px] font-medium text-[var(--text-muted)]">Booked jobs</div>
              <div className="mt-1 font-mono text-3xl font-semibold text-[var(--text-primary)]">14</div>
            </div>
            <div className="h-20 w-40 max-w-full">
              <SparkLineChart
                data={[2, 4, 3, 6, 5, 9, 8, 11, 14]}
                color="var(--accent)"
                height={80}
                width={160}
                showTooltip
                showHighlight
              />
            </div>
          </div>
        </CompareCard>
        <CompareCard label="Do Not Use Everywhere" note="These are the AI fingerprints.">
          <div className="grid gap-2 text-xs leading-5 text-[var(--text-muted)]">
            <p><Sparkles className="mr-2 inline h-3.5 w-3.5 text-[var(--priority-text)]" />Shimmer buttons on core actions</p>
            <p><Sparkles className="mr-2 inline h-3.5 w-3.5 text-[var(--priority-text)]" />Animated grid backgrounds behind tables</p>
            <p><Sparkles className="mr-2 inline h-3.5 w-3.5 text-[var(--priority-text)]" />Pill chips as row metadata</p>
          </div>
        </CompareCard>
      </ComparisonSection>
    </div>
  );
}

function LibraryLane({
  name,
  source,
  verdict,
  tone,
  choice,
  children,
}: {
  name: string;
  source: string;
  verdict: string;
  tone: string;
  choice?: string;
  children: React.ReactNode;
}) {
  return (
    <article
      className={cx(
        "grid min-h-[24rem] grid-rows-[auto_1fr_auto] overflow-hidden border bg-[var(--surface-panel)]",
        choice ? "border-[var(--accent-border-strong)] shadow-[inset_0_2px_0_var(--accent)]" : "border-[var(--border-panel)]",
      )}
    >
      <div className="border-b border-[var(--border-hairline)] p-4">
        <div className="flex items-center justify-between gap-3">
          <div className="text-[10px] font-medium text-[var(--text-muted)]">{source}</div>
          {choice ? (
            <span className="shrink-0 rounded-[3px] border border-[var(--accent-border-strong)] bg-[var(--accent-soft)] px-1.5 py-0.5 text-[10px] font-semibold text-[var(--accent-contrast)]">
              Chosen
            </span>
          ) : null}
        </div>
        <h2 className="mt-2 text-xl font-semibold tracking-[-0.02em] text-[var(--text-primary)]">{name}</h2>
        <p className="mt-2 text-xs leading-5 text-[var(--text-secondary)]">{tone}</p>
        {choice ? <p className="mt-2 text-xs font-semibold text-[var(--accent-contrast)]">{choice}</p> : null}
      </div>
      <div className="p-4">{children}</div>
      <div className="border-t border-[var(--border-hairline)] bg-[var(--surface-inset)] p-3 text-xs font-semibold text-[var(--accent-contrast)]">
        {verdict}
      </div>
    </article>
  );
}

function ArcNativeSample() {
  return (
    <div className="grid gap-4">
      <button className="min-h-9 rounded-[4px] border border-[var(--accent-border-strong)] bg-[var(--accent)] px-4 text-sm font-semibold text-[var(--on-accent)] shadow-[var(--elev-control)] transition duration-200 ease-out hover:-translate-y-0.5 hover:border-[var(--accent-hover)] hover:bg-[var(--accent-hover)] hover:shadow-[var(--elev-control-hover)] active:translate-y-px">
        Primary action
      </button>
      <div className="border-y border-[var(--border-hairline)]">
        <div className="grid grid-cols-[1fr_auto] border-b border-[var(--border-hairline)] py-3">
          <span className="text-sm font-semibold text-[var(--text-primary)]">Campaign row</span>
          <span className="text-xs text-[var(--warn-text)]">Review</span>
        </div>
        <div className="grid grid-cols-[1fr_auto] py-3">
          <span className="text-sm font-semibold text-[var(--text-primary)]">Ready row</span>
          <span className="text-xs text-[var(--ok-text)]">Live</span>
        </div>
      </div>
      <div className="flex min-h-9 items-center gap-2 border-b border-[var(--border-strong)]">
        <Search className="h-4 w-4 text-[var(--text-muted)]" />
        <span className="text-sm text-[var(--text-muted)]">Underline search</span>
      </div>
    </div>
  );
}

function ShadcnSample() {
  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap gap-2">
        <Button>Default</Button>
        <Button variant="outline">Outline</Button>
      </div>
      <div className="flex flex-wrap gap-2">
        <Badge>Badge</Badge>
        <Badge variant="secondary">Secondary</Badge>
        <Badge variant="outline">Outline</Badge>
      </div>
      <InputGroup>
        <InputGroupAddon><Search size={15} /></InputGroupAddon>
        <InputGroupInput placeholder="Input group" />
      </InputGroup>
      <ButtonGroup>
        <ButtonGroupText>Mode</ButtonGroupText>
        <Button variant="outline">A</Button>
        <Button variant="outline">B</Button>
      </ButtonGroup>
    </div>
  );
}

function JoySample() {
  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap gap-2">
        <JoyButton size="sm">Solid</JoyButton>
        <JoyButton size="sm" variant="outlined">Outlined</JoyButton>
        <JoyButton size="sm" variant="plain">Plain</JoyButton>
      </div>
      <div className="flex flex-wrap gap-2">
        <JoyChip color="warning">Warning</JoyChip>
        <JoyChip color="success">Live</JoyChip>
      </div>
      <JoySheet variant="outlined" sx={{ p: 2 }}>
        <div className="text-sm font-semibold">Joy Sheet</div>
        <div className="mt-1 text-xs opacity-70">Built-in density and surface handling</div>
      </JoySheet>
    </div>
  );
}

function MotionShaderSample() {
  return (
    <div className="grid gap-4">
      <motion.button
        whileHover={{ y: -4 }}
        whileTap={{ scale: 0.98 }}
        className="min-h-10 rounded-[4px] border border-[var(--accent-border-strong)] bg-[var(--accent)] px-4 text-sm font-semibold text-[var(--on-accent)] shadow-[var(--elev-control)] transition duration-200 ease-out hover:-translate-y-0.5 hover:border-[var(--accent-hover)] hover:bg-[var(--accent-hover)] hover:shadow-[var(--elev-control-hover)] active:translate-y-px"
      >
        Motion action
      </motion.button>
      <motion.div
        whileHover={{ rotate: -1, scale: 1.015 }}
        className="border border-[var(--border-hairline)] bg-[var(--surface-inset)] p-4"
      >
        <div className="text-sm font-semibold text-[var(--text-primary)]">Hover surface</div>
        <p className="mt-1 text-xs text-[var(--text-muted)]">Physical response without changing layout.</p>
      </motion.div>
      <div className="relative h-24 overflow-hidden border border-[var(--border-hairline)]">
        <EtheralShadow className="absolute inset-0" />
      </div>
    </div>
  );
}

function ComparisonSection({ title, detail, children }: { title: string; detail: string; children: React.ReactNode }) {
  return (
    <section className="mt-9 border-t border-[var(--border-hairline)] pt-6">
      <div className="mb-4 grid gap-2 lg:grid-cols-[18rem_minmax(0,1fr)]">
        <h2 className="text-lg font-semibold tracking-[-0.01em] text-[var(--text-primary)]">{title}</h2>
        <p className="max-w-[72ch] text-sm leading-6 text-[var(--text-secondary)]">{detail}</p>
      </div>
      <div className="grid gap-4 lg:grid-cols-2 2xl:grid-cols-4">{children}</div>
    </section>
  );
}

function CompareCard({ label, note, children }: { label: string; note: string; children: React.ReactNode }) {
  return (
    <article className="grid min-h-[12rem] grid-rows-[auto_1fr] border border-[var(--border-panel)] bg-[var(--surface-panel)]">
      <div className="border-b border-[var(--border-hairline)] px-4 py-3">
        <div className="text-sm font-semibold text-[var(--text-primary)]">{label}</div>
        <p className="mt-1 text-[11px] leading-4 text-[var(--text-muted)]">{note}</p>
      </div>
      <div className="p-4">{children}</div>
    </article>
  );
}

function MetaRow({ label, value, meta, tone = "neutral" }: { label: string; value: string; meta: string; tone?: "neutral" | "warn" | "ok" }) {
  return (
    <div className="grid grid-cols-[6rem_minmax(0,1fr)] items-baseline gap-3 border-b border-[var(--border-hairline)] pb-2 last:border-b-0 last:pb-0">
      <span className="text-[10px] font-medium text-[var(--text-muted)]">{label}</span>
      <span className="min-w-0">
        <span
          className={cx(
            "block truncate text-sm font-semibold",
            tone === "warn" ? "text-[var(--warn-text)]" : tone === "ok" ? "text-[var(--ok-text)]" : "text-[var(--text-primary)]",
          )}
        >
          {value}
        </span>
        <span className="mt-0.5 block truncate text-[11px] text-[var(--text-muted)]">{meta}</span>
      </span>
    </div>
  );
}

function FlagStrip({ tone, label, detail }: { tone: "warn" | "ok"; label: string; detail: string }) {
  return (
    <div className={cx("border-l-2 py-2 pl-3", tone === "warn" ? "border-[var(--warn)]" : "border-[var(--ok)]")}>
      <div className={cx("text-sm font-semibold", tone === "warn" ? "text-[var(--warn-text)]" : "text-[var(--ok-text)]")}>{label}</div>
      <div className="mt-0.5 text-[11px] text-[var(--text-muted)]">{detail}</div>
    </div>
  );
}
