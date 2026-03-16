export type LeverageBreakdown = {
  total: number;
  runwayScore: number;      // 0–30
  dependencyScore: number;  // 0–25
  velocityScore: number;    // 0–25
  shockScore: number;       // 0–20
  bottleneck: { key: "runway" | "dependency" | "velocity" | "shock"; name: string; why: string };
};

export const clamp = (n: number, min: number, max: number) =>
  Math.max(min, Math.min(max, n));

export const fmt = (n: number) =>
  n.toLocaleString(undefined, {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  });

export function fvMonthly(pmt: number, annualRate: number, years: number) {
  const r = annualRate / 12;
  const n = Math.round(years * 12);
  if (r === 0) return pmt * n;
  return pmt * ((Math.pow(1 + r, n) - 1) / r);
}

export function fvWithStart(
  start: number,
  pmt: number,
  annualRate: number,
  years: number
) {
  const r = annualRate / 12;
  const n = Math.round(years * 12);
  const startGrowth = start * Math.pow(1 + r, n);
  return startGrowth + fvMonthly(pmt, annualRate, years);
}

export function buildSeries(
  start: number,
  pmt: number,
  annualRate: number,
  years: number
) {
  const r = annualRate / 12;
  const months = Math.round(years * 12);
  let bal = start;
  const out: { month: number; year: number; value: number }[] = [];
  for (let m = 1; m <= months; m++) {
    bal = bal * (1 + r) + pmt;
    if (m % 3 === 0 || m === 1 || m === months)
      out.push({ month: m, year: m / 12, value: bal });
  }
  return out;
}

export function yearsToTarget(
  start: number,
  pmt: number,
  annualRate: number,
  target: number
) {
  const r = annualRate / 12;
  if (pmt <= 0) return null;
  let bal = start;
  for (let m = 1; m <= 12 * 60; m++) {
    bal = bal * (1 + r) + pmt;
    if (bal >= target) return m / 12;
  }
  return null;
}

export function computeScenario({
  monthlyIncome,
  monthlyExpenses,
  cashStart,
  months,
  incomeDropPct,
}: {
  monthlyIncome: number;
  monthlyExpenses: number;
  cashStart: number;
  months: number;
  incomeDropPct: number; // 0–100
}) {
  const keptIncome = monthlyIncome * (1 - incomeDropPct / 100);
  const netBurn = monthlyExpenses - keptIncome; // positive => burning cash
  const cashAfter = cashStart - netBurn * months;
  const survives = cashAfter >= 0;
  const runwayInShock = netBurn > 0 ? cashStart / netBurn : Infinity;

  return { keptIncome, netBurn, cashAfter, survives, runwayInShock };
}

