"use client";

import { useActionState, useState } from "react";

import { useAgentName } from "../_components/agent-name-context";
import { Button } from "../_components/page-header";
import { InstantSelect, Row, SaveHint, Segmented, Swatches, Toggle } from "./controls";
import {
  saveAgentBehaviorSettingsAction,
  saveAppearanceSettingsAction,
  saveBrandingSettingsAction,
  saveGeneralSettingsAction,
  saveArcDefaultsAction,
  saveMediaModelsAction,
  type SettingsActionState,
} from "./app-settings-actions";

const inputClass =
  "min-h-10 w-full rounded-md border border-[var(--border-hairline)] bg-[var(--surface-soft)] px-3 text-sm text-[var(--text-primary)] outline-none transition focus:border-[var(--accent)] focus:ring-4 focus:ring-[var(--accent-soft)]";

const radioCardClass =
  "flex min-h-12 cursor-pointer items-center gap-3 rounded-md border border-[var(--border-hairline)] bg-[var(--surface-soft)] px-3 py-2 text-sm text-[var(--text-secondary)] transition has-[:checked]:border-[var(--accent-border-strong)] has-[:checked]:bg-[var(--accent-soft)] has-[:checked]:text-[var(--text-primary)]";

function Feedback({ state }: { state: SettingsActionState }) {
  if (!state) return null;
  return (
    <span className={`text-xs font-semibold ${state.ok ? "text-[var(--ok-text)]" : "text-[var(--priority-text)]"}`}>
      {state.message}
    </span>
  );
}

/** Pick the image + video models Arc generates with. "" = Auto (env/default). */
export function MediaModelsForm({
  initialImageModel,
  initialVideoModel,
}: {
  initialImageModel: string;
  initialVideoModel: string;
}) {
  const [state, action, pending] = useActionState(saveMediaModelsAction, null);

  return (
    <form action={action}>
      <div className="divide-y divide-[var(--border-hairline)]">
        <Row
          control={
            <InstantSelect defaultValue={initialImageModel} name="imageModel">
              <option value="">Auto — follow Arc level</option>
              <option value="gemini-3-pro-image">Nano Banana Pro — 4K, max quality</option>
              <option value="gemini-3.1-flash-image">Nano Banana 2 — fast, high-volume</option>
              <option value="gemini-2.5-flash-image">Nano Banana — editing / reference</option>
            </InstantSelect>
          }
          description="Auto follows your Arc level. Pick one to pin it regardless of level."
          title="Image model"
        />
        <Row
          control={
            <InstantSelect defaultValue={initialVideoModel} name="videoModel">
              <option value="">Auto — follow Arc level</option>
              <option value="veo-3.1-generate-preview">Veo 3.1 — cinematic, synced audio</option>
              <option value="veo-3.1-fast-generate-preview">Veo 3.1 Lite — fast & economical</option>
            </InstantSelect>
          }
          description="Video generation needs billing on the Gemini key."
          title="Video model"
        />
      </div>
      <div className="border-t border-[var(--border-hairline)]">
        <SaveHint pending={pending} state={state} />
      </div>
    </form>
  );
}

export function GeneralSettingsForm({
  initialWorkspaceName,
  initialSupportEmail,
}: {
  initialWorkspaceName: string;
  initialSupportEmail: string;
}) {
  const [state, action, pending] = useActionState(saveGeneralSettingsAction, null);

  return (
    <form action={action} className="grid gap-4">
      <input name="workspaceName" type="hidden" value={initialWorkspaceName} />
      <label className="grid gap-1.5">
        <span className="text-sm font-semibold text-[var(--text-primary)]">Support email</span>
        <input
          className={inputClass}
          defaultValue={initialSupportEmail}
          name="supportEmail"
          placeholder="support@bigshouldersrestoration.com"
          type="email"
        />
        <span className="text-xs text-[var(--text-muted)]">Shown as a Contact support link in the console. Leave blank to hide it.</span>
      </label>
      <div className="flex flex-wrap items-center gap-3">
        <Button disabled={pending} size="sm" type="submit" variant="primary">
          Save support
        </Button>
        <Feedback state={state} />
      </div>
    </form>
  );
}

