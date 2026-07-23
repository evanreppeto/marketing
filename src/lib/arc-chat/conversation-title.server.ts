import "server-only";

import {
  canRefreshArcConversationTitle,
  deriveArcOutcomeConversationTitle,
} from "./conversation-title";
import {
  getConversation,
  listMessages,
  renameConversation,
} from "./persistence";

/**
 * Upgrade Arc's automatic first-prompt title once the first real result exists.
 * Manual renames are never overwritten, and reply recording never depends on
 * this best-effort navigation enhancement succeeding.
 */
export async function refreshArcConversationTitleFromResult(input: {
  conversationId: string;
  response: string;
}) {
  const [conversation, messages] = await Promise.all([
    getConversation(input.conversationId),
    listMessages(input.conversationId),
  ]);
  const firstRequest = messages.find((message) => message.role === "operator")?.body.trim() ?? "";

  if (
    !conversation
    || !firstRequest
    || !canRefreshArcConversationTitle(conversation.title, firstRequest)
  ) {
    return false;
  }

  const title = deriveArcOutcomeConversationTitle({
    request: firstRequest,
    response: input.response,
  });
  if (!title || title === conversation.title) return false;

  await renameConversation(input.conversationId, title);
  return true;
}
