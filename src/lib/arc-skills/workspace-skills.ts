import "server-only";

/**
 * The full set of workspace-installed skills the runner can be handed: skills
 * imported from GitHub (stored in the `arc_custom_skills` settings blob) plus
 * exemplar skills Arc generated from the workspace's own campaign history
 * (stored in `arc_generated_skills`).
 *
 * This merge exists so command routing has ONE source of truth. Without it the
 * Skills screen would list a generated skill whose slash command silently
 * resolved to nothing — the command lookup reads workspace skills, and a
 * generated skill that never appears there is a button that does nothing.
 */

import { type SupabaseClient } from "@supabase/supabase-js";

import { listGeneratedSkills, toWorkspaceArcSkill } from "@/lib/exemplar-skills/persistence";

import { type WorkspaceArcSkill } from "./custom";
import { getWorkspaceArcSkills } from "./github";

/**
 * Imported + generated skills for one workspace. An imported skill wins a command
 * collision: the operator chose it explicitly, whereas a generated command is
 * derived automatically and can be regenerated under a different slice.
 */
export async function getAllWorkspaceArcSkills(
  orgId: string | null | undefined,
  workspaceName: string,
  client?: SupabaseClient,
): Promise<WorkspaceArcSkill[]> {
  if (!orgId) return [];
  const [imported, generated] = await Promise.all([
    getWorkspaceArcSkills(orgId, client).catch(() => [] as WorkspaceArcSkill[]),
    listGeneratedSkills(orgId, client).catch(() => []),
  ]);
  const takenCommands = new Set(imported.flatMap((skill) => skill.commands.map((c) => c.replace(/^\//, ""))));
  const takenKeys = new Set(imported.map((skill) => skill.key));
  const merged = [...imported];
  for (const record of generated) {
    if (takenKeys.has(record.key)) continue;
    if (takenCommands.has(record.command.replace(/^\//, ""))) continue;
    merged.push(toWorkspaceArcSkill(record, workspaceName));
  }
  return merged;
}
