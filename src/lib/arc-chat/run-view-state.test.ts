import { describe, expect, it } from "vitest";

import { resolveArcRunViewState } from "./run-view-state";

describe("resolveArcRunViewState", () => {
  it("keeps a queued run visibly active while the request is pending", () => {
    expect(resolveArcRunViewState({
      pending: true,
      rows: [{ status: "queued" }, { status: "queued" }, { status: "queued" }],
    })).toMatchObject({
      state: "working",
      label: "Arc is working",
      progressLabel: "0/3 activities",
    });
  });

  it("reports failures consistently even when earlier work completed", () => {
    expect(resolveArcRunViewState({
      pending: false,
      messageStatus: "failed",
      rows: [{ status: "done" }, { status: "error" }],
    })).toMatchObject({
      state: "failed",
      label: "Needs attention",
    });
  });

  it("does not call an empty inspector complete", () => {
    expect(resolveArcRunViewState({ pending: false })).toMatchObject({
      state: "idle",
      label: "Ready",
    });
  });
});
