import { type SupabaseClient } from "@supabase/supabase-js";

import { getSupabaseAdminClient, isSupabaseAdminConfigured } from "../supabase/server";
import { type Tables } from "../supabase/database.types";

export type RoutingTone = "green" | "amber" | "red";

export type RoutingQueueLead = {
  id: string;
  code: string;
  lead: string;
  receivedAt: string;
  source: string;
  channel: string;
  issue: string;
  location: string;
  decision: string;
  tone: RoutingTone;
  score: number;
  status: string;
  recommendation: string;
  routed: boolean;
};

export type RoutingMetric = { label: string; value: number; delta: string };

export type RoutingDecisionEntry = {
  id: string;
  leadId: string;
  decision: string;
  decidedBy: string;
  decidedAt: string;
};

export type LossRoutingData =
  | {
      status: "live";
      queue: RoutingQueueLead[];
      metrics: RoutingMetric[];
      recentDecisions: RoutingDecisionEntry[];
    }
  | { status: "unavailable"; message: string };

type LeadRow = Pick<
  Tables<"leads">,
  | "id"
  | "company_id"
  | "contact_id"
  | "property_id"
  | "persona"
  | "status"
  | "routing_recommendation"
  | "source"
  | "loss_summary"
  | "loss_signals"
  | "lead_score"
  | "received_at"
  | "updated_at"
>;

export async function getLossRoutingData(client?: SupabaseClient): Promise<LossRoutingData> {
  if (!client && !isSupabaseAdminConfigured()) {
    return { status: "unavailable", message: "Supabase env vars are not configured." };
  }

  try {
    const supabase = client ?? getSupabaseAdminClient();

    const leadsResult = await supabase
      .from("leads")
      .select("id,company_id,contact_id,property_id,persona,status,routing_recommendation,source,loss_summary,loss_signals,lead_score,received_at,updated_at")
      .order("received_at", { ascending: false })
      .limit(60);
    assertOk("leads", leadsResult.error);
    const leads = (leadsResult.data ?? []) as LeadRow[];

    const contactIds = ids(leads.map((lead) => lead.contact_id));
    const companyIds = ids(leads.map((lead) => lead.company_id));
    const propertyIds = ids(leads.map((lead) => lead.property_id));
    const leadIds = leads.map((lead) => lead.id);

    // `.in("id", [])` is valid and returns an empty set, so we always query for
    // clean, uniform result types (no union with placeholder shapes).
    const [contactsResult, companiesResult, propertiesResult, decisionsResult] = await Promise.all([
      supabase.from("contacts").select("id,first_name,last_name,full_name,email").in("id", contactIds),
      supabase.from("companies").select("id,name").in("id", companyIds),
      supabase.from("properties").select("id,city,state").in("id", propertyIds),
      supabase
        .from("routing_decisions")
        .select("id,lead_id,decision,decided_by,decided_at")
        .in("lead_id", leadIds)
        .order("decided_at", { ascending: false })
        .limit(50),
    ]);
    assertOk("contacts", contactsResult.error);
    assertOk("companies", companiesResult.error);
    assertOk("properties", propertiesResult.error);
    assertOk("routing_decisions", decisionsResult.error);

    const contactById = new Map((contactsResult.data ?? []).map((row) => [row.id, row]));
    const companyById = new Map((companiesResult.data ?? []).map((row) => [row.id, row]));
    const propertyById = new Map((propertiesResult.data ?? []).map((row) => [row.id, row]));
    const decisions = decisionsResult.data ?? [];
    const routedLeadIds = new Set(decisions.map((decision) => decision.lead_id));

    const queue = leads.map((lead): RoutingQueueLead => {
      const contact = lead.contact_id ? contactById.get(lead.contact_id) : undefined;
      const company = lead.company_id ? companyById.get(lead.company_id) : undefined;
      const property = lead.property_id ? propertyById.get(lead.property_id) : undefined;
      const display = routingDisplay(lead.routing_recommendation, lead.status);

      return {
        id: lead.id,
        code: `L-${lead.id.slice(0, 6).toUpperCase()}`,
        lead: contactName(contact) ?? company?.name ?? titleize(lead.persona ?? "Lead"),
        receivedAt: lead.received_at ?? lead.updated_at ?? "",
        source: titleize(lead.source ?? "Unknown source"),
        channel: titleize(lead.persona ?? "Lead"),
        issue: lead.loss_summary ?? (lead.loss_signals?.[0] ? titleize(lead.loss_signals[0]) : "Loss reported"),
        location: locationLabel(property),
        decision: display.decision,
        tone: display.tone,
        score: lead.lead_score ?? 0,
        status: lead.status ?? "new",
        recommendation: lead.routing_recommendation ?? "target",
        routed: routedLeadIds.has(lead.id),
      };
    });

    const metrics: RoutingMetric[] = [
      { label: "New", value: queue.filter((lead) => lead.status === "new").length, delta: "Awaiting routing" },
      { label: "In review", value: queue.filter((lead) => lead.tone === "red" || lead.status === "needs_review").length, delta: "Needs a human" },
      { label: "Routed", value: queue.filter((lead) => lead.routed).length, delta: "Decisions logged" },
      { label: "Mitigation", value: queue.filter((lead) => lead.recommendation === "target" || lead.recommendation === "elevated").length, delta: "Target water loss" },
    ];

    return {
      status: "live",
      queue,
      metrics,
      recentDecisions: decisions.slice(0, 6).map((decision) => ({
        id: decision.id,
        leadId: decision.lead_id,
        decision: titleize(decision.decision),
        decidedBy: decision.decided_by,
        decidedAt: decision.decided_at,
      })),
    };
  } catch (error) {
    return { status: "unavailable", message: error instanceof Error ? error.message : "Loss routing data is unavailable." };
  }
}

/** Maps a lead's routing recommendation + status to a display decision + tone. */
export function routingDisplay(
  recommendation: string | null,
  status: string | null,
): { decision: string; tone: RoutingTone } {
  if (status === "needs_review") return { decision: "Needs review", tone: "amber" };
  switch (recommendation) {
    case "target":
      return { decision: "Route to mitigation", tone: "green" };
    case "elevated":
      return { decision: "Elevated priority", tone: "green" };
    case "downgraded":
      return { decision: "Downgrade", tone: "amber" };
    case "isolated":
      return { decision: "Out of scope", tone: "red" };
    case "archived":
      return { decision: "Archived", tone: "red" };
    default:
      return { decision: "Review routing", tone: "amber" };
  }
}

function ids(values: Array<string | null>): string[] {
  return Array.from(new Set(values.filter((value): value is string => Boolean(value))));
}

function contactName(contact?: { full_name?: string | null; first_name?: string | null; last_name?: string | null; email?: string | null }) {
  if (!contact) return undefined;
  return (
    contact.full_name ||
    [contact.first_name, contact.last_name].filter(Boolean).join(" ") ||
    contact.email ||
    undefined
  );
}

function locationLabel(property?: { city?: string | null; state?: string | null }) {
  if (!property) return "Location unknown";
  return [property.city, property.state].filter(Boolean).join(", ") || "Location unknown";
}

function titleize(value: string) {
  return value
    .replaceAll("_", " ")
    .replaceAll("-", " ")
    .trim()
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function assertOk(table: string, error: { message?: string } | null) {
  if (error) {
    throw new Error(`${table} lookup failed: ${error.message ?? "Unknown Supabase error"}`);
  }
}
