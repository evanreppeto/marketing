"use client";

import { useActionState, useRef, useState } from "react";

import { useAgentName } from "../_components/agent-name-context";
import { Button } from "../_components/page-header";
import {
  saveAgentBehaviorSettingsAction,
  saveAppearanceSettingsAction,
  saveBrandingSettingsAction,
  saveGeneralSettingsAction,
  saveMarkDefaultsAction,
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

function BrandLogoPreview({ src, fallback }: { src: string; fallback: string }) {
  return (
    <div className="flex min-h-24 items-center gap-4 rounded-md border border-[var(--border-hairline)] bg-[var(--surface-inset)] p-4">
      <span className="grid h-14 w-14 shrink-0 place-items-center overflow-hidden rounded-xl border border-[var(--border-hairline)] bg-[var(--accent-soft)] text-sm font-bold text-[var(--accent-strong)]">
        {src ? (
          // eslint-disable-next-line @next/next/no-img-element -- user-provided logo URL/data URL.
          <img alt="" className="h-full w-full object-contain p-1.5" src={src} />
        ) : (
          fallback
        )}
      </span>
      <div className="min-w-0">
        <div className="text-sm font-semibold text-[var(--text-primary)]">Logo preview</div>
        <p className="mt-1 text-xs leading-5 text-[var(--text-muted)]">
          This mark is used in the sidebar. If no logo is saved, the short brand mark is shown.
        </p>
      </div>
    </div>
  );
}

export function BrandingSettingsForm({
  initialWorkspaceName,
  initialWorkspaceProfile,
  initialProductLabel,
  initialAssistantName,
  initialBrandShortName,
  initialBrandLogoUrl,
  initialBrandFaviconUrl,
}: {
  initialWorkspaceName: string;
  initialWorkspaceProfile: "individual" | "company" | "agency";
  initialProductLabel: string;
  initialAssistantName: string;
  initialBrandShortName: string;
  initialBrandLogoUrl: string;
  initialBrandFaviconUrl: string;
}) {
  const [state, action, pending] = useActionState(saveBrandingSettingsAction, null);
  const [workspaceName, setWorkspaceName] = useState(initialWorkspaceName);
  const [workspaceProfile, setWorkspaceProfile] = useState(initialWorkspaceProfile);
  const [productLabel, setProductLabel] = useState(initialProductLabel);
  const [assistantName, setAssistantName] = useState(initialAssistantName);
  const [brandShortName, setBrandShortName] = useState(initialBrandShortName);
  const [logoUrl, setLogoUrl] = useState(initialBrandLogoUrl);
  const [logoUpload, setLogoUpload] = useState("");
  const [clearLogo, setClearLogo] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const [logoFileName, setLogoFileName] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const previewSrc = clearLogo ? "" : logoUpload || logoUrl;

  function readLogo(file: File | undefined) {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setUploadError("Choose an image file.");
      return;
    }
    if (file.size > 550_000) {
      setUploadError("Use a logo under 550 KB for now.");
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      setLogoUpload(typeof reader.result === "string" ? reader.result : "");
      setClearLogo(false);
      setLogoFileName(file.name);
      setUploadError("");
    };
    reader.onerror = () => setUploadError("Couldn't read that logo file.");
    reader.readAsDataURL(file);
  }

  return (
    <form action={action} className="grid gap-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="grid gap-1.5">
          <span className="text-sm font-semibold text-[var(--text-primary)]">Workspace or company name</span>
          <input className={inputClass} name="workspaceName" onChange={(event) => setWorkspaceName(event.target.value)} placeholder="Arc" value={workspaceName} />
        </label>
        <label className="grid gap-1.5">
          <span className="text-sm font-semibold text-[var(--text-primary)]">Product label</span>
          <input className={inputClass} name="productLabel" onChange={(event) => setProductLabel(event.target.value)} placeholder="Marketing" value={productLabel} />
        </label>
        <label className="grid gap-1.5">
          <span className="text-sm font-semibold text-[var(--text-primary)]">Chat assistant name</span>
          <input className={inputClass} name="assistantName" onChange={(event) => setAssistantName(event.target.value)} placeholder="Agent" value={assistantName} />
          <span className="text-xs text-[var(--text-muted)]">Changes the visible chat name, prompts, and send box wording.</span>
        </label>
        <label className="grid gap-1.5">
          <span className="text-sm font-semibold text-[var(--text-primary)]">Short mark</span>
          <input className={inputClass} name="brandShortName" onChange={(event) => setBrandShortName(event.target.value)} placeholder="BS" value={brandShortName} />
          <span className="text-xs text-[var(--text-muted)]">Used when no uploaded logo is saved.</span>
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

      <BrandLogoPreview fallback={initialBrandShortName} src={previewSrc} />

      <div className="rounded-md border border-[var(--border-hairline)] bg-[var(--surface-inset)] p-4">
        <div className="text-sm font-semibold text-[var(--text-primary)]">Live preview</div>
        <div className="mt-3 grid gap-3 md:grid-cols-[14rem_1fr]">
          <div className="rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-sidebar)] p-3">
            <div className="flex items-center gap-2.5">
              <span className="grid h-8 w-8 place-items-center overflow-hidden rounded-lg bg-[var(--accent-soft)] text-xs font-bold text-[var(--accent-strong)]">
                {previewSrc ? (
                  // eslint-disable-next-line @next/next/no-img-element -- user preview can be URL/data URL.
                  <img alt="" className="h-full w-full object-contain p-1" src={previewSrc} />
                ) : (
                  brandShortName || "BS"
                )}
              </span>
              <span className="min-w-0">
                <span className="block truncate text-sm font-bold text-[var(--text-primary)]">{workspaceName || "Workspace"}</span>
                <span className="block truncate text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--accent)]">{productLabel || "Product"}</span>
              </span>
            </div>
          </div>
          <div className="rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-soft)] p-3">
            <div className="text-sm font-bold text-[var(--text-primary)]">What should {assistantName || "Agent"} work on?</div>
            <p className="mt-1 text-xs leading-5 text-[var(--text-muted)]">
              Message {assistantName || "Agent"}... Workspace mode: {workspaceProfile}.
            </p>
          </div>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="grid gap-1.5">
          <span className="text-sm font-semibold text-[var(--text-primary)]">Logo URL</span>
          <input
            className={inputClass}
            name="brandLogoUrl"
            onChange={(event) => {
              setLogoUrl(event.target.value);
              setLogoUpload("");
              setClearLogo(false);
            }}
            placeholder="/brand/logo.png or https://..."
            value={logoUrl}
          />
        </label>
        <label className="grid gap-1.5">
          <span className="text-sm font-semibold text-[var(--text-primary)]">Favicon URL</span>
          <input className={inputClass} defaultValue={initialBrandFaviconUrl} name="brandFaviconUrl" placeholder="/icon.svg" />
        </label>
      </div>

      <div className="grid gap-3 rounded-md border border-[var(--border-hairline)] bg-[var(--surface-soft)] p-3">
        <div>
          <div className="text-sm font-semibold text-[var(--text-primary)]">Upload logo</div>
          <p className="mt-1 text-xs leading-5 text-[var(--text-muted)]">
            Choose a PNG, JPG, WebP, GIF, or SVG. It saves directly with settings so it works without storage setup.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <input
            ref={fileInputRef}
            accept="image/*"
            className="hidden"
            onChange={(event) => readLogo(event.target.files?.[0])}
            type="file"
          />
          <Button size="sm" type="button" variant="ghost" onClick={() => fileInputRef.current?.click()}>
            Choose logo
          </Button>
          <span className="text-xs text-[var(--text-muted)]">{logoFileName || "No logo selected"}</span>
          <Button
            size="sm"
            type="button"
            variant="ghost"
            onClick={() => {
              setLogoUpload("");
              setLogoUrl("");
              setClearLogo(true);
              setLogoFileName("");
              if (fileInputRef.current) fileInputRef.current.value = "";
            }}
          >
            Remove logo
          </Button>
        </div>
        {uploadError ? <p className="text-xs font-semibold text-[var(--priority-text)]">{uploadError}</p> : null}
      </div>

      <input name="brandLogoUpload" type="hidden" value={logoUpload} />
      <input name="clearBrandLogo" type="hidden" value={clearLogo ? "1" : "0"} />

      <div className="flex flex-wrap items-center gap-3">
        <Button disabled={pending} size="sm" type="submit" variant="primary">
          Save branding
        </Button>
        <Feedback state={state} />
      </div>
    </form>
  );
}

