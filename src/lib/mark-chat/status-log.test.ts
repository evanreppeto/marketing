import { afterEach, describe, expect, it, vi } from "vitest";

import { logMarkChatStatus } from "./status-log";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("logMarkChatStatus", () => {
  it("logs queued/processing transitions via console.info with task + conversation", () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);

    logMarkChatStatus("processing", { agentTaskId: "t1", conversationId: "c1", detail: "via=wake" });

    expect(info).toHaveBeenCalledTimes(1);
    expect(info.mock.calls[0][0]).toBe("[mark-chat] processing task=t1 conversation=c1 via=wake");
  });

  it("logs failed transitions via console.warn", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);

    logMarkChatStatus("failed", { agentTaskId: "t2" });

    expect(warn).toHaveBeenCalledWith("[mark-chat] failed task=t2");
    expect(info).not.toHaveBeenCalled();
  });

  it("omits the conversation segment when not provided", () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);

    logMarkChatStatus("waking_mark", { agentTaskId: "t3" });

    expect(info.mock.calls[0][0]).toBe("[mark-chat] waking_mark task=t3");
  });
});
