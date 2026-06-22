"use client";

import { useState, useTransition } from "react";

import { buttonClasses } from "@/app/_components/page-header";

import { FolderPlusIcon } from "./icons";
import { createFolderAction } from "../actions";

/**
 * Ghost "New folder" button that reveals an inline name field. Submits the
 * name to createFolderAction; revalidatePath refreshes the rail.
 */
export function NewFolderButton({ parentFolderId }: { parentFolderId: string | null }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [pending, startTransition] = useTransition();

  function submit() {
    const trimmed = name.trim();
    if (!trimmed) return;
    const formData = new FormData();
    formData.set("name", trimmed);
    if (parentFolderId) formData.set("parentId", parentFolderId);
    startTransition(async () => {
      await createFolderAction(formData);
      setName("");
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
          setOpen(false);
        }}
      >
        Cancel
      </button>
    </form>
  );
}
