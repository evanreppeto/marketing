"use client";

import Link from "next/link";
import { useActionState, useRef, useState } from "react";

import { buttonClasses } from "@/app/_components/page-header";

import { importFromGoogleDriveAction } from "../actions";

type PickerTokenResponse =
  | {
      ok: true;
      accessToken: string;
      apiKey: string;
      appId: string;
    }
  | {
      ok: false;
      message: string;
      missing?: string[];
    };

type PickerView = {
  setIncludeFolders?: (includeFolders: boolean) => PickerView;
  setSelectFolderEnabled?: (selectFolderEnabled: boolean) => PickerView;
};

type PickerBuilder = {
  enableFeature(feature: string): PickerBuilder;
  setDeveloperKey(apiKey: string): PickerBuilder;
  setAppId(appId: string): PickerBuilder;
  setOAuthToken(accessToken: string): PickerBuilder;
  addView(view: PickerView): PickerBuilder;
  setCallback(callback: (data: Record<string, unknown>) => void): PickerBuilder;
  build(): { setVisible(visible: boolean): void };
};

type GooglePicker = {
  Action: { PICKED: string };
  Document: { ID: string; NAME: string };
  Feature: { MULTISELECT_ENABLED: string; SUPPORT_DRIVES?: string };
  Response: { DOCUMENTS: string };
  View: new (viewId: string) => PickerView;
  ViewId: { DOCS: string };
  PickerBuilder: new () => PickerBuilder;
};

declare global {
  interface Window {
    gapi?: { load(api: string, callback: () => void): void };
    google?: { picker?: GooglePicker };
  }
}

let pickerLoadPromise: Promise<void> | null = null;

function loadGooglePicker(): Promise<void> {
  if (window.google?.picker) return Promise.resolve();
  if (pickerLoadPromise) return pickerLoadPromise;

  pickerLoadPromise = new Promise((resolve, reject) => {
    const loadPicker = () => {
      if (!window.gapi) {
        reject(new Error("Google Picker script loaded, but gapi was unavailable."));
        return;
      }
      window.gapi.load("picker", () => resolve());
    };

    const existing = document.querySelector<HTMLScriptElement>('script[src="https://apis.google.com/js/api.js"]');
    if (existing) {
      if (window.gapi) loadPicker();
      else existing.addEventListener("load", loadPicker, { once: true });
      return;
    }

    const script = document.createElement("script");
    script.src = "https://apis.google.com/js/api.js";
    script.async = true;
    script.defer = true;
    script.onload = loadPicker;
    script.onerror = () => reject(new Error("Google Picker script could not be loaded."));
    document.head.appendChild(script);
  });

  return pickerLoadPromise;
}

async function fetchPickerToken(): Promise<PickerTokenResponse> {
  const response = await fetch("/api/integrations/google-drive/picker", {
    cache: "no-store",
    headers: { accept: "application/json" },
  });
  const payload = (await response.json()) as PickerTokenResponse;
  if (!response.ok && payload.ok) {
    return { ok: false, message: "Google Drive Picker could not be opened." };
  }
  return payload;
}

function selectedFileIds(data: Record<string, unknown>, picker: GooglePicker): string[] {
  if (data.action !== picker.Action.PICKED) return [];
  const docs = data[picker.Response.DOCUMENTS];
  if (!Array.isArray(docs)) return [];
  return docs
    .map((doc) => {
      if (!doc || typeof doc !== "object") return null;
      const value = (doc as Record<string, unknown>)[picker.Document.ID];
      return typeof value === "string" ? value : null;
    })
    .filter((value): value is string => Boolean(value));
}

