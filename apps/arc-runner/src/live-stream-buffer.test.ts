import { describe, expect, it, vi } from "vitest";

import { createCumulativeStreamBuffer } from "./live-stream-buffer";

describe("createCumulativeStreamBuffer", () => {
  it("flushes the unposted tail before completion", async () => {
    let clock = 1_000;
    const emit = vi.fn(async () => undefined);
    const stream = createCumulativeStreamBuffer({ onEmit: emit, throttleMs: 180, now: () => clock });

    await stream.append("The final ");
    clock += 20;
    await stream.append("answer.");

    expect(emit).toHaveBeenCalledTimes(1);
    expect(emit).toHaveBeenLastCalledWith("The final ");

    await stream.flush("The final answer.");

    expect(emit).toHaveBeenCalledTimes(2);
    expect(emit).toHaveBeenLastCalledWith("The final answer.");
  });

  it("does not duplicate a snapshot that was already emitted", async () => {
    const emit = vi.fn(async () => undefined);
    const stream = createCumulativeStreamBuffer({ onEmit: emit, throttleMs: 180, now: () => 1_000 });

    await stream.append("Complete");
    await stream.flush("Complete");

    expect(emit).toHaveBeenCalledTimes(1);
  });
});
