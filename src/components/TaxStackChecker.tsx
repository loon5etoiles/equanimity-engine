// Tax Stack Checker — a free standalone mini-tool aimed at HENRYs.
// Shows how many tax-advantaged levers you're using vs the playbook and
// estimates the dollars you're leaving on the table.
//
// Designed to be Reddit-shareable: independent of the Leverage Score flow,
// no signup required, deep-linkable via #tax-stack.
//
// All contribution limits use 2025 IRS figures. Update annually.

import { useMemo, useState } from "react";

// ─── 2025 IRS limits (update yearly) ──────────────────────────────────────────
const LIMITS_2025 = {
  e401k: 23_500,         // 401(k) elective deferral, under 50
  catchUp: 7_500,        // 50+ catch-up
  ira: 7_000,            // IRA contribution (Roth/Trad), under 50
  hsa_self: 4_300,       // HSA self-only
  hsa_family: 8_550,     // HSA family
  dcfsa: 5_000,          // Dependent Care FSA (per household)
  total_401k: 70_000,    // 401k total (employee + employer + after-tax) for MBDR
};

type Filing = "single" | "married";

interface Lever {
  id: string;
  label: string;
  blurb: string;
  applies: boolean;          // false → hidden / not counted
  done: boolean;             // user said they're using it
  potentialSavings: number;  // $/yr left on the table (0 if done)
  why: string;               // displayed when expanded — why this matters
}

