import { beforeEach, describe, expect, it, vi } from "vitest";

import { sendBrandedEmail } from "./index";

const theme = { appName: "Summit", accentColor: "#0B0B0C" };

describe("sendBrandedEmail", () => {
  beforeEach(() => {
    delete process.env.RESEND_API_KEY;
    delete process.env.RESEND_FROM;
  });

  it("returns ok:false when Resend creds are missing", async () => {
    const result = await sendBrandedEmail({ to: "a@b.com", subject: "Hi", heading: "Hi", bodyBlocks: ["x"], theme });
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/RESEND/);
  });

  it("renders + sends via the injected sender and returns the provider id", async () => {
    const send = vi.fn().mockResolvedValue({ id: "msg_123" });
    const result = await sendBrandedEmail(
      { to: "a@b.com", subject: "Hi", heading: "Hi", bodyBlocks: ["x"], theme },
      { send, apiKey: "re_test", from: "Summit <hi@summit.com>" },
    );
    expect(result).toEqual({ ok: true, id: "msg_123" });
    expect(send).toHaveBeenCalledWith("re_test", expect.objectContaining({
      from: "Summit <hi@summit.com>",
      to: ["a@b.com"],
      subject: "Hi",
      html: expect.stringContaining("Hi"),
      text: expect.stringContaining("Hi"),
    }));
  });

  it("returns ok:false with the error message when the send throws", async () => {
    const send = vi.fn().mockRejectedValue(new Error("Resend 422"));
    const result = await sendBrandedEmail(
      { to: "a@b.com", subject: "Hi", heading: "Hi", bodyBlocks: ["x"], theme },
      { send, apiKey: "re_test", from: "Summit <hi@summit.com>" },
    );
    expect(result).toEqual({ ok: false, error: "Resend 422" });
  });
});
