import { describe, expect, it } from "vitest";

import { getVaultNotes } from "./read-model";

describe("getVaultNotes (no Supabase configured)", () => {
  it("returns fallback status with seeded notes when env vars are unset", async () => {
    const prevUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const prevKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    try {
      const model = await getVaultNotes();
      expect(model.status).toBe("fallback");
      expect(model.notes.length).toBeGreaterThan(0);
    } finally {
      if (prevUrl) process.env.NEXT_PUBLIC_SUPABASE_URL = prevUrl;
      if (prevKey) process.env.SUPABASE_SERVICE_ROLE_KEY = prevKey;
    }
  });
});
