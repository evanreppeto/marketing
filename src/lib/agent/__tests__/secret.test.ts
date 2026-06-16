import { beforeEach, describe, expect, it, vi } from "vitest";

import { resolveWebhookSecret } from "../secret";

describe("resolveWebhookSecret", () => {
  beforeEach(() => {
    delete process.env.ARC_WEBHOOK_SECRET;
  });

  it("prefers the env secret over vault", async () => {
    process.env.ARC_WEBHOOK_SECRET = "env-secret";
    const client = { from: vi.fn() } as never;

    await expect(resolveWebhookSecret("vault-ref", client)).resolves.toBe("env-secret");
    expect((client as { from: ReturnType<typeof vi.fn> }).from).not.toHaveBeenCalled();
  });

  it("reads vault when no env secret and a ref exists", async () => {
    const client = {
      schema: () => ({
        from: () => ({
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({ data: { decrypted_secret: "vault-secret" }, error: null }),
            }),
          }),
        }),
      }),
    } as never;

    await expect(resolveWebhookSecret("vault-ref", client)).resolves.toBe("vault-secret");
  });

  it("returns null when neither env nor ref is present", async () => {
    await expect(resolveWebhookSecret(null, { from: vi.fn() } as never)).resolves.toBeNull();
  });

  it("degrades to null if vault read fails", async () => {
    const client = {
      schema: () => ({
        from: () => ({
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({ data: null, error: { message: "no vault" } }),
            }),
          }),
        }),
      }),
    } as never;

    await expect(resolveWebhookSecret("vault-ref", client)).resolves.toBeNull();
  });
});
