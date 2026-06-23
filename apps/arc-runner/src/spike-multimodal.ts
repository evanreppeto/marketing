/**
 * Task A8 — end-to-end multimodal verification spike.
 *
 * Does the Claude Agent SDK (subscription auth, via claude-code) actually
 * FORWARD image content blocks to the model? This de-risks the multimodal
 * attachment work (A5-A7) by calling the SDK the SAME way runArcQuery does:
 * a single streamed user message whose content is built by
 * buildTurnContentAsync (text + url image block).
 *
 * Run: `npm run spike:multimodal` (override URL via SPIKE_IMAGE_URL).
 * Must run where the spawned `claude` CLI has a logged-in subscription
 * (run `claude` once to /login first); otherwise the model call 401s.
 *
 * Verdicts:
 *  - model describes the cat            => image blocks reach the model (WORKS)
 *  - model replies NO_IMAGE_RECEIVED    => claude-code drops image blocks (BROKEN)
 *  - "API Error: 401 ... /login" / auth => COULD_NOT_RUN, the spawned CLI isn't
 *                                           authenticated here; run post-deploy
 */
import { query } from "@anthropic-ai/claude-agent-sdk";

import { buildTurnContentAsync } from "./attachments";

const IMAGE_URL =
  process.env.SPIKE_IMAGE_URL ??
  "https://upload.wikimedia.org/wikipedia/commons/thumb/3/3a/Cat03.jpg/240px-Cat03.jpg";

const PROMPT =
  "Describe the attached image in one short sentence. If you cannot see any image, reply exactly: NO_IMAGE_RECEIVED.";

/** Mirror arc.ts's (unexported) promptInput: wrap content blocks in one
 *  streamed SDKUserMessage so images reach the model. */
async function* promptInput(content: Awaited<ReturnType<typeof buildTurnContentAsync>>) {
  yield {
    type: "user" as const,
    session_id: "spike",
    parent_tool_use_id: null,
    message: { role: "user" as const, content },
  };
}

async function main(): Promise<number> {
  const content = await buildTurnContentAsync(PROMPT, [
    { url: IMAGE_URL, objectPath: "spike", contentType: "image/jpeg", name: "cat.jpg" },
  ]);

  if (typeof content === "string") {
    console.log("SPIKE ERROR: buildTurnContentAsync returned a plain string — no image block was built.");
    return 1;
  }

  let assistantText = "";
  let resultText = "";
  let childStderr = "";
  let exitError: unknown = null;

  // The spawned claude CLI can exit 1 even after delivering an assistant/result
  // message (e.g. it prints a benign Consumer-Terms notice to stderr, or returns
  // an in-band API error). Catch that terminal exit so we still print whatever
  // text arrived — the response text itself is the verdict, not the exit code.
  try {
    for await (const message of query({
      prompt: promptInput(content),
      options: {
        model: "claude-sonnet-4-6",
        permissionMode: "bypassPermissions",
        includePartialMessages: false,
        stderr: (chunk) => {
          childStderr += chunk;
        },
      },
    })) {
      if (message.type === "assistant") {
        for (const block of message.message.content) {
          if (block.type === "text") assistantText += block.text;
        }
      } else if (message.type === "result" && message.subtype === "success") {
        resultText = message.result;
      }
    }
  } catch (err) {
    exitError = err;
  }

  const text = (resultText || assistantText).trim();
  if (text) {
    console.log(`SPIKE RESULT: ${text}`);
    // An in-band auth error means the spawned CLI isn't logged in here — that's
    // COULD_NOT_RUN, not a real broken/works signal. Flag it so it isn't misread.
    if (/authentication|401|\/login/i.test(text)) {
      console.log("SPIKE NOTE: COULD_NOT_RUN — the spawned claude CLI is not authenticated in this environment. Run `claude` to /login, then re-run.");
      return 1;
    }
    return 0;
  }

  console.log(
    `SPIKE ERROR: ${
      exitError instanceof Error ? (exitError.stack ?? exitError.message) : String(exitError)
    }`,
  );
  if (childStderr.trim()) console.log(`SPIKE CHILD STDERR: ${childStderr.trim()}`);
  return 1;
}

main()
  .then((code) => process.exit(code))
  .catch((err) => {
    console.log(`SPIKE ERROR: ${err instanceof Error ? (err.stack ?? err.message) : String(err)}`);
    process.exit(1);
  });
