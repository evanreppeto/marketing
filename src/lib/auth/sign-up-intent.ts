export type SignUpWorkspaceIntent = "create" | "join";
export type SignUpWorkspaceType = "company" | "agency" | "individual";

type SignUpIntentInput = {
  fullName: string;
  organizationName: string;
  workspaceIntent: string;
  workspaceType: string;
};

export type SignUpIntentResult =
  | {
      ok: true;
      metadata: {
        full_name: string;
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

function normalizeWorkspaceIntent(value: string): SignUpWorkspaceIntent {
  return value === "join" ? "join" : "create";
}

function normalizeWorkspaceType(value: string): SignUpWorkspaceType {
  return workspaceTypes.has(value as SignUpWorkspaceType) ? (value as SignUpWorkspaceType) : "company";
}

export function buildSignUpIntent(input: SignUpIntentInput): SignUpIntentResult {
  const fullName = clean(input.fullName, 96);
  if (!fullName) return { ok: false, error: "profile" };

  const workspaceIntent = normalizeWorkspaceIntent(input.workspaceIntent);
  const organizationName = clean(input.organizationName, 96);
  if (workspaceIntent === "create" && !organizationName) {
    return { ok: false, error: "organization" };
  }

  return {
    ok: true,
    metadata: {
      full_name: fullName,
      ...(organizationName ? { pending_organization_name: organizationName } : {}),
      pending_workspace_intent: workspaceIntent,
      pending_workspace_type: normalizeWorkspaceType(input.workspaceType),
    },
  };
}
