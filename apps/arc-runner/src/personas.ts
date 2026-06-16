/**
 * The 12 official persona keys (mirrors OFFICIAL_PERSONA_MAPPINGS in the app's
 * src/domain/personas.ts). Duplicated, not imported — the runner is a standalone
 * service. Keep in sync if the app's taxonomy changes. `unassigned_persona` is
 * internal-only and deliberately excluded.
 */
export const ARC_PERSONAS: ReadonlyArray<{ key: string; label: string }> = [
  { key: "persona_homeowner_emergency", label: "Emergency Homeowner" },
  { key: "persona_homeowner_preventative", label: "Preventative Homeowner" },
  { key: "persona_homeowner_rebuild", label: "Rebuild Homeowner" },
  { key: "persona_landlord", label: "Landlord" },
  { key: "persona_hoa_board", label: "HOA Board" },
  { key: "persona_property_manager", label: "Property Manager" },
  { key: "persona_insurance_agent", label: "Insurance Agent" },
  { key: "persona_listing_agent", label: "Listing Agent" },
  { key: "persona_buyers_agent", label: "Buyer's Agent" },
  { key: "persona_plumbing_partner", label: "Plumbing Partner" },
  { key: "persona_hvac_roof_electrical_partner", label: "HVAC / Roof / Electrical Partner" },
  { key: "persona_gc_remodeler_partner", label: "GC / Remodeler Partner" },
];
