// FIRE taxonomy markers — shows where the user's invested base lands on
// the Coast/Chubby/Fat FIRE spectrum. HENRY-native framing they already
// recognize. Computes years-to-each at current trajectory.

interface Props {
  invested: number;          // current invested assets
  monthlyContribution: number;
  annualReturnPct: number;
  target: number;            // user's stated freedom target
  age: number;
}

// Coast FIRE: the invested amount that, with no further contributions,
// compounds to your target by age 65 at your assumed return.
function coastFireNumber(target: number, returnPct: number, age: number): number {
  const yearsToRetirement = Math.max(0, 65 - age);
  if (yearsToRetirement === 0 || target <= 0) return target;
  const growthFactor = Math.pow(1 + returnPct / 100, yearsToRetirement);
  return Math.round(target / growthFactor);
}

// Years to reach a threshold at current trajectory.
// FV = PV(1+r)^t + PMT * [(1+r)^t - 1] / r
// Solve for t numerically (binary search — handles edge cases cleanly).
function yearsTo(threshold: number, invested: number, monthlyPmt: number, returnPct: number): number | null {
  if (invested >= threshold) return 0;
  const r = returnPct / 100;
  const annualPmt = monthlyPmt * 12;
  if (r <= 0 && annualPmt <= 0) return null;
  // Binary search 0–80 years
  let lo = 0, hi = 80;
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    const growth = Math.pow(1 + r, mid);
    const fv = r === 0
      ? invested + annualPmt * mid
      : invested * growth + annualPmt * (growth - 1) / r;
    if (fv >= threshold) hi = mid;
    else lo = mid;
  }
  return Math.round(lo * 10) / 10;
}

function fmt(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(n >= 10_000_000 ? 0 : 1)}M`;
  if (n >= 1_000) return `$${Math.round(n / 1_000)}K`;
  return `$${Math.round(n)}`;
}

export default function FireTaxonomy({ invested, monthlyContribution, annualReturnPct, target, age }: Props) {
  const coastFire = coastFireNumber(target || 1_000_000, annualReturnPct || 7, age || 35);
  // Standard community thresholds — purposefully widely-recognized HENRY numbers
  const CHUBBY = 3_750_000;
  const FAT = 6_250_000;

  const markers = [
    {
      key: "coast",
      label: "Coast FIRE",
      threshold: coastFire,
      blurb: `Invested base that compounds to ${fmt(target || 1_000_000)} by 65 with no further contributions`,
    },
    {
      key: "chubby",
      label: "Chubby FIRE",
      threshold: CHUBBY,
      blurb: `25× ~$150K/yr — comfortable FI, not luxurious`,
    },
    {
      key: "fat",
      label: "Fat FIRE",
      threshold: FAT,
      blurb: `25× ~$250K/yr — luxury FI`,
    },
  ];

  return (
    <div className="rounded-xl border border-zinc-200 bg-white/60 p-3 space-y-2">
      <div className="flex items-center justify-between mb-1">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-zinc-600">FIRE Taxonomy</span>
        <span className="text-[10px] text-zinc-400">Where your numbers land</span>
      </div>
      {markers.map((m) => {
        const achieved = invested >= m.threshold;
        const years = achieved ? 0 : yearsTo(m.threshold, invested, monthlyContribution, annualReturnPct);
        return (
          <div key={m.key} className="flex items-center gap-3 rounded-lg bg-white border border-zinc-100 px-3 py-2">
            <div className={`grid h-6 w-6 shrink-0 place-items-center rounded-full text-[10px] font-bold ${
              achieved
                ? "bg-emerald-100 text-emerald-700"
                : years !== null && years < 5
                  ? "bg-amber-100 text-amber-700"
                  : "bg-zinc-100 text-zinc-500"
            }`}>
              {achieved ? "✓" : years !== null && years < 5 ? "~" : "·"}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-sm font-semibold text-zinc-800">{m.label}</span>
                <span className="text-sm font-semibold text-zinc-900">{fmt(m.threshold)}</span>
              </div>
              <div className="flex items-baseline justify-between gap-2 mt-0.5">
                <span className="text-[11px] text-zinc-500 truncate">{m.blurb}</span>
                <span className={`text-[11px] font-semibold whitespace-nowrap ${
                  achieved ? "text-emerald-700" : "text-zinc-600"
                }`}>
                  {achieved
                    ? "Achieved"
                    : years === null
                      ? "—"
                      : years > 50
                        ? "50+ yrs"
                        : `${years} yr${years === 1 ? "" : "s"}`}
                </span>
              </div>
            </div>
          </div>
        );
      })}
      <div className="text-[10px] text-zinc-400 mt-1 leading-snug">
        Years estimated at your current monthly contribution and assumed return. Coast FIRE uses age 65 as the traditional retirement anchor.
      </div>
    </div>
  );
}
