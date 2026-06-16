"use client";

import Link from "next/link";
import { useState, useTransition } from "react";

import { getMarketingSkillPacks } from "@/lib/agent/marketing-guidance";

import { Button } from "../_components/page-header";
import { type AgentTestResult } from "../arc/actions";
import { type GenerateSetupBundleResult, type IssueTokenResult } from "./agent-actions";

export function CopyPromptButton({
  copiedLabel = "Copied",
  label = "Copy Arc prompt",
  text,
}: {
  copiedLabel?: string;
  label?: string;
  text: string;
}) {
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");

  async function copyText() {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      const textarea = document.createElement("textarea");
      textarea.value = text;
      textarea.setAttribute("readonly", "true");
      textarea.style.position = "fixed";
      textarea.style.left = "-9999px";
      document.body.appendChild(textarea);
      textarea.select();
      try {
        return document.execCommand("copy");
      } finally {
        document.body.removeChild(textarea);
      }
    }
  }

  return (
    <Button
      onClick={async () => {
        setState((await copyText()) ? "copied" : "failed");
        window.setTimeout(() => setState("idle"), 1800);
      }}
      size="sm"
      type="button"
      variant="primary"
    >
      {state === "copied" ? copiedLabel : state === "failed" ? "Copy blocked" : label}
    </Button>
  );
}

export function AgentTestButton({ action }: { action: () => Promise<AgentTestResult> }) {
  const [result, setResult] = useState<AgentTestResult | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <div className="flex flex-wrap items-center gap-3">
      <Button
        disabled={pending}
        onClick={() => startTransition(async () => setResult(await action()))}
        size="sm"
        type="button"
        variant="ghost"
      >
        {pending ? "Testing..." : "Test connection"}
      </Button>
      {result ? (
        <span className={`text-xs font-semibold ${result.ok ? "text-[var(--ok-text)]" : "text-[var(--priority-text)]"}`}>
          {result.message} {result.ok ? `(${result.roundTripMs}ms)` : ""}
        </span>
      ) : null}
    </div>
  );
}

function BundleTextArea({
  label,
  minHeightClassName,
  text,
}: {
  label: string;
  minHeightClassName: string;
  text: string;
}) {
  return (
    <textarea
      aria-label={label}
      className={`${minHeightClassName} w-full resize-y rounded-md border border-[var(--border-hairline)] bg-[var(--surface-canvas)] p-3 font-mono text-[11px] leading-5 text-[var(--text-secondary)] outline-none focus:border-[var(--accent)] focus:ring-4 focus:ring-[var(--accent-soft)]`}
      readOnly
      value={text}
    />
  );
}

