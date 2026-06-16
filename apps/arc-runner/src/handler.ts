import { runArcTurn } from "./arc";
import type { Config } from "./config";
import type { ArcClient } from "./arc-client";
import type { MarkChatMessagePayload } from "./types";

/**
 * Handle one operator chat message: run it through Arc (Claude Agent SDK) and
 * post the reply back to the app, which resolves the pending bubble in /mark.
 * Outbound stays locked — this only records a chat reply.
 */
export async function handleChatMessage(
  client: ArcClient,
  _config: Config,
  payload: MarkChatMessagePayload,
): Promise<void> {
  console.log(`[arc-runner] wake received → running Arc for task ${payload.agentTaskId} (route=${payload.route}, mode=${payload.mode})`);
  const started = Date.now();
  try {
    const result = await runArcTurn(payload, client);
    const reply = result.body;
    await client.postChatReply({
      agentTaskId: payload.agentTaskId,
      body: reply || "(Arc returned an empty reply.)",
      status: reply ? "complete" : "failed",
      metadata: result.actions.length > 0 ? { actions: result.actions } : {},
    });
    console.log(`[arc-runner] replied to task ${payload.agentTaskId} in ${Date.now() - started}ms`);
  } catch (error) {
    console.error("[arc-runner] Arc run failed:", error);
    await client
      .postChatReply({
        agentTaskId: payload.agentTaskId,
        status: "failed",
        body: "Arc hit an error generating a reply. Check the runner logs.",
      })
      .catch(() => undefined);
  }
}
