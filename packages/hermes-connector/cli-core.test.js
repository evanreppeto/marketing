import { describe, expect, it } from "vitest";

import { parseInitArgs, runInitCommand } from "./cli-core.js";

describe("parseInitArgs", () => {
  it("parses the init command options", () => {
    expect(
      parseInitArgs(["init", "--app", "https://acme.growthengine.com", "--token", "sk_live_test", "--secret", "shared", "--env", ".env.local"]),
    ).toEqual({
      ok: true,
      command: "init",
      app: "https://acme.growthengine.com",
      token: "sk_live_test",
      secret: "shared",
      env: ".env.local",
    });
  });

  it("requires app and token for init", () => {
    expect(parseInitArgs(["init", "--app", "https://acme.growthengine.com"])).toMatchObject({
      ok: false,
      message: expect.stringContaining("--token"),
    });
  });
});

describe("runInitCommand", () => {
  it("writes the Hermes env file with injected file IO", async () => {
    const writes = [];
    const lines = [];

    const result = await runInitCommand(["init", "--app", "https://acme.growthengine.com/", "--token", "sk_live_test"], {
      writeFile: async (path, contents) => writes.push({ path, contents }),
      stdout: (line) => lines.push(line),
    });

    expect(result).toEqual({ ok: true, envPath: ".env.growth-engine" });
    expect(writes).toEqual([
      {
        path: ".env.growth-engine",
        contents: expect.stringContaining("GROWTH_APP_BASE_URL=https://acme.growthengine.com"),
      },
    ]);
    expect(lines.join("\n")).toContain("Wrote .env.growth-engine");
  });
});
