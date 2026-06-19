"use client";

import { useState, useTransition } from "react";

import { buttonClasses } from "@/app/_components/page-header";

import { FolderPlusIcon } from "./icons";
import { FOLDER_COLOR_OPTIONS } from "./folder-visuals";
import { createFolderAction } from "../actions";

/**
 * Ghost "New folder" button that reveals an inline name field. Submits the
 * name to createFolderAction; revalidatePath refreshes the rail.
 */
export function NewFolderButton({ parentFolderId }: { parentFolderId: string | null }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [color, setColor] = useState<string>(FOLDER_COLOR_OPTIONS[0].value);
  const [pending, startTransition] = useTransition();

  function submit() {
    const trimmed = name.trim();
    if (!trimmed) return;
    const formData = new FormData();
    formData.set("name", trimmed);
    formData.set("color", color);
    if (parentFolderId) formData.set("parentId", parentFolderId);
    startTransition(async () => {
      await createFolderAction(formData);
      setName("");
      setColor(FOLDER_COLOR_OPTIONS[0].value);
      setOpen(false);
    });
  }

  if (!open) {
    return (
      <button
        type="button"
        className={buttonClasses({ variant: "ghost", size: "sm" })}
        onClick={() => setOpen(true)}
      >
        <FolderPlusIcon className="h-3.5 w-3.5" />
        New folder
      </button>
    );
  }

  return (
    <form
      className="flex flex-wrap items-center gap-2"
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
    >
      <input
        autoFocus
        value={name}
        onChange={(event) => setName(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            setName("");
            setOpen(false);
          }
        }}
        placeholder="Folder name"
        className="min-h-9 w-40 rounded-md border border-[var(--border-hairline)] bg-[var(--surface-inset)] px-3 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--accent)]"
      />
      <div className="flex items-center gap-1.5" aria-label="Folder color">
        {FOLDER_COLOR_OPTIONS.map((option) => (
          <button
            key={option.value}
            type="button"
            aria-label={`${option.label} folder color`}
            aria-pressed={color === option.value}
            onClick={() => setColor(option.value)}
            className="grid h-7 w-7 place-items-center rounded-full border border-transparent transition hover:border-[var(--border-strong)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--accent)] aria-pressed:border-[var(--text-primary)]"
          >
            <span
              aria-hidden
              className="h-4 w-4 rounded-full border border-black/20"
              style={{ backgroundColor: option.value }}
            />
          </button>
        ))}
      </div>
      <button
        type="submit"
        className={buttonClasses({ variant: "primary", size: "sm" })}
        disabled={pending || name.trim().length === 0}
      >
        {pending ? "Adding..." : "Add"}
      </button>
      <button
        type="button"
        className={buttonClasses({ variant: "ghost", size: "sm" })}
        onClick={() => {
          setName("");
          setColor(FOLDER_COLOR_OPTIONS[0].value);
          setOpen(false);
        }}
      >
        Cancel
      </button>
    </form>
  );
}
