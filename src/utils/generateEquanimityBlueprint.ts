/**
 * generateEquanimityBlueprint.ts
 *
 * Standalone 32-page premium PDF generator for the Equanimity Blueprint.
 * Accepts a BlueprintData object — no React closures, no html2canvas.
 * All charts are drawn with pure jsPDF primitives.
 *
 * Page layout (letter, 612 × 792 pt, margin 48 pt):
 *   1   Cover
 *   2   Table of Contents
 *   3   Executive Summary
 *   4   Financial Snapshot
 *   5   Leverage Score overview
 *   6   Runway deep-dive
 *   7   Income Dependency deep-dive
 *   8   Wealth Velocity deep-dive
 *   9   Shock Resistance deep-dive
 *  10   Pillar Radar
 *  11   Peer Benchmarks
 *  12   Monte Carlo overview (fan chart)
 *  13   Monte Carlo detail + success rate
 *  14   Milestones
 *  15   Spending Tiers
 *  16   Freedom Number analysis
 *  17   Acceleration strategies
 *  18   12-Month Plan — Phase 1 (0–60 days)
 *  19   12-Month Plan — Phase 2 (61–180 days)
 *  20   12-Month Plan — Phase 3 (181–365 days)
 *  21   Stress Tests overview
 *  22   Stress Test: Layoff
 *  23   Stress Test: Market Crash
 *  24   Stress Test: Medical
 *  25   Stress Test: Career Pivot
 *  26   Stress Test: Lifestyle Creep
 *  27   Bottleneck Analysis
 *  28   Harmony Score
 *  29   Legacy & Wealth Transfer
 *  30   Next Steps Checklist
 *  31   Glossary (part 1)
 *  32   Glossary (part 2)
 */

import jsPDF from "jspdf";
import {
  computeLeverageBreakdown,
  build12MonthPlan,
  computeStressTest,
  computeMonteCarlo,
  computePeerBenchmarks,
  computeSpendingTiers,
  computeHarmonyScore,
  yearsToTarget,
  fvWithStart,
  fmt,
  type LeverageBreakdown,
  type StressTestResult,
  type MonteCarloResult,
  type PeerBenchmarks,
  type SpendingTier,
} from "./math";

import {
  C,
  drawNavyCover,
  drawPageHeader,
  drawPageFooter,
  drawGoldRule,
  drawSectionTitle,
  drawSubTitle,
  drawKpiGrid,
  drawProgressBar,
  drawPillarBars,
  drawRadar,
  drawCallout,
  drawStatusBadge,
  drawSimpleTable,
  drawMonteCarloFan,
  setFill,
  setDraw,
  setTxt,
  font,
  wrapText,
} from "./premiumPdf";

// ─── BlueprintData interface ──────────────────────────────────────────────────

export interface BlueprintData {
  // User profile
  userName: string;
  age: number;
  goalName: string;

  // Financials
  monthlyIncome: number;
  monthlyExpenses: number;
  monthlyInvest: number;
  cashStart: number;
  investedStart: number;
  annualReturnPct: number;    // e.g. 7
  target: number;             // Goal target (user-chosen milestone; may be below FI)
  years: number;              // projection horizon

