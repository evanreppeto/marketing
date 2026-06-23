import { describe, expect, it } from "vitest";

import { summarizeSteps } from "@/domain";
import type { ArcStep } from "@/lib/arc-chat/persistence";

function step(label: string, status: "running" | "done" = "done"): ArcStep {
  return { label, status, at: "2026-06-23T00:00:00.000Z" };
}

describe("summarizeSteps", () => {
  it("returns an empty summary for no steps", () => {
    expect(summarizeSteps([])).toEqual({ groups: [], totalSteps: 0, doneCount: 0 });
  });

  it("collapses consecutive same-verb steps into one counted group", () => {
    const steps = [
      step("Creating lead for Rescue Plumbing"),
      step("Creating lead for Vanguard Plumbing"),
      step("Creating lead for Apex Plumbing"),
    ];
    const summary = summarizeSteps(steps);
    expect(summary.groups).toHaveLength(1);
    expect(summary.groups[0].count).toBe(3);
    expect(summary.groups[0].verb).toBe("Creating");
    expect(summary.totalSteps).toBe(3);
  });

  it("titles a collapsed group from the labels' common prefix, trailing connector trimmed", () => {
    const summary = summarizeSteps([
      step("Creating lead for Rescue Plumbing"),
      step("Creating lead for Vanguard Plumbing"),
    ]);
    // common prefix is "Creating lead for" → trailing "for" trimmed
    expect(summary.groups[0].title).toBe("Creating lead");
  });

  it("keeps the latest label of a group for a subtle 'now' line", () => {
    const summary = summarizeSteps([
      step("Creating lead for Rescue Plumbing"),
      step("Creating lead for Apex Plumbing"),
    ]);
    expect(summary.groups[0].latestLabel).toBe("Creating lead for Apex Plumbing");
  });

  it("starts a new group when the verb changes", () => {
    const summary = summarizeSteps([
      step("Searching CRM for lapsed leads"),
      step("Creating lead for Apex Plumbing"),
      step("Creating lead for Rescue Plumbing"),
    ]);
    expect(summary.groups).toHaveLength(2);
    expect(summary.groups[0].count).toBe(1);
    expect(summary.groups[1].count).toBe(2);
  });

  it("does not merge non-consecutive same-verb groups", () => {
    const summary = summarizeSteps([
      step("Creating lead for Apex Plumbing"),
      step("Scored the opportunity"),
      step("Creating lead for Rescue Plumbing"),
    ]);
    expect(summary.groups).toHaveLength(3);
  });

  it("marks a group running when its last step is still running", () => {
    const summary = summarizeSteps([
      step("Creating lead for Apex Plumbing", "done"),
      step("Creating lead for Rescue Plumbing", "running"),
    ]);
    expect(summary.groups[0].status).toBe("running");
  });

  it("marks a fully-finished group done", () => {
    const summary = summarizeSteps([step("Scored the opportunity", "done")]);
    expect(summary.groups[0].status).toBe("done");
  });

  it("counts only done steps in doneCount", () => {
    const summary = summarizeSteps([
      step("Creating lead for A", "done"),
      step("Creating lead for B", "done"),
      step("Creating lead for C", "running"),
    ]);
    expect(summary.doneCount).toBe(2);
    expect(summary.totalSteps).toBe(3);
  });

  it("keeps the original steps on the group for the expandable spine", () => {
    const steps = [step("Creating lead for A"), step("Creating lead for B")];
    const summary = summarizeSteps(steps);
    expect(summary.groups[0].steps).toEqual(steps);
  });

  it("treats a single step as a group of one", () => {
    const summary = summarizeSteps([step("Considering the options")]);
    expect(summary.groups).toHaveLength(1);
    expect(summary.groups[0].count).toBe(1);
    expect(summary.groups[0].title).toBe("Considering the options");
  });
});
