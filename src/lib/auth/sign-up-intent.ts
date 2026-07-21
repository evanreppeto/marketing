import { isKnownIndustry } from "@/lib/personas/industry-templates";

export type SignUpWorkspaceIntent = "create" | "join";
export type SignUpWorkspaceType = "company" | "agency" | "individual";

type SignUpIntentInput = {
  firstName?: string;
  fullName: string;
  industry?: string;
  inviteCode: string;
  lastName?: string;
  organizationName: string;
  workspaceIntent: string;
  workspaceType: string;
};

export type SignUpIntentResult =
  | {
      ok: true;
      metadata: {
        full_name: string;
        pending_invite_code?: string;
        pending_industry?: string;
        pending_organization_name?: string;
        pending_workspace_intent: SignUpWorkspaceIntent;
        pending_workspace_type: SignUpWorkspaceType;
      };
    }
  | { ok: false; error: "profile" | "organization" };

const workspaceTypes = new Set<SignUpWorkspaceType>(["company", "agency", "individual"]);

function clean(value: string, maxLength: number) {
  return value.trim().replace(/\s+/g, " ").slice(0, maxLength).trim();
}

function cleanInviteCode(value: string) {
  return value
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "")
    .replace(/[^A-Z0-9-]/g, "")
    .slice(0, 32);
}

function normalizeWorkspaceIntent(value: string): SignUpWorkspaceIntent {
  return value === "join" ? "join" : "create";
}

function normalizeWorkspaceType(value: string): SignUpWorkspaceType {
  return workspaceTypes.has(value as SignUpWorkspaceType) ? (value as SignUpWorkspaceType) : "company";
}

function normalizeIndustry(value: string | undefined): string {
  return isKnownIndustry(value) ? (value as string) : "general";
}

export function buildSignUpIntent(input: SignUpIntentInput): SignUpIntentResult {
  const splitName = clean(`${input.firstName ?? ""} ${input.lastName ?? ""}`, 96);
  const fullName = clean(input.fullName, 96) || splitName;
  if (!fullName) return { ok: false, error: "profile" };

  const workspaceIntent = normalizeWorkspaceIntent(input.workspaceIntent);
  const organizationName = clean(input.organizationName, 96);
  const inviteCode = cleanInviteCode(input.inviteCode);
  if (workspaceIntent === "create" && !organizationName) {
    return { ok: false, error: "organization" };
  }

  return {
    ok: true,
    metadata: {
      full_name: fullName,
      ...(workspaceIntent === "join" && inviteCode ? { pending_invite_code: inviteCode } : {}),
      ...(workspaceIntent === "create" ? { pending_industry: normalizeIndustry(input.industry) } : {}),
      ...(organizationName ? { pending_organization_name: organizationName } : {}),
      pending_workspace_intent: workspaceIntent,
      pending_workspace_type: normalizeWorkspaceType(input.workspaceType),
    },
  };
}
