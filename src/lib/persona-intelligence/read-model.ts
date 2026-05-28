import { getSupabaseAdminClient, isSupabaseAdminConfigured } from "../supabase/server";

export type PersonaSnapshotView = {
  basePersona: string;
  relationshipStage: string;
  valueTier: string;
  recentBehavior: string;
  dominantLossPattern: string;
  preferredChannel: string;
  messagePosture: string;
  recommendedOffer: string;
  nextBestAction: string;
  confidence: string;
  riskFlags: string[];
};

export type EngagementEventView = {
  event: string;
  channel: string;
  detail: string;
  time: string;
};

export type NextBestActionView = {
  action: string;
  reason: string;
  approval: string;
};

export type PersistedPersonaIntelligenceView =
  | {
      status: "mock";
      message: string;
    }
  | {
      status: "live";
      message: string;
      snapshot?: PersonaSnapshotView;
      engagementEvents: EngagementEventView[];
      nextBestActions: NextBestActionView[];
    }
  | {
      status: "unavailable";
      message: string;
    };

type PersonaSnapshotRow = {
  id: string;
  persona: string;
  relationship_stage: string | null;
  value_tier: string | null;
  dominant_loss_pattern: string | null;
  preferred_channel: string | null;
  message_posture: string | null;
  recommended_offer: string | null;
  next_best_action: string | null;
  confidence_score: number | null;
  risk_flags: string[] | null;
  updated_at: string;
};

type EngagementEventRow = {
  event_type: string;
  channel: string | null;
  summary: string | null;
  occurred_at: string;
};

type NextBestActionRow = {
  title: string;
  recommendation: string | null;
  reason: string | null;
  approval_required: boolean;
  status: string;
};

export async function getPersistedPersonaIntelligenceForRecord(
  recordId: string,
): Promise<PersistedPersonaIntelligenceView> {
  if (!isSupabaseAdminConfigured()) {
    return {
      status: "mock",
      message: "Supabase env vars are not configured, so CRM detail pages are using mock persona intelligence.",
    };
  }

  if (!isUuid(recordId)) {
    return {
      status: "mock",
      message: "This scaffold record is not a persisted UUID yet, so the page is using mock persona intelligence.",
    };
  }

  try {
    const supabase = getSupabaseAdminClient();
    const subjectFilter = [
      `company_id.eq.${recordId}`,
      `contact_id.eq.${recordId}`,
      `property_id.eq.${recordId}`,
      `lead_id.eq.${recordId}`,
      `job_id.eq.${recordId}`,
      `outcome_id.eq.${recordId}`,
    ].join(",");
    const actionSubjectFilter = [
      `company_id.eq.${recordId}`,
      `contact_id.eq.${recordId}`,
      `property_id.eq.${recordId}`,
      `lead_id.eq.${recordId}`,
    ].join(",");

    const { data: snapshots, error: snapshotError } = await supabase
      .from("persona_snapshots")
      .select(
        "id, persona, relationship_stage, value_tier, dominant_loss_pattern, preferred_channel, message_posture, recommended_offer, next_best_action, confidence_score, risk_flags, updated_at",
      )
      .or(subjectFilter)
      .order("updated_at", { ascending: false })
      .limit(1)
      .returns<PersonaSnapshotRow[]>();

    if (snapshotError) {
      throw snapshotError;
    }

    const snapshot = snapshots?.[0];
    const actionFilter = snapshot ? `persona_snapshot_id.eq.${snapshot.id},${actionSubjectFilter}` : actionSubjectFilter;

    const [{ data: events, error: eventsError }, { data: actions, error: actionsError }] = await Promise.all([
      supabase
        .from("engagement_events")
        .select("event_type, channel, summary, occurred_at")
        .or(subjectFilter)
        .order("occurred_at", { ascending: false })
        .limit(6)
        .returns<EngagementEventRow[]>(),
      supabase
        .from("next_best_actions")
        .select("title, recommendation, reason, approval_required, status")
        .or(actionFilter)
        .order("priority", { ascending: false })
        .limit(5)
        .returns<NextBestActionRow[]>(),
    ]);

    if (eventsError) {
      throw eventsError;
    }

    if (actionsError) {
      throw actionsError;
    }

    return {
      status: "live",
      message: snapshot
        ? "Live Supabase persona intelligence is connected for this record."
        : "Supabase is connected, but no persona snapshot exists for this record yet.",
      snapshot: snapshot ? mapSnapshot(snapshot) : undefined,
      engagementEvents: (events ?? []).map(mapEngagementEvent),
      nextBestActions: (actions ?? []).map(mapNextBestAction),
    };
  } catch (error) {
    return {
      status: "unavailable",
      message: error instanceof Error ? error.message : "Persona intelligence persistence is unavailable.",
    };
  }
}

function mapSnapshot(row: PersonaSnapshotRow): PersonaSnapshotView {
  return {
    basePersona: row.persona,
    relationshipStage: row.relationship_stage ?? "needs_review",
    valueTier: row.value_tier ?? "medium",
    recentBehavior: `updated_${formatRelative(row.updated_at)}`,
    dominantLossPattern: row.dominant_loss_pattern ?? "needs_operator_review",
    preferredChannel: row.preferred_channel ?? "operator_review",
    messagePosture: row.message_posture ?? "approval_safe_manual_review",
    recommendedOffer: row.recommended_offer ?? "Review before offer",
    nextBestAction: row.next_best_action ?? "Review profile",
    confidence: `${row.confidence_score ?? 0}%`,
    riskFlags: row.risk_flags ?? [],
  };
}

function mapEngagementEvent(row: EngagementEventRow): EngagementEventView {
  return {
    event: row.event_type.replaceAll("_", " "),
    channel: row.channel ?? "system",
    detail: row.summary ?? "Persisted event without summary.",
    time: formatRelative(row.occurred_at),
  };
}

function mapNextBestAction(row: NextBestActionRow): NextBestActionView {
  return {
    action: row.title,
    reason: row.reason ?? row.recommendation ?? "Persisted recommendation awaiting operator review.",
    approval: row.approval_required ? "Human approval required" : `No approval required (${row.status})`,
  };
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function formatRelative(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "Recently";
  }

  return date.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}
