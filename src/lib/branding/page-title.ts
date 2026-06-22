/** Build the app's title {default, template}. Default is "{workspace} · {brand}"
 *  when a real workspace identity exists, else just the brand. Pure. */
export function buildAppTitle(input: {
  brand: string;
  workspaceDisplayName: string | null | undefined;
}): { default: string; template: string } {
  const brand = input.brand.trim() || "Arc";
  const workspace = input.workspaceDisplayName?.trim();
  return {
    default: workspace ? `${workspace} · ${brand}` : brand,
    template: `%s · ${brand}`,
  };
}