export default function TaxStackChecker() {
  // Profile inputs
  const [filing, setFiling] = useState<Filing>("married");
  const [age50plus, setAge50plus] = useState(false);
  const [hasKids, setHasKids] = useState(false);
  const [hsaEligible, setHsaEligible] = useState(false);
  const [marginalRate, setMarginalRate] = useState<number>(32); // typical HENRY: 32/35/37

  // Lever inputs — separately tracked because each has different "currently doing" data
  const [e401k, setE401k] = useState<number>(0);             // $ contributed YTD or planned
  const [hasBackdoorRoth, setHasBackdoorRoth] = useState(false);
  const [hasMBDR, setHasMBDR] = useState(false);
  const [mbdrAvailable, setMbdrAvailable] = useState(false);  // does the plan even allow it?
  const [hsa, setHsa] = useState<number>(0);
  const [dcfsa, setDcfsa] = useState<number>(0);
  const [has529, setHas529] = useState(false);
  const [hasDAF, setHasDAF] = useState(false);
  const [hasESPP, setHasESPP] = useState(false);
  const [esppAvailable, setEsppAvailable] = useState(false);

  const mr = marginalRate / 100;
  const max401k = LIMITS_2025.e401k + (age50plus ? LIMITS_2025.catchUp : 0);
  const hsaMax = filing === "married" ? LIMITS_2025.hsa_family : LIMITS_2025.hsa_self;

  // Estimate MBDR headroom: total 401k limit minus elective minus a reasonable
  // employer-match assumption (5% of $300k typical HENRY base ≈ $15k). This is
  // intentionally rough — most HENRYs won't know exact employer contribution.
  const mbdrHeadroom = Math.max(0, LIMITS_2025.total_401k - max401k - 15_000);

  const levers: Lever[] = useMemo(() => {
    const e401kGap = Math.max(0, max401k - e401k);
    const hsaGap = Math.max(0, hsaMax - hsa);
    const dcfsaGap = Math.max(0, LIMITS_2025.dcfsa - dcfsa);

    return [
      {
        id: "401k",
        label: "401(k) elective deferral",
        blurb: `Max $${max401k.toLocaleString()} pre-tax this year${age50plus ? " (with catch-up)" : ""}`,
        applies: true,
        done: e401kGap === 0 && e401k > 0,
        potentialSavings: Math.round(e401kGap * mr),
        why: "Every $1,000 of pre-tax 401(k) contributions saves your marginal rate in current-year taxes. For a HENRY in the 32% bracket, that's $320 per $1,000 — and it grows tax-deferred.",
      },
      {
        id: "backdoor_roth",
        label: "Backdoor Roth IRA",
        blurb: `$${LIMITS_2025.ira.toLocaleString()}/yr per person of tax-free growth`,
        applies: true,
        done: hasBackdoorRoth,
        potentialSavings: hasBackdoorRoth ? 0 : Math.round(LIMITS_2025.ira * 0.07 * mr * 10), // rough 10-yr tax-free growth proxy
        why: "Above the Roth income limit you can still contribute via the Backdoor: contribute to a Traditional IRA (non-deductible), then convert to Roth. Watch the pro-rata rule if you have other IRA balances.",
      },
      {
        id: "mbdr",
        label: "Mega Backdoor Roth",
        blurb: mbdrAvailable
          ? `Up to ~$${mbdrHeadroom.toLocaleString()}/yr of additional Roth space`
          : "Check if your 401(k) plan supports after-tax + in-plan conversion",
        applies: mbdrAvailable,
        done: hasMBDR,
        potentialSavings: hasMBDR || !mbdrAvailable ? 0 : Math.round(mbdrHeadroom * 0.07 * mr * 10),
        why: "If your 401(k) allows after-tax contributions AND in-plan Roth conversions, you can stuff tens of thousands more into Roth annually. This is the single biggest miss for most HENRYs.",
      },
      {
        id: "hsa",
        label: "HSA (Health Savings Account)",
        blurb: `Max $${hsaMax.toLocaleString()} ${filing === "married" ? "(family)" : "(self)"} — triple tax-advantaged`,
        applies: hsaEligible,
        done: hsaGap === 0 && hsa > 0,
        potentialSavings: Math.round(hsaGap * mr),
        why: "HSA is the only account that's tax-deductible going in, grows tax-free, AND comes out tax-free for medical expenses. Invest it instead of spending it — best account in the tax code.",
      },
      {
        id: "dcfsa",
        label: "Dependent Care FSA",
        blurb: `$${LIMITS_2025.dcfsa.toLocaleString()}/yr pre-tax for childcare`,
        applies: hasKids,
        done: dcfsaGap === 0 && dcfsa > 0,
        potentialSavings: Math.round(dcfsaGap * mr),
        why: "Pre-tax dollars for daycare. Saves you your marginal rate × $5,000 ≈ $1,600+/yr for most HENRYs. Use-it-or-lose-it, so estimate conservatively.",
      },
      {
        id: "529",
        label: "529 Plan",
        blurb: "State tax deduction in 30+ states + tax-free growth",
        applies: hasKids,
        done: has529,
        potentialSavings: has529 ? 0 : 400, // placeholder qualitative — actual savings vary by state
        why: "529 contributions get a state tax deduction in most states (NY, IL, etc. up to $10k). All growth is tax-free if used for education. Even a small monthly auto-invest captures the deduction.",
      },
      {
        id: "daf",
        label: "Donor-Advised Fund (DAF)",
        blurb: "Bunch charitable giving for itemization",
        applies: true,
        done: hasDAF,
        potentialSavings: hasDAF ? 0 : 800,
        why: "If you give to charity, a DAF lets you bunch multiple years of donations into one year — clearing the standard deduction threshold and capturing real tax savings. Especially powerful with appreciated stock.",
      },
      {
        id: "espp",
        label: "Employee Stock Purchase Plan (ESPP)",
        blurb: "Typically 10–15% guaranteed discount on company stock",
        applies: esppAvailable,
        done: hasESPP,
        potentialSavings: hasESPP || !esppAvailable ? 0 : 2_000,
        why: "A 15% ESPP discount is effectively a guaranteed 17% return (1/0.85) if you sell at purchase. If you don't trust your employer's stock long-term — sell immediately. Don't leave free money on the table.",
      },
    ];
  }, [filing, age50plus, hasKids, hsaEligible, mr, e401k, hasBackdoorRoth, hasMBDR, mbdrAvailable, mbdrHeadroom, hsa, dcfsa, has529, hasDAF, hasESPP, esppAvailable, max401k, hsaMax]);

  const applicable = levers.filter(l => l.applies);
  const used = applicable.filter(l => l.done).length;
  const total = applicable.length;
  const coveragePct = total === 0 ? 0 : Math.round((used / total) * 100);
  const totalSavings = applicable.reduce((sum, l) => sum + l.potentialSavings, 0);

  // Top 3 missed levers by impact for the recommendations card
  const topMissed = applicable
    .filter(l => !l.done)
    .sort((a, b) => b.potentialSavings - a.potentialSavings)
    .slice(0, 3);

  const coverageColor =
    coveragePct >= 80 ? "text-emerald-600" :
    coveragePct >= 50 ? "text-amber-600"   :
                        "text-rose-600";

  return (
    <section id="tax-stack" className="mb-12 scroll-mt-24 rounded-3xl bg-gradient-to-br from-slate-900 via-zinc-900 to-slate-900 text-white p-6 sm:p-10 shadow-2xl border border-white/5">
      {/* Header */}
      <div className="mb-6">
        <div className="inline-flex items-center gap-2 rounded-full bg-emerald-500/15 border border-emerald-500/30 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-emerald-300 mb-3">
          <span className="relative flex h-1.5 w-1.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-400" />
          </span>
          Free Tool · For HENRYs
        </div>
        <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight">
          Are you using the full <span className="bg-gradient-to-r from-emerald-400 to-teal-400 bg-clip-text text-transparent">tax-advantaged stack?</span>
        </h2>
        <p className="mt-2 text-sm sm:text-base text-zinc-400 max-w-2xl">
          Most high earners use 3–4 of the 8 levers available to them. Each missed lever costs real money every year.
          This is the playbook discussed daily on r/HENRYfinance — checked against your actual situation.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* LEFT: Inputs */}
        <div className="space-y-5">
          {/* Profile */}
          <div className="rounded-2xl bg-white/5 border border-white/10 p-4">
            <div className="text-xs font-semibold uppercase tracking-wider text-zinc-400 mb-3">Your situation</div>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <label className="flex flex-col gap-1">
                <span className="text-zinc-300">Filing status</span>
                <select
                  value={filing}
                  onChange={e => setFiling(e.target.value as Filing)}
                  className="bg-zinc-800 border border-white/10 rounded-lg px-2 py-1.5 text-white"
                >
                  <option value="single">Single</option>
                  <option value="married">Married, filing jointly</option>
                </select>
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-zinc-300">Marginal tax rate</span>
                <select
                  value={marginalRate}
                  onChange={e => setMarginalRate(Number(e.target.value))}
                  className="bg-zinc-800 border border-white/10 rounded-lg px-2 py-1.5 text-white"
                >
                  <option value={24}>24% bracket</option>
                  <option value={32}>32% bracket</option>
                  <option value={35}>35% bracket</option>
                  <option value={37}>37% bracket</option>
                </select>
              </label>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-3">
              <Toggle label="Age 50+" value={age50plus} onChange={setAge50plus} />
              <Toggle label="Have kids" value={hasKids} onChange={setHasKids} />
              <Toggle label="HSA-eligible plan (HDHP)" value={hsaEligible} onChange={setHsaEligible} />
              <Toggle label="ESPP available" value={esppAvailable} onChange={setEsppAvailable} />
            </div>
          </div>

          {/* Lever checklist */}
          <div className="rounded-2xl bg-white/5 border border-white/10 p-4">
            <div className="text-xs font-semibold uppercase tracking-wider text-zinc-400 mb-3">What are you doing now?</div>
            <div className="space-y-3 text-sm">

              <DollarInput
                label="401(k) contributions this year"
                value={e401k}
                onChange={setE401k}
                max={max401k}
                hint={`Max: $${max401k.toLocaleString()}`}
              />

              <Toggle label="Doing Backdoor Roth IRA" value={hasBackdoorRoth} onChange={setHasBackdoorRoth} />

              <Toggle label="My 401(k) plan supports after-tax + in-plan conversion" value={mbdrAvailable} onChange={setMbdrAvailable} />
              {mbdrAvailable && (
                <Toggle label="Doing Mega Backdoor Roth" value={hasMBDR} onChange={setHasMBDR} />
              )}

              {hsaEligible && (
                <DollarInput
                  label="HSA contributions this year"
                  value={hsa}
                  onChange={setHsa}
                  max={hsaMax}
                  hint={`Max: $${hsaMax.toLocaleString()}`}
                />
              )}

              {hasKids && (
                <>
                  <DollarInput
                    label="Dependent Care FSA contributions"
                    value={dcfsa}
                    onChange={setDcfsa}
                    max={LIMITS_2025.dcfsa}
                    hint={`Max: $${LIMITS_2025.dcfsa.toLocaleString()}`}
                  />
                  <Toggle label="Contributing to a 529" value={has529} onChange={setHas529} />
                </>
              )}

              <Toggle label="Using a Donor-Advised Fund" value={hasDAF} onChange={setHasDAF} />

              {esppAvailable && (
                <Toggle label="Participating in ESPP" value={hasESPP} onChange={setHasESPP} />
              )}
            </div>
          </div>
        </div>

        {/* RIGHT: Results */}
        <div className="space-y-5">
          {/* Coverage hero */}
          <div className="rounded-2xl bg-white/5 border border-white/10 p-6 text-center">
            <div className="text-xs font-semibold uppercase tracking-wider text-zinc-400 mb-2">Your tax stack coverage</div>
            <div className={`text-6xl font-extrabold ${coverageColor}`}>
              {used}<span className="text-zinc-500 text-3xl"> / {total}</span>
            </div>
            <div className="text-sm text-zinc-400 mt-1">levers used</div>
            <div className="mt-4 h-2 w-full rounded-full bg-white/5 overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-emerald-500 to-teal-500 transition-all duration-500"
                style={{ width: `${coveragePct}%` }}
              />
            </div>
            {totalSavings > 0 && (
              <div className="mt-5">
                <div className="text-xs font-semibold uppercase tracking-wider text-zinc-400 mb-1">Estimated annual money left on the table</div>
                <div className="text-3xl font-extrabold text-amber-400">
                  ${totalSavings.toLocaleString()}
                </div>
                <div className="text-[11px] text-zinc-500 mt-1">Rough estimate based on your marginal rate. Some levers (Roth growth) compound over decades — they're worth even more long-term.</div>
              </div>
            )}
            {used === total && total > 0 && (
              <div className="mt-5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 p-3 text-sm text-emerald-300">
                ✓ Full coverage. You're using every applicable lever. Nice.
              </div>
            )}
          </div>

          {/* Top missed */}
          {topMissed.length > 0 && (
            <div className="rounded-2xl bg-white/5 border border-white/10 p-5">
              <div className="text-xs font-semibold uppercase tracking-wider text-zinc-400 mb-3">Top {topMissed.length} miss{topMissed.length > 1 ? "es" : ""} ranked by impact</div>
              <div className="space-y-3">
                {topMissed.map((l, i) => (
                  <div key={l.id} className="rounded-xl bg-zinc-950/40 border border-white/5 p-3">
                    <div className="flex items-start gap-3">
                      <div className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-amber-500/15 text-amber-400 text-xs font-bold">{i + 1}</div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-baseline justify-between gap-2">
                          <div className="font-semibold text-white text-sm">{l.label}</div>
                          {l.potentialSavings > 0 && (
                            <div className="text-amber-400 text-xs font-bold whitespace-nowrap">~${l.potentialSavings.toLocaleString()}/yr</div>
                          )}
                        </div>
                        <div className="text-xs text-zinc-400 mt-1 leading-relaxed">{l.why}</div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* CTA to Leverage Score */}
          <div className="rounded-2xl bg-gradient-to-br from-indigo-500/15 to-purple-500/15 border border-indigo-400/30 p-5">
            <div className="text-sm font-semibold text-white mb-1">Want to see what to fix first across your whole financial picture?</div>
            <p className="text-xs text-zinc-300 mb-3">Tax efficiency is one lever. The Leverage Score finds the one that's holding you back the most.</p>
            <a
              href="#calculator"
              className="inline-flex items-center gap-2 rounded-xl bg-white text-indigo-700 px-4 py-2 text-sm font-semibold hover:bg-indigo-50 transition"
            >
              Get my Leverage Score → it's free
            </a>
          </div>
        </div>
      </div>

      <div className="mt-6 text-[11px] text-zinc-500 max-w-2xl">
        Educational only, not tax advice. Limits shown are 2025 IRS figures.
        Marginal-rate estimates assume federal only — your actual savings include state and FICA where applicable.
        Mega Backdoor Roth headroom assumes a typical ~$15k employer match; adjust expectations to your plan.
      </div>
    </section>
  );
}

// ─── Inline UI bits ───────────────────────────────────────────────────────────
function Toggle({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!value)}
      className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-left text-sm transition ${
        value
          ? "bg-emerald-500/15 border-emerald-500/40 text-emerald-200"
          : "bg-zinc-800/50 border-white/10 text-zinc-300 hover:bg-zinc-800"
      }`}
    >
      <div className={`grid h-4 w-4 shrink-0 place-items-center rounded border ${value ? "border-emerald-400 bg-emerald-500" : "border-white/30"}`}>
        {value && <span className="text-[10px] text-white font-bold leading-none">✓</span>}
      </div>
      <span className="leading-tight">{label}</span>
    </button>
  );
}

function DollarInput({ label, value, onChange, max, hint }: { label: string; value: number; onChange: (v: number) => void; max: number; hint: string }) {
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-baseline justify-between">
        <span className="text-zinc-300">{label}</span>
        <span className="text-[11px] text-zinc-500">{hint}</span>
      </div>
      <div className="flex items-center gap-2 rounded-lg bg-zinc-800 border border-white/10 px-2 py-1.5 focus-within:border-emerald-400/50 transition">
        <span className="text-zinc-500">$</span>
        <input
          type="number"
          inputMode="numeric"
          min={0}
          max={max}
          step={500}
          value={value || ""}
          onChange={e => onChange(Math.min(max, Math.max(0, Number(e.target.value) || 0)))}
          placeholder="0"
          className="flex-1 bg-transparent text-white outline-none placeholder:text-zinc-600"
        />
      </div>
    </div>
  );
}
