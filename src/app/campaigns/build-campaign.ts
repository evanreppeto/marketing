const MAX_PROMPT = 2000;

export function parseBuildPrompt(raw: unknown): string {
  const prompt = String(raw ?? "").trim();
  if (!prompt) throw new Error("Describe the campaign you want the agent to build.");
  if (prompt.length > MAX_PROMPT) throw new Error(`Keep it under ${MAX_PROMPT} characters.`);
  return prompt;
}

/** A deterministic campaign name from the prompt (this app derives titles; it has
 *  no in-process LLM). First clause, titleized, capped at 60. */
export function deriveCampaignName(prompt: string): string {
  const clause = prompt.split(/[.!?\n]/)[0].replace(/\s+/g, " ").trim();
  const titled = clause.replace(/\b\w/g, (c) => c.toUpperCase());
  return titled.length <= 60 ? titled : `${titled.slice(0, 59).trimEnd()}…`;
}
