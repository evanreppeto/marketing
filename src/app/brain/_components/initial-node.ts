type MinimalNode = { id: string; kind: string; label: string; persona: string | null };

function normalizePersona(value: string): string {
  const stripped = value.startsWith("persona_") ? value.slice("persona_".length) : value;
  return stripped.replaceAll("_", "-").toLowerCase();
}

/**
 * Picks the node a Brain view should focus on first.
 * Priority: an explicit persona match (from `?persona=<slug>`) → the flagship
 * "emergency water" campaign node → the hub → the first node → null.
 */
export function pickInitialNodeId(
  nodes: MinimalNode[],
  opts: { persona?: string; hubId: string | null },
): string | null {
  if (opts.persona) {
    const want = normalizePersona(opts.persona);
    const match = nodes.find((n) => n.persona && normalizePersona(n.persona) === want);
    if (match) return match.id;
  }
  const flagship = nodes.find((n) => /emergency water/i.test(n.label));
  return flagship?.id ?? opts.hubId ?? nodes[0]?.id ?? null;
}
