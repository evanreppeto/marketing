import "server-only";

import { type SupabaseClient } from "@supabase/supabase-js";

import { getSupabaseAdminClient, isSupabaseAdminConfigured } from "../supabase/server";
import { parseGithubSkillMarkdown, parseWorkspaceArcSkills, type WorkspaceArcSkill } from "./custom";

export const ARC_CUSTOM_SKILLS_SETTING = "arc_custom_skills";

type GithubTarget = { owner: string; repo: string; path: string; ref?: string; repositoryUrl: string };

export function parseGithubSkillUrl(value: string): GithubTarget {
  let url: URL;
  try { url = new URL(value.trim()); } catch { throw new Error("Paste a valid public GitHub URL."); }
  if (url.protocol !== "https:" || url.hostname.toLowerCase() !== "github.com") {
    throw new Error("Arc currently imports skills from public github.com URLs.");
  }
  const parts = url.pathname.split("/").filter(Boolean).map(decodeURIComponent);
  const [owner, repo] = parts;
  if (!owner || !repo || !/^[\w.-]+$/.test(owner) || !/^[\w.-]+$/.test(repo)) throw new Error("That GitHub repository URL is incomplete.");
  let path = "SKILL.md";
  let ref: string | undefined;
  if (parts[2] === "blob") {
    ref = parts[3];
    path = parts.slice(4).join("/");
    if (!ref || !path) throw new Error("Open the SKILL.md file on GitHub and copy its URL.");
  } else if (parts[2] === "tree") {
    ref = parts[3];
    const directory = parts.slice(4).join("/");
    if (!ref || !directory) throw new Error("Open the skill folder on GitHub and copy its URL.");
    path = /(^|\/)SKILL\.md$/i.test(directory) ? directory : `${directory}/SKILL.md`;
  } else if (parts.length > 2) {
    throw new Error("Use a repository URL or the GitHub URL for a SKILL.md file.");
  }
  if (!/(^|\/)SKILL\.md$/i.test(path)) throw new Error("Choose a SKILL.md file.");
  return { owner, repo: repo.replace(/\.git$/i, ""), path, ref, repositoryUrl: url.toString() };
}

export async function previewGithubArcSkill(url: string): Promise<WorkspaceArcSkill> {
  const target = parseGithubSkillUrl(url);
  const endpoint = new URL(`https://api.github.com/repos/${encodeURIComponent(target.owner)}/${encodeURIComponent(target.repo)}/contents/${target.path.split("/").map(encodeURIComponent).join("/")}`);
  if (target.ref) endpoint.searchParams.set("ref", target.ref);
  const response = await fetch(endpoint, {
    headers: { Accept: "application/vnd.github.raw+json", "User-Agent": "Arc-Skill-Importer" },
    signal: AbortSignal.timeout(8_000),
    cache: "no-store",
  });
  if (!response.ok) {
    if (response.status === 404) throw new Error("Arc could not find that public SKILL.md.");
    throw new Error(`GitHub could not be reached (${response.status}).`);
  }
  const markdown = await response.text();
  return parseGithubSkillMarkdown({ markdown, owner: target.owner, repo: target.repo, repositoryUrl: target.repositoryUrl });
}

export async function getWorkspaceArcSkills(orgId: string | null | undefined, client?: SupabaseClient): Promise<WorkspaceArcSkill[]> {
  if (!orgId) return [];
  const supabase = client ?? (isSupabaseAdminConfigured() ? getSupabaseAdminClient() : null);
  if (!supabase) return [];
  const { data, error } = await supabase.from("app_settings").select("value").eq("org_id", orgId).eq("key", ARC_CUSTOM_SKILLS_SETTING).maybeSingle();
  if (error) return [];
  return parseWorkspaceArcSkills((data as { value?: unknown } | null)?.value);
}
