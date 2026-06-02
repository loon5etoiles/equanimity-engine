// PermissionMoment — a single peer-toned sentence rendered between the
// Leverage gauge and the constraint pill. Translates the numeric score
// into emotional precision the way a HENRY peer would name it.
//
// Driven by the *pattern* of pillar scores, not the total alone. The same
// 60/100 can mean very different things depending on which pillar is
// dragging vs leading.

interface Pillar {
  key: "runway" | "dependency" | "velocity" | "shock";
  points: number;
  max: number;
}

interface Props {
  total: number;
  pillars: Pillar[];
  bottleneckKey: Pillar["key"];
  age?: number;
  concentrationPct?: number;
}

// Helpers to read pillar percentages
function pct(p: Pillar) {
  return p.max ? p.points / p.max : 0;
}

export default function PermissionMoment({ total, pillars, bottleneckKey, age, concentrationPct = 0 }: Props) {
  const byKey: Record<Pillar["key"], number> = pillars.reduce((acc, p) => {
    acc[p.key] = pct(p);
    return acc;
  }, {} as Record<Pillar["key"], number>);

  // Order: most specific match first, fallback to bottleneck-based, fallback to band-based.
  const line = pickLine(total, byKey, bottleneckKey, age, concentrationPct);

  return (
    <div className="mt-3 rounded-xl bg-zinc-50 border border-zinc-200 px-4 py-3">
      <div className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500 mb-1">
        What this says about you
      </div>
      <p className="text-sm sm:text-base italic text-zinc-800 leading-snug">
        "{line}"
      </p>
    </div>
  );
}

// The dictionary. Order matters — more specific patterns are checked first.
function pickLine(
  total: number,
  p: Record<Pillar["key"], number>,
  bottleneck: Pillar["key"],
  age: number | undefined,
  concentrationPct: number
): string {

  // ── Concentration risk overrides — only fires when ≥40% in one position ──
  if (concentrationPct >= 60) {
    return "Your numbers look diversified. Your portfolio doesn't.";
  }
  if (concentrationPct >= 40 && bottleneck === "dependency") {
    return "On paper you're diversified. In practice, one ticker is steering the ship.";
  }

  // ── Pattern matches: high X with low Y combinations ──
  const HIGH = 0.7;
  const LOW = 0.35;

  if (p.velocity >= HIGH && p.runway <= LOW) {
    return "You're more deployed than you think.";
  }
  if (p.runway >= HIGH && p.velocity <= LOW) {
    return "You're safer than you feel — but slower than you could be.";
  }
  if (p.dependency >= HIGH && p.shock <= LOW) {
    return "Your invested base is strong. Your wiring is fragile.";
  }
  if (p.velocity >= HIGH && p.shock <= LOW) {
    return "Your income has outrun your safety net.";
  }
  if (total >= 60 && p.dependency <= LOW) {
    return "You have more optionality than you've been using.";
  }
  if (total >= 60 && p.runway <= LOW) {
    return "Your engine works. Your shock absorber doesn't.";
  }

  // ── Bottleneck-specific defaults (when no high/low contrast pattern matches) ──
  if (bottleneck === "runway") {
    return "You're playing offense without playing defense.";
  }
  if (bottleneck === "dependency") {
    return "You earn well — but everything still depends on one job.";
  }
  if (bottleneck === "velocity") {
    return "Your runway is solid. Your trajectory is the lever.";
  }
  if (bottleneck === "shock") {
    return "You can afford this lifestyle. You haven't priced in surviving without it.";
  }

  // ── Band-only fallback ──
  if (total < 30) {
    return "You're early — and earlier than you think isn't the same as late.";
  }
  if (total >= 80) {
    if (age && age < 40) return "You're further along than your age suggests.";
    return "You have permission to ease off the optimization.";
  }
  return "You're closer than your inner accountant is telling you.";
}