export function BrandingSettingsForm({
  initialWorkspaceProfile,
  initialProductLabel,
  initialAssistantName,
}: {
  initialWorkspaceProfile: "individual" | "company" | "agency";
  initialProductLabel: string;
  initialAssistantName: string;
}) {
  const [state, action, pending] = useActionState(saveBrandingSettingsAction, null);
  const [workspaceProfile, setWorkspaceProfile] = useState(initialWorkspaceProfile);
  const [productLabel, setProductLabel] = useState(initialProductLabel);
  const [assistantName, setAssistantName] = useState(initialAssistantName);

  return (
    <form action={action} className="grid gap-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="grid gap-1.5">
          <span className="text-sm font-semibold text-[var(--text-primary)]">Product label</span>
          <input className={inputClass} name="productLabel" onChange={(event) => setProductLabel(event.target.value)} placeholder="Marketing" value={productLabel} />
        </label>
        <label className="grid gap-1.5">
          <span className="text-sm font-semibold text-[var(--text-primary)]">Chat assistant name</span>
          <input className={inputClass} name="assistantName" onChange={(event) => setAssistantName(event.target.value)} placeholder="Agent" value={assistantName} />
          <span className="text-xs text-[var(--text-muted)]">Changes the visible chat name, prompts, and send box wording.</span>
        </label>
      </div>

      <fieldset className="grid gap-2">
        <legend className="text-sm font-semibold text-[var(--text-primary)]">Workspace type</legend>
        <div className="grid gap-2 sm:grid-cols-3">
          {[
            ["company", "Company", "One shared company workspace"],
            ["individual", "Individual", "A personal operator console"],
            ["agency", "Agency / client", "Manage one or more client brands"],
          ].map(([value, label, hint]) => (
            <label className={radioCardClass} key={value}>
              <input
                className="sr-only"
                checked={workspaceProfile === value}
                name="workspaceProfile"
                onChange={() => setWorkspaceProfile(value as "individual" | "company" | "agency")}
                type="radio"
                value={value}
              />
              <span className="grid gap-0.5">
                <span className="font-semibold">{label}</span>
                <span className="text-xs text-[var(--text-muted)]">{hint}</span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      <div className="rounded-md border border-[var(--border-hairline)] bg-[var(--surface-inset)] p-4">
        <div className="text-sm font-semibold text-[var(--text-primary)]">Live preview</div>
        <div className="mt-3 rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-soft)] p-3">
          <div className="text-sm font-bold text-[var(--text-primary)]">What should {assistantName || "Agent"} work on?</div>
          <p className="mt-1 text-xs leading-5 text-[var(--text-muted)]">
            Message {assistantName || "Agent"}... Product: {productLabel || "Marketing"}. Workspace mode: {workspaceProfile}.
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Button disabled={pending} size="sm" type="submit" variant="primary">
          Save workspace &amp; product
        </Button>
        <Feedback state={state} />
      </div>
    </form>
  );
}

export function ArcDefaultsForm({
  initialMode,
  initialRoute,
}: {
  initialMode: "ask" | "act" | "draft";
  initialRoute: "fast" | "standard";
}) {
  const agentName = useAgentName();
  const [state, action, pending] = useActionState(saveArcDefaultsAction, null);

  return (
    <form action={action} className="grid gap-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="grid gap-1.5">
          <span className="text-sm font-semibold text-[var(--text-primary)]">Default {agentName} stance</span>
          <select className={inputClass} defaultValue={initialMode} name="markDefaultMode">
            <option value="ask">Ask - answer only</option>
            <option value="act">Act - work inside the app</option>
            <option value="draft">Draft - bias toward campaign assets</option>
          </select>
          <span className="text-xs text-[var(--text-muted)]">
            Applied to new {agentName} messages unless a slash command supplies a stronger instruction.
          </span>
        </label>

        <label className="grid gap-1.5">
          <span className="text-sm font-semibold text-[var(--text-primary)]">Default Arc level</span>
          <select className={inputClass} defaultValue={initialRoute} name="markDefaultRoute">
            <option value="fast">Swift — quick & economical (Nano Banana 2 · Veo 3.1 Lite)</option>
            <option value="standard">Studio — best quality (Nano Banana Pro · Veo 3.1)</option>
          </select>
          <span className="text-xs text-[var(--text-muted)]">
            Studio uses deeper reasoning and higher-quality media; Swift is quicker and lighter. Switchable per message in the composer.
          </span>
        </label>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Button disabled={pending} size="sm" type="submit" variant="primary">
          Save {agentName} defaults
        </Button>
        <Feedback state={state} />
      </div>
    </form>
  );
}

export function AppearanceSettingsForm({
  initialAccent,
  initialDensity,
  initialMotion,
}: {
  initialAccent: "gold" | "blue" | "red" | "steel" | "emerald";
  initialDensity: "comfortable" | "compact";
  initialMotion: "standard" | "reduced";
}) {
  const [state, action, pending] = useActionState(saveAppearanceSettingsAction, null);

  return (
    <form action={action}>
      <div className="divide-y divide-[var(--border-hairline)]">
        <Row
          control={
            <Swatches
              defaultValue={initialAccent}
              name="appearanceAccent"
              options={[
                { value: "gold", label: "Signal Gold", color: "#c8a24a" },
                { value: "blue", label: "Signal Blue", color: "#5bb7e8" },
                { value: "red", label: "Restoration Red", color: "#d98080" },
                { value: "steel", label: "Steel", color: "#aeb5c2" },
                { value: "emerald", label: "Emerald", color: "#7fb89a" },
              ]}
            />
          }
          description="The highlight color used across buttons, links, and active states."
          title="Accent color"
        />
        <Row
          control={<Toggle defaultOn={initialDensity === "compact"} label="Compact layout" name="appearanceDensity" offValue="comfortable" onValue="compact" />}
          description="Tighten spacing to fit more on screen."
          title="Compact layout"
        />
        <Row
          control={<Toggle defaultOn={initialMotion === "reduced"} label="Reduce motion" name="appearanceMotion" offValue="standard" onValue="reduced" />}
          description="Minimize animations and transitions across the console."
          title="Reduce motion"
        />
      </div>
      <div className="border-t border-[var(--border-hairline)]">
        <SaveHint pending={pending} state={state} />
      </div>
    </form>
  );
}

export function AgentBehaviorSettingsForm({
  assistantName,
  initialTone,
  initialResponseStyle,
  initialApprovalStrictness,
  initialMode,
  initialRoute,
}: {
  assistantName: string;
  initialTone: "direct" | "friendly" | "formal" | "sales";
  initialResponseStyle: "brief" | "balanced" | "detailed";
  initialApprovalStrictness: "light" | "standard" | "strict";
  initialMode: "ask" | "act" | "draft";
  initialRoute: "fast" | "standard";
}) {
  const [state, action, pending] = useActionState(saveAgentBehaviorSettingsAction, null);

  return (
    <form action={action}>
      <div className="divide-y divide-[var(--border-hairline)]">
        <Row
          control={
            <InstantSelect defaultValue={initialTone} name="assistantTone">
              <option value="direct">Direct</option>
              <option value="friendly">Friendly</option>
              <option value="formal">Formal</option>
              <option value="sales">Sales-focused</option>
            </InstantSelect>
          }
          description={`How ${assistantName} sounds when it writes and replies.`}
          title="Tone"
        />
        <Row
          control={
            <Segmented
              defaultValue={initialResponseStyle}
              name="assistantResponseStyle"
              options={[
                { value: "brief", label: "Brief" },
                { value: "balanced", label: "Balanced" },
                { value: "detailed", label: "Detailed" },
              ]}
            />
          }
          description="How much detail replies include by default."
          title="Response length"
        />
        <Row
          control={
            <Segmented
              defaultValue={initialApprovalStrictness}
              name="approvalStrictness"
              options={[
                { value: "light", label: "Light" },
                { value: "standard", label: "Standard" },
                { value: "strict", label: "Strict" },
              ]}
            />
          }
          description="How cautious the guardrails are. Outbound always stays locked until you approve."
          title="Approval guardrails"
        />
        <Row
          control={
            <Segmented
              defaultValue={initialMode}
              name="markDefaultMode"
              options={[
                { value: "ask", label: "Ask" },
                { value: "act", label: "Act" },
                { value: "draft", label: "Draft" },
              ]}
            />
          }
          description="What new chats lean toward: answering, working in the app, or drafting assets."
          title="Default stance"
        />
        <Row
          control={
            <Segmented
              defaultValue={initialRoute}
              name="markDefaultRoute"
              options={[
                { value: "fast", label: "Swift" },
                { value: "standard", label: "Studio" },
              ]}
            />
          }
          description="Swift is quicker and lighter; Studio uses deeper reasoning and higher-quality media. Switchable per message."
          title="Quality level"
        />
      </div>
      <div className="border-t border-[var(--border-hairline)]">
        <SaveHint pending={pending} state={state} />
      </div>
    </form>
  );
}