export function MarkDefaultsForm({
  initialMode,
  initialRoute,
}: {
  initialMode: "ask" | "act" | "draft";
  initialRoute: "fast" | "standard";
}) {
  const agentName = useAgentName();
  const [state, action, pending] = useActionState(saveMarkDefaultsAction, null);

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
          <span className="text-sm font-semibold text-[var(--text-primary)]">Default model route</span>
          <select className={inputClass} defaultValue={initialRoute} name="markDefaultRoute">
            <option value="fast">Fast - routine chat and lookup</option>
            <option value="standard">Standard - deeper drafting/reasoning</option>
          </select>
          <span className="text-xs text-[var(--text-muted)]">
            Sent to the agent as metadata so Hermes can choose the right runner path.
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
  const [accent, setAccent] = useState(initialAccent);
  const [density, setDensity] = useState(initialDensity);
  const [motion, setMotion] = useState(initialMotion);
  const accentColor = {
    gold: "#c8a24a",
    blue: "#5bb7e8",
    red: "#d98080",
    steel: "#aeb5c2",
    emerald: "#7fb89a",
  }[accent];

  return (
    <form action={action} className="grid gap-5">
      <div className="rounded-md border border-[var(--border-hairline)] bg-[var(--surface-inset)] p-4">
        <div className="text-sm font-semibold text-[var(--text-primary)]">Live preview</div>
        <div
          className={`mt-3 rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-soft)] ${
            density === "compact" ? "p-2 text-xs" : "p-4 text-sm"
          }`}
          style={{ boxShadow: `inset 0 0 0 1px ${accentColor}44` }}
        >
          <div className="flex items-center justify-between gap-3">
            <span className="font-bold text-[var(--text-primary)]">Example control</span>
            <span className="rounded-md px-2 py-1 text-xs font-bold text-black" style={{ backgroundColor: accentColor }}>
              Accent
            </span>
          </div>
          <p className="mt-2 text-[var(--text-muted)]">
            {density === "compact" ? "Compact layout" : "Comfortable layout"} with {motion === "reduced" ? "minimal motion" : "standard motion"}.
          </p>
        </div>
      </div>

      <fieldset className="grid gap-2">
        <legend className="text-sm font-semibold text-[var(--text-primary)]">Accent color</legend>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {[
            ["gold", "Signal Gold", "#c8a24a"],
            ["blue", "Signal Blue", "#5bb7e8"],
            ["red", "Restoration Red", "#d98080"],
            ["steel", "Steel", "#aeb5c2"],
            ["emerald", "Emerald", "#7fb89a"],
          ].map(([value, label, color]) => (
            <label className={radioCardClass} key={value}>
              <input
                className="sr-only"
                checked={accent === value}
                name="appearanceAccent"
                onChange={() => setAccent(value as "gold" | "blue" | "red" | "steel" | "emerald")}
                type="radio"
                value={value}
              />
              <span className="h-5 w-5 rounded-full border border-[var(--border-strong)]" style={{ backgroundColor: color }} />
              <span className="font-semibold">{label}</span>
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset className="grid gap-2">
        <legend className="text-sm font-semibold text-[var(--text-primary)]">Interface density</legend>
        <div className="grid gap-2 sm:grid-cols-2">
          <label className={radioCardClass}>
            <input className="sr-only" checked={density === "comfortable"} name="appearanceDensity" onChange={() => setDensity("comfortable")} type="radio" value="comfortable" />
            <span className="font-semibold">Comfortable</span>
            <span className="ml-auto text-xs text-[var(--text-muted)]">More breathing room</span>
          </label>
          <label className={radioCardClass}>
            <input className="sr-only" checked={density === "compact"} name="appearanceDensity" onChange={() => setDensity("compact")} type="radio" value="compact" />
            <span className="font-semibold">Compact</span>
            <span className="ml-auto text-xs text-[var(--text-muted)]">Fits more on screen</span>
          </label>
        </div>
      </fieldset>

      <fieldset className="grid gap-2">
        <legend className="text-sm font-semibold text-[var(--text-primary)]">Motion</legend>
        <div className="grid gap-2 sm:grid-cols-2">
          <label className={radioCardClass}>
            <input className="sr-only" checked={motion === "standard"} name="appearanceMotion" onChange={() => setMotion("standard")} type="radio" value="standard" />
            <span className="font-semibold">Standard</span>
            <span className="ml-auto text-xs text-[var(--text-muted)]">Normal transitions</span>
          </label>
          <label className={radioCardClass}>
            <input className="sr-only" checked={motion === "reduced"} name="appearanceMotion" onChange={() => setMotion("reduced")} type="radio" value="reduced" />
            <span className="font-semibold">Reduced</span>
            <span className="ml-auto text-xs text-[var(--text-muted)]">Minimal animation</span>
          </label>
        </div>
      </fieldset>

      <div className="flex flex-wrap items-center gap-3">
        <Button disabled={pending} size="sm" type="submit" variant="primary">
          Save appearance
        </Button>
        <Feedback state={state} />
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
  const [tone, setTone] = useState(initialTone);
  const [style, setStyle] = useState(initialResponseStyle);
  const [strictness, setStrictness] = useState(initialApprovalStrictness);

  return (
    <form action={action} className="grid gap-5">
      <div className="rounded-md border border-[var(--border-hairline)] bg-[var(--surface-inset)] p-4">
        <div className="text-sm font-semibold text-[var(--text-primary)]">Live behavior preview</div>
        <p className="mt-2 text-sm leading-6 text-[var(--text-secondary)]">
          {assistantName} will answer in a <span className="font-semibold text-[var(--text-primary)]">{tone}</span> tone,
          keep responses <span className="font-semibold text-[var(--text-primary)]">{style}</span>, and use{" "}
          <span className="font-semibold text-[var(--text-primary)]">{strictness}</span> approval guardrails.
        </p>
      </div>

      <fieldset className="grid gap-2">
        <legend className="text-sm font-semibold text-[var(--text-primary)]">Tone</legend>
        <div className="grid gap-2 sm:grid-cols-2">
          {[
            ["direct", "Direct", "Concise, clear, operator-first"],
            ["friendly", "Friendly", "Warmer and more conversational"],
            ["formal", "Formal", "More polished and conservative"],
            ["sales", "Sales-focused", "More persuasive campaign language"],
          ].map(([value, label, hint]) => (
            <label className={radioCardClass} key={value}>
              <input
                className="sr-only"
                checked={tone === value}
                name="assistantTone"
                onChange={() => setTone(value as "direct" | "friendly" | "formal" | "sales")}
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

      <div className="grid gap-5 md:grid-cols-2">
        <fieldset className="grid gap-2">
          <legend className="text-sm font-semibold text-[var(--text-primary)]">Response style</legend>
          {[
            ["brief", "Brief", "Short answers unless asked for depth"],
            ["balanced", "Balanced", "Useful detail without walls of text"],
            ["detailed", "Detailed", "More reasoning, context, and options"],
          ].map(([value, label, hint]) => (
            <label className={radioCardClass} key={value}>
              <input
                className="sr-only"
                checked={style === value}
                name="assistantResponseStyle"
                onChange={() => setStyle(value as "brief" | "balanced" | "detailed")}
                type="radio"
                value={value}
              />
              <span className="grid gap-0.5">
                <span className="font-semibold">{label}</span>
                <span className="text-xs text-[var(--text-muted)]">{hint}</span>
              </span>
            </label>
          ))}
        </fieldset>

        <fieldset className="grid gap-2">
          <legend className="text-sm font-semibold text-[var(--text-primary)]">Approval strictness</legend>
          {[
            ["light", "Light", "Fewer warnings; still blocks outbound"],
            ["standard", "Standard", "Balanced safety checks"],
            ["strict", "Strict", "Extra cautious around claims and sends"],
          ].map(([value, label, hint]) => (
            <label className={radioCardClass} key={value}>
              <input
                className="sr-only"
                checked={strictness === value}
                name="approvalStrictness"
                onChange={() => setStrictness(value as "light" | "standard" | "strict")}
                type="radio"
                value={value}
              />
              <span className="grid gap-0.5">
                <span className="font-semibold">{label}</span>
                <span className="text-xs text-[var(--text-muted)]">{hint}</span>
              </span>
            </label>
          ))}
        </fieldset>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="grid gap-1.5">
          <span className="text-sm font-semibold text-[var(--text-primary)]">Default chat stance</span>
          <select className={inputClass} defaultValue={initialMode} name="markDefaultMode">
            <option value="ask">Ask - answer only</option>
            <option value="act">Act - work inside the app</option>
            <option value="draft">Draft - bias toward campaign assets</option>
          </select>
        </label>

        <label className="grid gap-1.5">
          <span className="text-sm font-semibold text-[var(--text-primary)]">Default model route</span>
          <select className={inputClass} defaultValue={initialRoute} name="markDefaultRoute">
            <option value="fast">Fast - routine chat and lookup</option>
            <option value="standard">Standard - deeper drafting/reasoning</option>
          </select>
        </label>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Button disabled={pending} size="sm" type="submit" variant="primary">
          Save behavior
        </Button>
        <Feedback state={state} />
      </div>
    </form>
  );
}