export function GoogleDriveImport({ activeFolderId }: { activeFolderId: string | null }) {
  const [state, action, pending] = useActionState(importFromGoogleDriveAction, null);
  const [pickerMessage, setPickerMessage] = useState<string | null>(null);
  const [pickerPending, setPickerPending] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  async function openPicker() {
    setPickerPending(true);
    setPickerMessage(null);
    try {
      const config = await fetchPickerToken();
      if (!config.ok) {
        setPickerMessage(config.message);
        return;
      }

      await loadGooglePicker();
      const picker = window.google?.picker;
      if (!picker) {
        setPickerMessage("Google Picker is unavailable in this browser.");
        return;
      }

      const view = new picker.View(picker.ViewId.DOCS);
      view.setIncludeFolders?.(true);
      view.setSelectFolderEnabled?.(false);

      const builder = new picker.PickerBuilder()
        .enableFeature(picker.Feature.MULTISELECT_ENABLED)
        .setDeveloperKey(config.apiKey)
        .setAppId(config.appId)
        .setOAuthToken(config.accessToken)
        .addView(view)
        .setCallback((data) => {
          const ids = selectedFileIds(data, picker);
          if (ids.length === 0) return;
          if (textareaRef.current) textareaRef.current.value = ids.join("\n");
          setPickerMessage(`Selected ${ids.length} file${ids.length === 1 ? "" : "s"}. Importing...`);
          formRef.current?.requestSubmit();
        });
      if (picker.Feature.SUPPORT_DRIVES) builder.enableFeature(picker.Feature.SUPPORT_DRIVES);
      builder.build().setVisible(true);
    } catch (error) {
      setPickerMessage(error instanceof Error ? error.message : "Google Drive Picker could not be opened.");
    } finally {
      setPickerPending(false);
    }
  }

  return (
    <details className="group relative">
      <summary className={buttonClasses({ variant: "ghost", size: "sm" })}>
        <DriveIcon />
        Drive
      </summary>
      <div className="absolute right-0 z-20 mt-2 w-[min(28rem,calc(100vw-2rem))] rounded-md border border-[var(--border-hairline)] bg-[var(--surface-raised)] p-4 shadow-[var(--elev-overlay)]">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-sm font-bold text-[var(--text-primary)]">Import from Google Drive</div>
            <p className="mt-1 text-xs leading-5 text-[var(--text-muted)]">
              Choose files from Drive. Arc copies selected files into Library.
            </p>
          </div>
          <Link className={buttonClasses({ variant: "ghost", size: "sm" })} href="/api/integrations/google-drive/connect">
            Connect
          </Link>
        </div>
        <form ref={formRef} action={action} className="mt-3 grid gap-3">
          {activeFolderId ? <input name="folderId" type="hidden" value={activeFolderId} /> : null}
          <button
            className={buttonClasses({ variant: "primary", size: "sm" })}
            disabled={pickerPending || pending}
            onClick={openPicker}
            type="button"
          >
            {pickerPending ? "Opening..." : "Choose from Drive"}
          </button>
          <textarea
            ref={textareaRef}
            className="min-h-24 resize-y rounded-md border border-[var(--border-hairline)] bg-[var(--surface-soft)] px-3 py-2 text-sm text-[var(--text-primary)] outline-none transition placeholder:text-[var(--text-muted)] focus:border-[var(--accent)] focus:ring-4 focus:ring-[var(--accent-soft)]"
            name="driveFiles"
            placeholder="https://drive.google.com/file/d/.../view"
          />
          <div className="flex flex-wrap items-center justify-between gap-2">
            {state ? (
              <p className={`text-xs font-semibold ${state.ok ? "text-[var(--ok-text)]" : "text-[var(--priority-text)]"}`}>
                {state.message}
              </p>
            ) : pickerMessage ? (
              <p className="text-xs font-semibold text-[var(--text-muted)]">{pickerMessage}</p>
            ) : (
              <p className="text-xs text-[var(--text-muted)]">You can also paste Drive links or IDs.</p>
            )}
            <button className={buttonClasses({ variant: "primary", size: "sm" })} disabled={pending} type="submit">
              {pending ? "Importing..." : "Import"}
            </button>
          </div>
        </form>
      </div>
    </details>
  );
}

function DriveIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M9 4h6l6 10-3 6H6l-3-6z" />
      <path d="M9 4 3 14" />
      <path d="m15 4 6 10" />
      <path d="M6 20 12 9l6 11" />
    </svg>
  );
}
