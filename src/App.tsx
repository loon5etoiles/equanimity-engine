import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import React, { useEffect, useMemo, useState, useRef } from "react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
  CartesianGrid,
} from "recharts";
import {
  Wallet,
  Calculator,
  HeartHandshake,
  Activity,
  Flag,
  ShieldCheck,
} from "lucide-react";

import {
  LeverageGauge,
  PremiumCTAButton,
  ColorCard,
  Card,
  CardContent,
  Button,
  Input,
  Label,
  Badge,
  Separator,
  InfoTooltip,
} from "./components/ui";
import {
  clamp,
  fmt,
  fvWithStart,
  buildSeries,
  yearsToTarget,
  computeScenario,
  computeLeverageBreakdown,
  build12MonthPlan,
  computeStressTest,
  type StressTestResult,
} from "./utils/math";
import { FORM_SAVED_KEY, encodeState, decodeState } from "./utils/state";
import { wrap, sectionTitle, drawTable } from "./utils/pdf";  

// TODO: Replace with your live Stripe payment link before going to production.
// Also add server-side payment verification (Stripe webhook → signed token)
// so the PDF gate cannot be bypassed by appending ?success=1 manually.
const STRIPE_PAYMENT_LINK = "https://buy.stripe.com/test_cNi9ATe8c6IedBsays8bS02";
// TODO: Replace with your live Stripe payment link for the Stress Test add-on.
const STRIPE_STRESS_LINK = "https://buy.stripe.com/test_bJe28rd48d6CfJAays8bS01";
const STRESS_LINK_READY = !STRIPE_STRESS_LINK.includes("PLACEHOLDER");

const GLOSSARY_TERMS: { term: string; def: string; scenario: string }[] = [
  {
    term: "Leverage Score",
    def: "A 0–100 composite score measuring how free you are from income dependency. Calculated across four pillars: Runway Strength (30 pts), Income Dependency (25 pts), Wealth Velocity (25 pts), and Shock Resistance (20 pts).",
    scenario: "A score of 42 means you are stable but structurally dependent on your current job. Losing it would create immediate financial stress.",
  },
  {
    term: "Freedom Number",
    def: "The total invested portfolio value at which your assets can sustain your lifestyle indefinitely without employment income. Calculated as: Annual Expenses × 25 (the inverse of the 4% Safe Withdrawal Rate).",
    scenario: "If you spend $10,000/mo ($120,000/yr), your Freedom Number is $3,000,000. Once your portfolio reaches that level, you no longer need to work.",
  },
  {
    term: "Emergency Runway",
    def: "The number of months your cash savings can cover all living expenses if income stopped today. Calculated as: Cash ÷ Monthly Expenses. A minimum of 6 months is the baseline safety threshold; 9+ months is considered strong.",
    scenario: "$45,000 in cash with $7,500/mo expenses gives a 6-month runway — the minimum to avoid panic-driven career decisions.",
  },
  {
    term: "Safe Withdrawal Rate (4% Rule)",
    def: "A research-backed guideline stating that you can withdraw 4% of your portfolio annually with a high probability of never running out of money over 30+ years. This means 25× annual expenses is sufficient for financial independence.",
    scenario: "A $2,000,000 portfolio at a 4% SWR supports $80,000/yr in withdrawals — indefinitely, with a diversified investment mix.",
  },
  {
    term: "Income Dependency Ratio",
    def: "Annual expenses as a percentage of invested assets. It measures how reliant you are on ongoing income to cover your lifestyle. Above 6% signals high dependency; below 4% means your assets could theoretically sustain you.",
    scenario: "$200,000 invested with $96,000 annual expenses = 48% dependency ratio. You would exhaust your portfolio in about 2 years without income.",
  },
  {
    term: "Monthly Surplus",
    def: "The difference between monthly income and monthly expenses. This is the fuel for all wealth-building. A positive surplus is required for any meaningful progress toward your Freedom Number.",
    scenario: "Income of $12,000/mo minus expenses of $9,500/mo = a $2,500 surplus. Invested consistently, this drives your Wealth Velocity score.",
  },
  {
    term: "Wealth Velocity",
    def: "How quickly your invested assets are growing toward your Freedom Number, given your current monthly investment and expected annual return. Scored 0–25 based on years-to-target.",
    scenario: "Investing $3,000/mo at 7% with $150,000 already invested reaches a $1,000,000 target in ~10 years — a velocity score of 10 out of 25.",
  },
  {
    term: "Savings Rate",
    def: "The percentage of gross monthly income that you invest or save. A rate below 20% is considered low for wealth-building. Higher rates compress your timeline to financial independence significantly.",
    scenario: "Earning $15,000/mo and investing $3,000 is a 20% savings rate. Raising it to $4,500/mo (30%) can shorten your timeline to freedom by several years.",
  },
  {
    term: "Shock Resistance",
    def: "Your financial durability during an unexpected income event — job loss, illness, or forced career change. Scored 0–20 in the Leverage Score. Factors in whether cash savings exceed 6 months of expenses after the shock.",
    scenario: "A 100% income drop for 6 months costs $60,000 if you spend $10,000/mo. With $75,000 in cash, you survive with $15,000 remaining — a positive shock resistance score.",
  },
  {
    term: "Compound Growth",
    def: "The process by which investment returns generate their own returns over time. The longer money is invested, the more powerful the effect. It is the core engine behind long-term wealth accumulation.",
    scenario: "$100,000 at 7%/yr becomes $197,000 in 10 years — and $761,000 in 30 years — without adding a single additional dollar.",
  },
  {
    term: "Optionality",
    def: "The degree of genuine choice you have in career and life decisions, enabled by financial security. High optionality means you can negotiate, decline, pivot, or rest without financial fear.",
    scenario: "With 12 months runway and a leverage score of 72, you can decline a promotion you do not want, negotiate remote work, or explore a new role — without panic.",
  },
  {
    term: "Bottleneck",
    def: "The single pillar of your Leverage Score most limiting your overall financial freedom. The engine identifies it automatically and prioritises it in the 12-month action plan. Fixing your bottleneck gives the largest score improvement per unit of effort.",
    scenario: "A runway score of 0/30 with solid dependency and velocity scores means runway is your bottleneck. Building cash to 6 months of expenses is the highest-leverage move available.",
  },
];


/**
 * A controlled number input that lets users freely edit (delete, retype) without
 * being snapped mid-keystroke. Commits and clamps only on blur.
 */
function NumericInput({
  value,
  onCommit,
  min,
  max,
  placeholder,
  className,
}: {
  value: number;
  onCommit: (n: number) => void;
  min?: number;
  max?: number;
  placeholder?: string;
  className?: string;
}) {
  const [raw, setRaw] = React.useState(String(value));

  // Sync when value changes externally (URL decode, reset, etc.)
  React.useEffect(() => {
    setRaw(String(value));
  }, [value]);

  const commit = (str: string) => {
    const n = parseFloat(str);
    if (isNaN(n)) {
      // revert to last valid value
      setRaw(String(value));
      return;
    }
    const clamped =
      min !== undefined && max !== undefined
        ? clamp(n, min, max)
        : min !== undefined
        ? Math.max(min, n)
        : max !== undefined
        ? Math.min(max, n)
        : n;
    setRaw(String(clamped));
    onCommit(clamped);
  };

  return (
    <input
      type="number"
      value={raw}
      placeholder={placeholder}
      onChange={(e) => setRaw(e.target.value)}
      onBlur={(e) => commit(e.target.value)}
      className={
        "w-full rounded-2xl border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-zinc-200 " +
        (className ?? "")
      }
    />
  );
}

const EE_INPUTS_KEY = "ee_inputs_v1";
const EE_SNAPSHOT_KEY = "ee_snapshot_v1";