  // Optional extras
  riskTolerance?: number;     // 1 (conservative) – 5 (aggressive)
  bufferTarget?: number;      // comfort buffer target
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const PAGE_W = 612;
const PAGE_H = 792;
const MARGIN = 48;
const CONTENT_W = PAGE_W - MARGIN * 2;
const BODY_TOP = 44;     // y below page header
const BODY_BOT = PAGE_H - 28; // y above page footer

let _doc: any;
let _pageNum = 0;
let _section = "";

function newPage(section?: string) {
  _doc.addPage();
  _pageNum++;
  if (section) _section = section;
  drawPageHeader(_doc, { section: _section, pageW: PAGE_W, pageNum: _pageNum });
  drawPageFooter(_doc, { pageW: PAGE_W, pageH: PAGE_H });
}

function bodyY() {
  return BODY_TOP + 20;
}

/** Ensure there is at least `needed` pt of space before next page break */
function ensureSpace(currentY: number, needed: number): number {
  if (currentY + needed > BODY_BOT - 10) {
    newPage();
    return bodyY();
  }
  return currentY;
}

// ─── Main export ─────────────────────────────────────────────────────────────

export function generateEquanimityBlueprint(
  data: BlueprintData,
  mode: "download" | "base64" = "download"
): string | void {
  _doc = new jsPDF({ unit: "pt", format: "letter" });
  _pageNum = 0;

  const {
    userName,
    age,
    goalName,
    monthlyIncome,
    monthlyExpenses,
    monthlyInvest,
    cashStart,
    investedStart,
    annualReturnPct,
    target,
    years,
    riskTolerance = 3,
    bufferTarget = 0,
  } = data;

  const annualRate = annualReturnPct / 100;
  const surplus = monthlyIncome - monthlyExpenses;
  const savingsRate = monthlyIncome > 0 ? (surplus / monthlyIncome) * 100 : 0;
  const runwayMonths = monthlyExpenses > 0 ? cashStart / monthlyExpenses : 0;
  const annualExpenses = monthlyExpenses * 12;
  // 4% SWR implied FI number (25× annual expenses).
  const fiNumber = annualExpenses * 25;
  // User-specified target (often a milestone below FI for partial optionality).
  const goalTarget = target;
  const yrsToGoalTarget = yearsToTarget(investedStart, monthlyInvest, annualRate, goalTarget);
  const projectedValue = fvWithStart(investedStart, monthlyInvest, annualRate, years);
  const fileSafeDate = new Date().toISOString().slice(0, 10);
  const displayDate = new Date().toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });

  const breakdown: LeverageBreakdown = computeLeverageBreakdown({
    runwayMonths,
    monthlyExpenses,
    investedStart,
    yrsToTarget: yrsToGoalTarget,
    cashStart,
  });

  const plan = build12MonthPlan({
    runwayMonths,
    surplus,
    bottleneckKey: breakdown.bottleneck.key,
  });

  const stressTest: StressTestResult = computeStressTest({
    monthlyIncome,
    monthlyExpenses,
    cashStart,
    investedStart,
    monthlyInvest,
    annualReturnPct,
    target: goalTarget,
  });

  const stdDev = riskTolerance === 1 ? 0.08
    : riskTolerance === 2 ? 0.11
    : riskTolerance === 4 ? 0.18
    : riskTolerance === 5 ? 0.22
    : 0.15;

  const monte: MonteCarloResult = computeMonteCarlo({
    start: investedStart,
    monthlyContrib: monthlyInvest,
    annualRate,
    stdDev,
    years,
    target: goalTarget,
    simCount: 1000,
  });

  const peers: PeerBenchmarks = computePeerBenchmarks({
    savingsRate,
    runwayMonths,
    leverageScore: breakdown.total,
  });

  const spendingTiers: SpendingTier[] = computeSpendingTiers({
    monthlyExpenses,
    investedStart,
    monthlyInvest,
    annualRate,
  });

  const harmonyScore = computeHarmonyScore({
    savingsRate,
    surplus,
    monthlyIncome,
    hasGoalName: !!goalName,
  });

  // ─────────────────────────────────────────────────────────────────────────
  // PAGE 1 — COVER
  // ─────────────────────────────────────────────────────────────────────────
  _pageNum = 1;
  drawNavyCover(_doc, {
    title: "Your Leverage Blueprint",
    subtitle: goalName
      ? `Freedom Strategy · ${goalName}`
      : "Personalised Financial Independence Strategy",
    name: userName || "Confidential",
    date: displayDate,
    pageW: PAGE_W,
    pageH: PAGE_H,
  });

  // ─────────────────────────────────────────────────────────────────────────
  // PAGE 2 — TABLE OF CONTENTS
  // ─────────────────────────────────────────────────────────────────────────
  newPage("Table of Contents");
  let y = bodyY();

  y = drawSectionTitle(_doc, "Table of Contents", MARGIN, y);
  y += 8;

  const tocEntries: [string, string][] = [
    ["Executive Summary", "3"],
    ["Financial Snapshot", "4"],
    ["Leverage Score", "5"],
    ["Pillar Deep-Dives", "6–9"],
    ["Pillar Radar", "10"],
    ["Peer Benchmarks", "11"],
    ["Monte Carlo Simulation", "12–13"],
    ["Milestones", "14"],
    ["Spending Tiers", "15"],
    ["Freedom Number Analysis", "16"],
    ["Acceleration Strategies", "17"],
    ["12-Month Action Plan", "18–20"],
    ["Stress Tests", "21–26"],
    ["Bottleneck Analysis", "27"],
    ["Harmony Score", "28"],
    ["Legacy & Wealth Transfer", "29"],
    ["Next Steps Checklist", "30"],
    ["Glossary", "31–32"],
  ];

  tocEntries.forEach(([title, pg], i) => {
    const isEven = i % 2 === 0;
    if (isEven) {
      setFill(_doc, C.softBg);
      _doc.roundedRect(MARGIN, y - 9, CONTENT_W, 18, 2, 2, "F");
    }
    font(_doc, 9, "bold");
    setTxt(_doc, C.charcoal);
    _doc.text(title, MARGIN + 8, y + 2);
    font(_doc, 9, "normal");
    setTxt(_doc, C.muted);
    _doc.text(pg, PAGE_W - MARGIN - 8, y + 2, { align: "right" });
    y += 18;
  });

  // ─────────────────────────────────────────────────────────────────────────
  // PAGE 3 — EXECUTIVE SUMMARY
  // ─────────────────────────────────────────────────────────────────────────
  newPage("Executive Summary");
  y = bodyY();

  y = drawSectionTitle(_doc, "Executive Summary", MARGIN, y);
  y += 4;

  // Score badge
  const scoreColor: [number, number, number] =
    breakdown.total >= 70 ? C.teal :
    breakdown.total >= 50 ? C.goldLight :
    breakdown.total >= 30 ? C.warn : C.danger;

  setFill(_doc, scoreColor);
  _doc.circle(MARGIN + 36, y + 36, 36, "F");
  font(_doc, 26, "bold");
  setTxt(_doc, C.white);
  _doc.text(String(breakdown.total), MARGIN + 36, y + 42, { align: "center" });
  font(_doc, 8, "bold");
  setTxt(_doc, C.white);
  _doc.text("/ 100", MARGIN + 36, y + 54, { align: "center" });

  const scoreLabel =
    breakdown.total >= 70 ? "Strong Optionality" :
    breakdown.total >= 50 ? "Building Leverage" :
    breakdown.total >= 30 ? "Stable but Dependent" : "Financially Exposed";

  font(_doc, 13, "bold");
  setTxt(_doc, C.navy);
  _doc.text(scoreLabel, MARGIN + 82, y + 28);

  font(_doc, 9, "normal");
  setTxt(_doc, C.muted);
  _doc.text(`Leverage Score`, MARGIN + 82, y + 14);

  font(_doc, 9, "normal");
  setTxt(_doc, C.charcoal);
  const summaryText =
    `${userName ? userName + ", your" : "Your"} Leverage Score of ${breakdown.total}/100 places you in the ` +
    `"${scoreLabel}" tier. Your primary bottleneck is ${breakdown.bottleneck.name.toLowerCase()}: ` +
    `${breakdown.bottleneck.why} This blueprint provides a personalised 12-month roadmap to address this ` +
    `bottleneck and accelerate your path to ${goalName || "financial independence"}.`;
  y = wrapText(_doc, summaryText, MARGIN + 82, y + 44, CONTENT_W - 82, 14);

  y += 16;
  drawGoldRule(_doc, MARGIN, y, CONTENT_W);
  y += 16;

  // 3 headline metrics
  y = drawKpiGrid(_doc, {
    cells: [
      { label: "Goal Target", value: fmt(goalTarget), sub: `${yrsToGoalTarget ? yrsToGoalTarget.toFixed(1) + " yrs away" : "Beyond 60 yrs"}`, accent: C.teal },
      { label: "Monthly Surplus", value: fmt(surplus), sub: `${savingsRate.toFixed(0)}% savings rate`, accent: surplus >= 0 ? C.teal : C.danger },
      { label: "Emergency Runway", value: `${runwayMonths.toFixed(1)} mo`, sub: runwayMonths >= 6 ? "Above safety floor" : "Below 6-month floor", accent: runwayMonths >= 6 ? C.teal : C.warn },
    ],
    x: MARGIN,
    y,
    w: CONTENT_W,
  });

  y += 8;
  y = drawCallout(_doc, {
    x: MARGIN, y, w: CONTENT_W,
    heading: `Primary Bottleneck: ${breakdown.bottleneck.name}`,
    body: breakdown.bottleneck.why + " See page 27 for the full bottleneck analysis and specific actions.",
    accentColor: C.gold,
  });

  // ─────────────────────────────────────────────────────────────────────────
  // PAGE 4 — FINANCIAL SNAPSHOT
  // ─────────────────────────────────────────────────────────────────────────
  newPage("Financial Snapshot");
  y = bodyY();

  y = drawSectionTitle(_doc, "Financial Snapshot", MARGIN, y);
  y += 4;

  y = drawKpiGrid(_doc, {
    cells: [
      { label: "Monthly Income", value: fmt(monthlyIncome), accent: C.teal },
      { label: "Monthly Expenses", value: fmt(monthlyExpenses), accent: C.charcoal },
      { label: "Monthly Investment", value: fmt(monthlyInvest), accent: C.gold },
      { label: "Savings Rate", value: `${savingsRate.toFixed(1)}%`, accent: savingsRate >= 20 ? C.teal : C.warn },
    ],
    x: MARGIN, y, w: CONTENT_W,
  });

  y = drawKpiGrid(_doc, {
    cells: [
      { label: "Invested Assets", value: fmt(investedStart), accent: C.teal },
      { label: "Cash Savings", value: fmt(cashStart), accent: C.teal },
      { label: "Total Net Worth (liquid)", value: fmt(investedStart + cashStart), accent: C.teal },
      { label: "Age", value: String(age), sub: `Goal at ~${yrsToGoalTarget ? Math.round(age + yrsToGoalTarget) : "?"}`, accent: C.navy },
    ],
    x: MARGIN, y, w: CONTENT_W,
  });

  y += 4;
  y = drawSubTitle(_doc, "Income Allocation", MARGIN, y);

  // Allocation bar
  const investPct = monthlyIncome > 0 ? monthlyInvest / monthlyIncome : 0;
  const expPct    = monthlyIncome > 0 ? monthlyExpenses / monthlyIncome : 0;
  const surpPct   = Math.max(0, 1 - investPct - expPct);

  const barH = 20;
  setFill(_doc, C.border);
  _doc.roundedRect(MARGIN, y, CONTENT_W, barH, barH / 2, barH / 2, "F");

  let bx = MARGIN;

  // Expenses (charcoal)
  setFill(_doc, C.charcoal);
  const ew = Math.max(4, CONTENT_W * Math.min(1, expPct));
  _doc.roundedRect(bx, y, ew, barH, barH / 2, barH / 2, "F");
  bx += ew;

  // Investments (teal)
  setFill(_doc, C.teal);
  const iw = Math.max(4, CONTENT_W * Math.min(1 - expPct, investPct));
  _doc.roundedRect(bx, y, iw, barH, barH / 2, barH / 2, "F");
  bx += iw;

  // Surplus (gold)
  if (surpPct > 0.01) {
    setFill(_doc, C.gold);
    const sw = CONTENT_W * surpPct;
    _doc.roundedRect(bx, y, sw, barH, barH / 2, barH / 2, "F");
  }

  y += barH + 10;
  font(_doc, 7, "normal");
  setTxt(_doc, C.muted);
  _doc.text(
    `Expenses ${(expPct * 100).toFixed(0)}%  ·  Invested ${(investPct * 100).toFixed(0)}%  ·  Unallocated ${(surpPct * 100).toFixed(0)}%`,
    MARGIN, y
  );

  y += 20;
  y = drawSubTitle(_doc, "Key Ratios", MARGIN, y);

  y = drawSimpleTable(_doc, {
    x: MARGIN, y, w: CONTENT_W,
    headers: ["Metric", "Your Value", "Healthy Threshold"],
    rows: [
      ["Emergency runway", `${runwayMonths.toFixed(1)} months`, "≥ 6 months"],
      ["Savings rate", `${savingsRate.toFixed(1)}%`, "≥ 20%"],
      ["Income dependency ratio", investedStart > 0 ? `${((annualExpenses / investedStart) * 100).toFixed(1)}%` : "N/A", "< 4%"],
      ["Monthly surplus", fmt(surplus), "> $0"],
      ["Projected value in " + years + " yrs", fmt(projectedValue), fmt(goalTarget)],
    ],
    colWidths: [160, 130, 226],
  });

  // ─────────────────────────────────────────────────────────────────────────
  // PAGE 5 — LEVERAGE SCORE OVERVIEW
  // ─────────────────────────────────────────────────────────────────────────
  newPage("Leverage Score");
  y = bodyY();

  y = drawSectionTitle(_doc, "Leverage Score", MARGIN, y);

  font(_doc, 9, "normal");
  setTxt(_doc, C.muted);
  const scoreDesc = "Your Leverage Score is a 0–100 composite measuring how free you are from income dependency. " +
    "It combines four pillars: Runway Strength (30 pts), Income Dependency (25 pts), Wealth Velocity (25 pts), and Shock Resistance (20 pts).";
  y = wrapText(_doc, scoreDesc, MARGIN, y + 2, CONTENT_W, 13);
  y += 12;

  // Big score ring
  const ringCx = PAGE_W / 2;
  const ringCy = y + 66;
  const ringR = 56;
  setDraw(_doc, C.border);
  _doc.setLineWidth(10);
  _doc.circle(ringCx, ringCy, ringR, "S");
  setDraw(_doc, scoreColor);
  _doc.setLineWidth(10);
  // Draw arc approximation using lines
  const arcEnd = (breakdown.total / 100) * 2 * Math.PI - Math.PI / 2;
  const arcSteps = 60;
  for (let i = 0; i < arcSteps; i++) {
    const a1 = -Math.PI / 2 + (i / arcSteps) * (arcEnd + Math.PI / 2);
    const a2 = -Math.PI / 2 + ((i + 1) / arcSteps) * (arcEnd + Math.PI / 2);
    _doc.line(
      ringCx + ringR * Math.cos(a1), ringCy + ringR * Math.sin(a1),
      ringCx + ringR * Math.cos(a2), ringCy + ringR * Math.sin(a2)
    );
  }

  font(_doc, 32, "bold");
  setTxt(_doc, C.navy);
  _doc.text(String(breakdown.total), ringCx, ringCy + 6, { align: "center" });
  font(_doc, 8, "bold");
  setTxt(_doc, C.muted);
  _doc.text(scoreLabel, ringCx, ringCy + 20, { align: "center" });

  y = ringCy + ringR + 20;
  drawGoldRule(_doc, MARGIN, y, CONTENT_W);
  y += 16;

  // Pillar bars
  y = drawSubTitle(_doc, "Pillar Breakdown", MARGIN, y);

  y = drawPillarBars(_doc, {
    bars: [
      { name: "Runway Strength",    score: breakdown.runwayScore,    max: 30, isBottleneck: breakdown.bottleneck.key === "runway" },
      { name: "Income Dependency",  score: breakdown.dependencyScore, max: 25, isBottleneck: breakdown.bottleneck.key === "dependency" },
      { name: "Wealth Velocity",    score: breakdown.velocityScore,   max: 25, isBottleneck: breakdown.bottleneck.key === "velocity" },
      { name: "Shock Resistance",   score: breakdown.shockScore,      max: 20, isBottleneck: breakdown.bottleneck.key === "shock" },
    ],
    x: MARGIN, y, w: CONTENT_W - 60,
  });

  y += 8;
  y = drawCallout(_doc, {
    x: MARGIN, y, w: CONTENT_W,
    heading: "What moves the score the most?",
    body: "The pillar scored lowest relative to its maximum is your bottleneck. Improving it gives the largest score gain per unit of effort. " +
      `Your bottleneck is currently ${breakdown.bottleneck.name}. See page 27 for targeted actions.`,
    accentColor: C.teal,
  });

  // ─────────────────────────────────────────────────────────────────────────
  // PAGES 6–9 — PILLAR DEEP-DIVES
  // ─────────────────────────────────────────────────────────────────────────

  // -- Runway (page 6)
  newPage("Runway Deep-Dive");
  y = bodyY();
  y = drawSectionTitle(_doc, "Runway Strength", MARGIN, y);

  font(_doc, 9, "normal");
  setTxt(_doc, C.muted);
  y = wrapText(_doc,
    "Emergency runway is the number of months you can cover all living expenses if income stopped today. " +
    "It is the most impactful lever for reducing burnout-driven career decisions.",
    MARGIN, y, CONTENT_W, 13
  );
  y += 12;

  y = drawKpiGrid(_doc, {
    cells: [
      { label: "Current Runway", value: `${runwayMonths.toFixed(1)} mo`, sub: runwayMonths >= 9 ? "Excellent" : runwayMonths >= 6 ? "Good" : "Needs work", accent: runwayMonths >= 6 ? C.teal : C.warn },
      { label: "Cash Savings", value: fmt(cashStart), accent: C.teal },
      { label: "Monthly Expenses", value: fmt(monthlyExpenses), accent: C.charcoal },
      { label: "Score", value: `${breakdown.runwayScore} / 30`, accent: scoreColor },
    ],
    x: MARGIN, y, w: CONTENT_W,
  });

  y = drawSubTitle(_doc, "Runway Thresholds", MARGIN, y);
  [
    ["< 3 months", "0 pts", "Critical — immediate action required"],
    ["3–6 months", "10 pts", "Minimum safety net — job loss is high-risk"],
    ["6–9 months", "20 pts", "Solid — stress-free career decisions possible"],
    ["9+ months", "30 pts", "Excellent — true optionality achieved"],
  ].forEach(([range, pts, note]) => {
    const isActive = (
      (range.includes("< 3") && runwayMonths < 3) ||
      (range.includes("3–6") && runwayMonths >= 3 && runwayMonths < 6) ||
      (range.includes("6–9") && runwayMonths >= 6 && runwayMonths < 9) ||
      (range.includes("9+") && runwayMonths >= 9)
    );
    if (isActive) {
      setFill(_doc, C.navy800);
      _doc.roundedRect(MARGIN, y - 9, CONTENT_W, 18, 4, 4, "F");
      setFill(_doc, C.teal);
      _doc.roundedRect(MARGIN, y - 9, 3, 18, 2, 2, "F");
    }
    font(_doc, 8, isActive ? "bold" : "normal");
    setTxt(_doc, isActive ? C.white : C.charcoal);
    _doc.text(range, MARGIN + 12, y + 2);
    _doc.text(pts, MARGIN + 120, y + 2);
    font(_doc, 8, "normal");
    setTxt(_doc, isActive ? [180, 200, 220] as any : C.muted);
    _doc.text(note, MARGIN + 180, y + 2);
    y += 20;
  });

  y += 8;
  y = drawCallout(_doc, {
    x: MARGIN, y, w: CONTENT_W,
    heading: "Recommended Action",
    body: runwayMonths >= 9
      ? "Maintain your strong runway. Redirect excess cash above 9 months into investments to accelerate velocity."
      : runwayMonths >= 6
      ? `You are above the safety floor. Target 9 months: add ${fmt(Math.max(0, monthlyExpenses * 9 - cashStart))} to reach the excellent tier.`
      : `PRIORITY: Build runway to ${fmt(monthlyExpenses * 6)} (6-month floor) — current gap: ${fmt(Math.max(0, monthlyExpenses * 6 - cashStart))}.`,
    accentColor: runwayMonths >= 6 ? C.teal : C.warn,
  });

  // -- Dependency (page 7)
  newPage("Income Dependency");
  y = bodyY();
  y = drawSectionTitle(_doc, "Income Dependency", MARGIN, y);

  const dependencyRatio = investedStart > 0 ? (annualExpenses / investedStart) * 100 : 100;
  font(_doc, 9, "normal");
  setTxt(_doc, C.muted);
  y = wrapText(_doc,
    "Income Dependency measures how much of your annual expenses your invested assets can cover. " +
    "Below 4% means your portfolio could theoretically sustain you — the foundation of true financial independence.",
    MARGIN, y, CONTENT_W, 13
  );
  y += 12;

  y = drawKpiGrid(_doc, {
    cells: [
      { label: "Dependency Ratio", value: `${dependencyRatio.toFixed(1)}%`, sub: dependencyRatio < 4 ? "Excellent" : dependencyRatio < 6 ? "Getting there" : "High dependency", accent: dependencyRatio < 4 ? C.teal : dependencyRatio < 6 ? C.goldLight : C.danger },
      { label: "Annual Expenses", value: fmt(annualExpenses), accent: C.charcoal },
      { label: "Invested Assets", value: fmt(investedStart), accent: C.teal },
      { label: "Score", value: `${breakdown.dependencyScore} / 25`, accent: scoreColor },
    ],
    x: MARGIN, y, w: CONTENT_W,
  });

  y = drawProgressBar(_doc, {
    x: MARGIN, y, w: CONTENT_W - 60, h: 14,
    pct: Math.min(1, (annualExpenses / (investedStart || 1))),
    fillColor: dependencyRatio < 4 ? C.teal : dependencyRatio < 6 ? C.goldLight : C.danger,
    label: "Dependency ratio (lower is better)",
    valueLabel: `${dependencyRatio.toFixed(1)}%`,
  });
  y += 8;

  y = drawCallout(_doc, {
    x: MARGIN, y, w: CONTENT_W,
    heading: dependencyRatio < 4 ? "You have crossed the 4% threshold — near independence" : "How to reduce dependency",
    body: dependencyRatio < 4
      ? "Your invested assets are large enough relative to annual spend that portfolio withdrawals could sustain you. Continue compounding."
      : `To reach the 4% threshold you need ${fmt(fiNumber)} invested. Current gap: ${fmt(Math.max(0, fiNumber - investedStart))}. ` +
        "Two levers: grow invested assets faster (higher contributions/returns), or reduce annual expenses.",
    accentColor: dependencyRatio < 4 ? C.teal : C.gold,
  });

  // -- Velocity (page 8)
  newPage("Wealth Velocity");
  y = bodyY();
  y = drawSectionTitle(_doc, "Wealth Velocity", MARGIN, y);

  font(_doc, 9, "normal");
  setTxt(_doc, C.muted);
  y = wrapText(_doc,
    "Wealth Velocity measures how quickly your invested assets are growing toward your Freedom Number. " +
    "It rewards consistent monthly contributions and a realistic return expectation.",
    MARGIN, y, CONTENT_W, 13
  );
  y += 12;

  y = drawKpiGrid(_doc, {
    cells: [
      { label: "Years to Goal", value: yrsToGoalTarget ? yrsToGoalTarget.toFixed(1) : "—", sub: yrsToGoalTarget ? `Age ${Math.round(age + yrsToGoalTarget)} at goal` : "Increase contributions", accent: yrsToGoalTarget && yrsToGoalTarget <= 10 ? C.teal : C.warn },
      { label: "Monthly Investment", value: fmt(monthlyInvest), accent: C.teal },
      { label: "Annual Return", value: `${annualReturnPct}%`, accent: C.navy },
      { label: "Score", value: `${breakdown.velocityScore} / 25`, accent: scoreColor },
    ],
    x: MARGIN, y, w: CONTENT_W,
  });

  y = drawSubTitle(_doc, "Velocity Impact: +$500/month", MARGIN, y);
  const extraYrs = yrsToGoalTarget ?? 0;
  const fasterYrs = yearsToTarget(investedStart, monthlyInvest + 500, annualRate, goalTarget) ?? 0;
  const savedYrs = Math.max(0, extraYrs - fasterYrs);
  y = drawSimpleTable(_doc, {
    x: MARGIN, y, w: CONTENT_W,
    headers: ["Scenario", "Monthly Investment", "Years to goal"],
    rows: [
      ["Current", fmt(monthlyInvest), yrsToGoalTarget ? yrsToGoalTarget.toFixed(1) : "—"],
      ["+$500/mo", fmt(monthlyInvest + 500), fasterYrs > 0 ? fasterYrs.toFixed(1) : "—"],
      ["+$1,000/mo", fmt(monthlyInvest + 1000), (() => { const y2 = yearsToTarget(investedStart, monthlyInvest + 1000, annualRate, goalTarget); return y2 ? y2.toFixed(1) : "—"; })()],
    ],
    colWidths: [160, 160, 196],
  });
  y += 8;

  if (savedYrs > 0.1) {
    y = drawCallout(_doc, {
      x: MARGIN, y, w: CONTENT_W,
      heading: `+$500/month saves ${savedYrs.toFixed(1)} years`,
      body: `Increasing your monthly investment by just $500 would shorten your timeline to ${fasterYrs.toFixed(1)} years. ` +
        `The compounding effect makes early increases disproportionately powerful.`,
      accentColor: C.teal,
    });
  }

  // -- Shock (page 9)
  newPage("Shock Resistance");
  y = bodyY();
  y = drawSectionTitle(_doc, "Shock Resistance", MARGIN, y);

  font(_doc, 9, "normal");
  setTxt(_doc, C.muted);
  y = wrapText(_doc,
    "Shock Resistance measures your financial durability under a 6-month disruption. " +
    "It factors in whether cash savings exceed 6 months of expenses after a complete income stop.",
    MARGIN, y, CONTENT_W, 13
  );
  y += 12;

  const sixMonthCost = monthlyExpenses * 6;
  const cashAfterShock = cashStart - sixMonthCost;
  const shockRunwayAfter = cashAfterShock > 0 ? cashAfterShock / monthlyExpenses : 0;

  y = drawKpiGrid(_doc, {
    cells: [
      { label: "Cash after 6-mo shock", value: fmt(cashAfterShock), sub: cashAfterShock >= 0 ? "Positive — buffer remains" : "Negative — shortfall", accent: cashAfterShock >= 0 ? C.teal : C.danger },
      { label: "6-Month Cost", value: fmt(sixMonthCost), accent: C.charcoal },
      { label: "Remaining runway", value: `${shockRunwayAfter.toFixed(1)} mo`, accent: shockRunwayAfter >= 3 ? C.teal : C.warn },
      { label: "Score", value: `${breakdown.shockScore} / 20`, accent: scoreColor },
    ],
    x: MARGIN, y, w: CONTENT_W,
  });

  y = drawCallout(_doc, {
    x: MARGIN, y, w: CONTENT_W,
    heading: cashAfterShock >= monthlyExpenses * 3 ? "Strong shock buffer in place" : "Strengthen your shock buffer",
    body: cashAfterShock >= monthlyExpenses * 3
      ? `After a 6-month income stop you would still have ${fmt(cashAfterShock)} remaining (${shockRunwayAfter.toFixed(1)} months). This gives you genuine decision-making freedom during a crisis.`
      : `A 6-month income stop would ${cashAfterShock >= 0 ? "leave only " + fmt(cashAfterShock) : "create a " + fmt(-cashAfterShock) + " shortfall"}. ` +
        `Target an additional ${fmt(Math.max(0, sixMonthCost * 1.5 - cashStart))} in cash to achieve a resilient shock buffer.`,
    accentColor: cashAfterShock >= monthlyExpenses * 3 ? C.teal : C.warn,
  });

  // ─────────────────────────────────────────────────────────────────────────
  // PAGE 10 — PILLAR RADAR
  // ─────────────────────────────────────────────────────────────────────────
  newPage("Pillar Radar");
  y = bodyY();

  y = drawSectionTitle(_doc, "5-Pillar Radar", MARGIN, y);
  font(_doc, 9, "normal");
  setTxt(_doc, C.muted);
  y = wrapText(_doc, "Visual representation of your four Leverage Score pillars plus Harmony Score. The shaded polygon shows your current profile versus the outer ring (maximum possible).", MARGIN, y, CONTENT_W, 13);
  y += 20;

  const radarCx = PAGE_W / 2;
  const radarCy = y + 140;
  drawRadar(_doc, {
    cx: radarCx,
    cy: radarCy,
    r: 120,
    scores: [
      breakdown.runwayScore / 30,
      breakdown.dependencyScore / 25,
      breakdown.velocityScore / 25,
      breakdown.shockScore / 20,
      harmonyScore / 100,
    ],
    labels: ["Runway", "Dependency", "Velocity", "Shock", "Harmony"],
  });

  y = radarCy + 140;
  y += 16;

  drawGoldRule(_doc, MARGIN, y, CONTENT_W);
  y += 14;
  font(_doc, 8, "normal");
  setTxt(_doc, C.muted);
  _doc.text(
    "Teal polygon = your profile · Outer pentagon = maximum score per pillar",
    PAGE_W / 2, y, { align: "center" }
  );

  // ─────────────────────────────────────────────────────────────────────────
  // PAGE 11 — PEER BENCHMARKS
  // ─────────────────────────────────────────────────────────────────────────
  newPage("Peer Benchmarks");
  y = bodyY();

  y = drawSectionTitle(_doc, "Peer Benchmarks", MARGIN, y);
  font(_doc, 9, "normal");
  setTxt(_doc, C.muted);
  y = wrapText(_doc,
    "How do your key metrics compare to US household financial health data? " +
    "Peer medians are based on Federal Reserve Survey of Consumer Finances and published financial planning research.",
    MARGIN, y, CONTENT_W, 13
  );
  y += 12;

  const benchRows: [string, PeerBenchmarks[keyof PeerBenchmarks]][] = [
    ["Savings Rate", peers.savingsRate],
    ["Emergency Runway", peers.runwayMonths],
    ["Leverage Score", peers.leverageScore],
  ];

  benchRows.forEach(([name, bench]) => {
    y = drawSubTitle(_doc, name, MARGIN, y);

    const maxVal = Math.max(bench.peerTop * 1.2, bench.value * 1.1, 1);

    // Your bar
    y = drawProgressBar(_doc, {
      x: MARGIN, y, w: CONTENT_W - 80, h: 10,
      pct: bench.value / maxVal,
      fillColor: C.teal,
      label: `You: ${typeof bench.value === "number" ? bench.value.toFixed(1) : bench.value}${name.includes("Rate") || name.includes("Score") ? "" : " mo"}`,
      valueLabel: bench.label,
    });

    // Peer median
    y = drawProgressBar(_doc, {
      x: MARGIN, y, w: CONTENT_W - 80, h: 10,
      pct: bench.peerMedian / maxVal,
      fillColor: C.muted,
      label: `Peer Median: ${bench.peerMedian}${name.includes("Rate") ? "%" : name.includes("Score") ? "" : " mo"}`,
    });

    // Top tier
    y = drawProgressBar(_doc, {
      x: MARGIN, y, w: CONTENT_W - 80, h: 10,
      pct: bench.peerTop / maxVal,
      fillColor: C.gold,
      label: `Top Tier: ${bench.peerTop}${name.includes("Rate") ? "%" : name.includes("Score") ? "" : " mo"}`,
    });

    y += 12;
  });

  // ─────────────────────────────────────────────────────────────────────────
  // PAGE 12 — MONTE CARLO FAN CHART
  // ─────────────────────────────────────────────────────────────────────────
  newPage("Monte Carlo Simulation");
  y = bodyY();

  y = drawSectionTitle(_doc, "Monte Carlo Simulation", MARGIN, y);
  font(_doc, 9, "normal");
  setTxt(_doc, C.muted);
  y = wrapText(_doc,
    `Based on 1,000 simulated market paths using your ${annualReturnPct}% expected return with ` +
    `${(stdDev * 100).toFixed(0)}% annual volatility (risk tolerance ${riskTolerance}/5). ` +
    "The fan shows the range of likely outcomes — not a guarantee.",
    MARGIN, y, CONTENT_W, 13
  );
  y += 8;

  // KPI strip
  y = drawKpiGrid(_doc, {
    cells: [
      { label: "Success Rate", value: `${(monte.successRate * 100).toFixed(0)}%`, sub: "Simulations reaching target", accent: monte.successRate >= 0.7 ? C.teal : C.warn },
      { label: "P50 in " + years + " yrs", value: fmt(monte.p50[years - 1] ?? 0), sub: "Median outcome", accent: C.teal },
      { label: "P10 in " + years + " yrs", value: fmt(monte.p10[years - 1] ?? 0), sub: "Worst 10% scenario", accent: C.warn },
      { label: "P90 in " + years + " yrs", value: fmt(monte.p90[years - 1] ?? 0), sub: "Best 10% scenario", accent: C.gold },
    ],
    x: MARGIN, y, w: CONTENT_W,
  });
  y += 4;

  const fanH = 180;
  const maxV = Math.max(...monte.p90, goalTarget) * 1.05;

  drawMonteCarloFan(_doc, {
    x: MARGIN, y, w: CONTENT_W - 60, h: fanH,
    p10: monte.p10,
    p25: monte.p25,
    p50: monte.p50,
    p75: monte.p75,
    p90: monte.p90,
    target: goalTarget,
    maxVal: maxV,
    yearCount: years,
  });

  // ─────────────────────────────────────────────────────────────────────────
  // PAGE 13 — MONTE CARLO DETAIL
  // ─────────────────────────────────────────────────────────────────────────
  newPage("Monte Carlo Detail");
  y = bodyY();

  y = drawSectionTitle(_doc, "Simulation Outcomes by Year", MARGIN, y);

  const tableYears = [1, 2, 3, 5, 7, 10].filter((yr) => yr <= years);
  y = drawSimpleTable(_doc, {
    x: MARGIN, y, w: CONTENT_W,
    headers: ["Year", "P10 (Worst 10%)", "P25", "P50 (Median)", "P75", "P90 (Best 10%)"],
    rows: tableYears.map((yr) => [
      String(yr),
      fmt(monte.p10[yr - 1] ?? 0),
      fmt(monte.p25[yr - 1] ?? 0),
      fmt(monte.p50[yr - 1] ?? 0),
      fmt(monte.p75[yr - 1] ?? 0),
      fmt(monte.p90[yr - 1] ?? 0),
    ]),
    colWidths: [36, 96, 84, 96, 84, 120],
  });

  y += 8;
  y = drawCallout(_doc, {
    x: MARGIN, y, w: CONTENT_W,
    heading: monte.successRate >= 0.7 ? "Strong probability of reaching your Freedom Number" : "Consider increasing contributions",
    body: monte.successRate >= 0.7
      ? `${(monte.successRate * 100).toFixed(0)}% of 1,000 simulations reached your ${fmt(goalTarget)} goal target within ${years} years. ` +
        "This is a robust outcome — maintain your current trajectory and do not reduce contributions during market downturns."
      : `Only ${(monte.successRate * 100).toFixed(0)}% of simulations reached your Freedom Number in ${years} years. ` +
        `Increasing monthly investments by $500–$1,000 or extending the timeline by 2–3 years substantially improves these odds.`,
    accentColor: monte.successRate >= 0.7 ? C.teal : C.warn,
  });

  // ─────────────────────────────────────────────────────────────────────────
  // PAGE 14 — MILESTONES
  // ─────────────────────────────────────────────────────────────────────────
  newPage("Milestones");
  y = bodyY();

  y = drawSectionTitle(_doc, "Portfolio Milestones", MARGIN, y);
  font(_doc, 9, "normal");
  setTxt(_doc, C.muted);
  y = wrapText(_doc, "Key portfolio value thresholds and when you are projected to reach them based on your current trajectory.", MARGIN, y, CONTENT_W, 13);
  y += 12;

  const milestones = [
    { label: "First $100k", target: 100_000 },
    { label: "Quarter FI Number (4% SWR)", target: fiNumber * 0.25 },
    { label: "Half FI Number (4% SWR)", target: fiNumber * 0.5 },
    { label: "Three-Quarter FI Number (4% SWR)", target: fiNumber * 0.75 },
    { label: "FI Number (4% SWR)", target: fiNumber },
    { label: "Goal target", target: goalTarget },
  ].filter((m) => m.target > investedStart);

  y = drawSimpleTable(_doc, {
    x: MARGIN, y, w: CONTENT_W,
    headers: ["Milestone", "Target Value", "Projected Year", "Your Age"],
    rows: milestones.map((m) => {
      const yrs = yearsToTarget(investedStart, monthlyInvest, annualRate, m.target);
      return [
        m.label,
        fmt(Math.round(m.target)),
        yrs ? `Year ${yrs.toFixed(1)}` : "Beyond 60 yrs",
        yrs ? String(Math.round(age + yrs)) : "—",
      ];
    }),
    colWidths: [170, 110, 110, 126],
  });

  // ─────────────────────────────────────────────────────────────────────────
  // PAGE 15 — SPENDING TIERS
  // ─────────────────────────────────────────────────────────────────────────
  newPage("Spending Tiers");
  y = bodyY();

  y = drawSectionTitle(_doc, "Spending Tier Analysis", MARGIN, y);
  font(_doc, 9, "normal");
  setTxt(_doc, C.muted);
  y = wrapText(_doc,
    "Your Freedom Number and timeline change significantly depending on your target lifestyle. " +
    "This analysis shows four spending scenarios relative to your current expenses.",
    MARGIN, y, CONTENT_W, 13
  );
  y += 12;

  y = drawSimpleTable(_doc, {
    x: MARGIN, y, w: CONTENT_W,
    headers: ["Tier", "Monthly Expenses", "Freedom Number", "Years to FI"],
    rows: spendingTiers.map((t) => [
      t.label + (t.label === "Current" ? " ←" : ""),
      fmt(t.monthlyExpenses),
      fmt(t.freedomNumber),
      t.yearsToFreedom ? t.yearsToFreedom.toFixed(1) : "60+",
    ]),
    colWidths: [100, 130, 130, 156],
  });

  y += 8;
  const leanTier = spendingTiers.find((t) => t.label === "Lean");
  const currentTier = spendingTiers.find((t) => t.label === "Current");
  if (leanTier && currentTier && leanTier.yearsToFreedom && currentTier.yearsToFreedom) {
    const saved = Math.max(0, currentTier.yearsToFreedom - leanTier.yearsToFreedom);
    if (saved > 0.5) {
      y = drawCallout(_doc, {
        x: MARGIN, y, w: CONTENT_W,
        heading: `Lean spending saves ${saved.toFixed(1)} years`,
        body: `Reducing expenses to the Lean tier (${fmt(leanTier.monthlyExpenses)}/mo) would lower your Freedom Number to ${fmt(leanTier.freedomNumber)} ` +
          `and shorten your timeline by ${saved.toFixed(1)} years. This is the most powerful lever available.`,
        accentColor: C.teal,
      });
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // PAGE 16 — FREEDOM NUMBER
  // ─────────────────────────────────────────────────────────────────────────
  newPage("Freedom Number");
  y = bodyY();

  y = drawSectionTitle(_doc, "Freedom Number Analysis", MARGIN, y);

  const progress = investedStart / Math.max(1, fiNumber);
  y = drawKpiGrid(_doc, {
    cells: [
      { label: "FI Number (4% SWR)", value: fmt(fiNumber), sub: "Annual expenses × 25", accent: C.gold },
      { label: "Current Portfolio", value: fmt(investedStart), sub: `${(progress * 100).toFixed(1)}% of the way`, accent: C.teal },
      { label: "FI Gap", value: fmt(Math.max(0, fiNumber - investedStart)), sub: `${fmt(monthlyInvest)}/mo contribution`, accent: C.charcoal },
      { label: "Goal Timeline", value: yrsToGoalTarget ? yrsToGoalTarget.toFixed(1) : "—", sub: yrsToGoalTarget ? `Age ${Math.round(age + yrsToGoalTarget)} at goal` : "", accent: yrsToGoalTarget && yrsToGoalTarget <= 10 ? C.teal : C.warn },
    ],
    x: MARGIN, y, w: CONTENT_W,
  });

  y = drawProgressBar(_doc, {
    x: MARGIN, y, w: CONTENT_W - 60, h: 16,
    pct: Math.min(1, progress),
    fillColor: C.teal,
    label: "Progress to Freedom Number",
    valueLabel: `${(progress * 100).toFixed(1)}%`,
  });
  y += 12;

  font(_doc, 9, "normal");
  setTxt(_doc, C.muted);
  y = wrapText(_doc,
    "The 4% Safe Withdrawal Rate (SWR) is a research-backed guideline (Bengen 1994, Trinity Study) suggesting a " +
    "portfolio of 25× annual expenses can sustain indefinite withdrawals with high probability over 30+ years.",
    MARGIN, y, CONTENT_W, 13
  );
  y += 12;

  y = drawCallout(_doc, {
    x: MARGIN, y, w: CONTENT_W,
    heading: `Annual withdrawals at your Freedom Number: ${fmt(annualExpenses)}`,
    body: `At ${fmt(fiNumber)} invested (4% SWR), you could withdraw ${fmt(annualExpenses)}/year (${fmt(monthlyExpenses)}/mo) indefinitely. ` +
      `This covers your current expenses without touching the principal in a diversified, historically-backtested portfolio.`,
    accentColor: C.gold,
  });

  // ─────────────────────────────────────────────────────────────────────────
  // PAGE 17 — ACCELERATION STRATEGIES
  // ─────────────────────────────────────────────────────────────────────────
  newPage("Acceleration Strategies");
  y = bodyY();

  y = drawSectionTitle(_doc, "Acceleration Strategies", MARGIN, y);

  const strategies = [
    {
      title: "Raise your savings rate by 1% per quarter",
      impact: "Compounds to a 5–10% rate increase over 18 months without lifestyle shock.",
      action: "Set a calendar reminder every quarter. Automate the increase the day after each raise.",
    },
    {
      title: "Redirect windfalls directly to investments",
      impact: `A single $10k bonus invested at ${annualReturnPct}% becomes ${fmt(fvWithStart(10000, 0, annualRate, 10))} in 10 years.`,
      action: "Pre-commit: decide now that 80% of any bonus, tax refund, or unexpected income goes straight to investments.",
    },
    {
      title: "Reduce your largest expense categories",
      impact: "Housing, transport, and insurance typically represent 60–70% of spending. A 10% reduction here beats cutting 20+ small items.",
      action: "Review each of these three categories annually. Renegotiate insurance every 12–18 months.",
    },
    {
      title: "Optimise investment costs",
      impact: "A 0.5% reduction in annual fees (e.g., switching to index funds) saves tens of thousands over 20+ years.",
      action: "Review expense ratios on all funds. Target < 0.15% total portfolio weighted average fee.",
    },
    {
      title: "Income growth is the highest leverage",
      impact: `Every $1,000/month increase in income = ${fmt(fvWithStart(0, 1000, annualRate, 20))} over 20 years when invested.`,
      action: "Negotiate salary annually. Document achievements 3 months before review cycle. Explore adjacent high-income roles.",
    },
  ];

  strategies.forEach((s) => {
    y = ensureSpace(y, 60);
    font(_doc, 9, "bold");
    setTxt(_doc, C.navy);
    _doc.text(`✦  ${s.title}`, MARGIN, y);
    y += 14;
    font(_doc, 8, "normal");
    setTxt(_doc, C.charcoal);
    y = wrapText(_doc, `Impact: ${s.impact}`, MARGIN + 12, y, CONTENT_W - 12, 12);
    setTxt(_doc, C.muted);
    y = wrapText(_doc, `Action: ${s.action}`, MARGIN + 12, y + 2, CONTENT_W - 12, 12);
    y += 12;
  });

  // ─────────────────────────────────────────────────────────────────────────
  // PAGES 18–20 — 12-MONTH PLAN
  // ─────────────────────────────────────────────────────────────────────────

  const phaseConfigs = [
    { page: 18, phase: "Phase 1: 0–60 Days", items: [...plan[0].items, ...plan[1].items] },
    { page: 19, phase: "Phase 2: 61–180 Days", items: plan[2].items.length > 0 ? plan[2].items : ["Increase investing to a sustainable level.", "Keep fixed costs flat for 90 days at a time."] },
    { page: 20, phase: "Phase 3: 181–365 Days", items: plan[3].items.length > 0 ? plan[3].items : ["Quarterly review: runway, invest rate, time-to-target.", "Protect health: burnout kills compounding."] },
  ];

  phaseConfigs.forEach(({ phase, items }) => {
    newPage("12-Month Plan");
    y = bodyY();

    y = drawSectionTitle(_doc, "12-Month Action Plan", MARGIN, y);
    y = drawSubTitle(_doc, phase, MARGIN, y);
    y += 4;

    items.forEach((item, idx) => {
      y = ensureSpace(y, 36);
      const ix = MARGIN + 12;
      // Checkbox outline
      setFill(_doc, C.white);
      setDraw(_doc, C.teal);
      _doc.setLineWidth(1);
      _doc.roundedRect(MARGIN, y - 10, 12, 12, 2, 2, "FD");

      // Item number
      setFill(_doc, C.teal);
      _doc.roundedRect(ix + 6, y - 10, 18, 12, 3, 3, "F");
      font(_doc, 7, "bold");
      setTxt(_doc, C.white);
      _doc.text(String(idx + 1), ix + 15, y - 2, { align: "center" });

      font(_doc, 9, "normal");
      setTxt(_doc, C.charcoal);
      y = wrapText(_doc, item, ix + 28, y, CONTENT_W - 42, 13);
      y += 6;
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // PAGE 21 — STRESS TEST OVERVIEW
  // ─────────────────────────────────────────────────────────────────────────
  newPage("Stress Tests");
  y = bodyY();

  y = drawSectionTitle(_doc, "Stress Test Overview", MARGIN, y);
  font(_doc, 9, "normal");
  setTxt(_doc, C.muted);
  y = wrapText(_doc,
    "Five adversity scenarios stress-tested against your current financial position. " +
    "Each scenario reveals vulnerabilities and the minimum actions required to survive them.",
    MARGIN, y, CONTENT_W, 13
  );
  y += 12;

  const stressOverview = [
    { name: "Layoff (income → $0)", status: stressTest.layoff.status, headline: stressTest.layoff.headline },
    { name: "Market Crash (−35%)", status: stressTest.marketCrash.status, headline: stressTest.marketCrash.headline },
    { name: "Medical Emergency ($50k)", status: stressTest.medical.status, headline: stressTest.medical.headline },
    { name: "Career Pivot (−30% income)", status: stressTest.careerPivot.status, headline: stressTest.careerPivot.headline },
    { name: "Lifestyle Creep (+$2k/mo)", status: stressTest.lifestyleCreep.status, headline: stressTest.lifestyleCreep.headline },
  ];

  stressOverview.forEach((s) => {
    setFill(_doc, C.softBg);
    _doc.roundedRect(MARGIN, y - 10, CONTENT_W, 28, 4, 4, "F");

    drawStatusBadge(_doc, { x: MARGIN + 8, y: y + 2, status: s.status });

    font(_doc, 9, "bold");
    setTxt(_doc, C.charcoal);
    _doc.text(s.name, MARGIN + 70, y - 2);
    font(_doc, 8, "normal");
    setTxt(_doc, C.muted);
    y = wrapText(_doc, s.headline, MARGIN + 70, y + 10, CONTENT_W - 78, 12);
    y += 10;
  });

  // ─────────────────────────────────────────────────────────────────────────
  // PAGES 22–26 — STRESS TEST DETAIL
  // ─────────────────────────────────────────────────────────────────────────

  const stressDetails = [
    stressTest.layoff,
    stressTest.marketCrash,
    stressTest.medical,
    stressTest.careerPivot,
    stressTest.lifestyleCreep,
  ];

  stressDetails.forEach((s) => {
    newPage("Stress Tests");
    y = bodyY();

    y = drawSectionTitle(_doc, s.name, MARGIN, y);
    drawStatusBadge(_doc, { x: MARGIN, y: y + 8, status: s.status });
    y += 24;

    font(_doc, 11, "bold");
    setTxt(_doc, C.charcoal);
    y = wrapText(_doc, s.headline, MARGIN, y, CONTENT_W, 15);
    y += 8;

    // Numbers grid
    y = drawKpiGrid(_doc, {
      cells: s.numbers.map((n) => ({
        label: n.label,
        value: n.value,
        accent: s.status === "SURVIVES" ? C.teal : s.status === "AT_RISK" ? C.warn : C.danger,
      })),
      x: MARGIN, y, w: CONTENT_W, h: 64,
    });

    y = drawCallout(_doc, {
      x: MARGIN, y, w: CONTENT_W,
      heading: "Recommended Action",
      body: s.action,
      accentColor: s.status === "SURVIVES" ? C.teal : s.status === "AT_RISK" ? C.gold : C.warn,
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // PAGE 27 — BOTTLENECK ANALYSIS
  // ─────────────────────────────────────────────────────────────────────────
  newPage("Bottleneck Analysis");
  y = bodyY();

  y = drawSectionTitle(_doc, "Bottleneck Analysis", MARGIN, y);

  font(_doc, 9, "normal");
  setTxt(_doc, C.muted);
  y = wrapText(_doc,
    "Your bottleneck is the single Leverage Score pillar most limiting your financial freedom. " +
    "Fixing it delivers the largest score gain per unit of effort.",
    MARGIN, y, CONTENT_W, 13
  );
  y += 16;

  y = drawCallout(_doc, {
    x: MARGIN, y, w: CONTENT_W,
    heading: `Primary Bottleneck: ${breakdown.bottleneck.name}`,
    body: breakdown.bottleneck.why,
    accentColor: C.gold,
  });

  y += 4;
  y = drawSubTitle(_doc, "All Pillars (Ranked by Gap)", MARGIN, y);

  const pillarsRanked = [
    { name: "Runway Strength",   score: breakdown.runwayScore,    max: 30 },
    { name: "Income Dependency", score: breakdown.dependencyScore, max: 25 },
    { name: "Wealth Velocity",   score: breakdown.velocityScore,   max: 25 },
    { name: "Shock Resistance",  score: breakdown.shockScore,      max: 20 },
  ].sort((a, b) => (a.score / a.max) - (b.score / b.max));

  y = drawPillarBars(_doc, {
    bars: pillarsRanked.map((p) => ({
      ...p,
      isBottleneck: p.name.toLowerCase().includes(breakdown.bottleneck.key),
    })),
    x: MARGIN, y, w: CONTENT_W - 60,
  });

  y += 8;
  const nextBottleneck = pillarsRanked[1];
  y = drawCallout(_doc, {
    x: MARGIN, y, w: CONTENT_W,
    heading: `After fixing the bottleneck — next target: ${nextBottleneck.name}`,
    body: `Once ${breakdown.bottleneck.name} improves, focus on ${nextBottleneck.name} ` +
      `(currently ${nextBottleneck.score}/${nextBottleneck.max} — ${((nextBottleneck.score / nextBottleneck.max) * 100).toFixed(0)}% of maximum). ` +
      `Sequential bottleneck elimination creates compounding score improvement.`,
    accentColor: C.teal,
  });

  // ─────────────────────────────────────────────────────────────────────────
  // PAGE 28 — HARMONY SCORE
  // ─────────────────────────────────────────────────────────────────────────
  newPage("Harmony Score");
  y = bodyY();

  y = drawSectionTitle(_doc, "Harmony Score", MARGIN, y);

  const harmonyColor: [number, number, number] =
    harmonyScore >= 70 ? C.teal :
    harmonyScore >= 50 ? C.goldLight : C.warn;

  y = drawKpiGrid(_doc, {
    cells: [
      { label: "Harmony Score", value: String(harmonyScore), sub: "/ 100", accent: harmonyColor },
      { label: "Savings Rate", value: `${savingsRate.toFixed(1)}%`, sub: savingsRate >= 20 ? "Strong" : "Needs growth", accent: savingsRate >= 20 ? C.teal : C.warn },
      { label: "Monthly Surplus", value: fmt(surplus), sub: surplus > 0 ? "Positive cash flow" : "Deficit", accent: surplus > 0 ? C.teal : C.danger },
      { label: "Goal Defined", value: goalName ? "Yes" : "No", sub: goalName || "Set a goal name", accent: goalName ? C.teal : C.muted },
    ],
    x: MARGIN, y, w: CONTENT_W,
  });

  font(_doc, 9, "normal");
  setTxt(_doc, C.muted);
  y = wrapText(_doc,
    "The Harmony Score is distinct from the Leverage Score. It measures alignment between your financial momentum " +
    "and life design clarity. A high Harmony Score means you are both building wealth and building toward something meaningful.",
    MARGIN, y, CONTENT_W, 13
  );
  y += 12;

  y = drawCallout(_doc, {
    x: MARGIN, y, w: CONTENT_W,
    heading: harmonyScore >= 70 ? "High harmony — momentum and clarity aligned" : "Opportunity to raise harmony",
    body: harmonyScore >= 70
      ? "Your savings rate, cash flow, and goal clarity are in strong alignment. " +
        "This is the zone where financial decisions become easier and less emotionally fraught."
      : "The fastest path to a higher Harmony Score is defining a named goal and increasing your savings rate. " +
        "Even naming your goal (e.g., 'Career optionality by 45') improves clarity and decision-making quality.",
    accentColor: harmonyColor,
  });

  // ─────────────────────────────────────────────────────────────────────────
  // PAGE 29 — LEGACY & WEALTH TRANSFER
  // ─────────────────────────────────────────────────────────────────────────
  newPage("Legacy & Wealth Transfer");
  y = bodyY();

  y = drawSectionTitle(_doc, "Legacy & Wealth Transfer", MARGIN, y);

  font(_doc, 9, "normal");
  setTxt(_doc, C.muted);
  y = wrapText(_doc,
    "At your Freedom Number and beyond, your portfolio generates wealth in excess of withdrawals. " +
    "Understanding the compounding of legacy wealth helps frame the long-term value of financial independence.",
    MARGIN, y, CONTENT_W, 13
  );
  y += 12;

  const legacyYears = [10, 20, 30];
  y = drawSimpleTable(_doc, {
    x: MARGIN, y, w: CONTENT_W,
    headers: ["Scenario", "10-Year Value", "20-Year Value", "30-Year Value"],
    rows: [
      [
        "Current portfolio (no withdrawals)",
        fmt(fvWithStart(investedStart, 0, annualRate, 10)),
        fmt(fvWithStart(investedStart, 0, annualRate, 20)),
        fmt(fvWithStart(investedStart, 0, annualRate, 30)),
      ],
      [
        "At Freedom Number (no withdrawals)",
        fmt(fvWithStart(fiNumber, 0, annualRate, 10)),
        fmt(fvWithStart(fiNumber, 0, annualRate, 20)),
        fmt(fvWithStart(fiNumber, 0, annualRate, 30)),
      ],
      [
        "FI with expenses withdrawn monthly",
        fmt(fvWithStart(fiNumber, -monthlyExpenses, annualRate, 10)),
        fmt(fvWithStart(fiNumber, -monthlyExpenses, annualRate, 20)),
        fmt(fvWithStart(fiNumber, -monthlyExpenses, annualRate, 30)),
      ],
    ],
    colWidths: [156, 96, 96, 168],
  });

  y += 8;
  y = drawCallout(_doc, {
    x: MARGIN, y, w: CONTENT_W,
    heading: "Estate planning baseline",
    body: "With a properly structured portfolio at your Freedom Number, you can withdraw your full expenses " +
      "annually and still leave a growing estate. Consult an estate attorney to establish a will, " +
      "beneficiary designations, and a trust structure if applicable.",
    accentColor: C.gold,
  });

  // ─────────────────────────────────────────────────────────────────────────
  // PAGE 30 — NEXT STEPS CHECKLIST
  // ─────────────────────────────────────────────────────────────────────────
  newPage("Next Steps");
  y = bodyY();

  y = drawSectionTitle(_doc, "Your Next Steps Checklist", MARGIN, y);

  font(_doc, 9, "normal");
  setTxt(_doc, C.muted);
  y = wrapText(_doc,
    "Print or bookmark this page. Check each item off in order — they are sequenced by highest leverage first.",
    MARGIN, y, CONTENT_W, 13
  );
  y += 12;

  const checklist = [
    { priority: "TODAY", item: "Automate your monthly investment transfer so it happens on payday." },
    { priority: "THIS WEEK", item: `Verify your emergency runway target: ${fmt(monthlyExpenses * 6)} (6 months).` },
    { priority: "THIS WEEK", item: `Reduce one fixed monthly expense by $100–$300.` },
    { priority: "THIS MONTH", item: `Confirm your investment vehicle has expense ratios below 0.20%.` },
    { priority: "THIS MONTH", item: `Document your FI Number (${fmt(fiNumber)}) somewhere visible.` },
    { priority: "30 DAYS", item: breakdown.bottleneck.key === "runway"
        ? `Fund your runway gap: ${fmt(Math.max(0, monthlyExpenses * 6 - cashStart))} needed for the 6-month floor.`
        : breakdown.bottleneck.key === "velocity"
        ? "Review the three biggest expense categories for a 10% reduction opportunity."
        : breakdown.bottleneck.key === "dependency"
        ? "Calculate the gap to 4% dependency ratio and set a concrete portfolio milestone."
        : "Create a layoff protocol: expense triggers, timeline, and decision rules." },
    { priority: "QUARTERLY", item: "Re-run this blueprint to measure Leverage Score progress and adjust the plan." },
    { priority: "ANNUALLY", item: "Negotiate salary or contract rates — review 3 months before your review cycle." },
    { priority: "ANNUALLY", item: "Rebalance portfolio and review estate/beneficiary designations." },
  ];

  checklist.forEach((c) => {
    y = ensureSpace(y, 36);

    const priorityColor: [number, number, number] =
      c.priority === "TODAY" ? C.danger :
      c.priority === "THIS WEEK" ? C.warn :
      c.priority === "THIS MONTH" ? C.gold :
      c.priority === "30 DAYS" ? C.goldLight : C.teal;

    setFill(_doc, priorityColor);
    _doc.roundedRect(MARGIN, y - 10, 72, 14, 3, 3, "F");
    font(_doc, 6.5, "bold");
    setTxt(_doc, C.white);
    _doc.text(c.priority, MARGIN + 36, y - 1, { align: "center" });

    // Checkbox
    setFill(_doc, C.white);
    setDraw(_doc, C.border);
    _doc.setLineWidth(0.75);
    _doc.roundedRect(MARGIN + 78, y - 10, 12, 12, 2, 2, "FD");

    font(_doc, 8.5, "normal");
    setTxt(_doc, C.charcoal);
    y = wrapText(_doc, c.item, MARGIN + 96, y, CONTENT_W - 96, 13);
    y += 8;
  });

  // ─────────────────────────────────────────────────────────────────────────
  // PAGE 31 — GLOSSARY
  // PAGE 32 — METHODOLOGY & ASSUMPTIONS (premium auditability)
  // ─────────────────────────────────────────────────────────────────────────

  const glossaryTerms = [
    { term: "Leverage Score", def: "A 0–100 composite measuring freedom from income dependency across four pillars.", scenario: "Score of 42 = stable but structurally dependent on your job." },
    { term: "Freedom Number", def: "Portfolio value at which assets sustain lifestyle indefinitely. Annual Expenses × 25.", scenario: "$10k/mo spend → $3M Freedom Number." },
    { term: "4% Safe Withdrawal Rate", def: "Research guideline: withdraw 4% annually from a diversified portfolio indefinitely.", scenario: "$2M portfolio → $80k/yr withdrawals." },
    { term: "Emergency Runway", def: "Months of expenses covered by cash if income stopped today. Cash ÷ Monthly Expenses.", scenario: "$45k cash, $7.5k/mo expenses → 6-month runway." },
    { term: "Income Dependency Ratio", def: "Annual expenses as % of invested assets. Above 6% = high dependency.", scenario: "$200k invested, $96k expenses → 48% ratio." },
    { term: "Monthly Surplus", def: "Income minus expenses. The fuel for all wealth-building.", scenario: "$12k income, $9.5k expenses → $2.5k surplus." },
    { term: "Savings Rate", def: "% of gross income invested or saved. Below 20% = low for wealth-building.", scenario: "$15k/mo income, $3k invested → 20% savings rate." },
    { term: "Wealth Velocity", def: "Speed of asset growth toward Freedom Number. Scored 0–25.", scenario: "$3k/mo contribution, 7% return → ~10 years to $1M." },
    { term: "Shock Resistance", def: "Financial durability under 6-month disruption. Scored 0–20.", scenario: "$75k cash, $10k/mo expenses → survives 6-month income stop with $15k remaining." },
    { term: "Bottleneck", def: "Single pillar most limiting your Leverage Score. Fixing it gives biggest score gain.", scenario: "Runway score 0/30 with solid other pillars → runway is the bottleneck." },
    { term: "Compound Growth", def: "Investment returns generating their own returns over time.", scenario: "$100k at 7%/yr → $197k in 10 yrs, $761k in 30 yrs." },
    { term: "Optionality", def: "Degree of genuine choice in career/life enabled by financial security.", scenario: "12-month runway + score 72 → can decline a role without panic." },
    { term: "Monte Carlo Simulation", def: "Statistical technique running 1,000 market scenarios to show the probability distribution of outcomes.", scenario: "70% success rate = 700 of 1,000 simulated paths reached the Freedom Number." },
    { term: "Harmony Score", def: "0–100 score combining financial momentum with life design clarity. Distinct from Leverage Score.", scenario: "High savings rate + named goal + positive surplus → Harmony Score 75." },
    { term: "Peer Benchmarks", def: "Comparative data from US household financial health surveys (Federal Reserve SCF).", scenario: "Median US household: 3-month runway, 12% savings rate, 35 Leverage Score." },
  ];

  // Page 31: Glossary (curated)
  newPage("Glossary");
  y = bodyY();
  y = drawSectionTitle(_doc, "Glossary", MARGIN, y);

  glossaryTerms.slice(0, 10).forEach((g) => {
    y = ensureSpace(y, 50);

    font(_doc, 9, "bold");
    setTxt(_doc, C.navy);
    _doc.text(g.term, MARGIN, y);
    y += 13;

    font(_doc, 8, "normal");
    setTxt(_doc, C.charcoal);
    y = wrapText(_doc, g.def, MARGIN + 8, y, CONTENT_W - 8, 12);

    setTxt(_doc, C.muted);
    y = wrapText(_doc, `e.g. ${g.scenario}`, MARGIN + 8, y + 2, CONTENT_W - 8, 12);
    y += 10;
  });

  // Page 32: Methodology & assumptions (auditable)
  newPage("Methodology");
  y = bodyY();
  y = drawSectionTitle(_doc, "Methodology & Assumptions", MARGIN, y);

  font(_doc, 9, "normal");
  setTxt(_doc, C.muted);
  y = wrapText(
    _doc,
    "This page makes the model auditable: how scores are assigned, what assumptions drive projections, and how sensitive your goal timeline is to changes.",
    MARGIN,
    y + 2,
    CONTENT_W,
    13
  );
  y += 12;

  y = drawSubTitle(_doc, "Leverage Score thresholds (points)", MARGIN, y);
  y = drawSimpleTable(_doc, {
    x: MARGIN,
    y,
    w: CONTENT_W,
    headers: ["Pillar", "Thresholds (→ points)", "Your input"],
    rows: [
      ["Runway (0–30)", "<3 mo → 0 · 3–6 → 10 · 6–9 → 20 · 9+ → 30", `${runwayMonths.toFixed(1)} mo`],
      [
        "Dependency (0–25)",
        ">6% → 0 · 4–6% → 10 · 3–4% → 20 · <3% → 25",
        investedStart > 0 ? `${((annualExpenses / investedStart) * 100).toFixed(1)}%` : "N/A",
      ],
      ["Velocity (0–25)", ">15y → 0 · 10–15 → 10 · 5–10 → 20 · <5 → 25", yrsToGoalTarget ? `${yrsToGoalTarget.toFixed(1)} yrs` : "—"],
      ["Shock (0–20)", "0–3 mo → 5 · 3–6 → 10 · 6–12 → 15 · 12+ → 20", "6-mo shock model"],
    ],
    colWidths: [120, 280, 116],
  });

  y += 6;
  y = drawSubTitle(_doc, "Projection assumptions", MARGIN, y);
  y = drawSimpleTable(_doc, {
    x: MARGIN,
    y,
    w: CONTENT_W,
    headers: ["Input", "Assumption used"],
    rows: [
      ["Return (deterministic)", `${annualReturnPct.toFixed(1)}%/yr, compounded monthly; contributions monthly`],
      ["Monte Carlo volatility", `Mapped from risk tolerance ${riskTolerance}/5; σ≈${(stdDev * 100).toFixed(0)}%`],
      ["Taxes / fees", "Excluded (use after-tax contribution rate if possible)"],
      ["Inflation", "Not modeled (treat values as 'today dollars')"],
    ],
    colWidths: [180, 336],
  });

  y += 6;
  y = drawSubTitle(_doc, "Sensitivity (years to goal target)", MARGIN, y);

  const ytt = (start: number, pmt: number, rate: number, tgt: number) => yearsToTarget(start, pmt, rate, tgt);
  const fmtYrs = (v: number | null) => (v ? v.toFixed(1) : "60+");

  const rateDown = Math.max(0, annualRate - 0.02);
  const rateUp = annualRate + 0.02;
  const investDown = Math.max(0, monthlyInvest - 500);
  const investUp = monthlyInvest + 500;

  y = drawSimpleTable(_doc, {
    x: MARGIN,
    y,
    w: CONTENT_W,
    headers: ["Scenario", "Years"],
    rows: [
      [`Baseline (${annualReturnPct.toFixed(1)}% return, ${fmt(monthlyInvest)}/mo)`, fmtYrs(ytt(investedStart, monthlyInvest, annualRate, goalTarget))],
      [`Return −2% (${(rateDown * 100).toFixed(1)}%)`, fmtYrs(ytt(investedStart, monthlyInvest, rateDown, goalTarget))],
      [`Return +2% (${(rateUp * 100).toFixed(1)}%)`, fmtYrs(ytt(investedStart, monthlyInvest, rateUp, goalTarget))],
      [`Invest −$500/mo (${fmt(investDown)}/mo)`, fmtYrs(ytt(investedStart, investDown, annualRate, goalTarget))],
      [`Invest +$500/mo (${fmt(investUp)}/mo)`, fmtYrs(ytt(investedStart, investUp, annualRate, goalTarget))],
    ],
    colWidths: [360, 156],
  });

  // ─────────────────────────────────────────────────────────────────────────
  // OUTPUT
  // ─────────────────────────────────────────────────────────────────────────

  if (mode === "base64") {
    const dataUri = (_doc as any).output("datauristring") as string;
    return dataUri.split(",")[1];
  }
  (_doc as any).save(`Equanimity-Blueprint-${fileSafeDate}.pdf`);
}