export function computeLeverageBreakdown({
  runwayMonths,
  monthlyExpenses,
  investedStart,
  yrsToTarget,
  cashStart,
}: {
  runwayMonths: number;
  monthlyExpenses: number;
  investedStart: number;
  yrsToTarget: number | null;
  cashStart: number;
}): LeverageBreakdown {
  // Runway 0–30
  let runwayScore = 0;
  if (runwayMonths < 3) runwayScore = 0;
  else if (runwayMonths < 6) runwayScore = 10;
  else if (runwayMonths < 9) runwayScore = 20;
  else runwayScore = 30;

  // Dependency 0–25
  const annualExpenses = monthlyExpenses * 12;
  const dependencyRatio = investedStart > 0 ? annualExpenses / investedStart : 1;
  let dependencyScore = 0;
  if (dependencyRatio > 0.06) dependencyScore = 0;
  else if (dependencyRatio > 0.04) dependencyScore = 10;
  else if (dependencyRatio > 0.03) dependencyScore = 20;
  else dependencyScore = 25;

  // Velocity 0–25
  let velocityScore = 0;
  if (!yrsToTarget) velocityScore = 0;
  else if (yrsToTarget > 15) velocityScore = 0;
  else if (yrsToTarget > 10) velocityScore = 10;
  else if (yrsToTarget > 5) velocityScore = 20;
  else velocityScore = 25;

  // Shock 0–20
  const sixMonthShockCash = cashStart - monthlyExpenses * 6;
  const shockRunway = sixMonthShockCash > 0 ? sixMonthShockCash / monthlyExpenses : 0;
  let shockScore = 0;
  if (shockRunway <= 0) shockScore = 0;
  else if (shockRunway < 3) shockScore = 5;
  else if (shockRunway < 6) shockScore = 10;
  else if (shockRunway < 12) shockScore = 15;
  else shockScore = 20;

  const total = Math.min(runwayScore + dependencyScore + velocityScore + shockScore, 100);

  const ratios = [
    { key: "runway" as const, score: runwayScore, max: 30, name: "Runway strength" },
    { key: "dependency" as const, score: dependencyScore, max: 25, name: "Income dependency" },
    { key: "velocity" as const, score: velocityScore, max: 25, name: "Wealth velocity" },
    { key: "shock" as const, score: shockScore, max: 20, name: "Shock resistance" },
  ].map((x) => ({ ...x, pct: x.max ? x.score / x.max : 0 }));

  ratios.sort((a, b) => a.pct - b.pct);
  const b = ratios[0];

  const why =
    b.key === "runway"
      ? "Your cash coverage is the fastest lever for reducing fear and pressure."
      : b.key === "dependency"
      ? "Your invested base isn't yet large enough relative to annual spend."
      : b.key === "velocity"
      ? "Your current contribution rate slows the timeline to true optionality."
      : "A 6–12 month disruption would force reactive decisions too quickly.";

  return {
    total,
    runwayScore,
    dependencyScore,
    velocityScore,
    shockScore,
    bottleneck: { key: b.key, name: b.name, why },
  };
}

export function build12MonthPlan({
  runwayMonths,
  surplus,
  bottleneckKey,
}: {
  runwayMonths: number;
  surplus: number;
  bottleneckKey: LeverageBreakdown["bottleneck"]["key"];
}) {
  const actions: { phase: "0–14 days" | "15–60 days" | "61–180 days" | "181–365 days"; items: string[] }[] = [
    { phase: "0–14 days", items: [] },
    { phase: "15–60 days", items: [] },
    { phase: "61–180 days", items: [] },
    { phase: "181–365 days", items: [] },
  ];

  actions[0].items.push("Automate bills + transfers: remove decision fatigue.");
  actions[0].items.push("Define a minimum cash floor (6 months) and protect it.");
  actions[0].items.push("Cut 1–2 recurring expenses you don't feel (subscriptions, unused services).");

  if (runwayMonths < 6) {
    actions[1].items.push("Prioritize runway: redirect surplus to cash until 6–8 months.");
    actions[1].items.push("Freeze lifestyle expansion: no new fixed monthly commitments.");
  } else {
    actions[1].items.push("Maintain runway: keep cash ≥ 6 months while investing consistently.");
  }

  if (bottleneckKey === "dependency") {
    actions[1].items.push("Reduce annual spend or increase invested base to lower dependency ratio.");
    actions[2].items.push("Raise contribution rate by +$500–$1,000/month (or redirect bonuses).");
  }

  if (bottleneckKey === "velocity") {
    actions[1].items.push("Pick a 'speed target': +$1k/mo or +$2k/mo and lock it in.");
    actions[2].items.push("Review big 3 expenses (housing, transport, insurance) for compounding impact.");
  }

  if (bottleneckKey === "shock") {
    actions[1].items.push("Create a layoff protocol: reduce burn triggers + define decision deadlines.");
    actions[2].items.push("Build a 'shock buffer': additional 2–4 months beyond base runway.");
  }

  if (bottleneckKey === "runway") {
    actions[1].items.push("Turn runway into a system: separate 'runway' account, auto-fund weekly.");
    actions[2].items.push("Negotiate fixed costs down (insurance, utilities, interest rates, subscriptions).");
  }

  actions[3].items.push("Use leverage at work: boundaries, negotiation, or role change from calm.");
  actions[3].items.push("Design a 1–2 month 'recovery window' plan if burnout spikes.");

  if (surplus < 0) {
    actions[0].items.unshift("Stop the bleed: you are running a monthly deficit — fix burn first.");
    actions[1].items.unshift("Stabilize cashflow: reduce fixed costs or increase income immediately.");
  }

  return actions;
}

