import { describe, expect, it } from "vitest";

import { buildQueryOptions, inferenceForRoute } from "./inference";

describe("inferenceForRoute", () => {
  it("routes fast chat to Sonnet with a light thinking budget", () => {
    const s = inferenceForRoute("fast");
    expect(s.model).toBe("claude-sonnet-4-6");
    expect(s.maxThinkingTokens).toBeGreaterThan(0);
  });

  it("routes standard work to Opus with a deeper thinking budget than chat", () => {
    const s = inferenceForRoute("standard");
    expect(s.model).toBe("claude-opus-4-8");
    expect(s.maxThinkingTokens).toBeGreaterThan(inferenceForRoute("fast").maxThinkingTokens);
  });

  it("sets a fallback model and cost/turn rails on every route", () => {
    for (const route of ["fast", "standard"] as const) {
      const s = inferenceForRoute(route);
      expect(s.fallbackModel.length).toBeGreaterThan(0);
      expect(s.maxTurns).toBeGreaterThan(0);
      expect(s.maxBudgetUsd).toBeGreaterThan(0);
    }
  });
});

describe("buildQueryOptions", () => {
  it("applies inference settings and keeps the outbound-safe permission flags", () => {
    const opts = buildQueryOptions({
      inference: inferenceForRoute("standard"),
      systemPrompt: "SYS",
      mcpServers: {},
      allowedTools: ["query_brain"],
    });
    expect(opts.systemPrompt).toBe("SYS");
    expect(opts.model).toBe("claude-opus-4-8");
    expect(opts.fallbackModel).toBe("claude-sonnet-4-6");
    expect(opts.maxThinkingTokens).toBeGreaterThan(0);
    expect(opts.maxTurns).toBeGreaterThan(0);
    expect(opts.maxBudgetUsd).toBeGreaterThan(0);
    expect(opts.allowedTools).toEqual(["query_brain"]);
    expect(opts.permissionMode).toBe("bypassPermissions");
    expect(opts.includePartialMessages).toBe(true);
  });

  it("carries the fast-route Sonnet model + Haiku fallback through", () => {
    const opts = buildQueryOptions({
      inference: inferenceForRoute("fast"),
      systemPrompt: "SYS",
      mcpServers: {},
      allowedTools: [],
    });
    expect(opts.model).toBe("claude-sonnet-4-6");
    expect(opts.fallbackModel).toBe("claude-haiku-4-5");
  });
});
