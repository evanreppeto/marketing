import { type SupabaseClient } from "@supabase/supabase-js";

import { type LeadIngestionResult, type ParsedLeadIngestionInput } from "../../domain";

type AcceptedLeadIngestionResult = Extract<LeadIngestionResult, { ok: true }>;

type PersistLeadInput = {
  input: ParsedLeadIngestionInput;
  result: AcceptedLeadIngestionResult;
  supabase: SupabaseClient;
};

type InsertResult = {
  id: string;
};

export type PersistedLeadIngestion = {
  companyId: string | null;
  contactId: string | null;
  propertyId: string | null;
  leadId: string;
};

export async function persistLeadIngestion({
  input,
  result,
  supabase,
}: PersistLeadInput): Promise<PersistedLeadIngestion> {
  const companyId = input.company
    ? await insertAndReturnId(supabase, "companies", {
        name: input.company.name,
        persona: result.persona,
        partner_tier: input.company.partnerTier ?? null,
        metadata: {
          network_connection: input.company.networkConnection ?? null,
          ingestion_source: input.source,
        },
      })
    : null;

  const contactId = input.contact
    ? await insertAndReturnId(supabase, "contacts", {
        company_id: companyId,
        persona: result.persona,
        first_name: input.contact.firstName ?? null,
        last_name: input.contact.lastName ?? null,
        email: input.contact.email ?? null,
        phone: input.contact.phone ?? null,
        metadata: {
          ingestion_source: input.source,
        },
      })
    : null;

  const propertyId = input.property
    ? await insertAndReturnId(supabase, "properties", {
        company_id: companyId,
        contact_id: contactId,
        persona: result.persona,
        street_line_1: input.property.streetLine1,
        street_line_2: input.property.streetLine2 ?? null,
        city: input.property.city,
        state: input.property.state.toUpperCase(),
        postal_code: input.property.postalCode,
        metadata: {
          ingestion_source: input.source,
        },
      })
    : null;

  const leadId = await insertAndReturnId(supabase, "leads", {
    company_id: companyId,
    contact_id: contactId,
    property_id: propertyId,
    persona: result.persona,
    status: result.routing === "archived" ? "archived" : "validated",
    routing_recommendation: toDatabaseRoutingRecommendation(result.routing),
    source: input.source,
    external_lead_id: input.externalLeadId ?? null,
    loss_summary: input.lossSummary ?? null,
    loss_signals: input.lossSignals,
    matched_target_keywords: result.classification.matchedTargetKeywords,
    matched_non_target_keywords: result.classification.matchedNonTargetKeywords,
    lead_score: result.scores.leadScore,
    attributed_campaign_id: result.attribution.campaignId,
    attributed_asset_id: result.attribution.assetId,
    attribution_channel: result.attribution.channel,
    attribution_method: result.attribution.method,
    attribution_utm: result.attribution.utm,
    metadata: {
      ...input.metadata,
      classification: result.classification.classification,
      partner_score: result.scores.partnerScore,
      calculated_at: result.scores.calculatedAt,
    },
  });

  return {
    companyId,
    contactId,
    propertyId,
    leadId,
  };
}

function toDatabaseRoutingRecommendation(routing: AcceptedLeadIngestionResult["routing"]) {
  if (routing === "needs_review") {
    return "target";
  }

  return routing;
}

async function insertAndReturnId(
  supabase: SupabaseClient,
  table: "companies" | "contacts" | "properties" | "leads",
  values: Record<string, unknown>,
) {
  const { data, error } = await supabase.from(table).insert(values).select("id").single<InsertResult>();

  if (error) {
    throw new Error(`Failed to persist ${table}: ${error.message}`);
  }

  if (!data?.id) {
    throw new Error(`Failed to persist ${table}: insert did not return an id.`);
  }

  return data.id;
}
