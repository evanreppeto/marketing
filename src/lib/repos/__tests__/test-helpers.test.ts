import { describe, expect, it } from "vitest";

import { createSupabaseQueryMock } from "./test-helpers";

describe("createSupabaseQueryMock", () => {
  it("returns canned data when the chain is awaited", async () => {
    const supabase = createSupabaseQueryMock({
      leads: { data: [{ id: "abc" }], error: null },
    });

    const result = await supabase.from("leads").select("*").order("received_at", { ascending: false });

    expect(result).toEqual({ data: [{ id: "abc" }], error: null });
  });

  it("records every chained call on the recorded calls log", async () => {
    const supabase = createSupabaseQueryMock({
      leads: { data: [], error: null },
    });

    await supabase.from("leads").select("id").eq("status", "validated").limit(5);

    expect(supabase.calls).toEqual([
      ["from", "leads"],
      ["select", "id"],
      ["eq", "status", "validated"],
      ["limit", 5],
    ]);
  });

  it("returns canned data for .single() too", async () => {
    const supabase = createSupabaseQueryMock({
      leads: { data: { id: "abc" }, error: null },
    });

    const result = await supabase.from("leads").select("*").eq("id", "abc").single();
    expect(result).toEqual({ data: { id: "abc" }, error: null });
  });

  it("returns an error response when configured", async () => {
    const supabase = createSupabaseQueryMock({
      leads: { data: null, error: { message: "boom" } },
    });

    const result = await supabase.from("leads").select("*");
    expect(result.error).toEqual({ message: "boom" });
  });
});
