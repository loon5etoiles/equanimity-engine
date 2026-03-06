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
