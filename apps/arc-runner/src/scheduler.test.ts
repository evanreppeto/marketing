import { describe, expect, it } from "vitest";

import { createFairScheduler } from "./scheduler";

/** Flush pending microtasks (pump cascades run on promise settle). */
const flush = () => new Promise<void>((r) => setTimeout(r, 0));

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

describe("createFairScheduler", () => {
  it("never runs more than the global concurrency cap at once", async () => {
    const scheduler = createFairScheduler({ maxConcurrent: 3, maxPerWorkspace: 99 });
    let current = 0;
    let peak = 0;
    const releases: Array<() => void> = [];

    for (let i = 0; i < 8; i++) {
      const gate = deferred();
      releases.push(gate.resolve);
      scheduler.schedule(`ws-${i}`, async () => {
        current += 1;
        peak = Math.max(peak, current);
        await gate.promise;
        current -= 1;
      });
    }

    await flush();
    expect(current).toBe(3); // only 3 of 8 started
    expect(scheduler.stats()).toMatchObject({ running: 3, pending: 5 });

    releases.forEach((release) => release());
    for (let i = 0; i < 6; i++) await flush();

    expect(current).toBe(0);
    expect(peak).toBe(3); // cap was never breached across the whole drain
    expect(scheduler.stats()).toMatchObject({ running: 0, pending: 0 });
  });

  it("caps per-workspace concurrency and stays fair so one tenant can't starve others", async () => {
    const scheduler = createFairScheduler({ maxConcurrent: 3, maxPerWorkspace: 1 });
    const perWs = new Map<string, number>();
    let maxPerWs = 0;
    const startOrder: string[] = [];
    const releases: Array<() => void> = [];

    const enqueue = (ws: string) => {
      const gate = deferred();
      releases.push(gate.resolve);
      scheduler.schedule(ws, async () => {
        startOrder.push(ws);
        const n = (perWs.get(ws) ?? 0) + 1;
        perWs.set(ws, n);
        maxPerWs = Math.max(maxPerWs, n);
        await gate.promise;
        perWs.set(ws, (perWs.get(ws) ?? 1) - 1);
      });
    };

    // A floods 3 jobs; B and C each have 1. A per-ws cap of 1 means A holds only
    // one global slot, so B and C run alongside A's first job instead of behind all 3.
    enqueue("A");
    enqueue("A");
    enqueue("A");
    enqueue("B");
    enqueue("C");

    await flush();
    expect(maxPerWs).toBe(1); // A never ran two at once
    expect(startOrder.slice(0, 3).sort()).toEqual(["A", "B", "C"]); // fairness: B/C not starved

    releases.forEach((release) => release());
    for (let i = 0; i < 8; i++) await flush();

    expect(perWs.get("A")).toBe(0);
    expect(startOrder.filter((w) => w === "A")).toHaveLength(3); // all of A's backlog still ran
    expect(scheduler.stats()).toMatchObject({ running: 0, pending: 0 });
  });
});
