import { type OpportunityRecord } from "./read-model";

/**
 * Read-only demo opportunity inbox. Used when Supabase is not configured (local
 * preview / ARC_DEMO_DATA) so the Opportunities screen — and the home hero
 * count, "open opportunities" list, and Signals rail that all read the same
 * source — render a populated, source-backed BSR inbox instead of empty states.
 *
 * The records span every card type the inbox classifies (weather, partner,
 * competitor, lifecycle, buyer intent) with full evidence so the impact/evidence
 * panels look real. Everything is display-only; nothing here sends anything.
 */

const DAY = 86_400_000;

function daysAgoIso(days: number): string {
  return new Date(Date.now() - days * DAY).toISOString();
}

export function buildDemoOpportunities(): OpportunityRecord[] {
  return [
    {
      id: "demo-opp-storm-riverside",
      subject_type: "weather_event",
      subject_id: "demo-weather-riverside-flood",
      title: "Flash-flood warning — Riverside basements at risk",
      summary:
        "The NWS issued an overnight flash-flood warning for Riverside and Brookfield; 30+ homes in the coverage area sit in the flood plain. This pattern historically drives same-week water-mitigation calls.",
      confidence: 92,
      urgency: "high",
      status: "pending",
      recommended_action: "Launch a geo-targeted storm-response campaign to Riverside / Brookfield homeowners",
      evidence: {
        persona: "persona_homeowner_emergency",
        lastActivityAt: daysAgoIso(0),
        evidence_urls: ["https://www.weather.gov/lot/", "https://water.noaa.gov/"],
      },
    },
    {
      id: "demo-opp-intent-evanston",
      subject_type: "lead",
      subject_id: "demo-lead-evanston-water",
      title: "Evanston homeowner comparing water-damage estimates",
      summary:
        "A high-intent lead requested a quote and visited the water-damage service page three times in two days. They're actively comparing estimates — speed of response is the deciding factor.",
      confidence: 88,
      urgency: "high",
      status: "pending",
      recommended_action: "Fast-track a same-day estimate outreach with proof-of-work photos",
      evidence: {
        persona: "persona_homeowner_emergency",
        leadScore: 91,
        daysCold: 1,
        lastActivityAt: daysAgoIso(1),
        evidence_urls: ["https://bigshouldersrestoration.com/water-damage"],
      },
    },
    {
      id: "demo-opp-partner-madden",
      subject_type: "partner_company",
      subject_id: "demo-company-madden-sewer",
      title: "Plumbing partner Madden Sewer & Drain sent 3 referrals",
      summary:
        "Madden Sewer & Drain referred three water-backup jobs in the last month with no formal co-marketing in place. A referral agreement would formalize the pipeline before a competitor courts them.",
      confidence: 78,
      urgency: "medium",
      status: "pending",
      recommended_action: "Draft a partner referral + co-marketing agreement for Madden Sewer & Drain",
      evidence: {
        persona: "persona_plumbing_partner",
        leadScore: 84,
        lastActivityAt: daysAgoIso(3),
        evidence_urls: ["https://www.maddensewer.net/service-area-plumbing"],
      },
    },
    {
      id: "demo-opp-competitor-oakpark",
      subject_type: "competitor_signal",
      subject_id: "demo-competitor-servpro-oakpark",
      title: "ServPro is running ads in Oak Park — contested territory",
      summary:
        "Competitor ServPro launched a new paid-search and Meta flight targeting Oak Park water-damage queries this week. Arc's share of voice there is strong; a defensive push protects the lead flow.",
      confidence: 71,
      urgency: "medium",
      status: "drafting",
      recommended_action: "Prepare a defensive Oak Park search + social flight emphasizing 60-minute response",
      evidence: {
        persona: "persona_homeowner_emergency",
        lastActivityAt: daysAgoIso(1),
        evidence_urls: ["https://www.facebook.com/ads/library/"],
      },
    },
    {
      id: "demo-opp-pm-inspection",
      subject_type: "company",
      subject_id: "demo-company-northside-pm",
      title: "Property manager portfolio due for annual moisture inspection",
      summary:
        "Northside Property Group's 14-building portfolio is approaching the anniversary of last year's moisture survey. An annual inspection offer keeps Arc front-of-mind and surfaces new mitigation work.",
      confidence: 69,
      urgency: "medium",
      status: "drafted",
      recommended_action: "Offer an annual portfolio moisture-inspection package",
      evidence: {
        persona: "persona_property_manager",
        leadScore: 73,
        daysCold: 340,
        lastActivityAt: daysAgoIso(340),
        evidence_urls: [],
      },
    },
    {
      id: "demo-opp-hoa-quiet",
      subject_type: "crm_inactivity",
      subject_id: "demo-company-lincoln-park-hoa",
      title: "Lincoln Park HOA has gone quiet 90 days after mitigation",
      summary:
        "The Lincoln Park HOA board hasn't been contacted since their basement mitigation wrapped in April. Post-job is the window for a preventative maintenance plan and referral ask before the relationship cools.",
      confidence: 64,
      urgency: "low",
      status: "pending",
      recommended_action: "Re-engage the HOA board with a preventative maintenance + referral nurture",
      evidence: {
        persona: "persona_hoa_board",
        leadScore: 58,
        daysCold: 92,
        lastActivityAt: daysAgoIso(92),
        evidence_urls: [],
      },
    },
  ];
}