export function AgentSetupBundle({
  action,
  agentName,
  appBaseUrl,
}: {
  action: (formData: FormData) => Promise<GenerateSetupBundleResult>;
  agentName: string;
  appBaseUrl: string;
}) {
  const [result, setResult] = useState<GenerateSetupBundleResult | null>(null);
  const [autoCopyState, setAutoCopyState] = useState<"idle" | "copied" | "failed">("idle");
  const [pending, startTransition] = useTransition();
  const skillIds = new Set(["brand-voice", "local-seo", "lead-follow-up", "approval-workflow"]);
  const skills = getMarketingSkillPacks().filter((skill) => skillIds.has(skill.id));
  const inputClass =
    "min-h-9 rounded-md border border-[var(--border-hairline)] bg-[var(--surface-soft)] px-3 text-sm text-[var(--text-primary)] outline-none transition focus:border-[var(--accent)] focus:ring-4 focus:ring-[var(--accent-soft)]";
  const textAreaClass =
    "min-h-20 rounded-md border border-[var(--border-hairline)] bg-[var(--surface-soft)] px-3 py-2 text-sm leading-5 text-[var(--text-primary)] outline-none transition focus:border-[var(--accent)] focus:ring-4 focus:ring-[var(--accent-soft)]";

  return (
    <div className="grid gap-3 rounded-md border border-[var(--accent-soft)] bg-[var(--surface-inset)] p-3 text-xs leading-5 text-[var(--text-muted)]">
      <form
        className="grid gap-4"
        onSubmit={(event) => {
          event.preventDefault();
          const formData = new FormData(event.currentTarget);
          startTransition(async () => {
            const nextResult = await action(formData);
            setResult(nextResult);
            if (nextResult.ok) {
              try {
                await navigator.clipboard.writeText(nextResult.prompt);
                setAutoCopyState("copied");
              } catch {
                setAutoCopyState("failed");
              }
            } else {
              setAutoCopyState("idle");
            }
          });
        }}
      >
        <input name="agent_name" type="hidden" value={agentName} />
        <input name="app_base_url" type="hidden" value={appBaseUrl} />

        <div>
          <div className="text-sm font-bold text-[var(--text-primary)]">Easiest path: generate setup bundle</div>
          <p className="mt-1 max-w-[78ch]">
            Answer a few plain-English questions, keep the suggested help areas selected, then generate everything Arc
            needs in one bundle.
          </p>
          <p className="mt-2 max-w-[78ch] rounded-md border border-[var(--border-hairline)] bg-[var(--surface-canvas)] px-3 py-2 text-[11px] font-semibold leading-5 text-[var(--text-secondary)]">
            This does not send anything to Arc automatically. It creates copyable setup text in this app; you paste
            that into your Arc agent.
          </p>
        </div>

        <div className="grid gap-3 rounded-md border border-[var(--border-hairline)] bg-[var(--surface-soft)] p-3">
          <div>
            <div className="font-bold text-[var(--text-primary)]">1. Tell Arc what this business does</div>
            <p className="mt-1">Keep it short. These answers are just context so Arc starts in the right lane.</p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="grid gap-1 text-xs font-semibold text-[var(--text-muted)]">
              Company name
              <input className={inputClass} name="marketing_company_name" placeholder="Big Shoulders Restoration" />
            </label>
            <label className="grid gap-1 text-xs font-semibold text-[var(--text-muted)]">
              Service area
              <input className={inputClass} name="marketing_service_area" placeholder="Chicago and nearby suburbs" />
            </label>
            <label className="grid gap-1 text-xs font-semibold text-[var(--text-muted)]">
              What do you want marketed?
              <input className={inputClass} name="marketing_services" placeholder="Water, fire, storm, mold, rebuilds" />
            </label>
            <label className="grid gap-1 text-xs font-semibold text-[var(--text-muted)]">
              Who are the best customers?
              <input className={inputClass} name="marketing_ideal_customers" placeholder="Homeowners, property managers, agents" />
            </label>
          </div>
          <label className="grid gap-1 text-xs font-semibold text-[var(--text-muted)]">
            Why should people choose you?
            <textarea
              className={textAreaClass}
              name="marketing_differentiators"
              placeholder="Fast response, clean documentation, clear communication, experienced crews"
            />
          </label>
          <input name="marketing_brand_voice" type="hidden" value="Direct, helpful, local restoration expert" />
          <input
            name="marketing_forbidden_claims"
            type="hidden"
            value="Do not promise claim approval, coverage, payouts, exact pricing, or guaranteed timelines."
          />
        </div>

        <div className="grid gap-3 rounded-md border border-[var(--border-hairline)] bg-[var(--surface-soft)] p-3">
          <div>
            <div className="font-bold text-[var(--text-primary)]">2. Choose what Arc should help with</div>
            <p className="mt-1">Everything is selected by default. Uncheck anything that does not fit right now.</p>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            {skills.map((skill) => (
              <label
                className="grid grid-cols-[1rem_1fr] gap-2 rounded-md border border-[var(--border-hairline)] bg-[var(--surface-inset)] p-2"
                key={skill.id}
              >
                <input
                  className="mt-1"
                  defaultChecked
                  name="marketing_skill_ids"
                  type="checkbox"
                  value={skill.id}
                />
                <span>
                  <span className="block text-sm font-semibold text-[var(--text-primary)]">{skill.title}</span>
                  <span className="mt-1 block text-xs leading-5 text-[var(--text-muted)]">{skill.summary}</span>
                </span>
              </label>
            ))}
          </div>
        </div>

        <details className="rounded-md border border-[var(--border-hairline)] bg-[var(--surface-soft)] p-3">
          <summary className="cursor-pointer text-sm font-bold text-[var(--text-primary)]">
            Optional: add special instructions
          </summary>
          <label className="mt-3 grid gap-1 text-xs font-semibold text-[var(--text-muted)]">
            Anything Arc should remember?
            <textarea
              className={textAreaClass}
              name="marketing_custom_instructions"
              placeholder="Example: Focus on emergency lead follow-up first. Keep social posts short."
            />
          </label>
        </details>

        <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-[var(--accent-soft)] bg-[var(--surface-canvas)] p-3">
          <div>
            <div className="font-bold text-[var(--text-primary)]">Ready to connect Arc</div>
            <p className="mt-1">The generated prompt will include this profile, the selected help areas, and safe defaults.</p>
          </div>
          <Button disabled={pending} size="sm" type="submit" variant="primary">
            {pending ? "Generating..." : "Generate setup bundle"}
          </Button>
        </div>
      </form>

      {result ? (
        result.ok ? (
          <div className="grid gap-3">
            <div className="rounded-md border border-[var(--warn-border-soft)] bg-[var(--warn-soft)] px-3 py-2 text-[var(--warn-text)]">
              <p className="font-semibold">{result.message}</p>
              <p className="mt-1">
                {autoCopyState === "copied"
                  ? "The Arc prompt was copied automatically. Paste it into Arc now."
                  : autoCopyState === "failed"
                    ? "Browser clipboard access was blocked. Use the Copy prompt button below."
                    : "The token below is not stored in plaintext by the app. Store it in Arc now."}
              </p>
            </div>

            <div className="grid gap-2 rounded-md border border-[var(--border-hairline)] bg-[var(--surface-soft)] p-3">
              <div className="font-bold text-[var(--text-primary)]">Finish setup</div>
              <div className="grid gap-2 sm:grid-cols-3">
                {["Paste prompt into Arc", "Copy verification message", `Send a test message in ${agentName}`].map((item, index) => (
                  <div className="rounded-md border border-[var(--border-hairline)] bg-[var(--surface-inset)] p-2" key={item}>
                    <div className="text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--text-muted)]">Step {index + 1}</div>
                    <div className="mt-1 text-sm font-semibold text-[var(--text-primary)]">{item}</div>
                  </div>
                ))}
              </div>
            </div>

            <div className="grid gap-3 rounded-md border border-[var(--border-hairline)] bg-[var(--surface-soft)] p-3">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="font-bold text-[var(--text-primary)]">1. Paste this prompt into Arc</div>
                  <p className="mt-1">The token and webhook secret are already filled in.</p>
                </div>
                <CopyPromptButton copiedLabel="Copied" label="Copy prompt" text={result.prompt} />
              </div>
              <BundleTextArea label="Generated Arc setup prompt" minHeightClassName="min-h-64" text={result.prompt} />
            </div>

            <div className="grid gap-3 rounded-md border border-[var(--border-hairline)] bg-[var(--surface-soft)] p-3">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="font-bold text-[var(--text-primary)]">2. Ask Arc to verify</div>
                  <p className="mt-1">Paste this after the setup prompt so Arc checks ping and inbox access.</p>
                </div>
                <CopyPromptButton copiedLabel="Copied" label="Copy verify" text={result.verificationMessage} />
              </div>
              <BundleTextArea
                label="Generated Arc verification message"
                minHeightClassName="min-h-40"
                text={result.verificationMessage}
              />
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-[var(--accent-soft)] bg-[var(--surface-canvas)] p-3">
              <div>
                <div className="font-bold text-[var(--text-primary)]">3. Send a test message in {agentName}</div>
                <p className="mt-1">After Arc says verification passed, send one short {agentName} message.</p>
              </div>
              <Link
                className="inline-flex min-h-9 items-center rounded-md border border-[var(--accent)] bg-[var(--accent)] px-3 text-sm font-semibold text-[var(--accent-contrast)] transition hover:opacity-90"
                href="/arc"
              >
                Open {agentName}
              </Link>
            </div>

            <details className="rounded-md border border-[var(--border-hairline)] bg-[var(--surface-soft)] p-3">
              <summary className="cursor-pointer font-bold text-[var(--text-primary)]">
                Advanced: env values for local Arc
              </summary>
              <div className="mt-3 grid gap-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="font-bold text-[var(--text-primary)]">Save this env file in Arc</div>
                    <p className="mt-1">Only needed if your Arc runtime wants environment variables.</p>
                  </div>
                  <CopyPromptButton copiedLabel="Copied" label="Copy env" text={result.envFile} />
                </div>
                <BundleTextArea label="Generated Arc environment file" minHeightClassName="min-h-28" text={result.envFile} />
              </div>
            </details>

            <div className="rounded-md border border-[var(--border-hairline)] bg-[var(--surface-inset)] px-3 py-2 text-[11px] leading-5 text-[var(--text-muted)]">
              Generating again creates a new token and webhook secret. If you reconnect Arc, use the newest bundle.
            </div>
          </div>
        ) : (
          <div className="rounded-md border border-[var(--priority-border-soft)] bg-[var(--priority-soft)] px-3 py-2 font-semibold text-[var(--priority-text)]">
            {result.message}
          </div>
        )
      ) : null}
    </div>
  );
}

