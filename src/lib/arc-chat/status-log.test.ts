import { afterEach, describe, expect, it, vi } from "vitest";

import { logArcChatStatus } from "./status-log";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("logArcChatStatus", () => {
  it("logs queued/processing transitions via console.info with task + conversation", () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);

    logArcChatStatus("processing", { agentTaskId: "t1", conversationId: "c1", detail: "via=wake" });

    expect(info).toHaveBeenCalledTimes(1);
    expect(info.mock.calls[0][0]).toBe("[arc-chat] processing task=t1 conversation=c1 via=wake");
  });

  it("logs failed transitions via console.warn", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);

    logArcChatStatus("failed", { agentTaskId: "t2" });

    expect(warn).toHaveBeenCalledWith("[arc-chat] failed task=t2");
    expect(info).not.toHaveBeenCalled();
  });

  it("omits the conversation segment when not provided", () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);

    logArcChatStatus("waking_arc", { agentTaskId: "t3" });

    expect(info.mock.calls[0][0]).toBe("[arc-chat] waking_arc task=t3");
  });
});
