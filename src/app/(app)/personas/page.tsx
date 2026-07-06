import { listPersonas, type Persona } from "@/lib/personas/console";

import { PersonasView, type PersonaVM } from "./_components/personas-view";

export const metadata = { title: "Personas — Arc" };

const SEG_COLOR: Record<string, string> = {
  acquisition: "#88b6d8",
  engagement: "#c8a24a",
  retention: "#7fb89a",
};

const STAGE_COLOR: Record<string, { color: string; bg: string }> = {
  "Hot lead": { color: "#e0a3a3", bg: "rgba(204,102,102,.15)" },
  Champion: { color: "#a3d0b8", bg: "rgba(127,184,154,.14)" },
  "Repeat customer": { color: "#a3d0b8", bg: "rgba(127,184,154,.14)" },
  Active: { color: "#ecd596", bg: "rgba(200,162,74,.12)" },
  New: { color: "#9cc1e0", bg: "rgba(136,182,216,.13)" },
  "At risk": { color: "#e6cf8e", bg: "rgba(216,182,94,.14)" },
  Dormant: { color: "#777c80", bg: "rgba(255,255,255,.04)" },
};

function scoreColor(score: number): string {
  if (score >= 80) return "#7fb89a";
  if (score >= 60) return "#c8a24a";
  return "#d8a24a";
}

function toVM(p: Persona): PersonaVM {
  const segColor = SEG_COLOR[p.segment] ?? "#c8a24a";
  const stage = STAGE_COLOR[p.stage] ?? { color: "#b8b4aa", bg: "rgba(255,255,255,.04)" };
  const share = Math.round(p.audienceShare > 1 ? p.audienceShare : p.audienceShare * 100);
  return {
    slug: p.slug,
    name: p.name,
    initials: p.initials,
    segment: p.segment,
    segmentLabel: p.segment.charAt(0).toUpperCase() + p.segment.slice(1),
    segColor,
    stage: p.stage,
    stageColor: stage.color,
    stageBg: stage.bg,
    score: p.score,
    scoreColor: scoreColor(p.score),
    audienceShare: share,
    scoreTrend: p.scoreTrend?.length ? p.scoreTrend : [p.score, p.score],
    live: p.live,
    quote: p.quote,
    profile: p.profile,
    angle: p.angle,
    cta: p.cta,
    nextAction: p.nextAction,
    channel: p.channel,
    bestTiming: p.bestTiming,
    audience: p.audience,
    proofPoints: p.proofPoints ?? [],
    sampleSubject: p.sampleMessage?.subject ?? "",
    samplePreview: p.sampleMessage?.preview ?? "",
  };
}

export default async function PersonasPage() {
  const personas = await listPersonas().catch(() => [] as Persona[]);
  return <PersonasView personas={personas.map(toVM)} />;
}
