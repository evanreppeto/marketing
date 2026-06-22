"use server";

import { revalidatePath } from "next/cache";

import { getOperatorActor, requireOperator } from "@/lib/auth/operator";
import { getCurrentOrgId } from "@/lib/auth/org";
import { isSupabaseAdminConfigured } from "@/lib/supabase/server";
import { classifyKind, NEUTRAL_DEFAULTS, validateBusinessProfile, validateUpload, type BusinessProfile } from "@/domain";
import { getBusinessProfile, upsertBusinessProfile } from "@/lib/brand-kit/persistence";
import { buildBusinessProfileFromForm } from "@/lib/brand-kit/form";
import { insertAssetWithUrl } from "@/lib/media-library/persistence";

export type BrandKitActionState = { ok: boolean; message: string } | null;

const NOT_CONFIGURED: BrandKitActionState = {
  ok: false,
  message: "Supabase isn't configured, so the brand profile can't be saved.",
};

async function loadCurrent(orgId: string): Promise<BusinessProfile> {
  const existing = await getBusinessProfile(orgId);
  return existing ?? NEUTRAL_DEFAULTS;
}

function fileFromForm(formData: FormData, key: string): File | null {
  const file = formData.get(key);
  return file instanceof File && file.size > 0 ? file : null;
}

function contentTypeForFile(file: File): string {
  if (file.type) return file.type;
  if (file.name.toLowerCase().endsWith(".ico")) return "image/x-icon";
  return "application/octet-stream";
}

async function uploadBrandProfileAsset(args: {
  orgId: string;
  file: File;
  role: "logo" | "favicon";
}): Promise<{ ok: true; url: string } | { ok: false; message: string }> {
  const contentType = contentTypeForFile(args.file);
  const check = validateUpload({ contentType, byteSize: args.file.size });
  if (!check.ok) return { ok: false, message: check.reason };

  const bytes = new Uint8Array(await args.file.arrayBuffer());
  const result = await insertAssetWithUrl({
    orgId: args.orgId,
    folderId: null,
    fileName: args.file.name,
    bytes,
    contentType,
    kind: classifyKind(contentType, args.file.name),
    byteSize: args.file.size,
    source: "uploaded",
    provenance: { brandRole: args.role },
    uploadedBy: getOperatorActor(),
  });
  return { ok: true, url: result.url };
}

export async function saveBrandKitAction(
  _previous: BrandKitActionState,
  formData: FormData,
): Promise<BrandKitActionState> {
  await requireOperator();
  if (!isSupabaseAdminConfigured()) return NOT_CONFIGURED;

  const orgId = await getCurrentOrgId();
  const current = await loadCurrent(orgId);

  for (const [key, uploadKey, role] of [
    ["logoFile", "logoUpload", "logo"],
    ["faviconFile", "faviconUpload", "favicon"],
  ] as const) {
    const file = fileFromForm(formData, key);
    if (!file) continue;
    const uploaded = await uploadBrandProfileAsset({ orgId, file, role });
    if (!uploaded.ok) return { ok: false, message: uploaded.message };
    formData.set(uploadKey, uploaded.url);
  }

  const profile = buildBusinessProfileFromForm(formData, current);

  const validation = validateBusinessProfile(profile);
  if (!validation.ok) {
    return { ok: false, message: `Please fix: ${validation.errors.join(", ")}.` };
  }

  try {
    await upsertBusinessProfile(orgId, profile);
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "Couldn't save the brand profile." };
  }

  revalidatePath("/", "layout");
  revalidatePath("/library/brand");
  revalidatePath("/settings");
  revalidatePath("/arc");
  return { ok: true, message: "Brand profile saved." };
}
