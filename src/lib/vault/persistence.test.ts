import { describe, expect, it } from "vitest";

import { rowToVaultNote, vaultNoteToRow, type VaultNoteRow } from "./persistence";
import type { VaultNote } from "@/domain";

const ROW: VaultNoteRow = {
  slug: "x",
  title: "X",
  folder: "Playbooks",
  tags: ["a", "b"],
  author: "Arc",
  status: "needs_review",
  body: "# X",
  updated_at: "2026-06-01T12:00:00.000Z",
};

describe("rowToVaultNote", () => {
  it("maps a db row to a VaultNote with display status and date", () => {
    expect(rowToVaultNote(ROW)).toEqual({
      slug: "x",
      title: "X",
      folder: "Playbooks",
      tags: ["a", "b"],
      author: "Arc",
      status: "Needs review",
      updated: "2026-06-01",
      body: "# X",
    });
  });

  it("defaults null tags and body", () => {
    const note = rowToVaultNote({ ...ROW, tags: null, body: null });
    expect(note.tags).toEqual([]);
    expect(note.body).toBe("");
  });
});

describe("vaultNoteToRow", () => {
  it("maps a VaultNote to a db row with enum status", () => {
    const note: VaultNote = {
      slug: "x", title: "X", folder: "Playbooks", tags: ["a"], author: "Arc",
      status: "Published", updated: "Today", body: "# X",
    };
    expect(vaultNoteToRow(note)).toEqual({
      slug: "x", title: "X", folder: "Playbooks", tags: ["a"], author: "Arc",
      status: "published", body: "# X",
    });
  });
});
