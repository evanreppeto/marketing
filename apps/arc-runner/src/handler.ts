import { runArc } from "./arc";
import type { Config } from "./config";
import type { ArcClient } from "./arc-client";
import type { ArcChatMessagePayload } from "./types";

/**
 * Handle one operator chat message: run it through Arc (Claude Agent SDK, on your
 * subscription) and post the reply back to the app, which resolves the pending
 * bubble in /arc. Outbound stays locked — this only records a chat reply.
 */
export async function handleChatMessage(
  client: ArcClient,
  config: Config,
  payload: ArcChatMessagePayload,
): Promise<void> {
  console.log(`[arc-runner] wake received → running Arc for task ${payload.agentTaskId} (model=${config.model})`);
  const started = Date.now();
  try {
    const reply = await runArc(
      { agentTaskId: payload.agentTaskId, userMessage: payload.message, model: config.model },
      client,
    );
    await client.postChatReply({
      agentTaskId: payload.agentTaskId,
      body: reply || "(Arc returned an empty reply.)",
      status: reply ? "complete" : "failed",
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
