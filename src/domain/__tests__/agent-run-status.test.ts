import { describe, expect, it } from "vitest";

import { AGENT_RUN_STATUS_VALUES, isAgentRunStatus, normalizeAgentRunStatus } from "@/domain";
import type { Database } from "@/lib/supabase/database.types";

describe("normalizeAgentRunStatus", () => {
  it("passes through valid enum values", () => {
    expect(normalizeAgentRunStatus("running")).toBe("running");
    expect(normalizeAgentRunStatus("completed")).toBe("completed");
    expect(normalizeAgentRunStatus("canceled")).toBe("canceled");
  });

  it("maps the model's common aliases to real enum values", () => {
    expect(normalizeAgentRunStatus("in_progress")).toBe("running");
    expect(normalizeAgentRunStatus("done")).toBe("completed");
    expect(normalizeAgentRunStatus("success")).toBe("completed");
    expect(normalizeAgentRunStatus("error")).toBe("failed");
    expect(normalizeAgentRunStatus("cancelled")).toBe("canceled");
  });

  it("returns null for unknown / non-string values", () => {
    expect(normalizeAgentRunStatus("sideways")).toBeNull();
    expect(normalizeAgentRunStatus(undefined)).toBeNull();
    expect(normalizeAgentRunStatus("")).toBeNull();
  });

  it("isAgentRunStatus only accepts exact enum members", () => {
    expect(isAgentRunStatus("queued")).toBe(true);
    expect(isAgentRunStatus("in_progress")).toBe(false);
  });

  it("stays in sync with the generated DB enum (drift guard)", () => {
    const fromDb: ReadonlyArray<Database["public"]["Enums"]["agent_run_status"]> = AGENT_RUN_STATUS_VALUES;
    expect(fromDb).toHaveLength(5);
  });
});
