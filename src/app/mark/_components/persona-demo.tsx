"use client";

import type { PersonaState } from "@/components/ai-elements/persona";
import { memo, useCallback, useEffect, useMemo, useState } from "react";

import { MarkAvatar, MarkPersona } from "./mark-avatar";

type StateIconName = "idle" | "listening" | "thinking" | "speaking" | "asleep";

const states: Array<{
  state: PersonaState;
  icon: StateIconName;
  label: string;
  note: string;
}> = [
  { icon: "idle", label: "Idle", note: "steady glow", state: "idle" },
  { icon: "listening", label: "Listening", note: "soft signal", state: "listening" },
  { icon: "thinking", label: "Thinking", note: "quiet motion", state: "thinking" },
  { icon: "speaking", label: "Speaking", note: "small waveform", state: "speaking" },
  { icon: "asleep", label: "Asleep", note: "dim glow", state: "asleep" },
];

const sequence = states.map((item) => item.state);

interface StateButtonProps {
  state: (typeof states)[number];
  currentState: PersonaState;
  onStateChange: (state: PersonaState) => void;
}

const StateButton = memo(({ state, currentState, onStateChange }: StateButtonProps) => {
  const handleClick = useCallback(() => onStateChange(state.state), [onStateChange, state.state]);
  const selected = currentState === state.state;

  return (
    <button
      aria-label={state.label}
      aria-pressed={selected}
      className={`grid size-9 place-items-center border transition first:rounded-l-lg last:rounded-r-lg focus-visible:z-10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)] active:translate-y-px ${
        selected
          ? "border-[var(--accent-border-strong)] bg-[var(--accent)] text-[var(--surface-panel)]"
          : "border-[var(--border-hairline)] bg-[var(--surface-inset)] text-[var(--text-secondary)] hover:border-[var(--accent-border)] hover:text-[var(--text-primary)]"
      }`}
      onClick={handleClick}
      title={state.label}
      type="button"
    >
      <StateIcon name={state.icon} />
    </button>
  );
});

StateButton.displayName = "StateButton";

function StateIcon({ name }: { name: StateIconName }) {
  if (name === "idle") {
    return (
      <svg aria-hidden className="size-4" fill="none" viewBox="0 0 24 24">
        <circle cx="12" cy="12" r="6" stroke="currentColor" strokeWidth="2" />
      </svg>
    );
  }

  if (name === "listening") {
    return (
      <svg aria-hidden className="size-4" fill="none" viewBox="0 0 24 24">
        <path d="M8 10a4 4 0 0 1 8 0v2a4 4 0 0 1-8 0v-2Z" stroke="currentColor" strokeWidth="2" />
        <path d="M5 12a7 7 0 0 0 14 0M12 19v3" stroke="currentColor" strokeLinecap="round" strokeWidth="2" />
      </svg>
    );
  }

  if (name === "thinking") {
    return (
      <svg aria-hidden className="size-4" fill="none" viewBox="0 0 24 24">
        <path d="M8 15a4 4 0 0 1-1-7.85A5 5 0 0 1 16.8 7.6 4 4 0 0 1 16 15" stroke="currentColor" strokeLinecap="round" strokeWidth="2" />
        <path d="M9 18h6M10 21h4" stroke="currentColor" strokeLinecap="round" strokeWidth="2" />
      </svg>
    );
  }

  if (name === "speaking") {
    return (
      <svg aria-hidden className="size-4" fill="none" viewBox="0 0 24 24">
        <path d="M5 10v4h4l5 4V6L9 10H5Z" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />
        <path d="M17 9a4 4 0 0 1 0 6M19.5 6.5a8 8 0 0 1 0 11" stroke="currentColor" strokeLinecap="round" strokeWidth="2" />
      </svg>
    );
  }

  return (
    <svg aria-hidden className="size-4" fill="none" viewBox="0 0 24 24">
      <path d="M6 9c1.6 2 3.6 3 6 3s4.4-1 6-3" stroke="currentColor" strokeLinecap="round" strokeWidth="2" />
      <path d="M8 15h8" stroke="currentColor" strokeLinecap="round" strokeWidth="2" />
    </svg>
  );
}

