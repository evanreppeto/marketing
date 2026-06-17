import { runArcOpportunityDraft, runArcTurn } from "./arc";
import type { Config } from "./config";
import type { ArcClient } from "./arc-client";
import type { ArcOpportunityDraftPayload, MarkChatMessagePayload } from "./types";

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
    const metadata: Record<string, unknown> = {};
    if (result.actions.length > 0) metadata.actions = result.actions;
    if (result.suggestions.length > 0) metadata.suggestions = result.suggestions;
    if (result.questions.length > 0) metadata.questions = result.questions;
    await client.postChatReply({
      agentTaskId: payload.agentTaskId,
      body: reply || "(Arc returned an empty reply.)",
      status: reply ? "complete" : "failed",
      metadata,
      ...(result.sources.length > 0 ? { mentions: result.sources } : {}),
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

/**
 * Handle an `arc_opportunity_draft` wake: run Arc in DRAFT mode against the
 * briefing to produce an approval-gated campaign package. The draft links back
 * to the opportunity via opportunity_id (threaded into create_campaign_draft),
 * and the draft-asset endpoint flips the opportunity to "drafted" — that link is
 * the real outcome, so there is no separate task-completion call here (the
 * ArcClient exposes none and we don't fabricate endpoints). Outbound stays
 * locked; everything Arc produces awaits human approval.
 */
export async function handleOpportunityDraft(
  client: ArcClient,
  _config: Config,
  payload: ArcOpportunityDraftPayload,
): Promise<void> {
  console.log(
    `[arc-runner] opportunity-draft wake received → drafting for opportunity ${payload.opportunityId} (task ${payload.agentTaskId}, lead ${payload.leadId})`,
  );
  const started = Date.now();
  try {
    const result = await runArcOpportunityDraft(payload, client);
    console.log(
      `[arc-runner] opportunity ${payload.opportunityId} drafted in ${Date.now() - started}ms (${result.actions.length} card(s))`,
    );
  } catch (error) {
    console.error(`[arc-runner] opportunity-draft run failed for ${payload.opportunityId}:`, error);
  }
}
