import { describe, expect, it } from "vitest";
import type { ArcClient } from "./arc-client";
import { ARC_APP_MAP } from "./app-map";
import { toolsForMode, type ArcMode } from "./tools";
import type { TurnSink } from "./tools/helpers";

const noStep = async () => {};
const sink: TurnSink = { card: () => {}, suggestion: () => {}, source: () => {}, question: () => {} };

function allRealToolNames(): Set<string> {
  const names = new Set<string>();
  for (const mode of ["ask", "scan", "act", "draft"] as ArcMode[]) {
    for (const t of toolsForMode(mode, {} as ArcClient, noStep, sink)) names.add(t.name);
  }
  return names;
}

describe("ARC_APP_MAP", () => {
  it("references only tool names that exist in the real tool registry", () => {
    const real = allRealToolNames();
    const referenced = ARC_APP_MAP.flatMap((s) => [...s.reads, ...s.writes]);
    const missing = referenced.filter((name) => !real.has(name));
    expect(missing).toEqual([]);
  });

  it("gives every surface a non-empty id and a route under /", () => {
    for (const s of ARC_APP_MAP) {
      expect(s.id.length).toBeGreaterThan(0);
      expect(s.route.startsWith("/")).toBe(true);
    }
  });
});