export function AgentTokenIssue({ action }: { action: (formData: FormData) => Promise<IssueTokenResult> }) {
  const [result, setResult] = useState<IssueTokenResult | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <div className="flex flex-col gap-2">
      <form
        className="flex flex-wrap items-end gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          const form = event.currentTarget;
          const formData = new FormData(form);
          startTransition(async () => {
            setResult(await action(formData));
            form.reset();
          });
        }}
      >
        <label className="flex min-w-56 flex-1 flex-col gap-1 text-xs font-semibold text-[var(--text-muted)]">
          Token label
          <input
            className="min-h-9 rounded-md border border-[var(--border-hairline)] bg-[var(--surface-soft)] px-3 text-sm text-[var(--text-primary)] outline-none transition focus:border-[var(--accent)] focus:ring-4 focus:ring-[var(--accent-soft)]"
            name="label"
            placeholder="prod runner"
          />
        </label>
        <Button disabled={pending} size="sm" type="submit" variant="primary">
          {pending ? "Generating..." : "Generate token"}
        </Button>
      </form>

      {result ? (
        <div
          className={`rounded-md border px-3 py-2 text-xs leading-5 ${
            result.ok
              ? "border-[var(--warn-border-soft)] bg-[var(--warn-soft)] text-[var(--warn-text)]"
              : "border-[var(--priority-border-soft)] bg-[var(--priority-soft)] text-[var(--priority-text)]"
          }`}
        >
          <p className="font-semibold">{result.message}</p>
          {result.ok ? <p className="mt-1 break-all font-mono">{result.plaintext}</p> : null}
        </div>
      ) : null}
    </div>
  );
}
