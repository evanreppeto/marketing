export type FolderTone = {
  accent: string;
  soft: string;
  border: string;
};

const TONES = {
  neutral: { accent: "#9CA3AF", soft: "rgba(156, 163, 175, 0.12)", border: "rgba(156, 163, 175, 0.24)" },
  water: { accent: "#38BDF8", soft: "rgba(56, 189, 248, 0.12)", border: "rgba(56, 189, 248, 0.28)" },
  fire: { accent: "#F97316", soft: "rgba(249, 115, 22, 0.13)", border: "rgba(249, 115, 22, 0.3)" },
  mold: { accent: "#22C55E", soft: "rgba(34, 197, 94, 0.12)", border: "rgba(34, 197, 94, 0.28)" },
  brand: { accent: "#D6B25E", soft: "rgba(214, 178, 94, 0.13)", border: "rgba(214, 178, 94, 0.32)" },
  proof: { accent: "#14B8A6", soft: "rgba(20, 184, 166, 0.12)", border: "rgba(20, 184, 166, 0.28)" },
  job: { accent: "#60A5FA", soft: "rgba(96, 165, 250, 0.12)", border: "rgba(96, 165, 250, 0.28)" },
  before: { accent: "#F43F5E", soft: "rgba(244, 63, 94, 0.11)", border: "rgba(244, 63, 94, 0.26)" },
  after: { accent: "#10B981", soft: "rgba(16, 185, 129, 0.12)", border: "rgba(16, 185, 129, 0.28)" },
  default: { accent: "#A78BFA", soft: "rgba(167, 139, 250, 0.11)", border: "rgba(167, 139, 250, 0.25)" },
} satisfies Record<string, FolderTone>;

export function folderToneForName(name: string, isAll = false): FolderTone {
  if (isAll) return TONES.neutral;

  const value = name.toLowerCase();
  if (/\bjob|project|photos/.test(value)) return TONES.job;
  if (/\bwater|flood|dryout|basement|pipe|sump/.test(value)) return TONES.water;
  if (/\bbefore|intake|start|initial/.test(value)) return TONES.before;
  if (/\bafter|complete|finished|final/.test(value)) return TONES.after;
  if (/\bfire|smoke|soot|burn/.test(value)) return TONES.fire;
  if (/\bmold|containment|remediation/.test(value)) return TONES.mold;
  if (/\bbrand|logo|asset|guide|identity/.test(value)) return TONES.brand;
  if (/\bproof|review|testimonial/.test(value)) return TONES.proof;
  return TONES.default;
}
