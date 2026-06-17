import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createClient } from "@supabase/supabase-js";

function loadLocalEnv() {
  const envPath = join(process.cwd(), ".env.local");
  const envText = readFileSync(envPath, "utf8");

  for (const line of envText.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const separatorIndex = trimmed.indexOf("=");
    if (separatorIndex === -1) continue;

    const key = trimmed.slice(0, separatorIndex).trim();
    const value = trimmed.slice(separatorIndex + 1).trim();
    process.env[key] = value;
  }
}

function getSupabase() {
  loadLocalEnv();

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local.");
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

/**
 * Coerce a JSONB value from app_settings to a plain string.
 * app_settings.value is JSONB so a text value comes back as a JS string,
 * but guard for null/undefined and stringify anything else.
 */
function coerceToString(value) {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value.trim();
  return String(value).trim();
}

async function migrateBsrBranding() {
  const supabase = getSupabase();

  const ORG_SLUG = process.env.DEFAULT_ORG_SLUG ?? "big-shoulders-restoration";

  // 1. Resolve org by slug
  const { data: org, error: orgErr } = await supabase
    .from("organizations")
    .select("id")
    .eq("slug", ORG_SLUG)
    .maybeSingle();
  if (orgErr) throw orgErr;
  if (!org) throw new Error(`Org not found for slug "${ORG_SLUG}"`);

  const orgId = org.id;
  console.log(`Found org: ${ORG_SLUG} (${orgId})`);

  // 2. Read relevant app_settings keys
  const SETTING_KEYS = [
    "workspace_name",
    "brand_logo_url",
    "brand_favicon_url",
    "brand_short_name",
  ];

  const { data: settingRows, error: settingsErr } = await supabase
    .from("app_settings")
    .select("key,value")
    .in("key", SETTING_KEYS);
  if (settingsErr) throw settingsErr;

  /** @type {Record<string, string>} */
  const settings = {};
  for (const row of settingRows ?? []) {
    const str = coerceToString(row.value);
    if (str) settings[row.key] = str;
  }

  console.log("app_settings values found:", settings);

  // 3. Read current business_profiles row for this org
  const { data: profile, error: profileErr } = await supabase
    .from("business_profiles")
    .select("display_name,logo_url,favicon_url,short_mark")
    .eq("org_id", orgId)
    .maybeSingle();
  if (profileErr) throw profileErr;

  console.log("Current business_profiles:", profile ?? "(no row yet)");

  // 4. Build update object — only fill blank fields, never clobber non-empty ones
  const FIELD_MAP = [
    // [business_profiles column, app_settings key]
    ["display_name", "workspace_name"],
    ["logo_url", "brand_logo_url"],
    ["favicon_url", "brand_favicon_url"],
    ["short_mark", "brand_short_name"],
  ];

  /** @type {Record<string, string>} */
  const updates = {};
  const copied = [];
  const skipped = [];

  for (const [bpField, settingKey] of FIELD_MAP) {
    const currentValue = profile ? coerceToString(profile[bpField]) : "";
    const sourceValue = settings[settingKey] ?? "";

    if (currentValue) {
      // business_profiles already has a value — do not overwrite
      skipped.push(`${bpField} (already set: "${currentValue}")`);
    } else if (sourceValue) {
      // business_profiles is blank but app_settings has a value — copy it
      updates[bpField] = sourceValue;
      copied.push(`${bpField} <- "${sourceValue}" (from app_settings.${settingKey})`);
    } else {
      // both blank — nothing to do
      skipped.push(`${bpField} (no source value in app_settings.${settingKey})`);
    }
  }

  // 5. Upsert if there is at least one field to copy
  if (Object.keys(updates).length === 0) {
    console.log("Nothing to migrate — no blank business_profiles fields with a non-empty app_settings source.");
    return;
  }

  const { error: upsertErr } = await supabase
    .from("business_profiles")
    .upsert({ org_id: orgId, ...updates }, { onConflict: "org_id" });
  if (upsertErr) throw upsertErr;

  // 6. Report
  console.log("\nFields copied:");
  for (const entry of copied) console.log("  COPIED  ", entry);
  console.log("\nFields skipped:");
  for (const entry of skipped) console.log("  SKIPPED ", entry);
  console.log(`\nMigration complete — ${copied.length} field(s) copied to business_profiles for org ${ORG_SLUG}.`);
}

migrateBsrBranding()
  .then(() => {
    process.exit(0);
  })
  .catch((error) => {
    console.error(JSON.stringify({ ok: false, message: error.message }, null, 2));
    process.exit(1);
  });
