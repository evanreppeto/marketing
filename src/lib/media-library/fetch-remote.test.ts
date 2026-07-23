import { describe, expect, it, vi } from "vitest";

import { fetchRemoteMedia } from "./fetch-remote";

const PUBLIC_LOOKUP = async () => [{ address: "93.184.216.34", family: 4 }];

function pngResponse(bytes = 16, headers: Record<string, string> = {}): Response {
  return new Response(new Uint8Array(bytes).fill(1), {
    status: 200,
    headers: { "content-type": "image/png", ...headers },
  });
}

describe("fetchRemoteMedia", () => {
  it("fetches an https image and resolves the content type", async () => {
    const fetcher = vi.fn(async () => pngResponse());
    const result = await fetchRemoteMedia(
      { url: "https://cdn.example.com/roof.png", fileName: "roof.png" },
      { fetcher, lookup: PUBLIC_LOOKUP },
    );
    expect(result).toMatchObject({ ok: true, contentType: "image/png" });
    expect(fetcher).toHaveBeenCalledOnce();
  });

  it("refuses non-https URLs without touching the network", async () => {
    const fetcher = vi.fn();
    const result = await fetchRemoteMedia({ url: "http://cdn.example.com/a.png", fileName: "a.png" }, { fetcher });
    expect(result).toMatchObject({ ok: false, error: expect.stringContaining("https") });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it.each([
    ["loopback", "127.0.0.1", 4],
    ["private 10.x", "10.1.2.3", 4],
    ["private 172.16", "172.16.0.9", 4],
    ["private 192.168", "192.168.1.1", 4],
    ["cloud metadata", "169.254.169.254", 4],
    ["v6 loopback", "::1", 6],
    ["v6 unique-local", "fd00::2", 6],
    ["v4-mapped private", "::ffff:10.0.0.5", 6],
  ])("refuses hosts resolving to %s space", async (_label, address, family) => {
    const fetcher = vi.fn();
    const result = await fetchRemoteMedia(
      { url: "https://internal.example.com/a.png", fileName: "a.png" },
      { fetcher, lookup: async () => [{ address, family }] },
    );
    expect(result.ok).toBe(false);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("caps the size from the declared length and from the actual body", async () => {
    const declared = await fetchRemoteMedia(
      { url: "https://cdn.example.com/big.png", fileName: "big.png" },
      { fetcher: async () => pngResponse(16, { "content-length": String(200 * 1024 * 1024) }), lookup: PUBLIC_LOOKUP },
    );
    expect(declared).toMatchObject({ ok: false, error: expect.stringContaining("too large") });
  });

  it("refuses unsupported content types", async () => {
    const result = await fetchRemoteMedia(
      { url: "https://cdn.example.com/app.exe", fileName: "app.exe" },
      { fetcher: async () => new Response(new Uint8Array(8), { status: 200, headers: { "content-type": "application/octet-stream" } }), lookup: PUBLIC_LOOKUP },
    );
    expect(result.ok).toBe(false);
  });

  it("surfaces upstream failure statuses", async () => {
    const result = await fetchRemoteMedia(
      { url: "https://cdn.example.com/gone.png", fileName: "gone.png" },
      { fetcher: async () => new Response(null, { status: 404 }), lookup: PUBLIC_LOOKUP },
    );
    expect(result).toMatchObject({ ok: false, error: expect.stringContaining("404") });
  });
});
