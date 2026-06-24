// Throwaway spike (Phase 0): can a HEADLESS process call a Higgsfield MCP tool on
// Ultra credits, using a captured/replayable token? Deleted on GO (see the plan,
// docs/superpowers/plans/2026-06-24-higgsfield-arc-mcp.md, Task 0.4).
//
// Run: cd apps/arc-runner && HIGGSFIELD_TOKEN=<captured> CLAUDE_CODE_OAUTH_TOKEN=<yours> npx tsx src/spike-higgsfield.ts
//
// If you hit a 406 / "Not Acceptable": that's SDK issue #202 (HTTP transport omits the
// Accept: text/event-stream header) — a TRANSPORT problem, not an auth NO-GO. Flip
// TRANSPORT to "sse" below and/or bump @anthropic-ai/claude-agent-sdk, then re-run.
import { query } from "@anthropic-ai/claude-agent-sdk";

const TRANSPORT = "http" as const; // fallback to "sse" if a 406 occurs (see note above)

async function main() {
  const token = process.env.HIGGSFIELD_TOKEN?.trim();
  if (!token) throw new Error("Set HIGGSFIELD_TOKEN to the captured Higgsfield MCP token.");

  const options = {
    model: "claude-sonnet-4-6",
    permissionMode: "bypassPermissions" as const,
    mcpServers: {
      higgsfield: {
        type: TRANSPORT,
        url: "https://mcp.higgsfield.ai/mcp",
        headers: { Authorization: `Bearer ${token}` },
      },
    },
    // Allow every tool the higgsfield server exposes.
    allowedTools: ["mcp__higgsfield"],
    maxTurns: 6,
  };

  for await (const message of query({
    prompt:
      "Use the Higgsfield tools to list my available models, then run the cheapest available " +
      "image or virality-prediction tool once on a trivial prompt. Report exactly which tool " +
      "you called and the raw result.",
    options,
  })) {
    if (message.type === "assistant") {
      for (const block of message.message.content) {
        if (block.type === "text") console.log("[assistant]", block.text);
        if (block.type === "tool_use") console.log("[tool_use]", block.name, JSON.stringify(block.input));
      }
    } else if (message.type === "result") {
      console.log("[result]", JSON.stringify(message, null, 2));
    }
  }
}

main().catch((err) => {
  console.error("[spike-higgsfield] FAILED:", err);
  process.exit(1);
});