function loadSavedInputs() {
  try {
    const raw = localStorage.getItem(EE_INPUTS_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return null;
}

export default function App() {
  const _saved = loadSavedInputs();
  const [userName, setUserName] = useState<string>(_saved?.userName ?? "");
  const [age, setAge] = useState<number>(_saved?.age ?? 0);
  const [investedStart, setInvestedStart] = useState<number>(_saved?.investedStart ?? 0);
  const [cashStart, setCashStart] = useState<number>(_saved?.cashStart ?? 0);
  const [monthlyIncome, setMonthlyIncome] = useState<number>(_saved?.monthlyIncome ?? 0);
  const [monthlyExpenses, setMonthlyExpenses] = useState<number>(_saved?.monthlyExpenses ?? 0);
  const [monthlyInvest, setMonthlyInvest] = useState<number>(_saved?.monthlyInvest ?? 0);
  const [annualReturnPct, setAnnualReturnPct] = useState<number>(_saved?.annualReturnPct ?? 0);
  const [target, setTarget] = useState<number>(_saved?.target ?? 0);
  const [years, setYears] = useState<number>(_saved?.years ?? 0);
  const [shockMonths, setShockMonths] = useState<number>(_saved?.shockMonths ?? 0);
  const [incomeDropPct, setIncomeDropPct] = useState<number>(_saved?.incomeDropPct ?? 0);
  const [tab, setTab] = useState<"projection" | "milestones" | "runway">("projection");
  const [paymentSuccess, setPaymentSuccess] = useState<boolean>(() => {
    try { return localStorage.getItem("ee_blueprint_paid") === "1"; } catch { return false; }
  });
  const [isGenerating, setIsGenerating] = useState(false);
  const [blueprintDownloaded, setBlueprintDownloaded] = useState(() => {
    try { return localStorage.getItem("ee_blueprint_downloaded") === "1"; } catch { return false; }
  });
  const [stressTestUnlocked, setStressTestUnlocked] = useState<boolean>(() => {
    try { return localStorage.getItem("ee_st_v3") === "1"; } catch { return false; }
  });
  const [stressUpsellDismissed, setStressUpsellDismissed] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);
  const [resetModal, setResetModal] = useState<null | "inputs" | "full">(null);
  const [fullResetConfirm, setFullResetConfirm] = useState(false);
  const [lastSnapshot, setLastSnapshot] = useState<{ date: string; score: number; bottleneckKey: string } | null>(() => {
    try {
      const raw = localStorage.getItem(EE_SNAPSHOT_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch { return null; }
  });
  const [legalModal, setLegalModal] = useState<"terms" | "privacy" | "cookies" | "disclaimer" | null>(null);
  const [showGlossary, setShowGlossary] = useState(false);
  const [showTutorial, setShowTutorial] = useState(() => {
    try { return !localStorage.getItem("ee_tutorial_seen"); } catch { return false; }
  });
  const [tutorialStep, setTutorialStep] = useState(0);

  const closeTutorial = () => {
    try { localStorage.setItem("ee_tutorial_seen", "1"); } catch {}
    setShowTutorial(false);
    setTutorialStep(0);
  };

  useEffect(() => {
    // Clean up any stale stress-test keys from previous builds
    try {
      localStorage.removeItem("ee_stress_unlocked");
      localStorage.removeItem("ee_stress_paid");
    } catch {}

    const params = new URLSearchParams(window.location.search);
    const success = params.get("success") === "1";
    if (success) {
      try { localStorage.setItem("ee_blueprint_paid", "1"); } catch {}
      setPaymentSuccess(true);
    }

    const s = params.get("s");
    if (s) {
      const decoded = decodeState(s);
      if (decoded) {
        setAge(decoded.age ?? 42);
        setInvestedStart(decoded.investedStart ?? 104000);
        setCashStart(decoded.cashStart ?? 60000);
        setMonthlyIncome(decoded.monthlyIncome ?? 16214);
        setMonthlyExpenses(decoded.monthlyExpenses ?? 12815);
        setMonthlyInvest(decoded.monthlyInvest ?? 4749);
        setAnnualReturnPct(decoded.annualReturnPct ?? decoded.annualReturn ?? 7);
        setTarget(decoded.target ?? 1000000);
        setYears(decoded.years ?? 10);
        return;
      }
    }

    if (success) {
      try {
        const saved = localStorage.getItem(FORM_SAVED_KEY);
        if (saved) {
          const decoded = JSON.parse(saved);
          setAge(decoded.age ?? 0);
          setInvestedStart(decoded.investedStart ?? 0);
          setCashStart(decoded.cashStart ?? 0);
          setMonthlyIncome(decoded.monthlyIncome ?? 0);
          setMonthlyExpenses(decoded.monthlyExpenses ?? 0);
          setMonthlyInvest(decoded.monthlyInvest ?? 0);
          setAnnualReturnPct(decoded.annualReturnPct ?? 0);
          setTarget(decoded.target ?? 0);
          setYears(decoded.years ?? 0);
          localStorage.removeItem(FORM_SAVED_KEY);
        }
      } catch {
        // ignore parse/storage errors
      }
    }

    const stressSuccess = params.get("stress_success") === "1";
    if (stressSuccess) {
      try { localStorage.setItem("ee_st_v3", "1"); } catch {}
      setStressTestUnlocked(true);
      try {
        const saved = localStorage.getItem(FORM_SAVED_KEY);
        if (saved) {
          const decoded = JSON.parse(saved);
          setAge(decoded.age ?? 0);
          setInvestedStart(decoded.investedStart ?? 0);
          setCashStart(decoded.cashStart ?? 0);
          setMonthlyIncome(decoded.monthlyIncome ?? 0);
          setMonthlyExpenses(decoded.monthlyExpenses ?? 0);
          setMonthlyInvest(decoded.monthlyInvest ?? 0);
          setAnnualReturnPct(decoded.annualReturnPct ?? 0);
          setTarget(decoded.target ?? 0);
          setYears(decoded.years ?? 0);
          localStorage.removeItem(FORM_SAVED_KEY);
        }
      } catch {}
      const url = new URL(window.location.href);
      url.searchParams.delete("stress_success");
      window.history.replaceState({}, "", url.toString());
    }
  }, []);

  // Persist inputs to localStorage (debounced 600ms)
  useEffect(() => {
    const t = setTimeout(() => {
      try {
        localStorage.setItem(EE_INPUTS_KEY, JSON.stringify({
          userName, age, investedStart, cashStart, monthlyIncome,
          monthlyExpenses, monthlyInvest, annualReturnPct, target,
          years, shockMonths, incomeDropPct,
        }));
      } catch {}
    }, 600);
    return () => clearTimeout(t);
  }, [userName, age, investedStart, cashStart, monthlyIncome,
      monthlyExpenses, monthlyInvest, annualReturnPct, target,
      years, shockMonths, incomeDropPct]);

  const heroRef = useRef<HTMLElement | null>(null);
  const [heroInView, setHeroInView] = useState(false);

  useEffect(() => {
    const el = heroRef.current;
    if (!el) return;

    const obs = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) setHeroInView(true);
      },
      { threshold: 0.35 }
    );

    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  const annualRate = useMemo(() => annualReturnPct / 100, [annualReturnPct]);

  const surplus = useMemo(
    () => monthlyIncome - monthlyExpenses,
    [monthlyIncome, monthlyExpenses]
  );

  const hasInputs =
    age > 0 &&
    investedStart > 0 &&
    cashStart > 0 &&
    monthlyIncome > 0 &&
    monthlyExpenses > 0 &&
    monthlyInvest > 0 &&
    annualReturnPct > 0 &&
    target > 0 &&
    years > 0;

  const runwayMonths = useMemo(
    () => (monthlyExpenses > 0 ? cashStart / monthlyExpenses : 0),
    [cashStart, monthlyExpenses]
  );

  const projection = useMemo(() => {
    const value = fvWithStart(investedStart, monthlyInvest, annualRate, years);
    const series = buildSeries(investedStart, monthlyInvest, annualRate, years);
    return { value, series };
  }, [investedStart, monthlyInvest, annualRate, years]);

  const yrsToTarget = useMemo(
    () => yearsToTarget(investedStart, monthlyInvest, annualRate, target),
    [investedStart, monthlyInvest, annualRate, target]
  );

  const shock = useMemo(() => {
    const keptIncome = monthlyIncome * (1 - incomeDropPct / 100);
    const netBurn = monthlyExpenses - keptIncome;
    const cashAfter = cashStart - netBurn * shockMonths;
    const survives = cashAfter >= 0;
    const runwayInShock = netBurn > 0 ? cashStart / netBurn : Infinity;

    return { keptIncome, netBurn, cashAfter, survives, runwayInShock };
  }, [monthlyIncome, monthlyExpenses, cashStart, shockMonths, incomeDropPct]);

  const leverage = useMemo(() => {
    let runwayPts = 0;
    let dependencyPts = 0;
    let velocityPts = 0;
    let shockPts = 0;

    if (runwayMonths < 3) runwayPts = 0;
    else if (runwayMonths < 6) runwayPts = 10;
    else if (runwayMonths < 9) runwayPts = 20;
    else runwayPts = 30;

    const annualExpenses = monthlyExpenses * 12;
    const dependencyRatio = investedStart > 0 ? annualExpenses / investedStart : 1;

    if (dependencyRatio > 0.06) dependencyPts = 0;
    else if (dependencyRatio > 0.04) dependencyPts = 10;
    else if (dependencyRatio > 0.03) dependencyPts = 20;
    else dependencyPts = 25;

    if (!yrsToTarget) velocityPts = 0;
    else if (yrsToTarget > 15) velocityPts = 0;
    else if (yrsToTarget > 10) velocityPts = 10;
    else if (yrsToTarget > 5) velocityPts = 20;
    else velocityPts = 25;

    const sixMonthShockCash = cashStart - monthlyExpenses * 6;
    const shockRunway = sixMonthShockCash > 0 ? sixMonthShockCash / monthlyExpenses : 0;

    if (shockRunway <= 0) shockPts = 0;
    else if (shockRunway < 3) shockPts = 5;
    else if (shockRunway < 6) shockPts = 10;
    else if (shockRunway < 12) shockPts = 15;
    else shockPts = 20;

    const total = Math.min(runwayPts + dependencyPts + velocityPts + shockPts, 100);

    const label =
      total < 30
        ? "Financially Exposed"
        : total < 60
        ? "Stable but Dependent"
        : total < 80
        ? "Building Leverage"
        : "Strong Optionality";

    const components = [
      { key: "runway", name: "Runway strength", points: runwayPts, max: 30 },
      { key: "dependency", name: "Income dependency", points: dependencyPts, max: 25 },
      { key: "velocity", name: "Wealth velocity", points: velocityPts, max: 25 },
      { key: "shock", name: "Shock resistance", points: shockPts, max: 20 },
    ];

    const ranked = [...components].sort(
      (a, b) => a.points / a.max - b.points / b.max
    );
    const bottleneck = ranked[0];

    const recs: { title: string; why: string; nextStep: string }[] = [];

    if (bottleneck.key === "runway") {
      const targetMonths = 7;
      const cashTarget = monthlyExpenses * targetMonths;
      const gap = Math.max(0, cashTarget - cashStart);

      recs.push(
        {
          title: "Increase runway to 6–8 months",
          why: "Runway is the fastest way to reduce burnout stress because it lowers the consequences of job loss.",
          nextStep:
            gap > 0
              ? `Target cash: ${fmt(cashTarget)} (gap: ${fmt(gap)}). Automate a monthly transfer to cash until you hit it.`
              : "You're already at/above the 6–8 month target. Maintain it and shift excess toward investing.",
        },
        {
          title: "Cut one fixed cost (not everything)",
          why: "Small permanent reductions compound and immediately increase runway and surplus.",
          nextStep:
            "Pick one line item to reduce by $100–$300/month (insurance, subscriptions, renegotiate utilities, etc.).",
        },
        {
          title: "Add a 'bridge' income option",
          why: "Even $500–$1,000/month drastically improves resilience in layoffs.",
          nextStep: "Define 1 low-stress option you can activate in 30 days if needed.",
        }
      );
    }

    if (bottleneck.key === "dependency") {
      recs.push(
        {
          title: "Lower your dependency ratio",
          why: "If annual expenses consume a high % of invested assets, you're forced to keep earning at your current level.",
          nextStep: "Aim for expenses ≤ 4% of invested assets (or grow assets faster than expenses).",
        },
        {
          title: "Reduce rigid expenses (housing / fixed payments)",
          why: "Rigid costs are what trap you in a job even with a good income.",
          nextStep: "Identify your top 1–2 fixed payments and explore refinance, recast, downsizing, or restructuring.",
        },
        {
          title: "Increase invest rate by a 'non-painful' amount",
          why: "A small consistent bump to monthly investing can cut years off your target timeline.",
          nextStep: "Try +$250 to +$500/month first. Re-run the model and lock it in if stress stays stable.",
        }
      );
    }

    if (bottleneck.key === "velocity") {
      recs.push(
        {
          title: "Shorten time-to-target with contribution boosts",
          why: "Velocity is mostly contribution rate + consistency.",
          nextStep: "Test +$1,000/month and +$2,000/month scenarios and pick a sustainable level.",
        },
        {
          title: "Automate investing on payday",
          why: "Automation beats motivation — especially during burnout periods.",
          nextStep: "Set autopilot contributions so savings happens before lifestyle inflation.",
        },
        {
          title: "Protect the engine: avoid burnout-induced income drops",
          why: "Burnout often reduces output and income — which destroys velocity.",
          nextStep: "Build a plan that reduces stress first (runway + boundaries) so income stays stable.",
        }
      );
    }

    if (bottleneck.key === "shock") {
      recs.push(
        {
          title: "Harden your layoff scenario",
          why: "Shock resistance is your ability to absorb income loss without panic decisions.",
          nextStep: "Increase cash runway and reduce fixed costs; both improve shock score quickly.",
        },
        {
          title: "Create a 'shock protocol'",
          why: "Decisions are worst during stress. A protocol prevents rash moves.",
          nextStep:
            "Write a 1-page plan: expense cuts, timeline, how you'll search, and what you will NOT do.",
        },
        {
          title: "Keep liquidity for optionality",
          why: "Liquidity buys time; time buys better decisions.",
          nextStep: "Maintain a cash floor that you don't invest below (e.g., 6 months).",
        }
      );
    }

    const altPlus500 = yearsToTarget(investedStart, monthlyInvest + 500, annualRate, target);
    const altPlus1000 = yearsToTarget(investedStart, monthlyInvest + 1000, annualRate, target);

    return {
      total,
      label,
      components,
      bottleneck,
      annualExpenses,
      dependencyRatio,
      recs,
      needle: {
        plus500: altPlus500,
        plus1000: altPlus1000,
      },
    };
  }, [runwayMonths, monthlyExpenses, investedStart, yrsToTarget, cashStart, monthlyInvest, annualRate, target]);

  const ageAtTarget = yrsToTarget ? age + yrsToTarget : null;

  const stressTest = useMemo<StressTestResult | null>(() => {
    if (!hasInputs) return null;
    return computeStressTest({ monthlyIncome, monthlyExpenses, cashStart, investedStart, monthlyInvest, annualReturnPct, target });
  }, [monthlyIncome, monthlyExpenses, cashStart, investedStart, monthlyInvest, annualReturnPct, target, hasInputs]);

  const constraintAnalysis = useMemo(() => {
    if (!hasInputs || !leverage) return null;
    const comp = (key: string) => leverage.components.find((c) => c.key === key)!;
    const { annualExpenses, dependencyRatio } = leverage;
    const bKey = leverage.bottleneck.key;

    if (bKey === "runway") {
      const targetMonths = 9;
      const cashNeeded = Math.max(0, (targetMonths - runwayMonths) * monthlyExpenses);
      const monthlySavingsNeeded = cashNeeded > 0 ? Math.ceil(cashNeeded / 6) : 0;
      const monthsAtSurplus = surplus > 0 && cashNeeded > 0 ? Math.ceil(cashNeeded / surplus) : null;
      const scoreGain = comp("runway").max - comp("runway").points;
      return {
        title: "Emergency Runway",
        icon: "🛡",
        color: "rose",
        current: `${runwayMonths.toFixed(1)} months`,
        target: `${targetMonths} months`,
        gapPct: Math.min(100, Math.round((runwayMonths / targetMonths) * 100)),
        gapLabel: cashNeeded > 0 ? `${fmt(cashNeeded)} additional cash needed` : "Gap closed",
        actions: [
          monthlySavingsNeeded > 0
            ? `Increase dedicated monthly savings by ${fmt(monthlySavingsNeeded)} — closes gap in 6 months`
            : "Maintain current cash reserve rate",
          monthsAtSurplus
            ? `Redirect current surplus of ${fmt(surplus)}/mo to cash — runway target in ${monthsAtSurplus} months`
            : "Build a positive monthly surplus to accelerate runway",
          `Hold monthly expenses at ${fmt(monthlyExpenses)} — any fixed cost increase delays the target`,
        ],
        scoreGain,
        impactLine: `Fixing runway unlocks up to +${scoreGain} pts on your Leverage Score`,
      };
    }

    if (bKey === "dependency") {
      const targetRatio = 0.04;
      const targetInvested = annualExpenses / targetRatio;
      const gapToTarget = Math.max(0, targetInvested - investedStart);
      const additionalMonthly = gapToTarget > 0 ? Math.ceil(gapToTarget / (10 * 12)) : 0;
      const expenseCutMonthly = dependencyRatio > targetRatio
        ? Math.ceil(((dependencyRatio - targetRatio) * investedStart) / 12) : 0;
      const scoreGain = comp("dependency").max - comp("dependency").points;
      return {
        title: "Income Dependency",
        icon: "⛓",
        color: "amber",
        current: `${(dependencyRatio * 100).toFixed(1)}% annual withdrawal rate`,
        target: `< 4.0% withdrawal rate`,
        gapPct: Math.min(100, Math.round((targetRatio / Math.max(dependencyRatio, 0.001)) * 100)),
        gapLabel: gapToTarget > 0 ? `${fmt(gapToTarget)} to grow invested assets to safe level` : "Dependency in safe range",
        actions: [
          additionalMonthly > 0
            ? `Increase monthly investment by ${fmt(additionalMonthly)} to close the asset gap over 10 years`
            : "Maintain current investment rate",
          expenseCutMonthly > 0
            ? `Reduce fixed monthly expenses by ${fmt(expenseCutMonthly)} to lower your withdrawal rate`
            : "Keep expense growth below income growth",
          yrsToTarget
            ? `Current trajectory: ${yrsToTarget.toFixed(1)} yrs to Freedom Number — goal is under 10`
            : "Set a Freedom Number to calculate exact velocity",
        ],
        scoreGain,
        impactLine: `Closing the dependency gap unlocks up to +${scoreGain} pts on your Leverage Score`,
      };
    }

    if (bKey === "velocity") {
      const targetYears = 5;
      let lo = monthlyInvest, hi = monthlyInvest + 20000;
      for (let i = 0; i < 60; i++) {
        const mid = (lo + hi) / 2;
        const y = yearsToTarget(investedStart, mid, annualRate, target);
        if (y && y <= targetYears) hi = mid; else lo = mid;
      }
      const investNeededFor5yr = target > 0 ? Math.ceil((hi - monthlyInvest) / 50) * 50 : 0;
      const plus500yrs = leverage.needle.plus500;
      const plus1000yrs = leverage.needle.plus1000;
      const scoreGain = comp("velocity").max - comp("velocity").points;
      return {
        title: "Wealth Velocity",
        icon: "🚀",
        color: "indigo",
        current: yrsToTarget ? `${yrsToTarget.toFixed(1)} years to Freedom Number` : "No projection",
        target: `Under 5 years to Freedom Number`,
        gapPct: yrsToTarget ? Math.min(100, Math.round((targetYears / yrsToTarget) * 100)) : 0,
        gapLabel: yrsToTarget ? `${Math.max(0, yrsToTarget - targetYears).toFixed(1)} years above optimal target` : "Set a Freedom Number to project",
        actions: [
          plus500yrs
            ? `Adding +$500/mo compresses timeline from ${yrsToTarget?.toFixed(1)} to ${plus500yrs.toFixed(1)} yrs — net gain ${((yrsToTarget ?? 0) - plus500yrs).toFixed(1)} yrs`
            : "Increase monthly investment by $500 to measure timeline compression",
          plus1000yrs
            ? `Adding +$1,000/mo brings timeline to ${plus1000yrs.toFixed(1)} yrs`
            : "Target +$1,000/mo as a meaningful velocity milestone",
          investNeededFor5yr > 0 && target > 0
            ? `To reach 5-year target: increase investment by ${fmt(investNeededFor5yr)}/mo → total ${fmt(monthlyInvest + investNeededFor5yr)}/mo`
            : "Maintain current investment rate and review in 90 days",
        ],
        scoreGain,
        impactLine: `Improving velocity unlocks up to +${scoreGain} pts on your Leverage Score`,
      };
    }

    if (bKey === "shock") {
      const cashNeededFor6mo = monthlyExpenses * 6;
      const shockGap = Math.max(0, cashNeededFor6mo - cashStart);
      const monthsToFill = surplus > 0 && shockGap > 0 ? Math.ceil(shockGap / surplus) : null;
      const monthlyToFillIn6 = shockGap > 0 ? Math.ceil(shockGap / 6) : 0;
      const scoreGain = comp("shock").max - comp("shock").points;
      return {
        title: "Shock Resistance",
        icon: "⚡",
        color: "orange",
        current: `${Math.min(runwayMonths, 6).toFixed(1)} of 6 shock-months covered`,
        target: `Survive full 6-month income shock`,
        gapPct: Math.min(100, Math.round((cashStart / cashNeededFor6mo) * 100)),
        gapLabel: shockGap > 0 ? `${fmt(shockGap)} needed to survive a complete shock scenario` : "Shock buffer is sufficient",
        actions: [
          monthlyToFillIn6 > 0
            ? `Add ${fmt(monthlyToFillIn6)}/mo to cash reserves to fill the shock gap in 6 months`
            : "Maintain current cash buffer",
          monthsToFill
            ? `Redirect surplus of ${fmt(surplus)}/mo to shock buffer — gap filled in ${monthsToFill} months`
            : "Build positive monthly surplus to fund shock buffer",
          `Keep ${fmt(cashNeededFor6mo)} (6 × monthly expenses) liquid — never invest below this floor`,
        ],
        scoreGain,
        impactLine: `Building shock resistance unlocks up to +${scoreGain} pts on your Leverage Score`,
      };
    }

    return null;
  }, [hasInputs, leverage, runwayMonths, surplus, monthlyExpenses, cashStart, investedStart, monthlyInvest, annualRate, target, yrsToTarget]);

  const milestones = useMemo(() => {
    const marks = [250000, 500000, 750000, 1000000, 1500000, 2000000];
    return marks
      .map((t) => ({
        t,
        y: yearsToTarget(investedStart, monthlyInvest, annualRate, t),
      }))
      .filter((x) => x.y !== null) as { t: number; y: number }[];
  }, [investedStart, monthlyInvest, annualRate]);

  const safeWithdrawalAnnual = useMemo(() => {
    const v = projection.value;
    return { at35: v * 0.035, at4: v * 0.04 };
  }, [projection.value]);


  const chartData = useMemo(() => {
    const s2 = buildSeries(investedStart, monthlyInvest + 500, annualRate, years);
    const s3 = buildSeries(investedStart, monthlyInvest + 1000, annualRate, years);
    return projection.series.map((pt, i) => ({
      year: pt.year,
      baseline: pt.value,
      plus500: s2[i]?.value ?? null,
      plus1000: s3[i]?.value ?? null,
    }));
  }, [projection.series, investedStart, monthlyInvest, annualRate, years]);

  const scrollTo = (id: string) =>
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth" });

  const clearSuccessFlag = () => {
    const url = new URL(window.location.href);
    url.searchParams.delete("success");
    window.history.replaceState({}, "", url.toString());
    try { localStorage.removeItem("ee_blueprint_paid"); } catch {}
    setPaymentSuccess(false);
  };

  const handleResetInputs = () => {
    setUserName(""); setAge(0); setInvestedStart(0); setCashStart(0);
    setMonthlyIncome(0); setMonthlyExpenses(0); setMonthlyInvest(0);
    setAnnualReturnPct(0); setTarget(0); setYears(0); setShockMonths(6); setIncomeDropPct(50);
    setLastSnapshot(null);
    try {
      localStorage.removeItem(EE_INPUTS_KEY);
      localStorage.removeItem(EE_SNAPSHOT_KEY);
    } catch {}
    setResetModal(null);
  };

  const handleFullReset = () => {
    handleResetInputs();
    setPaymentSuccess(false);
    setBlueprintDownloaded(false);
    setStressTestUnlocked(false);
    setStressUpsellDismissed(false);
    setFullResetConfirm(false);
    try {
      localStorage.removeItem("ee_blueprint_paid");
      localStorage.removeItem("ee_blueprint_downloaded");
      localStorage.removeItem("ee_st_v3");
      localStorage.removeItem(FORM_SAVED_KEY);
    } catch {}
    setResetModal(null);
  };

  const handleCheckout = (url: string) => {
    try {
      const payload = {
        age,
        investedStart,
        cashStart,
        monthlyIncome,
        monthlyExpenses,
        monthlyInvest,
        annualReturnPct,
        target,
        years,
      };
      localStorage.setItem(FORM_SAVED_KEY, JSON.stringify(payload));
    } catch {
      // ignore storage errors
    }
    window.location.href = url;
  };

  const handleStressCheckout = () => {
    if (!STRESS_LINK_READY) {
      // Dev mode: session-only unlock — do NOT persist to localStorage
      setStressTestUnlocked(true);
      return;
    }
    try {
      const payload = { age, investedStart, cashStart, monthlyIncome, monthlyExpenses, monthlyInvest, annualReturnPct, target, years };
      localStorage.setItem(FORM_SAVED_KEY, JSON.stringify(payload));
    } catch {}
    window.location.href = STRIPE_STRESS_LINK;
  };

  const generateLeverageBlueprintPdf = () => {
    const doc = new jsPDF({ unit: "pt", format: "letter" });

    const breakdown = computeLeverageBreakdown({
      runwayMonths,
      monthlyExpenses,
      investedStart,
      yrsToTarget,
      cashStart,
    });

    const plan = build12MonthPlan({
      runwayMonths,
      surplus,
      bottleneckKey: breakdown.bottleneck.key,
    });

    const phase1Items = [...plan[0].items, ...plan[1].items];
    const phase2Items = plan[2].items.length > 0
      ? plan[2].items
      : ["Increase investing to a sustainable level.", "Keep fixed costs flat for 90 days at a time."];
    const phase3Items = plan[3].items.length > 0
      ? plan[3].items
      : ["Quarterly review: runway, invest-rate, time-to-target.", "Protect health: burnout kills compounding."];

    // ---- Colors ----
    const ACCENT = { r: 37, g: 99, b: 235 };
    const INK = { r: 17, g: 24, b: 39 };
    const MUTED = { r: 107, g: 114, b: 128 };
    const BORDER = { r: 229, g: 231, b: 235 };
    const SOFT_BG = { r: 248, g: 250, b: 252 };
    const SUCCESS = { r: 16, g: 185, b: 129 };
    const WARN = { r: 245, g: 158, b: 11 };
    const DANGER = { r: 239, g: 68, b: 68 };

    const pageW = doc.internal.pageSize.getWidth();
    const pageH = doc.internal.pageSize.getHeight();
    const margin = 48;

    // ---- Computed metrics ----
    const totalAssets = investedStart + cashStart;
    const annualExpenses = monthlyExpenses * 12;
    const savingsRate = monthlyIncome > 0 ? (surplus / monthlyIncome) * 100 : 0;
    const targetGap = Math.max(0, target - investedStart);
    const fiNumber = monthlyExpenses > 0 ? annualExpenses / 0.04 : 0;
    const runwayGap = Math.max(0, 6 - runwayMonths);
    const monthsToCloseRunwayGap: number | null =
      surplus > 0 && runwayGap > 0
        ? Math.ceil((runwayGap * monthlyExpenses) / surplus)
        : null;
    const dependencyRatio = investedStart > 0 ? annualExpenses / investedStart : 1;
    const dependencyPct = investedStart > 0 ? dependencyRatio * 100 : null;
    const cashAfter6 = cashStart - monthlyExpenses * 6;
    const cashAfter12 = cashStart - monthlyExpenses * 12;

    const now = new Date();
    const dateStr = now.toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "2-digit",
    });

    const setRGB = (c: { r: number; g: number; b: number }) =>
      doc.setTextColor(c.r, c.g, c.b);

    const line = (y: number) => {
      doc.setDrawColor(BORDER.r, BORDER.g, BORDER.b);
      doc.line(margin, y, pageW - margin, y);
    };

    // Track page number for footer
    let pageNum = 1;

    const footer = () => {
      doc.setFont("helvetica", "normal");
      doc.setFontSize(9);
      setRGB(MUTED);
      doc.text(
        "Educational only — not financial advice. Assumptions exclude taxes/fees; markets vary.",
        margin,
        pageH - 28
      );
      doc.text(`Page ${pageNum}`, pageW - margin - 30, pageH - 28);
    };

    const sectionHeader = (title: string, subtitle?: string) => {
      doc.setFont("helvetica", "bold");
      doc.setFontSize(14);
      setRGB(ACCENT);
      doc.text(title, margin, 58);

      if (subtitle) {
        doc.setFont("helvetica", "normal");
        doc.setFontSize(10);
        setRGB(MUTED);
        doc.text(subtitle, margin, 74);
      }

      line(88);
      setRGB(INK);
    };

    const badge = (text: string, x: number, y: number) => {
      const padX = 10;
      const height = 22;
      doc.setFont("helvetica", "bold");
      doc.setFontSize(9);
      const textWidth = doc.getTextWidth(text);
      const width = textWidth + padX * 2;
      doc.setFillColor(ACCENT.r, ACCENT.g, ACCENT.b);
      doc.roundedRect(x, y, width, height, height / 2, height / 2, "F");
      doc.setTextColor(255, 255, 255);
      doc.text(text, x + padX, y + 15);
      setRGB(INK);
    };

    const callout = (
      title: string,
      body: string,
      x: number,
      y: number,
      w: number,
      h = 92
    ) => {
      doc.setFillColor(SOFT_BG.r, SOFT_BG.g, SOFT_BG.b);
      doc.setDrawColor(BORDER.r, BORDER.g, BORDER.b);
      doc.roundedRect(x, y, w, h, 12, 12, "FD");
      doc.setFillColor(ACCENT.r, ACCENT.g, ACCENT.b);
      doc.roundedRect(x, y, 6, h, 12, 12, "F");
      doc.setFont("helvetica", "bold");
      doc.setFontSize(11);
      setRGB(INK);
      doc.text(title, x + 16, y + 26);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(10);
      setRGB(MUTED);
      const lines = doc.splitTextToSize(body, w - 28);
      doc.text(lines, x + 16, y + 46);
      setRGB(INK);
    };

    const kpiCard = (
      label: string,
      value: string,
      x: number,
      y: number,
      w: number,
      h: number
    ) => {
      doc.setFillColor(255, 255, 255);
      doc.setDrawColor(BORDER.r, BORDER.g, BORDER.b);
      doc.roundedRect(x, y, w, h, 14, 14, "FD");
      doc.setDrawColor(ACCENT.r, ACCENT.g, ACCENT.b);
      doc.setLineWidth(2);
      doc.line(x + 14, y + 18, x + 56, y + 18);
      doc.setLineWidth(1);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(9);
      setRGB(MUTED);
      doc.text(label, x + 14, y + 38);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(18);
      setRGB(INK);
      doc.text(value, x + 14, y + 64);
    };

    // Visual progress bar for score components
    const scoreBar = (
      label: string,
      score: number,
      max: number,
      x: number,
      y: number,
      w: number
    ) => {
      const ratio = max > 0 ? Math.min(1, score / max) : 0;
      const labelW = 158;
      const barW = w - labelW - 56;
      const barH = 11;

      doc.setFont("helvetica", "normal");
      doc.setFontSize(10);
      setRGB(INK);
      doc.text(label, x, y + barH);

      // background track
      doc.setFillColor(229, 231, 235);
      doc.roundedRect(x + labelW, y, barW, barH, 4, 4, "F");

      // filled bar
      const [fr, fg, fb] =
        ratio < 0.34
          ? [DANGER.r, DANGER.g, DANGER.b]
          : ratio < 0.67
          ? [WARN.r, WARN.g, WARN.b]
          : [SUCCESS.r, SUCCESS.g, SUCCESS.b];
      doc.setFillColor(fr, fg, fb);
      doc.roundedRect(x + labelW, y, Math.max(6, barW * ratio), barH, 4, 4, "F");

      // score label
      doc.setFont("helvetica", "bold");
      doc.setFontSize(10);
      setRGB(INK);
      doc.text(`${score}/${max}`, x + labelW + barW + 8, y + barH);

      return y + barH + 16;
    };

    const ensureRoom = (y: number, needed: number) => {
      if (y + needed > pageH - 70) {
        footer();
        doc.addPage();
        pageNum++;
        return 96;
      }
      return y;
    };

    const leverageLabel =
      leverage?.total < 30
        ? "FINANCIALLY EXPOSED"
        : leverage?.total < 60
        ? "STABLE BUT DEPENDENT"
        : leverage?.total < 80
        ? "BUILDING LEVERAGE"
        : "STRONG OPTIONALITY";

    const bottleneck = leverage?.bottleneck?.name ?? "Primary constraint";

    const diagnosis =
      runwayMonths < 6
        ? `Your runway is ${runwayMonths.toFixed(1)} months — ${runwayGap.toFixed(1)} months below the 6-month threshold. That is why the job feels mandatory.${monthsToCloseRunwayGap ? ` At your surplus of ${fmt(surplus)}/mo, you close this gap in ${monthsToCloseRunwayGap} months.` : ""} Fix runway before optimizing anything else.`
        : dependencyRatio > 0.05
        ? `You are structurally dependent on income. Annual expenses of ${fmt(annualExpenses)} are too large relative to your invested base of ${fmt(investedStart)}. Reduce fixed costs and increase velocity.`
        : !yrsToTarget || yrsToTarget > 10
        ? `Velocity is your constraint. At your current invest rate of ${fmt(monthlyInvest)}/mo, your timeline to ${fmt(target)} is long. Increase invest-rate sustainably to compress this window.`
        : "You are in a strong position. The mission now is consistency: protect the engine and keep fixed costs from creeping up.";

    const directive =
      bottleneck.toLowerCase().includes("runway")
        ? `Directive: build runway from ${runwayMonths.toFixed(1)} to 6–8 months. At ${fmt(surplus)}/mo surplus, that is ${monthsToCloseRunwayGap ?? "several"} months of focused discipline. Stress drops fastest here.`
        : bottleneck.toLowerCase().includes("dependency")
        ? `Directive: close the dependency gap. Annual expenses of ${fmt(annualExpenses)} vs invested assets of ${fmt(investedStart)} means a ${dependencyPct?.toFixed(1) ?? "—"}% withdrawal rate. Keep lifestyle flat while assets rise.`
        : bottleneck.toLowerCase().includes("velocity")
        ? `Directive: increase wealth velocity with a sustainable invest-rate bump. Every +$500/mo compresses your timeline by ${leverage?.needle?.plus500 && yrsToTarget ? (yrsToTarget - leverage.needle.plus500).toFixed(1) : "~"} years.`
        : bottleneck.toLowerCase().includes("shock")
        ? `Directive: harden your shock resilience. Cash of ${fmt(cashStart)} vs ${fmt(monthlyExpenses * 6)} needed for 6 months. Close this gap with cash accumulation first.`
        : `Directive: resolve the primary constraint first — ${bottleneck}.`;

    const baseTxt = yrsToTarget ? `${yrsToTarget.toFixed(1)} yrs` : "—";
    const plus500Txt =
      leverage?.needle?.plus500 != null ? `${leverage.needle.plus500.toFixed(1)} yrs` : "—";
    const plus1000Txt =
      leverage?.needle?.plus1000 != null ? `${leverage.needle.plus1000.toFixed(1)} yrs` : "—";

    // ================================================================
    // COVER PAGE
    // ================================================================
    doc.setFont("helvetica", "bold");
    doc.setFontSize(28);
    setRGB(INK);
    doc.text("Leverage Blueprint", margin, 110);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(12);
    setRGB(MUTED);
    doc.text("Confidential Operator Strategy Document", margin, 134);

    doc.setFontSize(10);
    doc.text(`Prepared for: ${userName.trim() || "You"}   ·   Generated: ${dateStr}`, margin, 154);

    doc.setDrawColor(ACCENT.r, ACCENT.g, ACCENT.b);
    doc.setLineWidth(2);
    doc.line(margin, 176, pageW - margin, 176);
    doc.setLineWidth(1);

    // Score card
    doc.setFillColor(255, 255, 255);
    doc.setDrawColor(BORDER.r, BORDER.g, BORDER.b);
    doc.roundedRect(margin, 196, pageW - margin * 2, 148, 18, 18, "FD");

    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    setRGB(INK);
    doc.text("Leverage Score", margin + 20, 230);

    doc.setFontSize(46);
    setRGB(ACCENT);
    doc.text(String(leverage?.total ?? "—"), margin + 20, 286);

    badge(leverageLabel, margin + 130, 242);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    setRGB(MUTED);
    doc.text(`Primary constraint: ${bottleneck}`, margin + 20, 326);

    // 3 quick-stat KPI boxes
    const kW3 = (pageW - margin * 2 - 32) / 3;
    const kY3 = 362;
    const kH3 = 80;
    kpiCard("Emergency Runway", `${runwayMonths.toFixed(1)} mo`, margin, kY3, kW3, kH3);
    kpiCard("Time to Target", baseTxt, margin + kW3 + 16, kY3, kW3, kH3);
    kpiCard("Monthly Surplus", fmt(surplus), margin + (kW3 + 16) * 2, kY3, kW3, kH3);

    doc.setFont("helvetica", "italic");
    doc.setFontSize(9);
    setRGB(MUTED);
    const displayName = userName.trim() || null;
    const introLines = doc.splitTextToSize(
      `${displayName ? `${displayName}, this` : "This"} report analyses your financial position across four dimensions — runway, dependency, velocity, and shock resistance — and produces a personalised 12-month execution plan. Every number in this document is calculated from the data you entered.`,
      pageW - margin * 2
    );
    doc.text(introLines, margin, 464);

    footer();

    // ================================================================
    // YOUR FINANCIAL SNAPSHOT
    // ================================================================
    doc.addPage();
    pageNum++;
    sectionHeader("Your Financial Snapshot", "Every number that drives your leverage score.");

    let y = 110;
    const halfW = (pageW - margin * 2) / 2 - 8;
    const col1X = margin;
    const col2X = margin + halfW + 16;
    const rowH = 36;

    const statRow = (
      label: string,
      value: string,
      x: number,
      yy: number,
      accent = false
    ) => {
      doc.setFillColor(accent ? 239 : 255, accent ? 246 : 255, accent ? 255 : 255);
      doc.setDrawColor(BORDER.r, BORDER.g, BORDER.b);
      doc.roundedRect(x, yy, halfW, rowH - 4, 8, 8, "FD");
      doc.setFont("helvetica", "normal");
      doc.setFontSize(9);
      setRGB(MUTED);
      doc.text(label, x + 12, yy + 14);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(12);
      setRGB(accent ? ACCENT : INK);
      doc.text(value, x + 12, yy + 28);
    };

    statRow("Monthly Income", fmt(monthlyIncome), col1X, y);
    statRow("Monthly Expenses", fmt(monthlyExpenses), col2X, y);
    y += rowH;

    statRow("Monthly Surplus", fmt(surplus), col1X, y, true);
    statRow("Savings Rate", `${savingsRate.toFixed(1)}%`, col2X, y, true);
    y += rowH;

    statRow("Invested Assets", fmt(investedStart), col1X, y);
    statRow("Cash / Emergency Fund", fmt(cashStart), col2X, y);
    y += rowH;

    statRow("Total Assets", fmt(totalAssets), col1X, y);
    statRow("Freedom Number", fmt(target), col2X, y);
    y += rowH;

    statRow("Gap to Freedom Number", fmt(targetGap), col1X, y);
    statRow("FI Number (4% SWR)", fmt(fiNumber), col2X, y);
    y += rowH;

    statRow("Emergency Runway", `${runwayMonths.toFixed(1)} months`, col1X, y);
    statRow(
      "Dependency Ratio",
      dependencyPct != null ? `${dependencyPct.toFixed(2)}%` : "—",
      col2X,
      y
    );
    y += rowH + 14;

    const snapshotNarrative =
      runwayMonths < 6
        ? `Your runway of ${runwayMonths.toFixed(1)} months is ${runwayGap.toFixed(1)} months below the 6-month safety threshold. You need ${fmt(runwayGap * monthlyExpenses)} more in cash to reach baseline stability. At your surplus of ${fmt(surplus)}/mo, that takes ${monthsToCloseRunwayGap ?? "~"} months of focused accumulation.`
        : savingsRate < 20
        ? `Your savings rate of ${savingsRate.toFixed(1)}% is below the 20% threshold for meaningful wealth velocity. Moving to 20% on ${fmt(monthlyIncome)}/mo income means investing ${fmt(monthlyIncome * 0.2)}/mo — ${fmt(monthlyIncome * 0.2 - monthlyInvest)} more than your current rate.`
        : `Your fundamentals are solid: ${fmt(surplus)}/mo surplus, ${runwayMonths.toFixed(1)} months runway, ${fmt(investedStart)} invested. The gap to your target is ${fmt(targetGap)}. At ${fmt(monthlyInvest)}/mo invest rate, you reach it in ${baseTxt}.`;

    callout("Your Position in Plain English", snapshotNarrative, margin, y, pageW - margin * 2, 100);

    footer();

    // ================================================================
    // SHOCK TESTING LAB
    // ================================================================
    doc.addPage();
    pageNum++;

    let y1 = 70;
    y1 = sectionTitle(doc, "Shock Testing Lab", margin, y1);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(11);
    doc.setTextColor(90);
    y1 = wrap(
      doc,
      "These scenarios model how long your current system holds under disruption — so you make decisions from calm, not panic.",
      margin,
      y1,
      pageW - margin * 2
    );
    y1 += 10;

    const jobLossRows = [3, 6, 9, 12].map((m) => {
      const s = computeScenario({ monthlyIncome, monthlyExpenses, cashStart, months: m, incomeDropPct: 100 });
      return [`${m} mo`, fmt(s.netBurn), fmt(s.cashAfter), s.survives ? "OK" : "BREAKS"];
    });

    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.setTextColor(40);
    doc.text("Scenario A — Job loss (income drops 100%)", margin, y1);
    y1 += 14;

    y1 = drawTable(doc, {
      x: margin,
      y: y1,
      w: pageW - margin * 2,
      headers: ["Duration", "Net burn / mo", "Cash after", "Status"],
      rows: jobLossRows,
      colPercents: [0.18, 0.28, 0.28, 0.18],
    });
    y1 += 10;

    const payCutRows = [10, 20, 30].map((p) => {
      const s = computeScenario({ monthlyIncome, monthlyExpenses, cashStart, months: 6, incomeDropPct: p });
      return [`${p}% cut`, fmt(s.keptIncome), fmt(s.netBurn), fmt(s.cashAfter)];
    });

    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.setTextColor(40);
    doc.text("Scenario B — Pay cut (6 months)", margin, y1);
    y1 += 14;

    y1 = drawTable(doc, {
      x: margin,
      y: y1,
      w: pageW - margin * 2,
      headers: ["Cut", "Kept income", "Net burn / mo", "Cash after 6 mo"],
      rows: payCutRows,
      colPercents: [0.18, 0.26, 0.26, 0.26],
    });
    y1 += 10;

    const sabbaticalRows = [1, 3, 6].map((m) => {
      const reducedExpenses = monthlyExpenses * 0.9;
      const s = computeScenario({ monthlyIncome: 0, monthlyExpenses: reducedExpenses, cashStart, months: m, incomeDropPct: 0 });
      return [`${m} mo`, fmt(reducedExpenses), fmt(s.cashAfter), s.survives ? "OK" : "BREAKS"];
    });

    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.setTextColor(40);
    doc.text("Scenario C — Sabbatical (expenses reduced 10%)", margin, y1);
    y1 += 14;

    drawTable(doc, {
      x: margin,
      y: y1,
      w: pageW - margin * 2,
      headers: ["Duration", "Monthly spend", "Cash after", "Status"],
      rows: sabbaticalRows,
      colPercents: [0.18, 0.30, 0.30, 0.18],
    });

    footer();

    // ================================================================
    // LEVERAGE BREAKDOWN (with visual score bars)
    // ================================================================
    doc.addPage();
    pageNum++;
    let y2 = 70;
    y2 = sectionTitle(doc, "Leverage Breakdown", margin, y2);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(11);
    doc.setTextColor(90);
    y2 = wrap(
      doc,
      "Your total score is a composite of four sub-systems. The fastest path to equanimity is improving the lowest sub-system first.",
      margin,
      y2,
      pageW - margin * 2
    );
    y2 += 18;

    doc.setFont("helvetica", "bold");
    doc.setFontSize(13);
    setRGB(INK);
    doc.text(`Total Leverage Score: ${leverage?.total ?? "—"} / 100`, margin, y2);
    y2 += 22;

    const barAreaW = pageW - margin * 2;
    y2 = scoreBar("Runway Strength", breakdown.runwayScore, 30, margin, y2, barAreaW);
    y2 = scoreBar("Income Dependency", breakdown.dependencyScore, 25, margin, y2, barAreaW);
    y2 = scoreBar("Wealth Velocity", breakdown.velocityScore, 25, margin, y2, barAreaW);
    y2 = scoreBar("Shock Resistance", breakdown.shockScore, 20, margin, y2, barAreaW);
    y2 += 14;

    const subRows = [
      ["Runway strength", `${breakdown.runwayScore}/30`, runwayMonths.toFixed(1) + " months emergency runway"],
      ["Income dependency", `${breakdown.dependencyScore}/25`, dependencyPct != null ? `${dependencyPct.toFixed(1)}% annual spend / assets` : "—"],
      ["Wealth velocity", `${breakdown.velocityScore}/25`, yrsToTarget ? `${yrsToTarget.toFixed(1)} yrs to ${fmt(target)}` : "No target projection"],
      ["Shock resistance", `${breakdown.shockScore}/20`, cashAfter6 >= 0 ? "Survives 6-mo shock" : "Breaks at 6-mo shock"],
    ];

    y2 = drawTable(doc, {
      x: margin,
      y: y2,
      w: pageW - margin * 2,
      headers: ["Component", "Score", "Interpretation"],
      rows: subRows,
      colPercents: [0.38, 0.18, 0.42],
    });
    y2 += 14;

    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.setTextColor(40);
    doc.text("Primary constraint (bottleneck)", margin, y2);
    y2 += 16;

    doc.setFont("helvetica", "normal");
    doc.setFontSize(11);
    doc.setTextColor(70);
    wrap(
      doc,
      `${breakdown.bottleneck.name}. ${breakdown.bottleneck.why}`,
      margin,
      y2,
      pageW - margin * 2
    );

    const boxY2 = y2 + 46;
    const colW2 = (pageW - margin * 2 - 24) / 2;
    kpiCard("Time to Target", baseTxt, margin, boxY2, colW2, 90);
    kpiCard("Runway (months)", runwayMonths.toFixed(1), margin + colW2 + 24, boxY2, colW2, 90);

    footer();

    // ================================================================
    // EXECUTIVE SNAPSHOT
    // ================================================================
    doc.addPage();
    pageNum++;
    sectionHeader("Executive Snapshot", "The truth in one page. No fluff.");

    y = 110;
    const cardW = (pageW - margin * 2 - 16) / 2;
    const cardH = 86;

    kpiCard("Leverage Score", String(leverage?.total ?? "—"), margin, y, cardW, cardH);
    kpiCard("Optionality Class", leverageLabel, margin + cardW + 16, y, cardW, cardH);
    y += cardH + 16;

    kpiCard("Monthly Surplus", fmt(surplus), margin, y, cardW, cardH);
    kpiCard("Age at Target", ageAtTarget ? `${ageAtTarget.toFixed(0)}` : "—", margin + cardW + 16, y, cardW, cardH);
    y += cardH + 22;

    callout("Diagnosis", diagnosis, margin, y, pageW - margin * 2, 110);
    y += 126;
    y = ensureRoom(y, 130);
    callout("Operator Directive", directive, margin, y, pageW - margin * 2, 110);

    footer();

    // ================================================================
    // FINANCIAL DEPENDENCY MAP
    // ================================================================
    doc.addPage();
    pageNum++;
    sectionHeader("Financial Dependency Map", "What's driving dependency — and what to fix first.");

    y = 110;
    (autoTable as any)(doc, {
      startY: y,
      head: [["Component", "Score", "Strength", "Meaning"]],
      body: (leverage?.components ?? []).map((c: any) => {
        const strength =
          c.points / c.max < 0.34 ? "WEAK" : c.points / c.max < 0.67 ? "MEDIUM" : "STRONG";
        const meaning =
          c.key === "runway"
            ? "Time buffer. Without it, every setback spikes stress."
            : c.key === "dependency"
            ? "How forced you are to keep earning."
            : c.key === "velocity"
            ? "How quickly you're buying freedom."
            : "How you handle income disruption.";
        return [c.name, `${c.points}/${c.max}`, strength, meaning];
      }),
      theme: "grid",
      styles: { font: "helvetica", fontSize: 10, cellPadding: 6 },
      headStyles: { fillColor: [ACCENT.r, ACCENT.g, ACCENT.b], textColor: 255 },
      margin: { left: margin, right: margin },
    });

    y = (doc as any).lastAutoTable.finalY + 18;

    callout(
      "Dependency Reality Check",
      `Annual expenses: ${fmt(annualExpenses)} (${fmt(monthlyExpenses)}/mo). Invested assets: ${fmt(investedStart)}. Dependency ratio: ${dependencyPct != null ? `${dependencyPct.toFixed(2)}%` : "—"} of assets consumed per year. Target dependency below 4% (safe withdrawal rate). Current gap: ${dependencyPct != null ? `${(dependencyPct - 4).toFixed(2)}%` : "—"}.`,
      margin,
      y,
      pageW - margin * 2,
      110
    );

    footer();

    // ================================================================
    // WEALTH VELOCITY MODEL
    // ================================================================
    doc.addPage();
    pageNum++;
    sectionHeader("Wealth Velocity Model", "Milestones that change your behavior — not just your net worth.");

    y = 110;
    (autoTable as any)(doc, {
      startY: y,
      head: [["Milestone", "When (est.)", "Age", "Meaning"]],
      body: [250000, 500000, 750000, 1000000].map((t) => {
        const yy = yearsToTarget(investedStart, monthlyInvest, annualRate, t);
        const when = yy ? `${yy.toFixed(1)} yrs` : "—";
        const ageAt = yy ? `${(age + yy).toFixed(0)}` : "—";
        const meaning =
          t === 250000
            ? "You stop feeling fragile. You can walk away without panic."
            : t === 500000
            ? "Negotiation power. You can trade money for sanity."
            : t === 750000
            ? "Momentum becomes visible. Your choices expand."
            : "Dependency breaks. Work becomes a choice.";
        return [fmt(t), when, ageAt, meaning];
      }),
      theme: "grid",
      styles: { font: "helvetica", fontSize: 10, cellPadding: 6 },
      headStyles: { fillColor: [ACCENT.r, ACCENT.g, ACCENT.b], textColor: 255 },
      margin: { left: margin, right: margin },
    });

    y = (doc as any).lastAutoTable.finalY + 18;

    const velocityNarrative = yrsToTarget
      ? `At your current invest rate of ${fmt(monthlyInvest)}/mo and ${annualReturnPct.toFixed(1)}% annual return, you reach ${fmt(target)} in ${yrsToTarget.toFixed(1)} years — age ${ageAtTarget?.toFixed(0) ?? "—"}. Adding $500/mo compresses the timeline to ${plus500Txt}. The compounding advantage of consistent investing outweighs nearly any other variable.`
      : "Set a target amount to see your personalized velocity projections.";

    callout("Velocity Insight", velocityNarrative, margin, y, pageW - margin * 2, 100);

    y += 118;

    // ---- Freedom Number callout ----
    const fiDiff = fiNumber - target;
    const fiDiffPct = target > 0 ? Math.abs(fiDiff / fiNumber) * 100 : 0;
    const freedomNumberInsight =
      fiNumber <= 0
        ? "Enter your monthly expenses to calculate your personalised Freedom Number."
        : Math.abs(fiDiff) < fiNumber * 0.05
        ? `Your Freedom Number of ${fmt(target)} closely matches your calculated Freedom Number of ${fmt(fiNumber)} (annual expenses × 25). This is the portfolio size at which the 4% Safe Withdrawal Rate covers your full lifestyle indefinitely — without relying on a pay cheque. You are calibrated correctly.`
        : fiDiff > 0
        ? `Your calculated Freedom Number is ${fmt(fiNumber)} (${fmt(monthlyExpenses)}/mo × 12 × 25). Your current Freedom Number of ${fmt(target)} sits ${fiDiffPct.toFixed(0)}% below that. Consider raising your target to ${fmt(fiNumber)} so the engine measures true independence — not just a partial milestone.`
        : `Your Freedom Number of ${fmt(target)} is ${fiDiffPct.toFixed(0)}% above your 4%-rule Freedom Number of ${fmt(fiNumber)}. This gives you a conservative buffer — your portfolio could sustain your lifestyle even with lower-than-average returns. A strong position to target.`;

    const panelW2 = pageW - margin * 2;
    doc.setFillColor(245, 243, 255);
    doc.setDrawColor(139, 92, 246);
    doc.roundedRect(margin, y, panelW2, 10, 6, 6, "FD");
    doc.setFillColor(245, 243, 255);
    doc.setDrawColor(139, 92, 246);
    doc.roundedRect(margin, y, panelW2, 90, 6, 6, "FD");
    doc.setFillColor(139, 92, 246);
    doc.roundedRect(margin, y, 6, 90, 6, 6, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(88, 28, 135);
    doc.text("Your Freedom Number", margin + 16, y + 22);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9.5);
    doc.setTextColor(109, 40, 217);
    doc.text(`4% Rule: ${fmt(monthlyExpenses)}/mo × 12 × 25 = ${fmt(fiNumber)}`, margin + 16, y + 38);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9.5);
    doc.setTextColor(55, 48, 163);
    doc.text(doc.splitTextToSize(freedomNumberInsight, panelW2 - 26), margin + 16, y + 54);
    setRGB(INK);

    y += 104;

    footer();

    // ================================================================
    // CAREER SHOCK SIMULATION
    // ================================================================
    doc.addPage();
    pageNum++;
    sectionHeader("Career Shock Simulation", "What happens if the job changes before you're ready.");

    y = 110;
    const panelW = pageW - margin * 2;
    const panelH = 96;

    const scenarioPanel = (title: string, body: string) => {
      doc.setFillColor(SOFT_BG.r, SOFT_BG.g, SOFT_BG.b);
      doc.setDrawColor(BORDER.r, BORDER.g, BORDER.b);
      doc.roundedRect(margin, y, panelW, panelH, 12, 12, "FD");
      doc.setFillColor(ACCENT.r, ACCENT.g, ACCENT.b);
      doc.roundedRect(margin, y, 6, panelH, 12, 12, "F");
      doc.setFont("helvetica", "bold");
      doc.setFontSize(11);
      setRGB(INK);
      doc.text(title, margin + 16, y + 26);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(10);
      setRGB(MUTED);
      doc.text(doc.splitTextToSize(body, panelW - 26), margin + 16, y + 46);
      setRGB(INK);
      y += panelH + 14;
    };

    scenarioPanel(
      "Scenario: 6-month income loss",
      cashAfter6 >= 0
        ? `Cash stays positive at ${fmt(cashAfter6)} remaining. You absorb the shock with ${runwayMonths.toFixed(1)} months of coverage built in.`
        : `Cash goes negative. Shortfall: ${fmt(Math.abs(cashAfter6))}. You need ${fmt(Math.abs(cashAfter6))} more in savings to survive a 6-month disruption without liquidating investments.`
    );

    scenarioPanel(
      "Scenario: 12-month income loss",
      cashAfter12 >= 0
        ? `Survivable with discipline. ${fmt(cashAfter12)} remains. You have genuine resilience — most high earners would not survive a 12-month income gap.`
        : `High risk. Shortfall: ${fmt(Math.abs(cashAfter12))}. You would be forced to liquidate investments or take on debt. Build a true 12-month buffer over time.`
    );

    scenarioPanel(
      "Scenario: 30% pay cut",
      `Income drops from ${fmt(monthlyIncome)} to ${fmt(monthlyIncome * 0.7)}/mo. If expenses stay fixed at ${fmt(monthlyExpenses)}/mo, surplus drops from ${fmt(surplus)} to ${fmt(monthlyIncome * 0.7 - monthlyExpenses)}. ${monthlyIncome * 0.7 - monthlyExpenses < 0 ? "You enter deficit. Fixed costs become the primary enemy." : "You maintain positive surplus but investing slows significantly."}`
    );

    footer();

    // ================================================================
    // ACCELERATION SCENARIOS
    // ================================================================
    doc.addPage();
    pageNum++;
    sectionHeader("Acceleration Scenarios", "What actually changes the timeline.");

    y = 110;
    const saved500 = yrsToTarget && leverage?.needle?.plus500 ? `${(yrsToTarget - leverage.needle.plus500).toFixed(1)} yrs` : "—";
    const saved1000 = yrsToTarget && leverage?.needle?.plus1000 ? `${(yrsToTarget - leverage.needle.plus1000).toFixed(1)} yrs` : "—";
    (autoTable as any)(doc, {
      startY: y,
      head: [["Scenario", "Time to Target", "Yrs Saved", "Stress Impact"]],
      body: [
        ["Baseline (current)",        baseTxt,   "—",       "Baseline"],
        [`Invest +$500/mo`,           plus500Txt, saved500,  "Medium relief"],
        [`Invest +$1,000/mo`,         plus1000Txt, saved1000, "High relief"],
        ["Cut expenses 10%",          "Varies",   "Varies",  "High — reduces dependency"],
        ["Cut expenses 20%",          "Varies",   "Significant", "Very high"],
      ],
      theme: "grid",
      styles: { font: "helvetica", fontSize: 10, cellPadding: 7, overflow: "linebreak" },
      headStyles: { fillColor: [ACCENT.r, ACCENT.g, ACCENT.b], textColor: 255, fontStyle: "bold" },
      columnStyles: {
        0: { cellWidth: 130 },
        1: { cellWidth: 80,  halign: "center" },
        2: { cellWidth: 75,  halign: "center" },
        3: { cellWidth: "auto" },
      },
      margin: { left: margin, right: margin },
    });

    y = (doc as any).lastAutoTable.finalY + 18;

    callout(
      "The Highest Leverage Variable",
      `Your savings rate (currently ${savingsRate.toFixed(1)}%) and fixed-cost rigidity matter more than return assumptions. Moving from ${savingsRate.toFixed(0)}% to 25% savings rate on ${fmt(monthlyIncome)}/mo means investing ${fmt(monthlyIncome * 0.25)}/mo — ${fmt(monthlyIncome * 0.25 - monthlyInvest)} more than now. That single move compresses your timeline more than any market performance assumption.`,
      margin,
      y,
      pageW - margin * 2,
      110
    );

    footer();

    // ================================================================
    // 12-MONTH LEVERAGE PLAN — 4 phases, dollar-specific, per-month checkpoints
    // ================================================================

    // ---- Plan-level computed variables ----
    const runway9moCash       = monthlyExpenses * 9;
    const runwayGapTo9        = Math.max(0, runway9moCash - cashStart);
    const monthlySavingsFor9  = runwayGapTo9 > 0 ? Math.ceil(runwayGapTo9 / 6) : 0;
    const investTarget10pct   = Math.round(monthlyInvest * 1.1 / 50) * 50;
    const investTarget20pct   = Math.round(monthlyInvest * 1.2 / 50) * 50;
    const targetRatioPlan     = 0.04;
    const targetInvestedFor4pct = annualExpenses / targetRatioPlan;
    const dependencyGap       = Math.max(0, targetInvestedFor4pct - investedStart);
    const projAt3mo   = fvWithStart(investedStart, monthlyInvest, annualRate, 3  / 12);
    const projAt6mo   = fvWithStart(investedStart, monthlyInvest, annualRate, 6  / 12);
    const projAt9mo   = fvWithStart(investedStart, monthlyInvest, annualRate, 9  / 12);
    const projAt12mo  = fvWithStart(investedStart, monthlyInvest, annualRate, 12 / 12);
    const targetSavingsRate25 = monthlyIncome * 0.25;

    // ---- Helper: draw a numbered action card ----
    const drawPhaseActions = (
      actions: string[],
      accentCol: { r: number; g: number; b: number }
    ) => {
      actions.forEach((action, idx) => {
        const lines = doc.splitTextToSize(action, pageW - margin * 2 - 56);
        const blockH = lines.length * 13 + 24;
        if (y + blockH > pageH - 50) {
          footer();
          doc.addPage();
          pageNum++;
          y = 50;
        }
        doc.setFillColor(SOFT_BG.r, SOFT_BG.g, SOFT_BG.b);
        doc.setDrawColor(BORDER.r, BORDER.g, BORDER.b);
        doc.roundedRect(margin, y, pageW - margin * 2, blockH, 6, 6, "FD");
        doc.setFillColor(accentCol.r, accentCol.g, accentCol.b);
        doc.circle(margin + 16, y + blockH / 2, 9, "F");
        doc.setFont("helvetica", "bold");
        doc.setFontSize(9);
        doc.setTextColor(255, 255, 255);
        doc.text(String(idx + 1), margin + 16, y + blockH / 2 + 3.5, { align: "center" });
        doc.setFont("helvetica", "normal");
        doc.setFontSize(9.5);
        setRGB(INK);
        doc.text(lines, margin + 32, y + 15);
        y += blockH + 8;
      });
    };

    // ---- Helper: phase checkpoint table ----
    const drawCheckpointTable = (
      rows: string[][],
      headerColor: { r: number; g: number; b: number }
    ) => {
      if (y + 120 > pageH - 50) { footer(); doc.addPage(); pageNum++; y = 50; }
      y += 10;
      doc.setFont("helvetica", "bold"); doc.setFontSize(11); setRGB(INK);
      doc.text("Month-End Checkpoints", margin, y); y += 12;
      (autoTable as any)(doc, {
        startY: y,
        head: [["Month", "What to Check", "Target", "Status Signal"]],
        body: rows,
        theme: "striped",
        styles: { font: "helvetica", fontSize: 9.5, cellPadding: 6 },
        headStyles: { fillColor: [headerColor.r, headerColor.g, headerColor.b], textColor: 255, fontStyle: "bold" },
        columnStyles: { 0: { cellWidth: 60 }, 1: { cellWidth: "auto" }, 2: { cellWidth: 130 }, 3: { cellWidth: 90 } },
        margin: { left: margin, right: margin },
      });
      y = (doc as any).lastAutoTable.finalY + 12;
    };

    // ---- Helper: red-flag banner ----
    const drawRedFlag = (text: string) => {
      doc.setFont("helvetica", "normal"); doc.setFontSize(9.5);
      const wrapped = doc.splitTextToSize(text, pageW - margin * 2 - 24);
      const lineH = 13;
      const boxH = 22 + wrapped.length * lineH + 10;
      if (y + boxH > pageH - 50) { footer(); doc.addPage(); pageNum++; y = 50; }
      doc.setFillColor(254, 242, 242); doc.setDrawColor(252, 165, 165);
      doc.roundedRect(margin, y, pageW - margin * 2, boxH, 6, 6, "FD");
      doc.setFont("helvetica", "bold"); doc.setFontSize(9.5); doc.setTextColor(185, 28, 28);
      doc.text("Red Flag:", margin + 12, y + 16);
      doc.setFont("helvetica", "normal"); doc.setTextColor(127, 29, 29);
      doc.text(wrapped, margin + 12, y + 30);
      setRGB(INK); y += boxH + 12;
    };

    // ================================================================
    // OVERVIEW PAGE
    // ================================================================
    doc.addPage(); pageNum++;
    sectionHeader(
      displayName ? `${displayName}'s 12-Month Leverage Plan` : "12-Month Leverage Plan",
      "Four phases. Dollar-specific. Built from your exact numbers."
    );
    y = 110;

    (autoTable as any)(doc, {
      startY: y,
      head: [["Phase", "Timeframe", "Primary Goal", "Success Metric"]],
      body: [
        ["1 — Stabilize",  "Days 1-90",    "Secure the floor. Stop the bleed.",           `Runway >= 6 months (${fmt(monthlyExpenses * 6)})`],
        ["2 — Strengthen", "Months 3-6",   "Attack bottleneck. Raise score.",              breakdown.bottleneck.key === "runway" ? `Runway -> 9 months (${fmt(runway9moCash)})` : breakdown.bottleneck.key === "dependency" ? `Dep. ratio -> < 6%` : breakdown.bottleneck.key === "velocity" ? `Timeline -> < 10 yrs` : `6-mo shock covered`],
        ["3 — Accelerate", "Months 6-9",   "Compound gains. Raise invest rate.",          `Portfolio >= ${fmt(projAt9mo)}`],
        ["4 — Leverage",   "Months 9-12",  "Use your position. Work becomes a choice.",  `Score >= ${Math.min(100, breakdown.total + 15)}, Portfolio >= ${fmt(projAt12mo)}`],
      ],
      theme: "grid",
      styles: { font: "helvetica", fontSize: 9.5, cellPadding: 7 },
      headStyles: { fillColor: [ACCENT.r, ACCENT.g, ACCENT.b], textColor: 255, fontStyle: "bold" },
      columnStyles: { 0: { cellWidth: 95, fontStyle: "bold" }, 1: { cellWidth: 80, halign: "center" }, 2: { cellWidth: "auto" }, 3: { cellWidth: 140 } },
      margin: { left: margin, right: margin },
    });
    y = (doc as any).lastAutoTable.finalY + 18;

    // Bottleneck context
    doc.setFillColor(254, 242, 242); doc.setDrawColor(254, 202, 202);
    doc.roundedRect(margin, y, pageW - margin * 2, 72, 8, 8, "FD");
    doc.setFillColor(DANGER.r, DANGER.g, DANGER.b);
    doc.roundedRect(margin, y, 5, 72, 8, 8, "F");
    doc.setFont("helvetica", "bold"); doc.setFontSize(10.5); doc.setTextColor(185, 28, 28);
    doc.text("Primary Constraint: " + breakdown.bottleneck.name, margin + 14, y + 22);
    doc.setFont("helvetica", "normal"); doc.setFontSize(9.5); doc.setTextColor(127, 29, 29);
    doc.text(doc.splitTextToSize(`${breakdown.bottleneck.why} Every phase of this plan is sequenced to fix this constraint first — the largest per-effort score improvement available to you right now.`, pageW - margin * 2 - 24), margin + 14, y + 38);
    setRGB(INK); y += 86;

    // Snapshot stats for the plan
    doc.setFont("helvetica", "bold"); doc.setFontSize(11); setRGB(INK);
    doc.text("Your Starting Point", margin, y); y += 14;
    (autoTable as any)(doc, {
      startY: y,
      body: [
        ["Monthly Surplus", fmt(surplus), "Leverage Score", `${breakdown.total} / 100`],
        ["Current Runway", `${runwayMonths.toFixed(1)} months`, "Time to Freedom Number", baseTxt],
        ["Invested Assets", fmt(investedStart), "Monthly Invest Rate", fmt(monthlyInvest)],
        ["Savings Rate", `${savingsRate.toFixed(1)}%`, "Freedom Number", fmt(target)],
      ],
      theme: "plain",
      styles: { font: "helvetica", fontSize: 9.5, cellPadding: 5 },
      columnStyles: { 0: { fontStyle: "bold", cellWidth: 120 }, 1: { cellWidth: 110 }, 2: { fontStyle: "bold", cellWidth: 130 }, 3: { cellWidth: "auto" } },
      margin: { left: margin, right: margin },
    });
    y = (doc as any).lastAutoTable.finalY + 12;
    footer();

    // ================================================================
    // PHASE 1 — STABILIZE
    // ================================================================
    doc.addPage(); pageNum++;
    sectionHeader("Phase 1 (Days 1–90): Stabilize", "Secure the floor. Remove the worst risks. Build the habit.");
    y = 110;

    const p1Actions: string[] = [];
    if (surplus < 0) {
      p1Actions.push(`URGENT — Monthly deficit detected: you are burning ${fmt(Math.abs(surplus))}/mo. Identify your top 1–2 fixed costs and begin reducing them within 7 days. Every month of deficit delays every other goal in this plan.`);
    }
    p1Actions.push(`Audit every recurring charge within 7 days. Cancel or reduce subscriptions, unused services, and auto-renewals. Target: free up ${fmt(200)}–${fmt(500)}/mo with zero lifestyle impact.`);
    p1Actions.push(`Automate on payday: set a standing order for investing (${fmt(monthlyInvest)}/mo) and cash savings (${fmt(Math.max(50, monthlySavingsFor9))}/mo). Automation removes the decision — it is the single highest-leverage habit in this plan.`);
    if (runwayMonths < 6) {
      p1Actions.push(`Runway is ${runwayMonths.toFixed(1)} months — below the 6-month minimum. Target: ${fmt(monthlyExpenses * 6)} in cash. Gap: ${fmt(Math.max(0, monthlyExpenses * 6 - cashStart))}. At ${fmt(surplus > 0 ? surplus : 0)}/mo surplus, this takes ${monthsToCloseRunwayGap ?? "several"} months. Redirect ALL discretionary surplus to cash until the floor is met.`);
    } else {
      p1Actions.push(`Runway is ${runwayMonths.toFixed(1)} months — above the minimum. Protect it. Do not dip below ${fmt(monthlyExpenses * 6)} for any reason. The moment you touch this floor, everything else becomes harder.`);
    }
    if (breakdown.bottleneck.key === "runway") {
      p1Actions.push(`Open a dedicated high-yield savings account labelled "Runway Only". Fund it with ${fmt(monthlySavingsFor9 > 0 ? monthlySavingsFor9 : Math.ceil(surplus * 0.5))}/mo. Keeping it separate makes it psychologically protected — you will not spend what you cannot see.`);
    }
    if (breakdown.bottleneck.key === "dependency") {
      p1Actions.push(`Your dependency ratio is ${dependencyPct !== null ? `${dependencyPct.toFixed(1)}%` : "high"} — annual expenses of ${fmt(annualExpenses)} represent ${dependencyPct !== null ? `${dependencyPct.toFixed(1)}%` : "a high percentage"} of your ${fmt(investedStart)} invested base. Target: < 4%. Required investment base at current expenses: ${fmt(targetInvestedFor4pct)}. Gap: ${fmt(dependencyGap)}.`);
    }
    if (breakdown.bottleneck.key === "velocity") {
      p1Actions.push(`Your timeline to your Freedom Number is ${yrsToTarget ? `${yrsToTarget.toFixed(1)} years` : "not calculable at current invest rate"}. Phase 1 target: identify ${fmt(250)}/mo of additional investment capacity from audit savings alone — without touching lifestyle.`);
    }
    if (breakdown.bottleneck.key === "shock") {
      p1Actions.push(`Shock buffer is insufficient. A 6-month income loss would leave you with a shortfall of ${fmt(Math.max(0, monthlyExpenses * 6 - cashStart))}. Phase 1 priority: close this gap before increasing any investment rate. Cash now, investments later.`);
    }
    p1Actions.push(`Define your "minimum viable income" in writing: the lowest monthly income that covers fixed expenses only (${fmt(monthlyExpenses)}/mo). Knowing this number changes how you negotiate, take risk, and respond to stress.`);
    p1Actions.push(`Negotiate one fixed cost this quarter. Insurance premium, subscription bundle, interest rate, or utility plan. A ${fmt(150)}/mo reduction equals ${fmt(1800)}/yr — permanently — with zero investment required.`);

    drawPhaseActions(p1Actions, ACCENT);
    drawCheckpointTable([
      ["Month 1", "Cash balance / runway", `>= ${fmt(cashStart + Math.max(0, surplus))}`, "Green if runway rising"],
      ["Month 2", "Monthly surplus", `${fmt(surplus)}/mo or higher`, "Red if deficit appears"],
      ["Month 3", "Invest rate maintained", `${fmt(monthlyInvest)}/mo automated`, "Green if auto-transfer set"],
    ], ACCENT);
    drawRedFlag(`If runway has not increased after 30 days, lifestyle creep is absorbing your surplus. Run a card transaction audit week-by-week until the source is identified and eliminated.`);
    footer();

    // ================================================================
    // PHASE 2 — STRENGTHEN
    // ================================================================
    doc.addPage(); pageNum++;
    sectionHeader("Phase 2 (Months 3–6): Strengthen", "Attack your constraint. Raise your score. Build momentum.");
    y = 110;

    const p2Actions: string[] = [];
    if (breakdown.bottleneck.key === "runway") {
      p2Actions.push(`Push runway from 6 to 9 months. Target cash: ${fmt(runway9moCash)}. You are currently at ${fmt(cashStart)}. Gap: ${fmt(runwayGapTo9)}. Add ${fmt(monthlySavingsFor9)}/mo to your Runway account for 6 months. At month 9 of the overall plan, redirect this amount to investing.`);
      p2Actions.push(`The "promotion" moment: when runway crosses 8 months, celebrate it. Then redirect the monthly savings amount (${fmt(monthlySavingsFor9)}) into your investment account. This is the moment the plan shifts from defensive to offensive.`);
    }
    if (breakdown.bottleneck.key === "dependency") {
      p2Actions.push(`Dependency ratio is ${dependencyPct !== null ? `${dependencyPct.toFixed(1)}%` : "high"} — target is < 4%. Required invested base: ${fmt(targetInvestedFor4pct)}. Gap: ${fmt(dependencyGap)}. This is a multi-year gap — the monthly strategy is consistent contribution combined with expense discipline.`);
      p2Actions.push(`Raise monthly investment from ${fmt(monthlyInvest)} to ${fmt(investTarget10pct)} (+10%). At this rate, your 6-month projected portfolio: ${fmt(fvWithStart(investedStart, investTarget10pct, annualRate, 0.5))}. Every ${fmt(500)}/mo expense cut reduces both what you need from assets AND increases what you can invest — double leverage.`);
    }
    if (breakdown.bottleneck.key === "velocity") {
      p2Actions.push(`Current timeline to Freedom Number: ${yrsToTarget ? `${yrsToTarget.toFixed(1)} years` : "not projected"}. Adding +$500/mo: ${leverage?.needle?.plus500 ? `${leverage.needle.plus500.toFixed(1)} years` : "—"}. Adding +$1,000/mo: ${leverage?.needle?.plus1000 ? `${leverage.needle.plus1000.toFixed(1)} years` : "—"}. Your goal this phase: identify ${fmt(500)}/mo of additional investment capacity.`);
      p2Actions.push(`Savings rate is currently ${savingsRate.toFixed(1)}%. Moving to 25% on your income of ${fmt(monthlyIncome)}/mo means investing ${fmt(targetSavingsRate25)}/mo — ${fmt(Math.max(0, targetSavingsRate25 - monthlyInvest))} more than now. This is the single most impactful lever available without changing income.`);
    }
    if (breakdown.bottleneck.key === "shock") {
      p2Actions.push(`Shock buffer target: ${fmt(monthlyExpenses * 6)}. Gap: ${fmt(Math.max(0, monthlyExpenses * 6 - cashStart))}. Phase 2 target: add ${fmt(Math.ceil(Math.max(0, monthlyExpenses * 6 - cashStart) / 6))}/mo for 6 months to close the gap completely.`);
      p2Actions.push(`Build your layoff protocol this quarter: a written one-page plan covering what you do in days 1, 7, 30, and 60 if income stops. Having the plan eliminates panic-driven decisions. It exists so you never have to improvise under stress.`);
    }
    p2Actions.push(`Benchmark at the 3-month mark: savings rate should be at least 20% of income (${fmt(monthlyIncome * 0.2)}/mo). Currently tracking at ${fmt(monthlyInvest + Math.max(0, monthlySavingsFor9))}/mo (${(((monthlyInvest + Math.max(0, monthlySavingsFor9)) / Math.max(1, monthlyIncome)) * 100).toFixed(1)}%).`);
    p2Actions.push(`Conduct a "fixed cost audit": list every recurring expense, categorise as essential / reducible / eliminable. Target: reduce the reducible category by ${fmt(300)}/mo over this phase. Document and track every change.`);
    p2Actions.push(`At month 6, recalculate your Leverage Score. Your primary constraint (${breakdown.bottleneck.name}) should show measurable improvement. If it has not moved, the bottleneck is not receiving enough capital — adjust allocation.`);

    drawPhaseActions(p2Actions, { r: 124, g: 58, b: 237 });
    drawCheckpointTable([
      ["Month 4", "Bottleneck pillar score", `${breakdown.bottleneck.name}: improving`, "Green if points increased"],
      ["Month 5", "Monthly invest rate", `${fmt(investTarget10pct)}/mo`, "Red if still at baseline"],
      ["Month 6", "Portfolio value", `>= ${fmt(projAt6mo)}`, "Green if on/above trajectory"],
    ], { r: 124, g: 58, b: 237 });
    drawRedFlag(`If your Leverage Score has not increased by month 6, the bottleneck (${breakdown.bottleneck.name}) is still absorbing all gains. Re-audit expense allocation and confirm automated transfers are running correctly.`);
    footer();

    // ================================================================
    // PHASE 3 — ACCELERATE
    // ================================================================
    doc.addPage(); pageNum++;
    sectionHeader("Phase 3 (Months 6–9): Accelerate", "Compound the gains. Raise velocity. Build the engine.");
    y = 110;

    const p3Actions: string[] = [];
    p3Actions.push(`Portfolio check at month 6: target >= ${fmt(projAt6mo)}. If ahead of projection, increase monthly investment by ${fmt(Math.round(surplus * 0.15 / 50) * 50)} immediately to lock in the advantage. If behind, diagnose the variance before proceeding.`);
    p3Actions.push(`Raise monthly investment to ${fmt(investTarget20pct)} (+20% from baseline). At this rate with ${annualReturnPct.toFixed(1)}% annual return, your projected 12-month portfolio is ${fmt(fvWithStart(investedStart, investTarget20pct, annualRate, 1))} — ${fmt(fvWithStart(investedStart, investTarget20pct, annualRate, 1) - projAt12mo)} ahead of baseline trajectory.`);
    p3Actions.push(`Redirect all windfalls (bonus, tax refund, raise) directly to your Freedom Number gap. A ${fmt(10000)} lump sum at this stage saves approximately ${monthlyInvest > 0 ? (10000 / monthlyInvest).toFixed(1) : "several"} months of contributions at compound interest.`);
    p3Actions.push(`Review dependency ratio at month 9. Projected invested assets: ${fmt(projAt9mo)}. Projected annual withdrawal rate: ${((annualExpenses / Math.max(1, projAt9mo)) * 100).toFixed(1)}% (target: < 4%). Evaluate whether the trajectory closes the gap or requires a strategy adjustment.`);
    p3Actions.push(`If the primary constraint (${breakdown.bottleneck.name}) is resolved, identify the next weakest pillar. Fixing the first constraint often unlocks the second automatically — portfolio growth reduces dependency, which improves velocity simultaneously.`);
    p3Actions.push(`Begin planning leverage moves: a raise conversation, a remote arrangement, a role reconfiguration, or a project negotiation. With a stronger Leverage Score, you are negotiating from a fundamentally different position — calm instead of desperate.`);
    p3Actions.push(`Review your tax efficiency. At ${fmt(monthlyInvest)}/mo+ investment rate, tax-advantaged accounts (401k, IRA, HSA) should be fully utilised before taxable accounts. Unoptimised tax drag at this rate is material.`);

    drawPhaseActions(p3Actions, SUCCESS);
    drawCheckpointTable([
      ["Month 7", "Monthly invest rate", `${fmt(investTarget20pct)}/mo automated`, "Green if set"],
      ["Month 8", "Portfolio value", `>= ${fmt(fvWithStart(investedStart, investTarget20pct, annualRate, 8 / 12))}`, "Within 5% = on track"],
      ["Month 9", "Leverage Score", `>= ${Math.min(100, breakdown.total + 10)} pts`, "Re-run the calculator"],
    ], SUCCESS);
    drawRedFlag(`If invest rate is still at baseline by month 8, a fixed cost has quietly re-expanded. Run a new fixed cost audit. Lifestyle inflation is the most common reason momentum stalls in phase 3.`);
    footer();

    // ================================================================
    // PHASE 4 — LEVERAGE YOUR POSITION
    // ================================================================
    doc.addPage(); pageNum++;
    sectionHeader("Phase 4 (Months 9–12): Leverage Your Position", "Use what you've built. Work becomes a choice, not a requirement.");
    y = 110;

    const p4Actions: string[] = [];
    p4Actions.push(`Month 12 portfolio projection: ${fmt(projAt12mo)}. Annual withdrawal rate at this level: ${((annualExpenses / Math.max(1, projAt12mo)) * 100).toFixed(1)}% (target: < 4%). Freedom Number gap remaining: ${fmt(Math.max(0, target - projAt12mo))}. You are ${((projAt12mo / Math.max(1, target)) * 100).toFixed(1)}% of the way there.`);
    p4Actions.push(`Negotiate from your new position. With runway of ${runwayMonths.toFixed(1)} months and a Leverage Score of ${breakdown.total}+, you can credibly pursue flexible hours, remote arrangements, compensation restructuring, or a role change — without financial desperation driving the outcome.`);
    p4Actions.push(`Write your "Recovery Window" document: a clear 30/60/90-day plan for what you do if income stops. Document your fixed expenses (${fmt(monthlyExpenses)}/mo), minimum viable income, income sources you can activate, and decisions you would make in sequence. The plan exists so you never improvise under stress.`);
    p4Actions.push(`Lock in the year-2 investment plan before month 12 ends. Goal: invest rate of ${fmt(investTarget20pct)}/mo sustained, Freedom Number timeline trending toward ${yrsToTarget ? `${Math.max(1, yrsToTarget - 1).toFixed(0)} years` : "your original estimate"} or better. Commit to a specific number in writing.`);
    p4Actions.push(`Protect everything you have built. Review income protection insurance, life insurance, and health coverage. The greatest risk to a financial leverage plan is not market performance — it is a single uninsured life event that forces asset liquidation or debt.`);
    p4Actions.push(`Schedule your year-2 review for month 13. Recalculate your Leverage Score, update your Freedom Number (expenses may have changed), and set 4 phase goals for the next 12 months. The engine compounds — your year-2 score should be materially higher if this plan was executed.`);
    p4Actions.push(`Consider your "optionality moves": the career choices that become available once your score reaches 65+. Remote work, sabbatical negotiation, project-based work, or income diversification. Write 2–3 options down. Knowing they exist changes how you show up every day.`);

    drawPhaseActions(p4Actions, WARN);
    drawCheckpointTable([
      ["Month 10", "Freedom Number gap", `Closing steadily`, "Red if gap is widening"],
      ["Month 11", "Fixed cost ratio", `< 80% of income`, "Red if creep detected"],
      ["Month 12", "Leverage Score",   `>= ${Math.min(100, breakdown.total + 15)} pts`, "Run full recalculation"],
    ], WARN);

    // ---- Monthly portfolio projection table ----
    if (y + 200 > pageH - 50) { footer(); doc.addPage(); pageNum++; y = 50; }
    y += 10;
    doc.setFont("helvetica", "bold"); doc.setFontSize(11); setRGB(INK);
    doc.text("Month-by-Month Portfolio Projection (Baseline)", margin, y); y += 14;
    (autoTable as any)(doc, {
      startY: y,
      head: [["Month", "Projected Portfolio", "Gap to Freedom Number", "% of Goal", "Withdrawal Rate"]],
      body: Array.from({ length: 12 }, (_, i) => {
        const mo = i + 1;
        const proj = fvWithStart(investedStart, monthlyInvest, annualRate, mo / 12);
        const gap  = Math.max(0, target - proj);
        const pct  = target > 0 ? `${((proj / target) * 100).toFixed(1)}%` : "—";
        const wdr  = proj > 0   ? `${((annualExpenses / proj) * 100).toFixed(1)}%` : "—";
        return [`Month ${mo}`, fmt(proj), target > 0 ? fmt(gap) : "—", pct, wdr];
      }),
      theme: "striped",
      styles: { font: "helvetica", fontSize: 9, cellPadding: 5 },
      headStyles: { fillColor: [ACCENT.r, ACCENT.g, ACCENT.b], textColor: 255, fontStyle: "bold" },
      columnStyles: {
        0: { cellWidth: 60 },
        1: { cellWidth: 110, halign: "right" },
        2: { cellWidth: 130, halign: "right" },
        3: { cellWidth: 65, halign: "center" },
        4: { cellWidth: 85, halign: "center" },
      },
      margin: { left: margin, right: margin },
    });
    y = (doc as any).lastAutoTable.finalY + 12;
    drawRedFlag(`If your month-12 portfolio is more than 10% below projection, identify the cause: reduced invest rate, missed contributions, or unexpected cash withdrawals. Do not adjust the Freedom Number downward to compensate — adjust the plan upward.`);
    footer();

    // ================================================================
    // OPERATOR MANDATE
    // ================================================================
    doc.addPage();
    pageNum++;
    sectionHeader(
      displayName ? `${displayName}'s Operator Mandate` : "OPERATOR MANDATE",
      "Close the loop. Keep it simple."
    );

    doc.setFont("helvetica", "bold");
    doc.setFontSize(24);
    setRGB(INK);
    doc.text(["You do not need to retire early.", "You need to remove dependency."], margin, 170);

    doc.setDrawColor(ACCENT.r, ACCENT.g, ACCENT.b);
    doc.setLineWidth(2);
    doc.line(margin, 216, pageW - margin, 216);
    doc.setLineWidth(1);

    const mandateStats = [
      [`Freedom Number`, fmt(target)],
      [`Timeline`, baseTxt],
      [`Age at Target`, ageAtTarget ? `${ageAtTarget.toFixed(0)}` : "—"],
      [`Leverage Class`, leverageLabel],
      [`Primary Constraint`, bottleneck],
      [`Monthly Surplus`, fmt(surplus)],
      [`Savings Rate`, `${savingsRate.toFixed(1)}%`],
      [`FI Number (4% SWR)`, fmt(fiNumber)],
    ];

    let statY = 244;
    mandateStats.forEach(([label, value]) => {
      doc.setFont("helvetica", "normal");
      doc.setFontSize(10);
      setRGB(MUTED);
      doc.text(label, margin, statY);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(10);
      setRGB(INK);
      doc.text(value, margin + 180, statY);
      statY += 22;
    });

    doc.setDrawColor(BORDER.r, BORDER.g, BORDER.b);
    doc.line(margin, statY + 4, pageW - margin, statY + 4);

    doc.setFont("helvetica", "italic");
    doc.setFontSize(11);
    setRGB(MUTED);
    const mandateLines = doc.splitTextToSize(
      `The fastest path to financial freedom is not picking better stocks — it is eliminating the conditions that make you feel trapped. Fix ${breakdown.bottleneck.name.toLowerCase()}, then repeat.`,
      pageW - margin * 2
    );
    doc.text(mandateLines, margin, statY + 24);

    footer();

    // ================================================================
    // FINANCIAL GLOSSARY
    // ================================================================
    doc.addPage();
    pageNum++;
    sectionHeader("Financial Glossary", "Every term used in this report — defined clearly and in context.");

    y = 108;
    const termColW = pageW - margin * 2;
    const termPad = 12;
    const termLabelH = 14;

    for (const item of GLOSSARY_TERMS) {
      const defLines = doc.splitTextToSize(`Definition: ${item.def}`, termColW - termPad * 2);
      const scenLines = doc.splitTextToSize(`In practice: ${item.scenario}`, termColW - termPad * 2);
      const blockH = termLabelH + defLines.length * 13 + scenLines.length * 13 + termPad * 2 + 6;

      if (y + blockH > pageH - 40) {
        footer();
        doc.addPage();
        pageNum++;
        y = 40;
      }

      // Card background
      doc.setFillColor(SOFT_BG.r, SOFT_BG.g, SOFT_BG.b);
      doc.setDrawColor(BORDER.r, BORDER.g, BORDER.b);
      doc.roundedRect(margin, y, termColW, blockH, 8, 8, "FD");

      // Accent strip
      doc.setFillColor(ACCENT.r, ACCENT.g, ACCENT.b);
      doc.roundedRect(margin, y, 5, blockH, 8, 8, "F");

      // Term label
      doc.setFont("helvetica", "bold");
      doc.setFontSize(11);
      setRGB(INK);
      doc.text(item.term, margin + termPad, y + termPad + 6);

      // Definition
      doc.setFont("helvetica", "normal");
      doc.setFontSize(9);
      setRGB(MUTED);
      doc.text(defLines, margin + termPad, y + termPad + termLabelH + 6);

      // Scenario
      doc.setFont("helvetica", "italic");
      doc.setFontSize(9);
      doc.setTextColor(ACCENT.r, ACCENT.g, ACCENT.b);
      doc.text(scenLines, margin + termPad, y + termPad + termLabelH + defLines.length * 13 + 12);

      setRGB(INK);
      y += blockH + 10;
    }

    footer();

    // ── Resilience Report (Stress Test add-on) ────────────────────────────
    if (stressTestUnlocked && stressTest) {
      doc.addPage();
      pageNum++;
      sectionHeader("Resilience Report — Stress Test", "Five financial shock scenarios modeled to your exact inputs.");
      let sy = 110;

      doc.setFont("helvetica", "normal"); doc.setFontSize(10); setRGB(MUTED);
      const introLines = doc.splitTextToSize(
        "Each scenario uses your actual numbers — not averages or assumptions. Status is SURVIVES, AT_RISK, or CRITICAL based on whether your cash position and investment trajectory hold under each condition.",
        pageW - margin * 2
      );
      doc.text(introLines, margin, sy);
      sy += introLines.length * 13 + 16;

      const statusRGB = (s: "SURVIVES" | "AT_RISK" | "CRITICAL") =>
        s === "SURVIVES" ? SUCCESS : s === "AT_RISK" ? WARN : DANGER;

      const scenarios = [
        stressTest.layoff, stressTest.marketCrash, stressTest.medical,
        stressTest.careerPivot, stressTest.lifestyleCreep,
      ];

      for (const sc of scenarios) {
        doc.setFont("helvetica", "normal"); doc.setFontSize(9);
        const actionLines = doc.splitTextToSize(`Action: ${sc.action}`, pageW - margin * 2 - 24);
        const cardH = 26 + 18 + sc.numbers.length * 16 + actionLines.length * 13 + 20;
        sy = ensureRoom(sy, cardH + 14);

        const col = statusRGB(sc.status);
        doc.setFillColor(SOFT_BG.r, SOFT_BG.g, SOFT_BG.b);
        doc.setDrawColor(BORDER.r, BORDER.g, BORDER.b);
        doc.roundedRect(margin, sy, pageW - margin * 2, cardH, 8, 8, "FD");
        doc.setFillColor(col.r, col.g, col.b);
        doc.roundedRect(margin, sy, 5, cardH, 8, 8, "F");

        doc.setFont("helvetica", "bold"); doc.setFontSize(11); setRGB(INK);
        doc.text(sc.name, margin + 16, sy + 20);

        doc.setFont("helvetica", "bold"); doc.setFontSize(9);
        doc.setTextColor(col.r, col.g, col.b);
        doc.text(sc.status, pageW - margin - doc.getTextWidth(sc.status), sy + 20);

        doc.setFont("helvetica", "normal"); doc.setFontSize(10); setRGB(MUTED);
        doc.text(sc.headline, margin + 16, sy + 36);

        const numW = (pageW - margin * 2 - 24) / Math.max(1, sc.numbers.length);
        sc.numbers.forEach((n, i) => {
          const nx = margin + 16 + i * numW;
          doc.setFont("helvetica", "normal"); doc.setFontSize(8); setRGB(MUTED);
          doc.text(n.label, nx, sy + 52);
          doc.setFont("helvetica", "bold"); doc.setFontSize(10); setRGB(INK);
          doc.text(n.value, nx, sy + 64);
        });

        const actionY = sy + 52 + sc.numbers.length * 16;
        doc.setFont("helvetica", "italic"); doc.setFontSize(9);
        doc.setTextColor(ACCENT.r, ACCENT.g, ACCENT.b);
        doc.text(actionLines, margin + 16, actionY);

        setRGB(INK);
        sy += cardH + 14;
      }

      footer();
    }

    const fileSafeDate = new Date().toISOString().slice(0, 10);
    doc.save(`Leverage-Blueprint-${fileSafeDate}.pdf`);
  };

  const handleGeneratePdf = async () => {
    if (!hasInputs) return;
    setIsGenerating(true);
    // Allow React to render the loading state before the synchronous PDF generation blocks the thread
    await new Promise((resolve) => setTimeout(resolve, 60));
    try {
      generateLeverageBlueprintPdf();
      setBlueprintDownloaded(true);
      try { localStorage.setItem("ee_blueprint_downloaded", "1"); } catch {}
      const snap = {
        date: new Date().toISOString(),
        score: leverage.total,
        bottleneckKey: leverage.bottleneck.key,
      };
      // Persist for next session's delta comparison — do NOT update lastSnapshot state,
      // so it keeps reflecting the previous download's score for the current-session delta.
      try { localStorage.setItem(EE_SNAPSHOT_KEY, JSON.stringify(snap)); } catch {}
    } finally {
      setIsGenerating(false);
    }
  };

  const bgRef = React.useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const el = bgRef.current;
    if (!el) return;

    let raf = 0;

    const onMove = (e: PointerEvent) => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;

        const x = e.clientX / window.innerWidth;
        const y = e.clientY / window.innerHeight;

        const dx = (x - 0.5) * 40;
        const dy = (y - 0.5) * 40;

        el.style.setProperty("--dx", `${dx}px`);
        el.style.setProperty("--dy", `${dy}px`);
      });
    };

    window.addEventListener("pointermove", onMove, { passive: true });
    return () => {
      window.removeEventListener("pointermove", onMove);
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);

  return (
    <div className="min-h-screen text-zinc-900 relative overflow-hidden bg-gradient-to-br from-blue-50 via-purple-50 to-indigo-50">
      <div className="absolute inset-0 -z-10 bg-gradient-to-br from-blue-100 via-purple-100 to-indigo-100 opacity-60 animate-gradient" />

      <header className="sticky top-0 z-30 border-b border-white/40 bg-white/50 backdrop-blur-xl">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
          <div className="flex items-center gap-2">
            <div className="grid h-9 w-9 place-items-center rounded-2xl bg-gradient-to-br from-indigo-950 via-blue-950 to-purple-950 ring-1 ring-white/10 ee-logo-glow">
              <svg
                viewBox="0 0 24 24"
                fill="none"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="h-5 w-5"
              >
                <defs>
                  <linearGradient id="ee-brain-grad" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor="#818cf8" />
                    <stop offset="100%" stopColor="#c084fc" />
                  </linearGradient>
                  <linearGradient id="ee-line-grad" gradientUnits="userSpaceOnUse" x1="7.5" y1="15" x2="15.5" y2="9.5">
                    <stop offset="0%" stopColor="#60a5fa" />
                    <stop offset="100%" stopColor="#34d399" />
                  </linearGradient>
                </defs>
                {/* Left hemisphere */}
                <path
                  d="M12 5C9.5 5 7 7 7 10C7 11.5 6.2 12.5 5.5 13.5C4.8 14.8 5.5 16.2 7 16.5L12 17"
                  stroke="url(#ee-brain-grad)"
                  strokeWidth="1.5"
                  className="ee-logo-brain"
                />
                {/* Right hemisphere */}
                <path
                  d="M12 5C14.5 5 17 7 17 10C17 11.5 17.8 12.5 18.5 13.5C19.2 14.8 18.5 16.2 17 16.5L12 17"
                  stroke="url(#ee-brain-grad)"
                  strokeWidth="1.5"
                  className="ee-logo-brain"
                />
                {/* Center hairline */}
                <line x1="12" y1="5" x2="12" y2="17" stroke="#6366f1" strokeWidth="0.7" strokeOpacity="0.3" />
                {/* Ascending line — calm financial clarity */}
                <polyline
                  points="7.5,15 9.5,12 11.5,13.2 15.5,9.5"
                  stroke="url(#ee-line-grad)"
                  strokeWidth="1.8"
                  className="ee-logo-draw"
                />
              </svg>
            </div>
            <div
              ref={bgRef}
              className="absolute inset-0 -z-10"
              style={
                {
                  ["--dx" as any]: "0px",
                  ["--dy" as any]: "0px",
                } as React.CSSProperties
              }
            >
              <div className="absolute inset-0 bg-gradient-to-br from-blue-100 via-purple-100 to-indigo-100 opacity-60" />
              <div className="absolute inset-0 overflow-hidden">
                <div
                  className="absolute -top-48 -left-48 h-[520px] w-[520px] rounded-full bg-blue-300/50 blur-[120px]"
                  style={{ transform: "translate3d(var(--dx), var(--dy), 0)" }}
                />
                <div
                  className="absolute -bottom-56 -right-56 h-[560px] w-[560px] rounded-full bg-purple-300/50 blur-[130px]"
                  style={{ transform: "translate3d(calc(var(--dx) * -0.9), calc(var(--dy) * -0.9), 0)" }}
                />
                <div
                  className="absolute top-[28%] left-[55%] h-[420px] w-[420px] rounded-full bg-indigo-300/40 blur-[120px]"
                  style={{ transform: "translate3d(calc(var(--dx) * 0.7), calc(var(--dy) * 0.7), 0)" }}
                />
              </div>
              <div className="absolute inset-0 opacity-[0.06] [background-image:radial-gradient(#000_1px,transparent_1px)] [background-size:24px_24px]" />
            </div>
            <div>
              <div className="text-sm font-semibold leading-tight">
                EQUANIMITY ENGINE
              </div>
              <div className="text-xs text-zinc-500">
                Financial leverage for high earners who want freedom before retirement
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2 no-print">
            <button
              onClick={() => { setTutorialStep(0); setShowTutorial(true); }}
              className="grid h-8 w-8 place-items-center rounded-full border border-zinc-200 bg-white text-zinc-500 hover:border-zinc-300 hover:text-zinc-800 transition-all text-sm font-semibold shadow-sm"
              title="How it works"
            >
              ?
            </button>
            <Button
              className="bg-blue-600 text-white hover:bg-blue-700 shadow-lg hover:shadow-xl transition-all duration-200"
              onClick={() => scrollTo("plan")}
            >
              Get My Plan
            </Button>
          </div>
        </div>
      </header>

      {/* Hero — embedded in page background */}
      <section
        ref={heroRef}
        className="relative overflow-hidden border-b border-white/30"
      >
        {/* Ambient blobs */}
        <div className="pointer-events-none absolute inset-0 -z-10">
          <div className="absolute -top-40 -left-40 h-[560px] w-[560px] rounded-full bg-blue-300/45 blur-[130px]" />
          <div className="absolute -bottom-40 -right-40 h-[560px] w-[560px] rounded-full bg-purple-300/45 blur-[130px]" />
          <div className="absolute top-[15%] left-[52%] h-[420px] w-[420px] rounded-full bg-indigo-300/35 blur-[110px]" />
          <div className="absolute inset-0 opacity-[0.045] [background-image:radial-gradient(#000_1px,transparent_1px)] [background-size:24px_24px]" />
        </div>

        <div className="mx-auto max-w-6xl px-4 py-20 text-center">
          <h1
            className={`ee-reveal ee-delay-1 text-4xl sm:text-5xl font-bold leading-tight max-w-3xl mx-auto text-zinc-900 ${
              heroInView ? "ee-on" : ""
            }`}
          >
            You don't want to{" "}
            <span className="gradient-shimmer bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 bg-clip-text text-transparent">
              retire
            </span>{" "}
            early.
            <br />
            You want to stop needing your{" "}
            <span className="gradient-shimmer bg-gradient-to-r from-indigo-600 via-purple-600 to-blue-600 bg-clip-text text-transparent">
              job
            </span>.
          </h1>

          <p
            className={`ee-reveal ee-delay-2 mt-5 text-lg text-zinc-500 max-w-2xl mx-auto ${
              heroInView ? "ee-on" : ""
            }`}
          >
            Measure your runway, model income shocks, and build financial leverage — so your
            wellbeing isn't tied to your next performance cycle.
          </p>

          <div
            className={`ee-reveal ee-delay-3 mt-8 flex justify-center gap-3 flex-wrap ${
              heroInView ? "ee-on" : ""
            }`}
          >
            <Button
              className="bg-blue-600 text-white hover:bg-blue-700 shadow-lg"
              onClick={() => scrollTo("calculator")}
            >
              Calculate My Leverage Score
            </Button>
            <Button variant="outline" onClick={() => scrollTo("plan")}>
              Get Your Personalised Blueprint — $197
            </Button>
          </div>
        </div>

        {/* fade-out at the bottom so it dissolves into the page */}
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-24 bg-gradient-to-b from-transparent to-blue-50/60" />
      </section>

      <main className="mx-auto max-w-6xl px-4 py-6">
        {paymentSuccess && (
          <div className="mb-6 overflow-hidden rounded-2xl shadow-lg">
            <div className="relative bg-gradient-to-r from-violet-600 via-indigo-600 to-purple-600 p-px">
              <div className="relative rounded-2xl bg-gradient-to-br from-zinc-950 via-zinc-900 to-zinc-950 px-6 py-5">
                <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-violet-400/60 to-transparent" />
                <div className="flex flex-wrap items-center justify-between gap-4">
                  <div className="flex items-center gap-4">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-emerald-500/15 ring-1 ring-emerald-500/30">
                      <svg className="h-5 w-5 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                    </div>
                    <div>
                      <div className="text-sm font-semibold tracking-wide text-white">
                        Payment confirmed — Blueprint unlocked
                      </div>
                      <div className="mt-0.5 text-xs text-zinc-400">
                        {hasInputs
                          ? "Your Leverage Blueprint is ready. Scroll down to generate and download your personalised PDF."
                          : "Enter your numbers in the calculator below, then scroll down to generate your personalised Blueprint."}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => scrollTo("plan")}
                      className="rounded-lg bg-violet-600 px-4 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-violet-500 active:scale-95"
                    >
                      Go to Blueprint
                    </button>
                    <button
                      onClick={clearSuccessFlag}
                      className="rounded-lg border border-zinc-700 px-4 py-2 text-xs font-medium text-zinc-400 transition hover:border-zinc-500 hover:text-zinc-200 active:scale-95"
                    >
                      Dismiss
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* 2. Calculator */}
        <div id="calculator" className="grid gap-4 lg:grid-cols-3 mb-12">
          <ColorCard tone="amber" className="lg:col-span-1">
            <CardContent>
              <div className="mb-4 flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Calculator className="h-5 w-5" />
                  <div className="text-sm font-semibold">Your inputs</div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="text-[10px] text-zinc-400"><span className="text-red-500">*</span> Required</div>
                  <button
                    onClick={() => { setResetModal("inputs"); setFullResetConfirm(false); }}
                    className="text-[10px] text-zinc-400 underline underline-offset-2 decoration-dotted hover:text-zinc-600 transition-colors"
                  >
                    Reset
                  </button>
                </div>
              </div>

              <div className="grid gap-4">
                <div>
                  <Label>First name</Label>
                  <input
                    type="text"
                    value={userName}
                    onChange={(e) => setUserName(e.target.value)}
                    placeholder="e.g. Alex"
                    className="w-full rounded-2xl border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-zinc-200"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label required>Age</Label>
                    <NumericInput value={age} onCommit={setAge} min={18} max={90} />
                  </div>
                  <div>
                    <Label required>Starting invested</Label>
                    <NumericInput value={investedStart} onCommit={setInvestedStart} min={0} />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label required>Emergency fund (cash)</Label>
                    <NumericInput value={cashStart} onCommit={setCashStart} min={0} />
                  </div>
                  <div>
                    <Label required>Monthly invest</Label>
                    <NumericInput value={monthlyInvest} onCommit={setMonthlyInvest} min={0} />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label required>Monthly income</Label>
                    <NumericInput value={monthlyIncome} onCommit={setMonthlyIncome} min={0} />
                  </div>
                  <div>
                    <Label required>Monthly expenses</Label>
                    <NumericInput value={monthlyExpenses} onCommit={setMonthlyExpenses} min={0} />
                  </div>
                </div>

                <Separator />

                <div>
                  <div className="flex items-center justify-between">
                    <Label required>Assumed annual return</Label>
                    <div className="text-xs text-zinc-500">
                      {annualReturnPct.toFixed(1)}%
                    </div>
                  </div>
                  <input
                    className="mt-2 w-full"
                    type="range"
                    min={0}
                    max={12}
                    step={0.1}
                    value={annualReturnPct}
                    onChange={(e) => setAnnualReturnPct(clamp(Number(e.target.value), 0, 12))}
                  />
                </div>

                <div>
                  <Label required>Projection years</Label>
                  <NumericInput value={years} onCommit={setYears} min={1} max={40} />
                </div>

                {/* Milestone Ladder — Equanimity + Freedom */}
                <div className="relative overflow-hidden rounded-2xl border border-zinc-200/80 bg-white shadow-sm">
                  {/* Ambient glows */}
                  <div className="pointer-events-none absolute -right-6 -top-6 h-28 w-28 rounded-full bg-violet-200/20 blur-3xl" />
                  <div className="pointer-events-none absolute -bottom-6 -left-6 h-28 w-28 rounded-full bg-amber-200/20 blur-3xl" />

                  {/* Card header */}
                  <div className="border-b border-zinc-100 px-4 pt-4 pb-3">
                    <div className="flex items-center justify-between">
                      <div className="text-xs font-semibold text-zinc-700">Your Two Milestones</div>
                      <div className="text-[9px] text-zinc-400 leading-tight text-right">Based on spending,<br/>not salary</div>
                    </div>
                    {monthlyExpenses === 0 && (
                      <p className="mt-1.5 text-[10px] text-zinc-400">Enter your monthly expenses above to see your personalised milestones.</p>
                    )}
                  </div>

                  {/* ── MILESTONE 1: Equanimity Number ── */}
                  <div className="px-4 pt-3 pb-3 border-b border-zinc-100">
                    <div className="flex items-start justify-between gap-2 mb-1">
                      <div className="flex items-center gap-1.5">
                        <div className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-violet-100 text-[9px] font-bold text-violet-700">1</div>
                        <span className="text-[10px] font-semibold uppercase tracking-widest text-violet-700">Equanimity Number</span>
                      </div>
                      {monthlyExpenses > 0 && (
                        <span className="text-base font-bold text-violet-800 leading-none">{fmt(monthlyExpenses * 12 * 10)}</span>
                      )}
                    </div>
                    <p className="text-[10px] leading-snug text-zinc-400 mb-2">
                      The milestone where financial anxiety fades and real options begin. At this point passive income covers <span className="font-medium text-zinc-500">~40% of your expenses</span> — enough to negotiate, pivot, or pause without fear.
                    </p>
                    {monthlyExpenses > 0 && (
                      <>
                        <div className="mb-1 flex items-center justify-between text-[10px]">
                          <span className="text-zinc-400">4% withdrawal → <span className="font-medium text-violet-700">{fmt(Math.round(monthlyExpenses * 12 * 10 * 0.04 / 12))}/mo</span></span>
                          {investedStart > 0 && (
                            <span className="font-medium text-zinc-500">
                              {investedStart >= monthlyExpenses * 12 * 10
                                ? "✓ Reached"
                                : `${Math.min(100, Math.round(investedStart / (monthlyExpenses * 12 * 10) * 100))}%`}
                            </span>
                          )}
                        </div>
                        {investedStart > 0 && (
                          <div className="h-1.5 overflow-hidden rounded-full bg-violet-100">
                            <div
                              className="h-full rounded-full bg-gradient-to-r from-violet-400 to-violet-500 transition-all duration-700 ease-out"
                              style={{ width: `${Math.min(100, investedStart / (monthlyExpenses * 12 * 10) * 100)}%` }}
                            />
                          </div>
                        )}
                      </>
                    )}
                  </div>

                  {/* ── MILESTONE 2: Freedom Number ── */}
                  <div className="px-4 pt-3 pb-4">
                    <div className="flex items-start justify-between gap-2 mb-1">
                      <div className="flex items-center gap-1.5">
                        <div className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-amber-100 text-[9px] font-bold text-amber-700">2</div>
                        <span className="text-[10px] font-semibold uppercase tracking-widest text-amber-700">
                          <Label required>Freedom Number</Label>
                        </span>
                      </div>
                      {target > 0 && (
                        <span className="text-base font-bold text-amber-800 leading-none">{fmt(target)}</span>
                      )}
                    </div>
                    <p className="text-[10px] leading-snug text-zinc-400 mb-2.5">
                      The portfolio that pays your expenses forever. Work becomes permanently optional — not one day, <span className="font-medium text-zinc-500">on your terms</span>.
                    </p>

                    {/* Suggested value */}
                    {monthlyExpenses > 0 && target === 0 && (
                      <div className="mb-2.5 rounded-xl border border-amber-200/80 bg-amber-50/60 px-3 py-2">
                        <div className="flex items-center justify-between gap-2">
                          <div>
                            <div className="text-[9px] text-amber-600/70 font-medium mb-0.5">Suggested · 25× annual expenses</div>
                            <div className="text-sm font-bold text-amber-800">{fmt(monthlyExpenses * 12 * 25)}</div>
                            <div className="text-[9px] text-zinc-400 mt-0.5">= {fmt(Math.round(monthlyExpenses * 12 * 25 * 0.04 / 12))}/mo passive — covers your {fmt(monthlyExpenses)}/mo ✓</div>
                          </div>
                          <button
                            onClick={() => setTarget(monthlyExpenses * 12 * 25)}
                            className="shrink-0 rounded-lg bg-amber-500 px-3 py-1.5 text-[10px] font-semibold text-white shadow-sm transition hover:bg-amber-600 active:scale-95"
                          >
                            Use this
                          </button>
                        </div>
                      </div>
                    )}

                    <NumericInput value={target} onCommit={setTarget} min={0} />

                    {target > 0 && (
                      <div className="mt-2.5 space-y-2">
                        <div className="flex items-center justify-between text-[10px]">
                          <span className="text-zinc-400">4% withdrawal → <span className="font-medium text-amber-700">{fmt(Math.round(target * 0.04 / 12))}/mo</span></span>
                          {monthlyExpenses > 0 && (
                            Math.round(target * 0.04 / 12) >= monthlyExpenses
                              ? <span className="text-emerald-600 font-medium text-[10px]">✓ covers expenses</span>
                              : <span className="text-amber-600 text-[10px]">short {fmt(monthlyExpenses - Math.round(target * 0.04 / 12))}/mo</span>
                          )}
                        </div>
                        {investedStart > 0 && (
                          <>
                            <div className="flex items-center justify-between text-[10px]">
                              <span className="text-zinc-500 font-medium">
                                {investedStart >= target ? "🎯 Freedom reached" : `${Math.min(100, Math.round(investedStart / target * 100))}% to full freedom`}
                              </span>
                              <span className="text-zinc-400">{fmt(investedStart)} of {fmt(target)}</span>
                            </div>
                            <div className="h-1.5 overflow-hidden rounded-full bg-amber-100">
                              <div
                                className="h-full rounded-full bg-gradient-to-r from-amber-400 via-orange-400 to-amber-500 transition-all duration-700 ease-out"
                                style={{ width: `${Math.min(100, investedStart / target * 100)}%` }}
                              />
                            </div>
                            {investedStart < target && (
                              <p className="text-[10px] text-zinc-400">
                                <span className="font-medium text-zinc-500">{fmt(target - investedStart)}</span> to build — your Blueprint maps the exact path.
                              </p>
                            )}
                          </>
                        )}
                      </div>
                    )}

                    {target === 0 && monthlyExpenses === 0 && (
                      <p className="text-[10px] text-zinc-400 leading-snug">
                        Enter monthly expenses above to see your suggested number. Based on <span className="font-medium text-zinc-500">spending</span>, not salary.
                      </p>
                    )}
                  </div>
                </div>

                <div
                  className={`rounded-2xl p-4 text-white transition-colors duration-300 ${
                    surplus >= 0 ? "bg-green-600" : "bg-red-600"
                  }`}
                >
                  <div className="text-xs opacity-90">Current monthly surplus</div>
                  <div className="mt-1 text-2xl font-semibold">{fmt(surplus)}</div>
                  <div className="mt-2 text-xs opacity-90">
                    Emergency fund coverage (months of expenses)
                  </div>
                  <div className="mt-1 text-sm font-medium">
                    {runwayMonths.toFixed(1)} months
                  </div>
                </div>

                <div className="rounded-2xl bg-gradient-to-b from-zinc-100 to-zinc-200 border border-zinc-200 p-4">
                  <div className="text-xs font-semibold text-zinc-500 uppercase tracking-wide mb-2">
                    Reality Check
                  </div>

                  <div className="text-sm text-zinc-700 leading-relaxed">
                    {runwayMonths < 3 && (
                      <div>
                        Your current runway suggests a sudden income loss would create
                        <span className="font-semibold"> immediate financial pressure</span>.
                        Increasing emergency reserves can dramatically reduce stress and restore decision leverage.
                      </div>
                    )}

                    {runwayMonths >= 3 && runwayMonths < 6 && (
                      <div>
                        You have some protection against career disruption, but your financial
                        flexibility is still limited. Building a stronger runway will increase
                        your ability to make career decisions from calm rather than fear.
                      </div>
                    )}

                    {runwayMonths >= 6 && runwayMonths < 12 && (
                      <div>
                        Your financial buffer is becoming meaningful. At this level, professionals
                        often report reduced anxiety around layoffs, negotiations, and career changes.
                      </div>
                    )}

                    {runwayMonths >= 12 && (
                      <div>
                        Your financial runway is strong. This level of protection creates real
                        optionality — the ability to walk away from unhealthy environments and
                        pursue better opportunities without immediate pressure.
                      </div>
                    )}

                    <div className="mt-4 rounded-2xl bg-zinc-50 border border-zinc-200 p-4">
                      <div className="text-xs font-semibold text-zinc-500 uppercase tracking-wide mb-3">
                        Why this matters
                      </div>
                      <div className="space-y-2 text-sm text-zinc-700">
                        <div className="flex items-start gap-2">
                          <span>•</span>
                          <span>Financial runway reduces career anxiety and negotiation pressure.</span>
                        </div>
                        <div className="flex items-start gap-2">
                          <span>•</span>
                          <span>Optionality means you work because you choose to — not because you must.</span>
                        </div>
                        <div className="flex items-start gap-2">
                          <span>•</span>
                          <span>Leverage turns burnout into strategy instead of panic.</span>
                        </div>
                        <div className="flex items-start gap-2">
                          <span>•</span>
                          <span>Clarity around your numbers creates calm, confident decision-making.</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

            </CardContent>
          </ColorCard>

          <Card className="lg:col-span-2">
            <CardContent>
              <div className="inline-flex rounded-2xl bg-zinc-100 p-1 gap-1 no-print flex-wrap">
                {(
                  [
                    { key: "projection", label: "Projection", icon: <Activity className="h-3.5 w-3.5" /> },
                    { key: "milestones", label: "Milestones", icon: <Flag className="h-3.5 w-3.5" /> },
                    { key: "runway", label: "Runway & Stress", icon: <ShieldCheck className="h-3.5 w-3.5" /> },
                  ] as const
                ).map(({ key, label, icon }) => (
                  <button
                    key={key}
                    onClick={() => setTab(key)}
                    className={[
                      "flex items-center gap-1.5 rounded-xl px-4 py-2 text-sm font-medium transition-all duration-200",
                      tab === key
                        ? "bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 text-white shadow-lg shadow-blue-500/20"
                        : "text-zinc-500 hover:text-zinc-800 hover:bg-white/70",
                    ].join(" ")}
                  >
                    {icon}
                    {label}
                  </button>
                ))}
              </div>

              {tab === "projection" && (
                <div className="mt-4">
                  <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-2">
                    <ColorCard tone="rose" className="relative z-10">
                      <CardContent className="p-4">
                        <div className="text-xs text-zinc-500 flex items-center">
                          Leverage Score
                          <InfoTooltip text="A 0–100 measure of how dependent you are on your job. Higher = more flexibility. Full breakdown is included in the paid PDF." />
                        </div>

                        {!hasInputs ? (
                          <div className="mt-3">
                            {/* Blurred ghost gauge */}
                            <div className="select-none blur-[3px] pointer-events-none opacity-40">
                              <div className="flex items-center justify-between">
                                <div className="text-xs text-zinc-500">LOW LEVERAGE</div>
                                <div className="text-xs text-zinc-500">HIGH LEVERAGE</div>
                              </div>
                              <div className="relative mt-2 h-3 rounded-full bg-zinc-200 overflow-hidden">
                                <div className="absolute inset-0 bg-gradient-to-r from-red-400 via-blue-500 to-emerald-500 opacity-30" />
                                <div className="absolute top-1/2 -translate-y-1/2" style={{ left: "45%" }}>
                                  <div className="h-4 w-4 rounded-full bg-blue-600 border-2 border-white shadow-md" />
                                </div>
                              </div>
                              <div className="mt-3 flex items-center justify-between">
                                <div className="text-sm font-semibold">—</div>
                                <span className="inline-flex items-center rounded-full border border-zinc-200 bg-zinc-100 px-3 py-1 text-xs font-semibold text-zinc-400">CALCULATING</span>
                              </div>
                            </div>
                            {/* Overlay prompt */}
                            <div className="mt-2 rounded-xl border border-rose-100 bg-rose-50/60 px-3 py-2 text-center">
                              <p className="text-[11px] font-medium text-rose-700">Complete all required fields <span className="text-red-500">*</span> to reveal your score</p>
                            </div>
                          </div>
                        ) : (
                          <>
                            <LeverageGauge
                              value={leverage.total}
                              label={
                                leverage.total < 30
                                  ? "FINANCIALLY EXPOSED"
                                  : leverage.total < 60
                                  ? "STABLE BUT DEPENDENT"
                                  : leverage.total < 80
                                  ? "BUILDING LEVERAGE"
                                  : "STRONG OPTIONALITY"
                              }
                            />
                            <div className="mt-3 flex items-center justify-between">
                              <span className="text-xs text-zinc-500">Primary constraint</span>
                              <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-semibold text-zinc-700">
                                {leverage.bottleneck.name}
                              </span>
                            </div>
                          </>
                        )}

                        <div className="mt-2 text-xs text-zinc-500">
                          Full breakdown + 12-month plan in the Blueprint.
                        </div>
                      </CardContent>
                    </ColorCard>

                    <ColorCard tone="slate">
                      <CardContent className="p-4">
                        <div className="text-xs text-zinc-500">
                          Projected value in {years} years
                        </div>
                        <div className="mt-1 text-2xl font-semibold">
                          {fmt(projection.value)}
                        </div>
                        <div className="mt-2 text-xs text-zinc-500">
                          Rule-of-thumb annual spending
                        </div>
                        <div className="mt-1 text-sm">
                          3.5%: {fmt(safeWithdrawalAnnual.at35)}
                        </div>
                        <div className="text-sm">
                          4.0%: {fmt(safeWithdrawalAnnual.at4)}
                        </div>
                      </CardContent>
                    </ColorCard>

                    <ColorCard tone="emerald">
                      <CardContent className="p-4">
                        <div className="text-xs text-zinc-500">Time to target</div>
                        <div className="mt-1 text-2xl font-semibold">
                          {yrsToTarget ? `${yrsToTarget.toFixed(1)} yrs` : "—"}
                        </div>
                        <div className="mt-2 text-xs text-zinc-500">
                          Estimated age at target
                        </div>
                        <div className="mt-1 text-sm font-medium">
                          {ageAtTarget ? `${ageAtTarget.toFixed(0)} years old` : "—"}
                        </div>
                        <div className="mt-3 text-xs text-zinc-500">
                          Assumes steady contributions and average returns.
                        </div>
                      </CardContent>
                    </ColorCard>

                    <ColorCard tone="blue">
                      <CardContent className="p-4">
                        <div className="flex items-center gap-2">
                          <HeartHandshake className="h-4 w-4" />
                          <div className="text-sm font-semibold">Stress-first tip</div>
                        </div>
                        <div className="mt-2 text-sm text-zinc-700">
                          If fear of job loss is driving burnout, build 6–8 months of
                          runway and automate investing. Optionality comes from
                          consistency.
                        </div>
                      </CardContent>
                    </ColorCard>
                  </div>

                  {/* ── Primary Constraint Panel ── */}
                  <Card className="overflow-hidden">
                    <CardContent className="p-0">
                      {constraintAnalysis ? (() => {
                        const colorMap: Record<string, { bar: string; badge: string; prog: string; num: string }> = {
                          rose:   { bar: "bg-gradient-to-r from-rose-500 to-pink-500",   badge: "bg-rose-50 text-rose-700 border-rose-200",   prog: "bg-rose-500",   num: "bg-rose-100 text-rose-700" },
                          amber:  { bar: "bg-gradient-to-r from-amber-500 to-orange-400", badge: "bg-amber-50 text-amber-700 border-amber-200", prog: "bg-amber-500", num: "bg-amber-100 text-amber-700" },
                          indigo: { bar: "bg-gradient-to-r from-indigo-500 to-violet-500", badge: "bg-indigo-50 text-indigo-700 border-indigo-200", prog: "bg-indigo-500", num: "bg-indigo-100 text-indigo-700" },
                          orange: { bar: "bg-gradient-to-r from-orange-500 to-amber-400", badge: "bg-orange-50 text-orange-700 border-orange-200", prog: "bg-orange-500", num: "bg-orange-100 text-orange-700" },
                        };
                        const c = colorMap[constraintAnalysis.color] ?? colorMap.rose;
                        return (
                          <>
                            {/* Header bar */}
                            <div className={`${c.bar} px-5 py-3 flex items-center justify-between`}>
                              <div className="flex items-center gap-2">
                                <span className="text-base">{constraintAnalysis.icon}</span>
                                <div>
                                  <div className="text-[10px] font-semibold uppercase tracking-widest text-white/70">Your Primary Constraint</div>
                                  <div className="text-sm font-bold text-white">{constraintAnalysis.title}</div>
                                </div>
                              </div>
                              <div className={`rounded-full border px-2.5 py-0.5 text-xs font-semibold ${c.badge}`}>
                                +{constraintAnalysis.scoreGain} pts potential
                              </div>
                            </div>

                            <div className="px-5 py-4 space-y-4">
                              {/* Current vs Target */}
                              <div className="grid grid-cols-2 gap-3">
                                <div className="rounded-xl bg-zinc-50 border border-zinc-100 p-3">
                                  <div className="text-[10px] font-semibold uppercase tracking-wide text-zinc-400 mb-1">Current</div>
                                  <div className="text-sm font-bold text-zinc-800">{constraintAnalysis.current}</div>
                                </div>
                                <div className="rounded-xl bg-zinc-50 border border-zinc-100 p-3">
                                  <div className="text-[10px] font-semibold uppercase tracking-wide text-zinc-400 mb-1">Target</div>
                                  <div className="text-sm font-bold text-zinc-800">{constraintAnalysis.target}</div>
                                </div>
                              </div>

                              {/* Progress bar */}
                              <div>
                                <div className="flex justify-between text-[10px] text-zinc-400 mb-1">
                                  <span>{constraintAnalysis.gapLabel}</span>
                                  <span>{constraintAnalysis.gapPct}% to target</span>
                                </div>
                                <div className="h-2 rounded-full bg-zinc-100 overflow-hidden">
                                  <div
                                    className={`h-full rounded-full ${c.prog} transition-all duration-700`}
                                    style={{ width: `${constraintAnalysis.gapPct}%` }}
                                  />
                                </div>
                              </div>

                              {/* Recommended actions */}
                              <div>
                                <div className="text-xs font-semibold text-zinc-500 uppercase tracking-wide mb-2">Recommended Actions</div>
                                <div className="space-y-2">
                                  {constraintAnalysis.actions.map((action, i) => (
                                    <div key={i} className="flex items-start gap-2.5">
                                      <span className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold ${c.num}`}>
                                        {i + 1}
                                      </span>
                                      <span className="text-sm text-zinc-700 leading-snug">{action}</span>
                                    </div>
                                  ))}
                                </div>
                              </div>

                              {/* Impact line */}
                              <div className="rounded-xl bg-zinc-50 border border-zinc-100 px-3 py-2 text-xs text-zinc-500">
                                <span className="font-semibold text-zinc-700">Impact: </span>{constraintAnalysis.impactLine}
                              </div>
                            </div>
                          </>
                        );
                      })() : (
                        <div className="px-5 py-6 text-sm text-zinc-400 text-center">
                          Fill in all fields to see your primary constraint analysis.
                        </div>
                      )}
                    </CardContent>
                  </Card>

                  {/* ── Blurred Smart Recommendations (Blueprint teaser) ── */}
                  {hasInputs && (
                    <Card className="overflow-hidden">
                      <CardContent className="p-0">
                        {/* Header */}
                        <div className="flex items-center justify-between border-b px-5 py-3">
                          <div>
                            <div className="text-sm font-semibold text-zinc-900">Smart Recommendations</div>
                            <div className="text-xs text-zinc-400 mt-0.5">Personalised to your exact numbers</div>
                          </div>
                          <span className="rounded-full bg-indigo-50 border border-indigo-200 px-2.5 py-0.5 text-xs font-semibold text-indigo-600">
                            Blueprint exclusive
                          </span>
                        </div>

                        {/* Blurred recs */}
                        <div className="relative px-5 py-4 space-y-3">
                          {leverage.recs.slice(0, 3).map((r, i) => (
                            <div key={i} className="rounded-xl border border-zinc-100 bg-zinc-50 px-4 py-3 select-none" style={{ filter: "blur(4px)", userSelect: "none" }}>
                              <div className="text-sm font-semibold text-zinc-800">{r.title}</div>
                              <div className="mt-1 text-xs text-zinc-500">{r.why}</div>
                              <div className="mt-1 text-xs text-zinc-400">Next: {r.nextStep}</div>
                            </div>
                          ))}

                          {/* Frosted overlay + CTA */}
                          <div className="absolute inset-0 flex flex-col items-center justify-center rounded-b-xl bg-white/70 backdrop-blur-[2px]">
                            <div className="text-center px-6">
                              <div className="text-sm font-semibold text-zinc-800 mb-1">
                                {leverage.recs.length} personalised recommendations waiting
                              </div>
                              <div className="text-xs text-zinc-500 mb-4">
                                Includes dollar amounts, timelines, and a 12-month execution plan tailored to your numbers.
                              </div>
                              <a
                                href={STRIPE_PAYMENT_LINK}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-2 rounded-2xl bg-gradient-to-r from-indigo-600 to-violet-600 px-5 py-2.5 text-sm font-semibold text-white shadow-lg hover:opacity-90 transition-opacity"
                              >
                                Unlock in Your Blueprint — $197
                              </a>
                            </div>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  )}

                  <div className="mt-4 rounded-3xl border bg-white p-4">
                    <div className="mb-3 flex items-center justify-between gap-2 flex-wrap">
                      <div>
                        <div className="text-sm font-semibold">Portfolio Growth</div>
                        <div className="text-xs text-zinc-400 mt-0.5">Hover to explore · 3 scenarios</div>
                      </div>
                      <div className="flex items-center gap-2 text-xs">
                        <span className="flex items-center gap-1">
                          <span className="inline-block h-2.5 w-2.5 rounded-full bg-blue-500" />
                          Baseline
                        </span>
                        <span className="flex items-center gap-1">
                          <span className="inline-block h-2.5 w-2.5 rounded-full bg-purple-500" />
                          +$500/mo
                        </span>
                        <span className="flex items-center gap-1">
                          <span className="inline-block h-2.5 w-2.5 rounded-full bg-emerald-500" />
                          +$1k/mo
                        </span>
                      </div>
                    </div>
                    <div className="h-[340px]">
                      <ResponsiveContainer width="100%" height="100%">
                        <AreaChart
                          data={chartData}
                          margin={{ top: 10, right: 16, left: 0, bottom: 0 }}
                        >
                          <defs>
                            <linearGradient id="gradBaseline" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.28} />
                              <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                            </linearGradient>
                            <linearGradient id="gradPlus500" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="5%" stopColor="#a855f7" stopOpacity={0.18} />
                              <stop offset="95%" stopColor="#a855f7" stopOpacity={0} />
                            </linearGradient>
                            <linearGradient id="gradPlus1000" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="5%" stopColor="#10b981" stopOpacity={0.18} />
                              <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                            </linearGradient>
                          </defs>
                          <CartesianGrid
                            strokeDasharray="3 3"
                            stroke="#f1f5f9"
                            vertical={false}
                          />
                          <XAxis
                            dataKey="year"
                            tickFormatter={(v) => `${Math.round(Number(v))}y`}
                            minTickGap={24}
                            tick={{ fontSize: 11, fill: "#94a3b8" }}
                            axisLine={false}
                            tickLine={false}
                          />
                          <YAxis
                            tickFormatter={(v) =>
                              Number(v) >= 1_000_000
                                ? `$${(Number(v) / 1_000_000).toFixed(1)}M`
                                : `$${Math.round(Number(v) / 1000)}k`
                            }
                            width={64}
                            tick={{ fontSize: 11, fill: "#94a3b8" }}
                            axisLine={false}
                            tickLine={false}
                          />
                          <Tooltip
                            content={({ active, payload, label }) => {
                              if (!active || !payload?.length) return null;
                              const yr = Number(label);
                              const base = payload.find((p) => p.dataKey === "baseline")?.value as number;
                              const p500 = payload.find((p) => p.dataKey === "plus500")?.value as number;
                              const p1000 = payload.find((p) => p.dataKey === "plus1000")?.value as number;
                              const pct = target > 0 && base ? Math.min(100, (base / target) * 100) : 0;
                              return (
                                <div className="rounded-2xl border border-zinc-100 bg-white/95 backdrop-blur-xl shadow-xl p-3 text-xs space-y-1.5 min-w-[190px]">
                                  <div className="font-semibold text-zinc-900 border-b border-zinc-100 pb-1.5 mb-1">
                                    Year {yr.toFixed(1)} · Age {(age + yr).toFixed(0)}
                                  </div>
                                  <div className="flex items-center justify-between gap-3">
                                    <span className="flex items-center gap-1 text-zinc-500">
                                      <span className="h-2 w-2 rounded-full bg-blue-500 shrink-0" />
                                      Baseline
                                    </span>
                                    <span className="font-semibold text-zinc-900">{fmt(base)}</span>
                                  </div>
                                  <div className="flex items-center justify-between gap-3">
                                    <span className="flex items-center gap-1 text-zinc-500">
                                      <span className="h-2 w-2 rounded-full bg-purple-500 shrink-0" />
                                      +$500/mo
                                    </span>
                                    <span className="font-semibold text-zinc-900">{fmt(p500)}</span>
                                  </div>
                                  <div className="flex items-center justify-between gap-3">
                                    <span className="flex items-center gap-1 text-zinc-500">
                                      <span className="h-2 w-2 rounded-full bg-emerald-500 shrink-0" />
                                      +$1k/mo
                                    </span>
                                    <span className="font-semibold text-zinc-900">{fmt(p1000)}</span>
                                  </div>
                                  {target > 0 && (
                                    <div className="pt-1.5 border-t border-zinc-100">
                                      <div className="flex justify-between mb-1">
                                        <span className="text-zinc-400">Target progress</span>
                                        <span className="font-semibold text-blue-600">{pct.toFixed(0)}%</span>
                                      </div>
                                      <div className="h-1.5 rounded-full bg-zinc-100 overflow-hidden">
                                        <div
                                          className="h-full rounded-full bg-gradient-to-r from-blue-500 via-purple-500 to-emerald-500"
                                          style={{ width: `${pct}%` }}
                                        />
                                      </div>
                                    </div>
                                  )}
                                </div>
                              );
                            }}
                          />
                          {target > 0 && (
                            <ReferenceLine
                              y={target}
                              stroke="#10b981"
                              strokeDasharray="5 4"
                              strokeWidth={1.5}
                              label={{
                                value: `Target ${fmt(target)}`,
                                position: "insideTopRight",
                                fontSize: 10,
                                fill: "#10b981",
                              }}
                            />
                          )}
                          <Area
                            type="monotone"
                            dataKey="plus1000"
                            stroke="#10b981"
                            strokeWidth={1.5}
                            strokeDasharray="4 3"
                            fill="url(#gradPlus1000)"
                            dot={false}
                            activeDot={{ r: 4, fill: "#10b981", strokeWidth: 0 }}
                          />
                          <Area
                            type="monotone"
                            dataKey="plus500"
                            stroke="#a855f7"
                            strokeWidth={1.5}
                            strokeDasharray="4 3"
                            fill="url(#gradPlus500)"
                            dot={false}
                            activeDot={{ r: 4, fill: "#a855f7", strokeWidth: 0 }}
                          />
                          <Area
                            type="monotone"
                            dataKey="baseline"
                            stroke="#3b82f6"
                            strokeWidth={2.5}
                            fill="url(#gradBaseline)"
                            dot={false}
                            activeDot={{ r: 5, fill: "#3b82f6", stroke: "#fff", strokeWidth: 2 }}
                          />
                        </AreaChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                </div>
              )}

              {tab === "milestones" && (
                <div className="mt-4 grid gap-4 md:grid-cols-2">
                  <div className="space-y-3">
                    <div className="text-sm font-semibold text-zinc-700 px-1">Wealth milestones</div>
                    {milestones.length === 0 ? (
                      <div className="rounded-2xl border bg-zinc-50 px-4 py-6 text-sm text-zinc-400 text-center">
                        Add a positive monthly invest amount to see milestones.
                      </div>
                    ) : (
                      ([
                        { t: 250000, color: "blue",    label: "First foothold",   meaning: "You stop feeling fragile" },
                        { t: 500000, color: "purple",  label: "Negotiation power", meaning: "Trade money for sanity" },
                        { t: 750000, color: "amber",   label: "Momentum visible",  meaning: "Your choices expand" },
                        { t: 1000000, color: "emerald", label: "Dependency breaks", meaning: "Work becomes a choice" },
                      ] as const).map(({ t, color, label, meaning }) => {
                        const m = milestones.find((x) => x.t === t);
                        const progress = Math.min(100, (investedStart / t) * 100);
                        const colorMap = {
                          blue:    { card: "from-blue-50 to-white border-blue-100",    bar: "from-blue-400 to-blue-600",    dot: "bg-blue-500",    text: "text-blue-700",    badge: "bg-blue-100 text-blue-700" },
                          purple:  { card: "from-purple-50 to-white border-purple-100", bar: "from-purple-400 to-purple-600", dot: "bg-purple-500",  text: "text-purple-700",  badge: "bg-purple-100 text-purple-700" },
                          amber:   { card: "from-amber-50 to-white border-amber-100",   bar: "from-amber-400 to-amber-500",   dot: "bg-amber-500",   text: "text-amber-700",   badge: "bg-amber-100 text-amber-700" },
                          emerald: { card: "from-emerald-50 to-white border-emerald-100", bar: "from-emerald-400 to-emerald-600", dot: "bg-emerald-500", text: "text-emerald-700", badge: "bg-emerald-100 text-emerald-700" },
                        }[color];
                        return (
                          <div key={t} className={`rounded-2xl border bg-gradient-to-br ${colorMap.card} p-4 transition-all duration-200 hover:-translate-y-[1px] hover:shadow-md`}>
                            <div className="flex items-start justify-between gap-2">
                              <div className="flex items-center gap-2">
                                <span className={`h-2.5 w-2.5 rounded-full shrink-0 ${colorMap.dot}`} />
                                <div>
                                  <div className={`text-xs font-semibold ${colorMap.text}`}>{label}</div>
                                  <div className="text-xs text-zinc-400">{meaning}</div>
                                </div>
                              </div>
                              <div className="text-right shrink-0">
                                <div className="text-sm font-bold text-zinc-900">{fmt(t)}</div>
                                {m ? (
                                  <div className={`text-xs font-medium ${colorMap.text}`}>{m.y.toFixed(1)} yrs · age {(age + m.y).toFixed(0)}</div>
                                ) : (
                                  <div className="text-xs text-zinc-400">beyond range</div>
                                )}
                              </div>
                            </div>
                            <div className="mt-3">
                              <div className="flex justify-between text-[10px] text-zinc-400 mb-1">
                                <span>Progress</span>
                                <span>{progress.toFixed(0)}%</span>
                              </div>
                              <div className="h-1.5 rounded-full bg-white/60 border border-white overflow-hidden">
                                <div
                                  className={`h-full rounded-full bg-gradient-to-r ${colorMap.bar} transition-all duration-700`}
                                  style={{ width: `${progress}%` }}
                                />
                              </div>
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>

                </div>
              )}

              {tab === "runway" && (
                <div className="mt-4 space-y-4">
                  {/* Runway visual bar */}
                  <div className="rounded-3xl border bg-gradient-to-br from-slate-50 to-white p-5">
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-2">
                        <Wallet className="h-4 w-4 text-zinc-400" />
                        <div className="text-sm font-semibold">Emergency Runway</div>
                      </div>
                      {hasInputs && (
                        <span className={`rounded-full px-3 py-0.5 text-xs font-semibold ${
                          runwayMonths >= 9 ? "bg-emerald-100 text-emerald-700"
                          : runwayMonths >= 6 ? "bg-blue-100 text-blue-700"
                          : runwayMonths >= 3 ? "bg-amber-100 text-amber-700"
                          : "bg-red-100 text-red-700"
                        }`}>
                          {runwayMonths >= 9 ? "Strong" : runwayMonths >= 6 ? "Solid" : runwayMonths >= 3 ? "Building" : "Critical"}
                        </span>
                      )}
                    </div>
                    <div className="text-3xl font-bold text-zinc-900 mt-1">
                      {runwayMonths.toFixed(1)}<span className="text-base font-normal text-zinc-400 ml-1">months</span>
                    </div>
                    <div className="mt-4 relative h-3 rounded-full bg-zinc-100 overflow-hidden">
                      <div className="absolute inset-0 flex">
                        <div className="h-full w-[25%] bg-red-200/60" />
                        <div className="h-full w-[25%] bg-amber-200/60" />
                        <div className="h-full w-[25%] bg-blue-200/60" />
                        <div className="h-full w-[25%] bg-emerald-200/60" />
                      </div>
                      <div
                        className={`absolute top-0 left-0 h-full rounded-full transition-all duration-700 ${
                          runwayMonths >= 9 ? "bg-gradient-to-r from-emerald-400 to-emerald-600"
                          : runwayMonths >= 6 ? "bg-gradient-to-r from-blue-400 to-blue-600"
                          : runwayMonths >= 3 ? "bg-gradient-to-r from-amber-400 to-amber-500"
                          : "bg-gradient-to-r from-red-400 to-red-600"
                        }`}
                        style={{ width: `${Math.min(100, (runwayMonths / 12) * 100)}%` }}
                      />
                    </div>
                    <div className="flex justify-between text-[10px] text-zinc-400 mt-1 px-0.5">
                      <span>0</span><span>3 mo</span><span>6 mo</span><span>9 mo</span><span>12 mo</span>
                    </div>
                  </div>

                  {/* Target cards */}
                  <div className="grid gap-3 sm:grid-cols-2">
                    {[
                      { label: "6-month target", months: 6, color: "blue" },
                      { label: "12-month target", months: 12, color: "purple" },
                    ].map(({ label, months, color }) => {
                      const needed = monthlyExpenses * months;
                      const gap = Math.max(0, needed - cashStart);
                      const covered = gap === 0;
                      const pct = Math.min(100, (cashStart / needed) * 100);
                      const c = covered
                        ? { card: "from-emerald-50 to-white border-emerald-100", bar: "from-emerald-400 to-emerald-600", text: "text-emerald-700", badge: "bg-emerald-100 text-emerald-700" }
                        : color === "blue"
                        ? { card: "from-blue-50 to-white border-blue-100",       bar: "from-blue-400 to-blue-600",       text: "text-blue-700",    badge: "bg-blue-100 text-blue-700" }
                        : { card: "from-purple-50 to-white border-purple-100",   bar: "from-purple-400 to-purple-600",   text: "text-purple-700",  badge: "bg-purple-100 text-purple-700" };
                      return (
                        <div key={months} className={`rounded-2xl border bg-gradient-to-br ${c.card} p-4`}>
                          <div className="flex items-center justify-between">
                            <div className="text-xs font-medium text-zinc-500">{label}</div>
                            <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${c.badge}`}>
                              {covered ? "Covered ✓" : `${pct.toFixed(0)}% funded`}
                            </span>
                          </div>
                          <div className="mt-1 text-xl font-bold text-zinc-900">{fmt(needed)}</div>
                          {!covered && (
                            <div className={`text-xs mt-0.5 ${c.text}`}>Gap: {fmt(gap)}</div>
                          )}
                          <div className="mt-3 h-1.5 rounded-full bg-white/70 border border-white overflow-hidden">
                            <div
                              className={`h-full rounded-full bg-gradient-to-r ${c.bar} transition-all duration-700`}
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* Stress principles */}
                  <div className="rounded-2xl border bg-gradient-to-br from-indigo-50 to-white border-indigo-100 p-4">
                    <div className="text-xs font-semibold text-indigo-700 mb-3">Stress-first principles</div>
                    <div className="grid gap-2 sm:grid-cols-2">
                      {[
                        { icon: "🛡️", text: "Build 6–8 months runway before optimising returns" },
                        { icon: "⚡", text: "Automate investing once runway is secure" },
                        { icon: "📉", text: "Keep fixed costs flat — rigidity is the real risk" },
                        { icon: "🧘", text: "Protect health: burnout kills compounding" },
                      ].map(({ icon, text }) => (
                        <div key={text} className="flex items-start gap-2 rounded-xl bg-white/60 border border-indigo-100/50 px-3 py-2">
                          <span className="text-base leading-snug">{icon}</span>
                          <span className="text-xs text-zinc-600">{text}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              <div className="mt-6 rounded-3xl bg-zinc-100 p-4 text-xs text-zinc-600">
                <div className="font-semibold text-zinc-700">Disclaimer</div>
                <div className="mt-1">
                  Educational only, not financial advice. Markets are volatile; returns
                  are not guaranteed. Consider taxes, fees, and your personal situation.
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* 3. Shock Simulator */}
        <section className="mb-12 rounded-3xl bg-gradient-to-b from-zinc-100 via-zinc-200 to-zinc-300 border border-zinc-200 p-10 shadow-xl">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div>
              <div className="text-sm font-semibold">Real Scenario Simulator</div>
              <div className="text-sm text-zinc-600">
                Stress-test your runway with an income shock.
              </div>
            </div>
            <Button
              className="bg-blue-600 text-white hover:bg-blue-700 shadow-lg"
              onClick={() => scrollTo("plan")}
            >
              Get Your Personalised Blueprint — $197
            </Button>
          </div>

          <div className="mt-6 grid gap-6 lg:grid-cols-3">
            <div className="rounded-2xl border bg-white p-5">
              <div className="text-xs font-medium text-zinc-500">
                Income shock duration
              </div>
              <div className="mt-2 flex items-center gap-3">
                <NumericInput value={shockMonths} onCommit={setShockMonths} min={1} max={24} />
                <div className="text-sm text-zinc-600 whitespace-nowrap">months</div>
              </div>

              <div className="mt-5 text-xs font-medium text-zinc-500">
                Income drop (%)
              </div>
              <div className="mt-2">
                <div className="flex items-center justify-between text-xs text-zinc-500">
                  <span>0%</span>
                  <span className="font-medium text-zinc-700">{incomeDropPct}%</span>
                  <span>100%</span>
                </div>
                <input
                  className="mt-2 w-full"
                  type="range"
                  min={0}
                  max={100}
                  step={5}
                  value={incomeDropPct}
                  onChange={(e) => setIncomeDropPct(clamp(Number(e.target.value), 0, 100))}
                />
                <div className="mt-2 text-xs text-zinc-500">
                  100% = job loss. 30% = pay cut.
                </div>
              </div>
            </div>

            <div className="rounded-2xl border bg-white p-5 lg:col-span-2">
              <div className="grid gap-4 md:grid-cols-3">
                <div className="rounded-2xl border p-4">
                  <div className="text-xs text-zinc-500">Kept income / month</div>
                  <div className="mt-1 text-lg font-semibold">
                    {fmt(shock.keptIncome)}
                  </div>
                </div>

                <div className="rounded-2xl border p-4">
                  <div className="text-xs text-zinc-500">Net burn / month</div>
                  <div className="mt-1 text-lg font-semibold">
                    {fmt(shock.netBurn)}
                  </div>
                  <div className="mt-1 text-xs text-zinc-500">
                    Expenses − kept income
                  </div>
                </div>

                <div className="rounded-2xl border p-4">
                  <div className="text-xs text-zinc-500">
                    Cash after {shockMonths} months
                  </div>
                  <div className={`mt-1 text-lg font-semibold ${shock.survives ? "text-emerald-600" : "text-red-600"}`}>
                    {fmt(shock.cashAfter)}
                  </div>
                </div>
              </div>

              <div className="mt-5 rounded-2xl border bg-zinc-50 p-4">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div className="text-sm font-semibold">
                      {shock.survives ? "You survive this shock." : "This shock breaks runway."}
                    </div>
                    <div className="mt-1 text-sm text-zinc-600">
                      Under this scenario, your cash runway is{" "}
                      <span className="font-semibold">
                        {Number.isFinite(shock.runwayInShock)
                          ? `${shock.runwayInShock.toFixed(1)} months`
                          : "not depleted — income still covers expenses"}
                      </span>.
                    </div>
                  </div>
                  <Badge>
                    {shock.survives ? "STABLE" : "HIGH RISK"}
                  </Badge>
                </div>

                <div className="mt-3 text-sm text-zinc-700">
                  <span className="font-semibold">Operator move:</span>{" "}
                  {shock.survives
                    ? "Lock a cash floor and reduce fixed costs before they reduce you."
                    : "Raise runway or cut fixed expenses. This is the fastest stress reducer."}
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* 4. Testimonials */}
        <section className="mb-12">
          <div className="text-center mb-8">
            <div className="text-xs font-semibold uppercase tracking-widest text-zinc-400 mb-2">
              Beta user feedback
            </div>
            <h2 className="text-2xl font-bold text-zinc-900">
              What professionals are saying
            </h2>
          </div>

          <div className="grid gap-6 md:grid-cols-3">
            <div className="rounded-3xl border bg-white p-6 shadow-sm">
              <div className="text-sm text-zinc-700 leading-relaxed">
                "I thought I was bad with money. Turns out I had no framework. My leverage score was 28. Four months of following the plan — it's now 61."
              </div>
              <div className="mt-4 flex items-center gap-3">
                <div className="h-9 w-9 rounded-full bg-blue-100 flex items-center justify-center text-blue-700 font-semibold text-sm">
                  SK
                </div>
                <div>
                  <div className="text-sm font-semibold">Sarah K.</div>
                  <div className="text-xs text-zinc-500">Principal Engineer · $220k/yr</div>
                </div>
              </div>
            </div>

            <div className="rounded-3xl border bg-white p-6 shadow-sm">
              <div className="text-sm text-zinc-700 leading-relaxed">
                "Seeing that a 6-month gap would wipe me out — despite earning well — forced me to get serious about runway. The shock simulator is a wake-up call."
              </div>
              <div className="mt-4 flex items-center gap-3">
                <div className="h-9 w-9 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-700 font-semibold text-sm">
                  MT
                </div>
                <div>
                  <div className="text-sm font-semibold">Marcus T.</div>
                  <div className="text-xs text-zinc-500">Director of Product · $185k/yr</div>
                </div>
              </div>
            </div>

            <div className="rounded-3xl border bg-white p-6 shadow-sm">
              <div className="text-sm text-zinc-700 leading-relaxed">
                "The 12-month plan gave me an actual sequence of moves instead of vague advice. I've cut 2 fixed costs and automated $2k/month to investments."
              </div>
              <div className="mt-4 flex items-center gap-3">
                <div className="h-9 w-9 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-700 font-semibold text-sm">
                  PN
                </div>
                <div>
                  <div className="text-sm font-semibold">Priya N.</div>
                  <div className="text-xs text-zinc-500">Senior Manager · $195k/yr</div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* 5. What's Inside the Blueprint */}
        <section className="mb-12 rounded-3xl border bg-white p-8 shadow-sm">
          <div className="text-center mb-8">
            <div className="text-xs font-semibold uppercase tracking-widest text-zinc-400 mb-2">
              The Leverage Blueprint
            </div>
            <h2 className="text-2xl font-bold text-zinc-900">
              What's inside your PDF
            </h2>
            <p className="mt-2 text-sm text-zinc-500 max-w-xl mx-auto">
              A 9-page confidential strategy document — personalized to your numbers, not a generic template.
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {[
              {
                page: "Cover",
                title: "Your Leverage Score",
                desc: "Leverage Score, optionality class badge, and primary constraint — the one thing to fix first.",
              },
              {
                page: "Page 1",
                title: "Executive Snapshot",
                desc: "KPI cards, personalized diagnosis, and a bold operator directive. The truth in one page.",
              },
              {
                page: "Page 2",
                title: "Financial Dependency Map",
                desc: "Exactly where your score comes from and how dependent you are on continued income.",
              },
              {
                page: "Page 3",
                title: "Wealth Velocity Model",
                desc: "Milestone timeline — when you hit $250k, $500k, $1M — and what changes at each level.",
              },
              {
                page: "Page 4",
                title: "Career Shock Simulation",
                desc: "Modeled outcomes for a 6-month loss, 12-month loss, and 30% pay cut using your actual numbers.",
              },
              {
                page: "Page 5",
                title: "Acceleration Scenarios",
                desc: "How +$500/mo and +$1k/mo in contributions changes your timeline — quantified.",
              },
              {
                page: "Page 6",
                title: "Shock Testing Lab",
                desc: "Three scenario tables: job loss, pay cut, and sabbatical — all modeled to your cash position.",
              },
              {
                page: "Page 7",
                title: "12-Month Leverage Plan",
                desc: "Personalized 3-phase operator plan built from your bottleneck. No generic advice.",
              },
              {
                page: "Final",
                title: "Operator Mandate",
                desc: "A clear closing directive. The one-line summary of your financial independence strategy.",
              },
            ].map((item) => (
              <div key={item.page} className="rounded-2xl border bg-zinc-50 p-4">
                <div className="flex items-center gap-2 mb-2">
                  <span className="inline-flex items-center rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-semibold text-blue-700">
                    {item.page}
                  </span>
                </div>
                <div className="text-sm font-semibold text-zinc-900">{item.title}</div>
                <div className="mt-1 text-xs text-zinc-500 leading-relaxed">{item.desc}</div>
              </div>
            ))}
          </div>
        </section>

        {/* 6. Offer */}
        <section id="plan" className="mt-12 rounded-3xl bg-zinc-900 p-8 text-white">
          <div className="max-w-3xl">
            <h2 className="text-3xl font-bold">
              The Leverage Blueprint
            </h2>
            <p className="mt-4 text-zinc-300 max-w-2xl">
              A strategic decision document for high-income professionals who want to
              stop feeling financially trapped and start building real optionality.
            </p>
            <p className="mt-2 text-xl font-semibold text-blue-400">
              $197 — One-Time
            </p>

            <div className="mt-10">
              <h3 className="text-xl font-semibold">Who This Is For</h3>
              <ul className="mt-4 space-y-3 text-zinc-300">
                <li>• High-income professionals ($150k+) who feel financially trapped despite earning well.</li>
                <li>• Tech workers, operators, and ambitious builders experiencing burnout or performance pressure.</li>
                <li>• People with significant income but no clear optionality strategy.</li>
                <li>• Professionals who want leverage — not extreme frugality.</li>
                <li>• Individuals serious about building $1M+ optionality within 5–10 years.</li>
              </ul>
            </div>

            <div className="mt-10">
              <h3 className="text-xl font-semibold">Who This Is NOT For</h3>
              <ul className="mt-4 space-y-3 text-zinc-300">
                <li>• People looking for get-rich-quick strategies.</li>
                <li>• Those unwilling to invest consistently.</li>
                <li>• Anyone expecting emotional motivation instead of structured strategy.</li>
                <li>• Individuals unwilling to confront their financial reality.</li>
              </ul>
            </div>

            <div className="mt-6 no-print flex flex-wrap gap-4 items-start">
              <div className="flex flex-col items-start gap-2">
                <PremiumCTAButton onClick={() => handleCheckout(STRIPE_PAYMENT_LINK)} disabled={!hasInputs}>
                  Get My Personalised Blueprint — $197
                </PremiumCTAButton>
                <p className="mt-2 text-sm text-blue-400">
                  Includes: Executive diagnosis · 12-month leverage roadmap ·
                  Scenario modeling · Milestone strategy
                </p>
              </div>

              {paymentSuccess && !blueprintDownloaded && (
                <div className="flex flex-col items-start gap-2">
                  <button
                    onClick={hasInputs && !isGenerating ? handleGeneratePdf : undefined}
                    disabled={isGenerating || !hasInputs}
                    className={[
                      "group relative overflow-hidden rounded-xl px-7 py-3.5 text-sm font-semibold transition-all duration-200",
                      "bg-gradient-to-r from-violet-600 via-indigo-600 to-purple-600",
                      "shadow-[0_0_24px_rgba(139,92,246,0.45)]",
                      "text-white tracking-wide",
                      hasInputs && !isGenerating
                        ? "hover:shadow-[0_0_36px_rgba(139,92,246,0.65)] hover:scale-[1.02] active:scale-[0.98] cursor-pointer"
                        : "opacity-50 cursor-not-allowed",
                    ].join(" ")}
                  >
                    {hasInputs && !isGenerating && (
                      <span className="pointer-events-none absolute inset-0 -translate-x-full skew-x-[-20deg] bg-white/10 transition-transform duration-700 group-hover:translate-x-[200%]" />
                    )}
                    <span className="relative flex items-center gap-2.5">
                      {isGenerating ? (
                        <>
                          <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
                            <path className="opacity-80" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
                          </svg>
                          Building your Blueprint…
                        </>
                      ) : (
                        <>
                          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M12 10v6m0 0l-3-3m3 3l3-3M3 17V7a2 2 0 012-2h6l2 2h6a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2z" />
                          </svg>
                          Download My Leverage Blueprint
                        </>
                      )}
                    </span>
                  </button>
                  {!hasInputs && (
                    <span className="text-xs text-amber-400/80">Fill in all calculator fields above before generating.</span>
                  )}
                  {hasInputs && !isGenerating && (
                    <span className="text-xs text-zinc-500">PDF · Personalised · Ready in seconds</span>
                  )}
                </div>
              )}

              {paymentSuccess && blueprintDownloaded && (
                <div className="w-full mt-2 overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-950 shadow-xl">
                  {/* top success bar */}
                  <div className="flex items-center gap-3 border-b border-zinc-800 bg-gradient-to-r from-emerald-950/60 to-zinc-950 px-5 py-3.5">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-emerald-500/20 ring-1 ring-emerald-500/40">
                      <svg className="h-4 w-4 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                    </div>
                    <div>
                      <div className="text-sm font-semibold text-white">Blueprint downloaded</div>
                      <div className="text-xs text-zinc-500">
                        {lastSnapshot
                          ? `Score ${lastSnapshot.score}/100 · ${new Date(lastSnapshot.date).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}`
                          : "Check your Downloads folder for your personalised PDF"}
                      </div>
                    </div>
                    <button
                      onClick={handleGeneratePdf}
                      className="ml-auto flex items-center gap-1.5 rounded-lg border border-zinc-700 px-3 py-1.5 text-xs text-zinc-400 transition hover:border-zinc-500 hover:text-zinc-200"
                    >
                      <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 10v6m0 0l-3-3m3 3l3-3M3 17V7a2 2 0 012-2h6l2 2h6a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2z" />
                      </svg>
                      Re-download
                    </button>
                  </div>

                  {/* score delta — shown when returning user's score has changed */}
                  {lastSnapshot && lastSnapshot.score !== leverage.total && (
                    <div className="flex items-center gap-2 border-b border-zinc-800 bg-zinc-900/40 px-5 py-2.5">
                      <span className="text-xs text-zinc-500">Score since last Blueprint:</span>
                      <span className={`text-xs font-semibold ${leverage.total > lastSnapshot.score ? "text-emerald-400" : "text-amber-400"}`}>
                        {lastSnapshot.score} → {leverage.total}
                        {leverage.total > lastSnapshot.score
                          ? ` (+${leverage.total - lastSnapshot.score} pts)`
                          : ` (${leverage.total - lastSnapshot.score} pts)`}
                      </span>
                    </div>
                  )}

                  {/* your #1 action */}
                  <div className="px-5 py-4">
                    <div className="mb-3 flex items-center gap-2">
                      <span className="rounded-md bg-violet-500/15 px-2 py-0.5 text-xs font-semibold uppercase tracking-widest text-violet-400">
                        Your #1 action — Start here
                      </span>
                    </div>
                    <p className="text-sm font-medium text-white leading-relaxed">
                      {leverage.bottleneck.key === "runway"
                        ? "Your cash coverage is the fastest lever for reducing fear and pressure."
                        : leverage.bottleneck.key === "dependency"
                        ? "Your invested base isn't yet large enough relative to annual spend."
                        : leverage.bottleneck.key === "velocity"
                        ? "Your current contribution rate slows the timeline to true optionality."
                        : "A 6–12 month disruption would force reactive decisions too quickly."}
                    </p>
                    <p className="mt-1 text-xs text-zinc-500">
                      Bottleneck: <span className="text-zinc-300">{leverage.bottleneck.name}</span> — the fastest lever to move your Leverage Score.
                    </p>
                  </div>

                  {/* 30-day reminder nudge */}
                  <div className="flex items-center justify-between border-t border-zinc-800 bg-zinc-900/50 px-5 py-3">
                    <div className="flex items-center gap-2.5">
                      <svg className="h-4 w-4 shrink-0 text-zinc-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                      </svg>
                      <span className="text-xs text-zinc-500">Set a 30-day check-in to re-run your numbers and track progress</span>
                    </div>
                    <a
                      href={`https://calendar.google.com/calendar/render?action=TEMPLATE&text=Equanimity+Engine+30-Day+Check-In&details=Re-run+your+Leverage+Score+and+review+progress+on+your+Blueprint.&dates=${(() => { const d = new Date(); d.setDate(d.getDate() + 30); const s = d.toISOString().replace(/[-:]/g,"").split(".")[0]+"Z"; return s+"/"+s; })()}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="ml-4 shrink-0 rounded-lg bg-zinc-800 px-3 py-1.5 text-xs font-medium text-zinc-300 transition hover:bg-zinc-700 hover:text-white"
                    >
                      Add to Calendar
                    </a>
                  </div>
                </div>
              )}

              {/* Stress Test upsell — shown only after Blueprint is downloaded */}
              {paymentSuccess && blueprintDownloaded && !stressTestUnlocked && !stressUpsellDismissed && stressTest && (
                <div className="w-full mt-4 overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-950 shadow-xl">
                  <div className="flex flex-wrap items-center justify-between gap-4 border-b border-zinc-800 bg-gradient-to-r from-violet-950/40 to-zinc-950 px-5 py-4">
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <span className="rounded-md bg-violet-500/15 px-2 py-0.5 text-xs font-semibold uppercase tracking-widest text-violet-400">Add-On — $47</span>
                      </div>
                      <div className="text-sm font-semibold text-white">Stress Test — Resilience Report</div>
                      <div className="mt-0.5 text-xs text-zinc-400">5 financial shock scenarios modeled to your exact numbers. One clear action per scenario.</div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={handleStressCheckout}
                        className="group relative shrink-0 overflow-hidden rounded-xl bg-gradient-to-r from-violet-600 to-purple-600 px-5 py-2.5 text-xs font-semibold text-white shadow transition hover:brightness-110 active:scale-95"
                      >
                        <span className="pointer-events-none absolute inset-0 -translate-x-full skew-x-[-20deg] bg-white/10 transition-transform duration-700 group-hover:translate-x-[200%]" />
                        Unlock Stress Test — $47
                      </button>
                      <button
                        onClick={() => setStressUpsellDismissed(true)}
                        className="rounded-lg border border-zinc-700 px-3 py-2.5 text-xs text-zinc-500 transition hover:border-zinc-500 hover:text-zinc-300"
                      >
                        Not now
                      </button>
                    </div>
                  </div>
                  {/* Blurred preview */}
                  <div className="relative px-5 py-4">
                    <div className="pointer-events-none absolute inset-0 z-10 flex flex-col items-center justify-center gap-1 rounded-b-2xl backdrop-blur-sm bg-zinc-950/70">
                      <svg className="h-5 w-5 text-violet-400 mb-1" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 2l7 4v5c0 5.25-3.5 9.74-7 11-3.5-1.26-7-5.75-7-11V6l7-4z" />
                      </svg>
                      <div className="text-sm font-semibold text-white">Unlock to reveal all 5 scenarios</div>
                      <div className="text-xs text-zinc-400">Layoff · Market Crash · Medical · Career Pivot · Lifestyle Creep</div>
                    </div>
                    <div className="grid grid-cols-3 gap-3 pointer-events-none select-none">
                      {([stressTest.layoff, stressTest.marketCrash, stressTest.medical] as const).map((s) => (
                        <div key={s.name} className="rounded-xl border border-zinc-800 bg-zinc-900 p-3">
                          <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-bold ring-1 mb-2 ${s.status === "SURVIVES" ? "bg-emerald-500/15 text-emerald-400 ring-emerald-500/30" : s.status === "AT_RISK" ? "bg-amber-500/15 text-amber-400 ring-amber-500/30" : "bg-red-500/15 text-red-400 ring-red-500/30"}`}>
                            {s.status}
                          </span>
                          <div className="text-xs font-semibold text-white truncate">{s.name}</div>
                          <div className="mt-1 text-xs text-zinc-500 truncate">{s.headline}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* Stress Test results — requires blueprint purchase + stress test unlock */}
              {paymentSuccess && stressTestUnlocked && (
                <div className="w-full mt-4 overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-950 shadow-xl">
                  <div className="flex items-center justify-between gap-3 border-b border-zinc-800 bg-gradient-to-r from-violet-950/40 to-zinc-950 px-5 py-3.5">
                    <div className="flex items-center gap-3">
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-violet-500/20 ring-1 ring-violet-500/40">
                        <svg className="h-4 w-4 text-violet-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M12 2l7 4v5c0 5.25-3.5 9.74-7 11-3.5-1.26-7-5.75-7-11V6l7-4z" />
                        </svg>
                      </div>
                      <div>
                        <div className="text-sm font-semibold text-white">Resilience Report — 5 Stress Scenarios</div>
                        <div className="text-xs text-zinc-500">Modeled to your exact financial inputs</div>
                      </div>
                    </div>
                    {paymentSuccess && hasInputs && (
                      <button
                        onClick={handleGeneratePdf}
                        disabled={isGenerating}
                        className="flex items-center gap-1.5 rounded-lg border border-zinc-700 px-3 py-1.5 text-xs text-zinc-400 transition hover:border-violet-500 hover:text-violet-300 disabled:opacity-50"
                      >
                        <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M12 10v6m0 0l-3-3m3 3l3-3M3 17V7a2 2 0 012-2h6l2 2h6a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2z" />
                        </svg>
                        {isGenerating ? "Generating…" : "Download Blueprint + Resilience Report"}
                      </button>
                    )}
                  </div>
                  {!stressTest && (
                    <div className="px-5 py-6 text-center">
                      <div className="text-sm text-zinc-400">Fill in your calculator fields above to see your personalised stress scenarios.</div>
                    </div>
                  )}
                  {stressTest && (
                  <div className="grid gap-3 p-5 sm:grid-cols-2">
                    {([stressTest.layoff, stressTest.marketCrash, stressTest.medical, stressTest.careerPivot, stressTest.lifestyleCreep] as const).map((scenario) => {
                      const badge =
                        scenario.status === "SURVIVES" ? "bg-emerald-500/15 text-emerald-400 ring-emerald-500/30 border-emerald-900/40"
                        : scenario.status === "AT_RISK"  ? "bg-amber-500/15 text-amber-400 ring-amber-500/30 border-amber-900/40"
                        : "bg-red-500/15 text-red-400 ring-red-500/30 border-red-900/40";
                      return (
                        <div key={scenario.name} className={`rounded-xl border bg-zinc-900 p-4 ${badge.split(" ").slice(3).join(" ")}`}>
                          <div className="flex items-start justify-between gap-2 mb-3">
                            <div className="text-sm font-semibold text-white">{scenario.name}</div>
                            <span className={`shrink-0 inline-flex rounded-full px-2.5 py-0.5 text-xs font-bold ring-1 ${badge.split(" ").slice(0,3).join(" ")}`}>
                              {scenario.status}
                            </span>
                          </div>
                          <div className="text-xs text-zinc-300 font-medium mb-3">{scenario.headline}</div>
                          <div className="grid grid-cols-3 gap-2 mb-3">
                            {scenario.numbers.map((n) => (
                              <div key={n.label} className="rounded-lg bg-zinc-800/60 px-2 py-2">
                                <div className="text-[10px] text-zinc-500 leading-tight">{n.label}</div>
                                <div className="mt-0.5 text-xs font-semibold text-zinc-200 leading-tight">{n.value}</div>
                              </div>
                            ))}
                          </div>
                          <div className="rounded-lg border border-zinc-700/40 bg-zinc-800/40 px-3 py-2">
                            <div className="text-[10px] font-semibold uppercase tracking-widest text-violet-400 mb-0.5">Action</div>
                            <div className="text-xs text-zinc-300 leading-relaxed">{scenario.action}</div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  )}
                </div>
              )}

              {/* Post-completion card — shown after Blueprint + Stress Test decision */}
              {paymentSuccess && blueprintDownloaded && (stressTestUnlocked || stressUpsellDismissed) && (
                <div className="w-full mt-4 overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-950 shadow-xl">
                  {/* Header */}
                  <div className="relative overflow-hidden border-b border-zinc-800 bg-gradient-to-r from-zinc-900 to-zinc-950 px-5 py-4">
                    <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-emerald-400/40 to-transparent" />
                    <div className="flex items-center gap-3">
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-emerald-500/15 ring-1 ring-emerald-500/30">
                        <svg className="h-4 w-4 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                      </div>
                      <div>
                        <div className="text-sm font-semibold text-white">You're set — here's what to do next</div>
                        <div className="text-xs text-zinc-500">Your leverage system is in motion</div>
                      </div>
                    </div>
                  </div>

                  {/* 24-hour action */}
                  <div className="border-b border-zinc-800/60 px-5 py-4">
                    <div className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-emerald-400">Do this in the next 24 hours</div>
                    <p className="text-sm font-medium leading-relaxed text-white">
                      {leverage.bottleneck.key === "runway"
                        ? "Open a separate high-yield savings account and label it \"Runway\". Transfer your first month's contribution today — the act of separation makes it real."
                        : leverage.bottleneck.key === "dependency"
                        ? "Calculate your current dependency ratio (annual expenses ÷ invested assets). Write it down. Set a 6-month target ratio. The awareness alone changes decisions."
                        : leverage.bottleneck.key === "velocity"
                        ? "Set up one automatic investment transfer — even $500/mo. Automation removes the monthly decision. The decision you make today repeats for years."
                        : "Write down your layoff protocol: what you cut first, what you sell first, who you call first. Having the plan removes 80% of the fear."}
                    </p>
                  </div>

                  {/* Social proof anchor */}
                  <div className="border-b border-zinc-800/60 bg-zinc-900/30 px-5 py-3.5">
                    <p className="text-xs text-zinc-400 leading-relaxed">
                      Most high earners never build a system around their income — they just earn more and spend more. By mapping your leverage score and bottleneck, you've already done what the majority won't.{" "}
                      <span className="text-zinc-300 font-medium">That gap compounds over time.</span>
                    </p>
                  </div>

                  {/* Share + 30-day footer */}
                  <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-3.5">
                    <div className="flex items-center gap-2">
                      <svg className="h-3.5 w-3.5 shrink-0 text-zinc-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
                      </svg>
                      <span className="text-xs text-zinc-500">Know someone earning well but feeling stuck?</span>
                      <button
                        onClick={() => {
                          navigator.clipboard.writeText(window.location.origin).then(() => {
                            setLinkCopied(true);
                            setTimeout(() => setLinkCopied(false), 2500);
                          });
                        }}
                        className="rounded-md border border-zinc-700 px-2.5 py-1 text-xs text-zinc-400 transition hover:border-zinc-500 hover:text-zinc-200"
                      >
                        {linkCopied ? "Link copied ✓" : "Copy link"}
                      </button>
                    </div>
                    <a
                      href={`https://calendar.google.com/calendar/render?action=TEMPLATE&text=Equanimity+Engine+30-Day+Check-In&details=Re-run+your+Leverage+Score+and+review+progress+on+your+Blueprint.&dates=${(() => { const d = new Date(); d.setDate(d.getDate() + 30); const s = d.toISOString().replace(/[-:]/g,"").split(".")[0]+"Z"; return s+"/"+s; })()}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="shrink-0 rounded-lg bg-zinc-800 px-3 py-1.5 text-xs font-medium text-zinc-300 transition hover:bg-zinc-700 hover:text-white"
                    >
                      30-day check-in →
                    </a>
                  </div>
                </div>
              )}

              {!paymentSuccess && (
                <div className="text-xs text-zinc-400 self-center">
                  After payment, you'll be redirected back here automatically.
                </div>
              )}
            </div>

            <div className="mt-6 text-xs text-zinc-400">
              Educational only, not financial advice.
            </div>
          </div>
        </section>

        <footer className="mx-auto mt-8 max-w-6xl px-1 pb-10">
          {/* Footer links */}
          <div className="mt-4 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 px-2">
            <button
              onClick={() => setShowGlossary(true)}
              className="text-xs font-medium text-indigo-500 hover:text-indigo-700 transition-colors"
            >
              Financial Glossary
            </button>
            <span className="text-xs text-zinc-300">·</span>
            {(["terms", "privacy", "cookies", "disclaimer"] as const).map((key) => (
              <button
                key={key}
                onClick={() => setLegalModal(key)}
                className="text-xs text-zinc-400 hover:text-zinc-600 transition-colors"
              >
                {key === "terms" && "Terms of Service"}
                {key === "privacy" && "Privacy Policy"}
                {key === "cookies" && "Cookie Settings"}
                {key === "disclaimer" && "Disclaimer"}
              </button>
            ))}
            <span className="text-xs text-zinc-300">·</span>
            <span className="text-xs text-zinc-400">© {new Date().getFullYear()} Equanimity Engine. All rights reserved.</span>
          </div>
        </footer>
      </main>

      {/* Legal modal */}
      {legalModal && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center sm:items-center p-4"
          onClick={() => setLegalModal(null)}
        >
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
          <div
            className="relative w-full max-w-2xl rounded-3xl border border-white/40 bg-white shadow-2xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between border-b px-6 py-4">
              <div className="text-sm font-semibold text-zinc-900">
                {legalModal === "terms" && "Terms of Service"}
                {legalModal === "privacy" && "Privacy Policy"}
                {legalModal === "cookies" && "Cookie Settings"}
                {legalModal === "disclaimer" && "Disclaimer"}
              </div>
              <button
                onClick={() => setLegalModal(null)}
                className="text-zinc-400 hover:text-zinc-700 transition-colors text-lg leading-none"
              >
                ✕
              </button>
            </div>

            {/* Body */}
            <div className="overflow-y-auto max-h-[60vh] px-6 py-5 text-sm text-zinc-600 space-y-4 leading-relaxed">
              {legalModal === "terms" && (
                <>
                  <p><strong className="text-zinc-900">Last updated: {new Date().toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" })}</strong></p>
                  <p>By accessing and using Equanimity Engine ("the Service"), you agree to be bound by these Terms of Service. If you do not agree, please do not use the Service.</p>
                  <p><strong className="text-zinc-900">Use of Service.</strong> Equanimity Engine is a financial planning tool intended for educational and informational purposes only. You may use the Service solely for personal, non-commercial use. You agree not to reproduce, distribute, or create derivative works without our express written consent.</p>
                  <p><strong className="text-zinc-900">No Financial Advice.</strong> Nothing on this platform constitutes financial, investment, legal, or tax advice. All projections and calculations are estimates based on inputs you provide. Past performance does not guarantee future results. Always consult a qualified financial professional before making financial decisions.</p>
                  <p><strong className="text-zinc-900">Intellectual Property.</strong> All content, design, and software on this platform is the property of Equanimity Engine and protected by applicable intellectual property laws.</p>
                  <p><strong className="text-zinc-900">Limitation of Liability.</strong> To the fullest extent permitted by law, Equanimity Engine shall not be liable for any indirect, incidental, or consequential damages arising from your use of the Service.</p>
                  <p><strong className="text-zinc-900">Changes.</strong> We reserve the right to modify these terms at any time. Continued use of the Service after changes constitutes acceptance.</p>
                  <p><strong className="text-zinc-900">Contact.</strong> For questions about these Terms, contact us at legal@equanimityengine.com.</p>
                </>
              )}
              {legalModal === "privacy" && (
                <>
                  <p><strong className="text-zinc-900">Last updated: {new Date().toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" })}</strong></p>
                  <p>Your privacy matters to us. This policy explains what data we collect, how we use it, and your rights.</p>
                  <p><strong className="text-zinc-900">Data We Collect.</strong> Equanimity Engine does not require account creation. Financial inputs you enter are stored locally in your browser (localStorage) solely to preserve your session. We do not transmit your financial data to our servers.</p>
                  <p><strong className="text-zinc-900">Payment Data.</strong> Payments are processed by Stripe. We do not store your credit card information. Stripe's privacy policy governs payment data handling.</p>
                  <p><strong className="text-zinc-900">Analytics.</strong> We may collect anonymised usage analytics (page views, feature interactions) to improve the Service. This data cannot be used to identify you personally.</p>
                  <p><strong className="text-zinc-900">Cookies.</strong> We use essential cookies required for the Service to function, and optional analytics cookies. You can manage cookie preferences via Cookie Settings.</p>
                  <p><strong className="text-zinc-900">Third Parties.</strong> We do not sell, trade, or rent your personal information to third parties.</p>
                  <p><strong className="text-zinc-900">Your Rights.</strong> You may request deletion of any data associated with you by contacting privacy@equanimityengine.com.</p>
                </>
              )}
              {legalModal === "cookies" && (
                <>
                  <p><strong className="text-zinc-900">Cookie Settings</strong></p>
                  <p>We use cookies and similar technologies to operate and improve Equanimity Engine. Below is a breakdown of the categories we use.</p>
                  <div className="space-y-3">
                    <div className="rounded-2xl border p-4">
                      <div className="flex items-center justify-between">
                        <div className="font-medium text-zinc-900">Essential Cookies</div>
                        <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs text-emerald-700 font-medium">Always On</span>
                      </div>
                      <p className="mt-1 text-xs text-zinc-500">Required for the Service to function. These store your form inputs locally so your data persists across sessions. Cannot be disabled.</p>
                    </div>
                    <div className="rounded-2xl border p-4">
                      <div className="flex items-center justify-between">
                        <div className="font-medium text-zinc-900">Analytics Cookies</div>
                        <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs text-zinc-500 font-medium">Optional</span>
                      </div>
                      <p className="mt-1 text-xs text-zinc-500">Help us understand how people use the platform so we can improve it. All data is anonymised and aggregated.</p>
                    </div>
                    <div className="rounded-2xl border p-4">
                      <div className="flex items-center justify-between">
                        <div className="font-medium text-zinc-900">Marketing Cookies</div>
                        <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs text-zinc-500 font-medium">Optional</span>
                      </div>
                      <p className="mt-1 text-xs text-zinc-500">Used to deliver relevant content. We do not share this data with third-party advertisers.</p>
                    </div>
                  </div>
                  <p className="text-xs text-zinc-400">To opt out of optional cookies, you can also use your browser's built-in cookie controls or a tool like uBlock Origin.</p>
                </>
              )}
              {legalModal === "disclaimer" && (
                <>
                  <p><strong className="text-zinc-900">Financial Disclaimer</strong></p>
                  <p>Equanimity Engine is an educational financial planning tool. All content, calculations, projections, and reports generated by this platform are for <strong className="text-zinc-900">informational purposes only</strong> and do not constitute financial, investment, tax, or legal advice.</p>
                  <p><strong className="text-zinc-900">No Guarantees.</strong> Financial projections are based solely on the inputs you provide and simplified mathematical models. They assume constant rates of return, exclude taxes, inflation, fees, and real-world market variability. Actual results will differ.</p>
                  <p><strong className="text-zinc-900">Not a Registered Advisor.</strong> Equanimity Engine is not a registered investment advisor, broker-dealer, or financial planner. No content on this platform should be interpreted as a personalised recommendation.</p>
                  <p><strong className="text-zinc-900">Consult a Professional.</strong> Before making any financial decision — including changes to savings, investment strategy, employment, or retirement planning — please consult a qualified and licensed financial professional who can account for your full personal circumstances.</p>
                  <p><strong className="text-zinc-900">Limitation of Liability.</strong> Equanimity Engine accepts no liability for any financial loss or damage arising from reliance on the information or outputs provided by this platform.</p>
                </>
              )}
            </div>

            {/* Footer */}
            <div className="border-t px-6 py-3 flex justify-end">
              <button
                onClick={() => setLegalModal(null)}
                className="rounded-2xl bg-zinc-900 px-5 py-2 text-sm font-medium text-white hover:bg-zinc-700 transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Tutorial modal ── */}
      {showTutorial && (() => {
        const steps = [
          {
            icon: (
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="h-7 w-7">
                <rect x="3" y="3" width="18" height="18" rx="4" />
                <path d="M8 12h8M8 8h5M8 16h3" />
              </svg>
            ),
            bg: "from-blue-500 to-indigo-600",
            glow: "shadow-blue-500/30",
            tag: "Step 1 — Enter your numbers",
            title: "Fill in your financial picture",
            body: "Enter your income, expenses, invested assets, and cash savings. Every metric on the page updates in real time as you type — no submit button needed.",
          },
          {
            icon: (
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="h-7 w-7">
                <circle cx="12" cy="12" r="9" />
                <path d="M12 7v5l3 3" />
              </svg>
            ),
            bg: "from-purple-500 to-violet-600",
            glow: "shadow-purple-500/30",
            tag: "Step 2 — Read your score",
            title: "Understand your Leverage Score",
            body: "Your score (0–100) measures how free you are from income dependency. It breaks down across four pillars: runway, dependency, velocity, and shock resistance. Higher means more options.",
          },
          {
            icon: (
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="h-7 w-7">
                <path d="M12 3C7 3 3 7 3 12s4 9 9 9 9-4 9-9" />
                <path d="M13 3.05A9 9 0 0 1 21 11" />
                <path d="M12 8v4l2.5 2.5" />
              </svg>
            ),
            bg: "from-amber-400 to-orange-500",
            glow: "shadow-amber-400/30",
            tag: "Step 3 — Stress-test your situation",
            title: "Simulate an income shock",
            body: "Use the Real Scenario Simulator to model what happens if your income drops or disappears for months. Know your breaking point before it becomes a crisis.",
          },
          {
            icon: (
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="h-7 w-7">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <polyline points="14 2 14 8 20 8" />
                <path d="M9 13l2 2 4-4" />
              </svg>
            ),
            bg: "from-emerald-500 to-teal-600",
            glow: "shadow-emerald-500/30",
            tag: "Step 4 — Get your Blueprint",
            title: "Download your personal action plan",
            body: "Unlock a premium PDF report tailored to your exact numbers — a 12-month execution plan, milestone projections, shock scenarios, and a personalized operator mandate.",
          },
        ];

        const s = steps[tutorialStep];
        const isLast = tutorialStep === steps.length - 1;

        return (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
            onClick={closeTutorial}
          >
            <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
            <div
              className="relative w-full max-w-sm"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Card */}
              <div className="rounded-3xl border border-white/20 bg-white shadow-2xl overflow-hidden">

                {/* Icon header */}
                <div className={`bg-gradient-to-br ${s.bg} p-8 flex flex-col items-center text-white`}>
                  <div className={`grid h-16 w-16 place-items-center rounded-2xl bg-white/20 shadow-xl ${s.glow} mb-4`}>
                    {s.icon}
                  </div>
                  <div className="text-xs font-semibold uppercase tracking-widest opacity-70">{s.tag}</div>
                </div>

                {/* Content */}
                <div className="px-6 pt-5 pb-2">
                  <div className="text-lg font-bold text-zinc-900 text-center">{s.title}</div>
                  <div className="mt-2 text-sm text-zinc-500 text-center leading-relaxed">{s.body}</div>
                </div>

                {/* Progress dots */}
                <div className="flex justify-center gap-1.5 py-4">
                  {steps.map((_, i) => (
                    <button
                      key={i}
                      onClick={() => setTutorialStep(i)}
                      className={`h-1.5 rounded-full transition-all duration-300 ${
                        i === tutorialStep
                          ? `w-6 bg-gradient-to-r ${s.bg}`
                          : "w-1.5 bg-zinc-200"
                      }`}
                    />
                  ))}
                </div>

                {/* Actions */}
                <div className="flex items-center justify-between gap-3 px-6 pb-6">
                  <button
                    onClick={closeTutorial}
                    className="text-sm text-zinc-400 hover:text-zinc-600 transition-colors"
                  >
                    Skip
                  </button>
                  <button
                    onClick={() => isLast ? closeTutorial() : setTutorialStep((p) => p + 1)}
                    className={`flex-1 rounded-2xl bg-gradient-to-r ${s.bg} py-2.5 text-sm font-semibold text-white shadow-lg transition-all duration-200 hover:opacity-90 active:scale-[0.98]`}
                  >
                    {isLast ? "Get started →" : "Next →"}
                  </button>
                </div>
              </div>
            </div>
          </div>
        );
      })()}
      {/* Glossary modal */}
      {showGlossary && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center sm:items-center p-4"
          onClick={() => setShowGlossary(false)}
        >
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
          <div
            className="relative z-10 w-full max-w-2xl rounded-3xl border bg-white shadow-2xl flex flex-col"
            style={{ maxHeight: "88vh" }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between border-b px-6 py-4">
              <div>
                <div className="text-sm font-semibold text-zinc-900">Financial Glossary</div>
                <div className="text-xs text-zinc-400 mt-0.5">{GLOSSARY_TERMS.length} terms used in this app — defined clearly</div>
              </div>
              <button onClick={() => setShowGlossary(false)} className="text-zinc-400 hover:text-zinc-700 transition-colors text-lg leading-none">✕</button>
            </div>

            {/* Terms list */}
            <div className="overflow-y-auto flex-1 px-6 py-5 space-y-4">
              {GLOSSARY_TERMS.map((item) => (
                <div key={item.term} className="rounded-2xl border border-zinc-100 bg-zinc-50 p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="h-2 w-2 rounded-full bg-indigo-500 shrink-0" />
                    <div className="text-sm font-semibold text-zinc-900">{item.term}</div>
                  </div>
                  <p className="text-sm text-zinc-600 leading-relaxed mb-2">{item.def}</p>
                  <div className="rounded-xl bg-indigo-50 border border-indigo-100 px-3 py-2">
                    <span className="text-xs font-semibold text-indigo-500 uppercase tracking-wide">In practice · </span>
                    <span className="text-xs text-indigo-700 leading-relaxed">{item.scenario}</span>
                  </div>
                </div>
              ))}
            </div>

            {/* Footer */}
            <div className="border-t px-6 py-4 text-xs text-zinc-400 text-center">
              These definitions also appear in the Leverage Blueprint PDF report.
            </div>
          </div>
        </div>
      )}

      {/* ── Reset Modal ── */}
      {resetModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={() => { setResetModal(null); setFullResetConfirm(false); }}>
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
          <div
            className="relative w-full max-w-sm rounded-2xl border border-zinc-800 bg-zinc-950 p-6 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="mb-1 text-base font-semibold text-white">Clear your data</div>
            <p className="mb-5 text-xs text-zinc-400 leading-relaxed">
              Choose what you'd like to clear. This cannot be undone.
            </p>

            {/* Option 1 — Reset inputs */}
            <button
              onClick={handleResetInputs}
              className="w-full rounded-xl border border-zinc-700 bg-zinc-900 px-4 py-3 text-left transition hover:border-zinc-500 hover:bg-zinc-800 mb-3"
            >
              <div className="text-sm font-medium text-white">Reset calculator inputs</div>
              <div className="mt-0.5 text-[11px] text-zinc-400">Clears all fields and your score history. Your Blueprint access is kept.</div>
            </button>

            {/* Option 2 — Full reset */}
            {!fullResetConfirm ? (
              <button
                onClick={() => setFullResetConfirm(true)}
                className="w-full rounded-xl border border-zinc-800 bg-zinc-900/50 px-4 py-3 text-left transition hover:border-red-900/60 hover:bg-red-950/20 mb-5"
              >
                <div className="text-sm font-medium text-zinc-300">Full reset</div>
                <div className="mt-0.5 text-[11px] text-zinc-500">Clears everything — inputs, history, and Blueprint access.</div>
              </button>
            ) : (
              <div className="mb-5 rounded-xl border border-red-900/50 bg-red-950/20 px-4 py-3">
                <div className="mb-2 text-[11px] font-medium text-red-400">This will remove your Blueprint purchase status. Are you sure?</div>
                <div className="flex gap-2">
                  <button
                    onClick={handleFullReset}
                    className="flex-1 rounded-lg bg-red-600 py-1.5 text-xs font-semibold text-white transition hover:bg-red-700 active:scale-95"
                  >
                    Yes, clear everything
                  </button>
                  <button
                    onClick={() => setFullResetConfirm(false)}
                    className="flex-1 rounded-lg border border-zinc-700 py-1.5 text-xs text-zinc-400 transition hover:border-zinc-500 hover:text-zinc-200"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}

            <button
              onClick={() => { setResetModal(null); setFullResetConfirm(false); }}
              className="w-full text-center text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