export function PersonaDemo() {
  const [state, setState] = useState<PersonaState>("idle");
  const [auto, setAuto] = useState(true);

  useEffect(() => {
    if (!auto) return;
    const id = window.setInterval(() => {
      setState((current) => sequence[(sequence.indexOf(current) + 1) % sequence.length]);
    }, 1800);
    return () => window.clearInterval(id);
  }, [auto]);

  const active = useMemo(() => states.find((item) => item.state === state) ?? states[0], [state]);
  const handleStateChange = useCallback((nextState: PersonaState) => {
    setAuto(false);
    setState(nextState);
  }, []);

  return (
    <main className="min-h-full bg-[var(--canvas)] px-4 py-6 text-[var(--text-primary)] sm:px-6 lg:px-8">
      <div className="mx-auto grid min-h-[calc(100vh-3rem)] max-w-5xl gap-6 lg:grid-cols-[minmax(0,1fr)_21rem]">
        <section className="flex min-h-[28rem] flex-col justify-between rounded-xl border border-[var(--border-panel)] bg-[var(--surface-panel)] p-5 shadow-[var(--elev-panel)]">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--text-muted)]">Mark persona</p>
              <h1 className="mt-2 font-display text-2xl font-semibold tracking-[-0.02em] text-[var(--text-primary)]">
                {active.label}
              </h1>
              <p className="mt-1 text-sm text-[var(--text-secondary)]">{active.note}</p>
            </div>
            <button
              type="button"
              aria-pressed={auto}
              onClick={() => setAuto((value) => !value)}
              className="inline-flex h-9 items-center gap-2 rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-inset)] px-3 text-xs font-semibold text-[var(--text-secondary)] transition hover:border-[var(--accent-border-strong)] hover:text-[var(--text-primary)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)] active:translate-y-px"
            >
              <span aria-hidden className={auto ? "h-2 w-2 rounded-full bg-[var(--ok)]" : "h-2 w-2 rounded-full bg-[var(--text-muted)]"} />
              Auto
            </button>
          </div>

          <div className="grid flex-1 place-items-center py-8">
            <MarkPersona state={state} size={128} />
          </div>

          <div className="flex justify-center">
            <div aria-label="Persona state" className="inline-flex rounded-lg shadow-[var(--elev-panel)]" role="group">
              {states.map((item) => (
                <StateButton
                  currentState={state}
                  key={item.state}
                  onStateChange={handleStateChange}
                  state={item}
                />
              ))}
            </div>
          </div>
        </section>

        <aside className="flex flex-col gap-3 rounded-xl border border-[var(--border-panel)] bg-[var(--surface-panel)] p-4 shadow-[var(--elev-panel)]">
          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--text-muted)]">Chat scale</p>
          <PreviewRow state="idle" label="Idle" body="Waiting for the next instruction." />
          <PreviewRow state="listening" label="Listening" body="Reading the operator's prompt and mentions." />
          <PreviewRow state="thinking" label="Thinking" body="Building the campaign recommendation." />
          <PreviewRow state="speaking" label="Speaking" body="Writing the answer back into the thread." />
          <PreviewRow state="asleep" label="Asleep" body="No active task attached." />
        </aside>
      </div>
    </main>
  );
}

function PreviewRow({
  state,
  label,
  body,
}: {
  state: PersonaState;
  label: string;
  body: string;
}) {
  return (
    <div className="flex gap-3 rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-inset)] p-3">
      <MarkAvatar size={42} state={state} />
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <span className="font-display text-sm font-semibold text-[var(--text-primary)]">Agent</span>
          <span className="text-[10px] text-[var(--text-muted)]">{label}</span>
        </div>
        <p className="mt-1 text-sm leading-6 text-[var(--text-secondary)]">{body}</p>
      </div>
    </div>
  );
}
