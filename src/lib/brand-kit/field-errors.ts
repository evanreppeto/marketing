const MESSAGES: Record<string, { field: string; message: string }> = {
  display_name_required: { field: "displayName", message: "Add a display name." },
  accent_invalid: { field: "accentHex", message: "Enter a valid hex color (e.g. #1B2A4A)." },
  palette_primary_invalid: { field: "primaryHex", message: "Enter a valid hex color." },
  palette_secondary_invalid: { field: "secondaryHex", message: "Enter a valid hex color." },
  palette_accent_invalid: { field: "accentHex", message: "Enter a valid hex color." },
  palette_dark_invalid: { field: "darkHex", message: "Enter a valid hex color." },
  palette_light_invalid: { field: "lightHex", message: "Enter a valid hex color." },
};

export function fieldErrorMap(codes: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const code of codes) {
    const entry = MESSAGES[code];
    if (entry) out[entry.field] = entry.message;
  }
  return out;
}
