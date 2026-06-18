import { type AgentOperationsTask } from "@/lib/agent-operations/read-model";

/**
 * Derive the marketing channels a task touches so board cards can show real
 * channel logos (ChannelLogo / ChannelRow from @/app/_components/brand-logos).
 * There is no dedicated `channels` field on AgentOperationsTask, so we infer a
 * tasteful, deterministic set from the objective + campaign label + task type.
 * Order is stable (matches the order checked) so the logo row never reshuffles.
 */

const CHANNEL_MATCHERS: Array<{ channel: string; test: RegExp }> = [
  { channel: "Meta", test: /paid social|facebook|\bmeta\b|\bads?\b|advertis/i },
  { channel: "Instagram", test: /instagram|\big\b|reel|story|stories/i },
  { channel: "TikTok", test: /tiktok|\bugc\b/i },
  { channel: "Email", test: /email|newsletter|reactivation|sequence|outreach|nurture/i },
  { channel: "SMS", test: /\bsms\b|text message|\btext\b/i },
  { channel: "Web", test: /landing|one-?pager|web|site|page|brief|sheet|packet|package|asset/i },
];

export function deriveTaskChannels(task: AgentOperationsTask): string[] {
  const haystack = `${task.objective} ${task.campaignLabel ?? ""} ${task.task}`;
  const channels: string[] = [];
  for (const { channel, test } of CHANNEL_MATCHERS) {
    if (test.test(haystack) && !channels.includes(channel)) channels.push(channel);
  }
  return channels;
}