// ─── Monte Carlo ──────────────────────────────────────────────────────────────

export interface MonteCarloResult {
  /** P10 portfolio value at each year mark */
  p10: number[];
  /** P25 portfolio value at each year mark */
  p25: number[];
  /** P50 (median) portfolio value at each year mark */
  p50: number[];
  /** P75 portfolio value at each year mark */
  p75: number[];
  /** P90 portfolio value at each year mark */
  p90: number[];
  /** Fraction of simulations that reached `target` */
  successRate: number;
  /** Years array (1 … years) */
  years: number[];
}

/** Box-Muller normal sample with mean=0, σ=1 */
function randn(): number {
  let u = 0, v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

export function computeMonteCarlo({
  start,
  monthlyContrib,
  annualRate,
  stdDev = 0.15,
  years,
  target,
  simCount = 1000,
}: {
  start: number;
  monthlyContrib: number;
  annualRate: number;   // decimal e.g. 0.07
  stdDev?: number;      // annual standard deviation, e.g. 0.15
  years: number;
  target: number;
  simCount?: number;
}): MonteCarloResult {
  const months = Math.round(years * 12);
  const monthlyStd = stdDev / Math.sqrt(12);

  // Store final values + per-year snapshots
  const snapshots: number[][] = Array.from({ length: years }, () => []);
  let hits = 0;

  for (let s = 0; s < simCount; s++) {
    let bal = start;
    let yr = 0;
    for (let m = 1; m <= months; m++) {
      const monthlyR = annualRate / 12 + monthlyStd * randn();
      bal = bal * (1 + monthlyR) + monthlyContrib;
      if (m % 12 === 0) {
        snapshots[yr].push(bal);
        yr++;
      }
    }
    if (bal >= target) hits++;
  }

  const pct = (arr: number[], p: number) => {
    const sorted = [...arr].sort((a, b) => a - b);
    const idx = Math.max(0, Math.min(sorted.length - 1, Math.floor(sorted.length * p)));
    return sorted[idx];
  };

  return {
    p10: snapshots.map((a) => pct(a, 0.1)),
    p25: snapshots.map((a) => pct(a, 0.25)),
    p50: snapshots.map((a) => pct(a, 0.5)),
    p75: snapshots.map((a) => pct(a, 0.75)),
    p90: snapshots.map((a) => pct(a, 0.9)),
    successRate: hits / simCount,
    years: Array.from({ length: years }, (_, i) => i + 1),
  };
}

// ─── Peer Benchmarks ──────────────────────────────────────────────────────────

export interface PeerBenchmarks {
  savingsRate:    { value: number; peerMedian: number; peerTop: number; label: string };
  runwayMonths:   { value: number; peerMedian: number; peerTop: number; label: string };
  leverageScore:  { value: number; peerMedian: number; peerTop: number; label: string };
}

/**
 * Returns peer percentile context for key metrics.
 * Medians/tops are based on published US household financial health data.
 */
export function computePeerBenchmarks({
  savingsRate,
  runwayMonths,
  leverageScore,
}: {
  savingsRate: number;    // 0–100
  runwayMonths: number;
  leverageScore: number;  // 0–100
}): PeerBenchmarks {
  return {
    savingsRate: {
      value: savingsRate,
      peerMedian: 12,
      peerTop: 30,
      label: savingsRate >= 30 ? "Top 15%" : savingsRate >= 20 ? "Top 30%" : savingsRate >= 12 ? "Average" : "Below average",
    },
    runwayMonths: {
      value: runwayMonths,
      peerMedian: 3,
      peerTop: 9,
      label: runwayMonths >= 9 ? "Top 20%" : runwayMonths >= 6 ? "Top 40%" : runwayMonths >= 3 ? "Average" : "Below average",
    },
    leverageScore: {
      value: leverageScore,
      peerMedian: 35,
      peerTop: 70,
      label: leverageScore >= 70 ? "Top 15%" : leverageScore >= 55 ? "Top 35%" : leverageScore >= 35 ? "Average" : "Below average",
    },
  };
}

// ─── Spending Tiers ───────────────────────────────────────────────────────────

export interface SpendingTier {
  label: string;
  monthlyExpenses: number;
  freedomNumber: number;
  yearsToFreedom: number | null;
}

export function computeSpendingTiers({
  monthlyExpenses,
  investedStart,
  monthlyInvest,
  annualRate,
}: {
  monthlyExpenses: number;
  investedStart: number;
  monthlyInvest: number;
  annualRate: number;   // decimal
}): SpendingTier[] {
  const tiers = [
    { label: "Lean", factor: 0.7 },
    { label: "Current", factor: 1.0 },
    { label: "Comfortable", factor: 1.3 },
    { label: "Affluent", factor: 1.6 },
  ];
  return tiers.map(({ label, factor }) => {
    const exp = monthlyExpenses * factor;
    const fn = exp * 12 * 25;
    const yrs = yearsToTarget(investedStart, monthlyInvest, annualRate, fn);
    return { label, monthlyExpenses: Math.round(exp), freedomNumber: Math.round(fn), yearsToFreedom: yrs };
  });
}

// ─── Harmony Score ────────────────────────────────────────────────────────────

/**
 * A qualitative 0–100 score combining financial momentum with life design clarity.
 * Higher is better. Distinct from the Leverage Score (which is purely financial).
 */
export function computeHarmonyScore({
  savingsRate,
  surplus,
  monthlyIncome,
  hasGoalName,
}: {
  savingsRate: number;    // 0–100
  surplus: number;        // can be negative
  monthlyIncome: number;
  hasGoalName: boolean;
}): number {
  // Savings rate contribution (0–40 pts)
  const srPts = Math.min(40, (savingsRate / 30) * 40);

  // Surplus as % of income contribution (0–30 pts)
  const surplusPct = monthlyIncome > 0 ? (surplus / monthlyIncome) * 100 : 0;
  const surplusPts = Math.min(30, Math.max(0, (surplusPct / 20) * 30));

  // Goal clarity (0–20 pts)
  const goalPts = hasGoalName ? 20 : 5;

  // Baseline stability (0–10 pts) — having any income and positive surplus
  const basePts = monthlyIncome > 0 && surplus > 0 ? 10 : surplus === 0 ? 5 : 0;

  return Math.round(Math.min(100, srPts + surplusPts + goalPts + basePts));
}

// ─── Stress Test ─────────────────────────────────────────────────────────────

export type StressStatus = "SURVIVES" | "AT_RISK" | "CRITICAL";

export type StressScenarioResult = {
  name: string;
  status: StressStatus;
  headline: string;
  numbers: { label: string; value: string }[];
  action: string;
};

export type StressTestResult = {
  layoff: StressScenarioResult;
  marketCrash: StressScenarioResult;
  medical: StressScenarioResult;
  careerPivot: StressScenarioResult;
  lifestyleCreep: StressScenarioResult;
};

export function computeStressTest({
  monthlyIncome,
  monthlyExpenses,
  cashStart,
  investedStart,
  monthlyInvest,
  annualReturnPct,
  target,
}: {
  monthlyIncome: number;
  monthlyExpenses: number;
  cashStart: number;
  investedStart: number;
  monthlyInvest: number;
  annualReturnPct: number;
  target: number;
}): StressTestResult {
  const annualRate = annualReturnPct / 100;
  const surplus = monthlyIncome - monthlyExpenses;

  // ── 1. Layoff (income = $0) ────────────────────────────────────────────────
  const layoffRunway = monthlyExpenses > 0 ? cashStart / monthlyExpenses : Infinity;
  const criticalMonth = Math.floor(layoffRunway);
  const minBurnToExtend =
    layoffRunway + 3 > 0
      ? Math.max(0, monthlyExpenses - cashStart / (layoffRunway + 3))
      : 0;

  const layoffStatus: StressStatus =
    layoffRunway >= 9 ? "SURVIVES" : layoffRunway >= 5 ? "AT_RISK" : "CRITICAL";

  const layoff: StressScenarioResult = {
    name: "Layoff",
    status: layoffStatus,
    headline: `Runway lasts ${layoffRunway === Infinity ? "indefinitely" : layoffRunway.toFixed(1) + " months"}`,
    numbers: [
      { label: "Cash runway", value: layoffRunway === Infinity ? "∞" : `${layoffRunway.toFixed(1)} mo` },
      { label: "Critical month", value: `Month ${criticalMonth}` },
      { label: "Reduce burn by", value: fmt(minBurnToExtend) + "/mo" },
    ],
    action:
      layoffRunway >= 9
        ? "You have genuine optionality if laid off — maintain 9+ month buffer."
        : layoffRunway >= 5
        ? `Build runway to 9 months — add ${fmt((9 - layoffRunway) * monthlyExpenses)} in cash reserves.`
        : `URGENT: Add ${fmt(Math.max(0, monthlyExpenses * 6 - cashStart))} to reach minimum 6-month floor immediately.`,
  };

  // ── 2. Market Crash (−35%) ─────────────────────────────────────────────────
  const crashedPortfolio = investedStart * 0.65;
  const baseYrs = yearsToTarget(investedStart, monthlyInvest, annualRate, target);
  const crashYrs = yearsToTarget(crashedPortfolio, monthlyInvest, annualRate, target);
  const yearsAdded = crashYrs != null && baseYrs != null ? crashYrs - baseYrs : null;

  const crashStatus: StressStatus =
    yearsAdded == null || yearsAdded > 5
      ? "CRITICAL"
      : yearsAdded > 2
      ? "AT_RISK"
      : "SURVIVES";

  const marketCrash: StressScenarioResult = {
    name: "Market Crash (−35%)",
    status: crashStatus,
    headline: yearsAdded != null
      ? `Adds ${yearsAdded.toFixed(1)} years to your timeline`
      : "Timeline extends significantly",
    numbers: [
      { label: "Portfolio after crash", value: fmt(crashedPortfolio) },
      { label: "Years added", value: yearsAdded != null ? `+${yearsAdded.toFixed(1)} yrs` : "—" },
      { label: "New timeline", value: crashYrs != null ? `${crashYrs.toFixed(1)} yrs` : "—" },
    ],
    action:
      "Do not stop investing — crashes reward consistent contributions via dollar-cost averaging.",
  };

  // ── 3. Medical Emergency ($50k midpoint) ───────────────────────────────────
  const medMid = 50000;
  const cashAfterMed = cashStart - medMid;
  const medStatus: StressStatus =
    cashAfterMed >= monthlyExpenses * 6
      ? "SURVIVES"
      : cashAfterMed >= 0
      ? "AT_RISK"
      : "CRITICAL";
  const rebuildMonths = surplus > 0 ? Math.ceil(medMid / surplus) : null;

  const medical: StressScenarioResult = {
    name: "Medical Emergency",
    status: medStatus,
    headline:
      cashAfterMed >= 0
        ? `Cash covers it — ${(cashAfterMed / Math.max(1, monthlyExpenses)).toFixed(1)} mo runway remains`
        : `Shortfall of ${fmt(-cashAfterMed)} — investments must be tapped`,
    numbers: [
      { label: "$25k hit: cash left", value: fmt(cashStart - 25000) },
      { label: "$75k hit: cash left", value: fmt(cashStart - 75000) },
      { label: "Rebuild time ($50k)", value: rebuildMonths != null ? `${rebuildMonths} mo` : "—" },
    ],
    action:
      cashAfterMed >= 0
        ? "Medical costs covered by runway — ensure HSA or dedicated medical reserve is funded."
        : "Add a dedicated $25k medical reserve separate from your emergency runway.",
  };

  // ── 4. Career Pivot (70% income for 24 months) ────────────────────────────
  const pivotIncome = monthlyIncome * 0.70;
  const pivotSurplus = pivotIncome - monthlyExpenses;
  const pivotBurn = Math.max(0, -pivotSurplus);
  const cashAfterPivot = cashStart - pivotBurn * 24;
  const pivotInvestRate = Math.max(0, pivotSurplus * 0.8);
  const pivotYrs = yearsToTarget(investedStart, pivotInvestRate, annualRate, target);
  const fnYearsLost = pivotYrs != null && baseYrs != null ? Math.max(0, pivotYrs - baseYrs) : null;
  const minPivotSalary = monthlyExpenses + monthlyInvest;

  const pivotStatus: StressStatus =
    cashAfterPivot >= monthlyExpenses * 6 && pivotSurplus > 0
      ? "SURVIVES"
      : cashAfterPivot >= 0
      ? "AT_RISK"
      : "CRITICAL";

  const careerPivot: StressScenarioResult = {
    name: "Career Pivot (−30% income)",
    status: pivotStatus,
    headline: fnYearsLost != null
      ? `Costs ${fnYearsLost.toFixed(1)} years of FN progress`
      : "Significant timeline impact",
    numbers: [
      { label: "Pivot income", value: fmt(pivotIncome) + "/mo" },
      { label: "FN years cost", value: fnYearsLost != null ? `+${fnYearsLost.toFixed(1)} yrs` : "—" },
      { label: "Min salary to stay on track", value: fmt(minPivotSalary * 12) + "/yr" },
    ],
    action: `Minimum pivot salary to preserve trajectory: ${fmt(minPivotSalary)}/mo (${fmt(minPivotSalary * 12)}/yr).`,
  };

  // ── 5. Lifestyle Creep (+$2,000/mo) ───────────────────────────────────────
  const creepExpenses = monthlyExpenses + 2000;
  const creepSurplus = monthlyIncome - creepExpenses;
  const creepInvestRate = Math.max(0, creepSurplus * 0.8);
  const creepRunwayMonths = creepExpenses > 0 ? cashStart / creepExpenses : 0;
  const creepYrs = yearsToTarget(investedStart, creepInvestRate, annualRate, target);
  const creepBreakdown = computeLeverageBreakdown({
    runwayMonths: creepRunwayMonths,
    monthlyExpenses: creepExpenses,
    investedStart,
    yrsToTarget: creepYrs,
    cashStart,
  });
  const baseBreakdown = computeLeverageBreakdown({
    runwayMonths: monthlyExpenses > 0 ? cashStart / monthlyExpenses : 0,
    monthlyExpenses,
    investedStart,
    yrsToTarget: baseYrs,
    cashStart,
  });

  const creepStatus: StressStatus =
    creepSurplus >= monthlyInvest ? "AT_RISK" : creepSurplus > 0 ? "AT_RISK" : "CRITICAL";

  const lifestyleCreep: StressScenarioResult = {
    name: "Lifestyle Creep (+$2k/mo)",
    status: creepStatus,
    headline: `Leverage Score drops ${baseBreakdown.total} → ${creepBreakdown.total}`,
    numbers: [
      { label: "Extra cost per year", value: fmt(24000) },
      { label: "New Leverage Score", value: String(creepBreakdown.total) },
      { label: "Wealth cost at 4% SWR", value: fmt(24000 * 25) },
    ],
    action: `This $2k/mo creep costs ${fmt(24000 * 25)} in future wealth at a 4% withdrawal rate — equivalent to ${Math.round(24000 * 25 / Math.max(1, investedStart) * 100)}% of your current portfolio.`,
  };

  return { layoff, marketCrash, medical, careerPivot, lifestyleCreep };
}
