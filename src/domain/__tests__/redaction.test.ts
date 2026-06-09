import { describe, expect, it } from "vitest";

import { REDACTED, redactDeep, redactSecrets } from "../redaction";

describe("redactSecrets", () => {
  it("redacts bearer tokens", () => {
    expect(redactSecrets("call with Authorization: Bearer abcDEF123456 please")).toContain(REDACTED);
    expect(redactSecrets("Bearer abcDEF123456")).not.toContain("abcDEF123456");
  });

  it("redacts JWTs and provider key shapes", () => {
    const jwt =
      "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV";
    expect(redactSecrets(`token ${jwt}`)).toContain(REDACTED);
    expect(redactSecrets(`token ${jwt}`)).not.toContain(jwt);
    expect(redactSecrets("sk-ABCDEFGHIJKLMNOP")).toBe(REDACTED);
    expect(redactSecrets("ghp_ABCDEFGHIJKLMNOPQRSTUVWX1234")).toContain(REDACTED);
    expect(redactSecrets("AKIAABCDEFGHIJKLMNOP")).toContain(REDACTED);
  });

  it("keeps the key but redacts the value for key:value secrets", () => {
    const out = redactSecrets("api_key=supersecretvalue123");
    expect(out).toContain("api_key");
    expect(out).not.toContain("supersecretvalue123");
    expect(out).toContain(REDACTED);
  });

  it("leaves ordinary text untouched", () => {
    const text = "Found Madden Sewer and Drain in 60614, score 96.";
    expect(redactSecrets(text)).toBe(text);
  });
});

describe("redactDeep", () => {
  it("walks nested objects and arrays", () => {
    const out = redactDeep({
      note: "use Bearer abcDEF123456",
      items: ["sk-ABCDEFGHIJKLMNOP", "plain text"],
      nested: { detail: "ok" },
    }) as { note: string; items: string[]; nested: { detail: string } };
    expect(out.note).toContain(REDACTED);
    expect(out.items[0]).toBe(REDACTED);
    expect(out.items[1]).toBe("plain text");
    expect(out.nested.detail).toBe("ok");
  });

  it("redacts values under secret-looking keys wholesale", () => {
    const out = redactDeep({ password: "hunter2", token: "anything", label: "fine" }) as Record<string, string>;
    expect(out.password).toBe(REDACTED);
    expect(out.token).toBe(REDACTED);
    expect(out.label).toBe("fine");
  });
});
