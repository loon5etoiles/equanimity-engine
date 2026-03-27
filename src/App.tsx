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
const STRIPE_PAYMENT_LINK = "https://buy.stripe.com/3cI14o5oi93zbff2KkfnO02";
const STRIPE_STRESS_LINK = "https://buy.stripe.com/9B63cw5oidjP5UVacMfnO03";
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

const COMING_SOON = false; // Toggle this to show the "coming soon" page instead of the app

export default function App() {
  if (COMING_SOON) {
    return (
      <div className="min-h-screen bg-zinc-950 flex flex-col items-center justify-center text-center px-6">
        <h1 className="text-4xl font-bold text-white mb-3">Equanimity Engine™</h1>
        <p className="text-zinc-400 text-lg mb-2">Something powerful is coming.</p>
        <p className="text-zinc-500 text-sm">Private beta in progress — check back soon.</p>
      </div>
    );
  }


  const _saved = loadSavedInputs();
  const [userName, setUserName] = useState<string>(_saved?.userName ?? "");
  const [age, setAge] = useState<number>(_saved?.age ?? 0);
  const [investedStart, setInvestedStart] = useState<number>(_saved?.investedStart ?? 0);
  const [cashStart, setCashStart] = useState<number>(_saved?.cashStart ?? 0);
  const [bufferTarget, setBufferTarget] = useState<number>(_saved?.bufferTarget ?? 0);
  const [monthlyIncome, setMonthlyIncome] = useState<number>(_saved?.monthlyIncome ?? 0);
  const [monthlyExpenses, setMonthlyExpenses] = useState<number>(_saved?.monthlyExpenses ?? 0);
  const [monthlyInvest, setMonthlyInvest] = useState<number>(_saved?.monthlyInvest ?? 0);
  const [annualReturnPct, setAnnualReturnPct] = useState<number>(_saved?.annualReturnPct ?? 0);
  const [target, setTarget] = useState<number>(_saved?.target ?? 0);
  const [goalName, setGoalName] = useState<string>(_saved?.goalName ?? "");
  const [years, setYears] = useState<number>(_saved?.years ?? 0);
  const [shockMonths, setShockMonths] = useState<number>(_saved?.shockMonths ?? 0);
  const [incomeDropPct, setIncomeDropPct] = useState<number>(_saved?.incomeDropPct ?? 0);
  const [tab, setTab] = useState<"projection" | "milestones" | "runway">("projection");
  const [paymentSuccess, setPaymentSuccess] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [blueprintEmail, setBlueprintEmail] = useState("");
  const [isSendingEmail, setIsSendingEmail] = useState(false);
  const [emailSent, setEmailSent] = useState(false);
  const [emailError, setEmailError] = useState("");
  const [blueprintDownloaded, setBlueprintDownloaded] = useState(() => {
    try { return localStorage.getItem("ee_blueprint_downloaded") === "1"; } catch { return false; }
  });
  const [stressTestUnlocked, setStressTestUnlocked] = useState(false);
  const [authVerifying, setAuthVerifying] = useState(() => {
    try { return !!localStorage.getItem("ee_auth_token"); } catch { return false; }
  });
  const [stressUpsellDismissed, setStressUpsellDismissed] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);
  const [justPurchased, setJustPurchased] = useState(false);
  const [justStressPurchased, setJustStressPurchased] = useState(false);
  const [stressTestExpanded, setStressTestExpanded] = useState(false);
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
  const [shockTabOpen, setShockTabOpen] = useState(false);

  // Auto-expand shock tab on load, then collapse
  React.useEffect(() => {
    const openTimer = setTimeout(() => setShockTabOpen(true), 3000);
    const closeTimer = setTimeout(() => setShockTabOpen(false), 7000);
    return () => { clearTimeout(openTimer); clearTimeout(closeTimer); };
  }, []);

  const closeTutorial = () => {
    try { localStorage.setItem("ee_tutorial_seen", "1"); } catch {}
    setShowTutorial(false);
    setTutorialStep(0);
  };

  useEffect(() => {
    // Remove stale localStorage payment flags — server JWT is now the source of truth
    try {
      localStorage.removeItem("ee_stress_unlocked");
      localStorage.removeItem("ee_stress_paid");
      localStorage.removeItem("ee_blueprint_paid");
      localStorage.removeItem("ee_st_v3");
    } catch {}

    const params = new URLSearchParams(window.location.search);
    const isBlueprint = params.get("success") === "1";
    const isStress = params.get("stress_success") === "1";
    const sessionId = params.get("session_id");

    // Clean URL immediately so refresh doesn't re-trigger
    const cleanUrl = new URL(window.location.href);
    cleanUrl.searchParams.delete("success");
    cleanUrl.searchParams.delete("stress_success");
    cleanUrl.searchParams.delete("session_id");
    window.history.replaceState({}, "", cleanUrl.toString());

    // Handle ?s= state sharing URL
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

    const restoreForm = () => {
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
    };

    const applyProducts = (products: string[]) => {
      if (products.includes("blueprint")) setPaymentSuccess(true);
      if (products.includes("stress_test")) setStressTestUnlocked(true);
    };

    if ((isBlueprint || isStress) && sessionId) {
      // Returning from Stripe — verify session with server
      restoreForm();
      (async () => {
        try {
          const res = await fetch("/api/verify-session", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ sessionId }),
          });
          if (res.ok) {
            const { token, products } = await res.json();
            try { localStorage.setItem("ee_auth_token", token); } catch {}
            applyProducts(products);
            if (isBlueprint) setJustPurchased(true);
            if (isStress) setJustStressPurchased(true);
          }
        } catch {}
        setAuthVerifying(false);
      })();
    } else {
      // Regular page load — verify existing token with server
      const token = localStorage.getItem("ee_auth_token");
      if (!token) { setAuthVerifying(false); return; }
      (async () => {
        try {
          const res = await fetch("/api/verify-token", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ token }),
          });
          if (res.ok) {
            const { valid, products } = await res.json();
            if (valid) {
              applyProducts(products);
            } else {
              try { localStorage.removeItem("ee_auth_token"); } catch {}
            }
          }
        } catch {}
        setAuthVerifying(false);
      })();
    }
  }, []);

  // Persist inputs to localStorage (debounced 600ms)
  useEffect(() => {
    const t = setTimeout(() => {
      try {
        localStorage.setItem(EE_INPUTS_KEY, JSON.stringify({
          userName, age, investedStart, cashStart, bufferTarget, monthlyIncome,
          monthlyExpenses, monthlyInvest, annualReturnPct, target,
          years, shockMonths, incomeDropPct, goalName,
        }));
      } catch {}
    }, 600);
    return () => clearTimeout(t);
  }, [userName, age, investedStart, cashStart, bufferTarget, monthlyIncome,
      monthlyExpenses, monthlyInvest, annualReturnPct, target,
      years, shockMonths, incomeDropPct, goalName]);

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

  // Auto-scroll to blueprint section immediately after payment redirect
  useEffect(() => {
    if (!justPurchased) return;
    // Blueprint refresh flow: if stress test was already purchased, keep it visible
    if (stressTestUnlocked) setStressTestExpanded(true);
    const timer = setTimeout(() => {
      document.getElementById("plan")?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 500);
    return () => clearTimeout(timer);
  }, [justPurchased]); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-scroll to blueprint section after stress test add-on payment, and expand results
  useEffect(() => {
    if (!justStressPurchased) return;
    setStressTestExpanded(true);
    const timer = setTimeout(() => {
      document.getElementById("plan")?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 500);
    return () => clearTimeout(timer);
  }, [justStressPurchased]);

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
          nextStep: "Aim for expenses below 4% of invested assets (or grow assets faster than expenses).",
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
      const cashSurplusForRunway = Math.max(0, surplus - monthlyInvest);
      const monthsAtSurplus = cashSurplusForRunway > 0 && cashNeeded > 0 ? Math.ceil(cashNeeded / cashSurplusForRunway) : null;
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
            ? `Redirect ${fmt(cashSurplusForRunway)}/mo to cash (after investing) — runway target in ${monthsAtSurplus} months`
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
      // Expense cut needed to hit 4% ratio with current invested assets — only meaningful if realistic
      const rawExpenseCut = dependencyRatio > targetRatio
        ? Math.ceil(((dependencyRatio - targetRatio) * investedStart) / 12) : 0;
      const scoreGain = comp("dependency").max - comp("dependency").points;

      // Guard: additionalMonthly > monthly income means the 10-year gap-close target is unreachable
      const isUnrealisticInvestIncrease = additionalMonthly > monthlyIncome;
      // Guard: expense cut > 40% of current expenses means the formula is producing an impractical result
      const isUnrealisticExpenseCut = rawExpenseCut > monthlyExpenses * 0.4;

      const action1 = isUnrealisticInvestIncrease
        ? yrsToTarget
          ? `Invest consistently at ${fmt(monthlyInvest)}/mo — your trajectory reaches Freedom Number in ${yrsToTarget.toFixed(1)} yrs`
          : `Asset gap is large (${fmt(gapToTarget)}) — prioritise consistent investing over time`
        : additionalMonthly > 0
          ? `Increase monthly investment by ${fmt(additionalMonthly)} to close the asset gap over 10 years`
          : "Maintain current investment rate";

      const action2 = isUnrealisticExpenseCut
        ? `Asset growth is the primary lever here — expenses are not the constraint, invested assets are too low relative to expenses`
        : rawExpenseCut > 0
          ? `Reduce fixed monthly expenses by ${fmt(rawExpenseCut)} to lower your withdrawal rate`
          : "Keep expense growth below income growth";

      return {
        title: "Income Dependency",
        icon: "⛓",
        color: "amber",
        current: `${(dependencyRatio * 100).toFixed(1)}% annual withdrawal rate`,
        target: `< 4.0% withdrawal rate`,
        gapPct: Math.min(100, Math.round((targetRatio / Math.max(dependencyRatio, 0.001)) * 100)),
        gapLabel: gapToTarget > 0 ? `${fmt(gapToTarget)} to grow invested assets to safe level` : "Dependency in safe range",
        actions: [
          action1,
          action2,
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
      const cashSurplusForShock = Math.max(0, surplus - monthlyInvest);
      const monthsToFill = cashSurplusForShock > 0 && shockGap > 0 ? Math.ceil(shockGap / cashSurplusForShock) : null;
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
            ? `Redirect ${fmt(cashSurplusForShock)}/mo to shock buffer (after investing) — gap filled in ${monthsToFill} months`
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

  // Guilt-free spending engine
  const guiltFree = useMemo(() => {
    if (!hasInputs || monthlyIncome <= 0) return null;

    // Reverse PMT: monthly contribution needed to reach `amount` in `yrs` years
    const monthlyNeeded = (amount: number, current: number, yrs: number): number => {
      if (yrs <= 0 || amount <= 0) return 0;
      const r = annualRate / 12;
      const n = Math.round(yrs * 12);
      if (r === 0) return Math.max(0, (amount - current) / n);
      const growth = Math.pow(1 + r, n);
      const fvCurrent = current * growth;
      if (fvCurrent >= amount) return 0;
      return Math.max(0, (amount - fvCurrent) / ((growth - 1) / r));
    };

    const eqNum = monthlyExpenses > 0 ? monthlyExpenses * 12 * 10 : 0;
    const eqHorizon = 10; // years to hit equanimity
    const needForEq = eqNum > 0 && investedStart < eqNum
      ? monthlyNeeded(eqNum, investedStart, eqHorizon) : 0;
    const needForTarget = target > 0 && years > 0 && investedStart < target
      ? monthlyNeeded(target, investedStart, years) : 0;
    // Runway top-up: fill 6-month gap over 12 months
    const runwayGap = Math.max(0, monthlyExpenses * 6 - cashStart);
    const runwayTopup = runwayGap > 0 ? Math.ceil(runwayGap / 12) : 0;
    // Buffer top-up: build comfort buffer over 3 months
    const bufferTopup = bufferTarget > 0 ? Math.ceil(bufferTarget / 3) : 0;

    const requiredInvest = Math.max(needForEq, needForTarget);
    const totalRequired = requiredInvest + runwayTopup + bufferTopup;
    const base = Math.max(0, monthlyIncome - monthlyExpenses - totalRequired);

    // Three tiers
    const tiers = [
      { key: "conservative", label: "Conservative", spend: Math.round(base * 0.5),  invest: Math.round(totalRequired + base * 0.5),  color: "emerald", desc: "Invest the surplus — reach goals faster" },
      { key: "balanced",     label: "Balanced",     spend: Math.round(base),         invest: Math.round(totalRequired),               color: "violet",  desc: "On track — enjoy what's left guilt-free" },
      { key: "generous",     label: "Generous",     spend: Math.round(base * 1.35),  invest: Math.round(totalRequired - base * 0.35), color: "amber",   desc: "Slight delay to goals — within tolerance" },
    ];

    return { base, requiredInvest, runwayTopup, bufferTopup, totalRequired, tiers, eqNum, eqHorizon };
  }, [hasInputs, monthlyIncome, monthlyExpenses, monthlyInvest, cashStart, bufferTarget, investedStart, annualRate, target, years]);


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
    setUserName(""); setAge(0); setInvestedStart(0); setCashStart(0); setBufferTarget(0);
    setMonthlyIncome(0); setMonthlyExpenses(0); setMonthlyInvest(0);
    setAnnualReturnPct(0); setTarget(0); setYears(0); setShockMonths(6); setIncomeDropPct(50);
    setGoalName("");
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

  const handleBlueprintRefresh = () => {
    setBlueprintDownloaded(false);
    try {
      localStorage.removeItem("ee_blueprint_downloaded");
      localStorage.removeItem("ee_blueprint_pdf_snapshot");
      // Keep ee_auth_token — server will add blueprint again on verify-session
    } catch {}
    handleCheckout(STRIPE_PAYMENT_LINK);
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

  const generateLeverageBlueprintPdf = (mode: "download" | "base64" = "download"): string | void => {
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
    const eqNum    = monthlyExpenses > 0 ? annualExpenses * 10 : 0;
    const runwayGap = Math.max(0, 6 - runwayMonths);
    // Cash available after investing — the realistic rate at which runway can be built
    // without pausing investments
    const cashSurplus = Math.max(0, surplus - monthlyInvest);
    const monthsToCloseRunwayGap: number | null =
      cashSurplus > 0 && runwayGap > 0
        ? Math.ceil((runwayGap * monthlyExpenses) / cashSurplus)
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
    const displayName = userName.trim() || null;

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
        ? `Your runway is ${runwayMonths.toFixed(1)} months — ${runwayGap.toFixed(1)} months below the 6-month threshold. That is why the job feels mandatory.${monthsToCloseRunwayGap ? ` After investing (${fmt(monthlyInvest)}/mo), you have ${fmt(cashSurplus)}/mo for cash savings — closing this gap in ${monthsToCloseRunwayGap} months.` : ""} Fix runway before optimizing anything else.`
        : dependencyRatio > 0.05
        ? `You are structurally dependent on income. Annual expenses of ${fmt(annualExpenses)} are too large relative to your invested base of ${fmt(investedStart)}. Reduce fixed costs and increase velocity.`
        : !yrsToTarget || yrsToTarget > 10
        ? `Velocity is your constraint. At your current invest rate of ${fmt(monthlyInvest)}/mo, your timeline to ${fmt(target)} is long. Increase invest-rate sustainably to compress this window.`
        : "You are in a strong position. The mission now is consistency: protect the engine and keep fixed costs from creeping up.";

    const directive =
      bottleneck.toLowerCase().includes("runway")
        ? `Directive: build runway from ${runwayMonths.toFixed(1)} to 6–8 months. After investing (${fmt(monthlyInvest)}/mo), you have ${fmt(cashSurplus)}/mo for cash savings — that is ${monthsToCloseRunwayGap ?? "several"} months of focused discipline. Stress drops fastest here.`
        : bottleneck.toLowerCase().includes("dependency")
        ? `Directive: close the dependency gap. Annual expenses of ${fmt(annualExpenses)} vs invested assets of ${fmt(investedStart)} means a ${dependencyPct?.toFixed(1) ?? "–"}% withdrawal rate. Keep lifestyle flat while assets rise.`
        : bottleneck.toLowerCase().includes("velocity")
        ? `Directive: increase wealth velocity with a sustainable invest-rate bump. Every +$500/mo compresses your timeline by ${leverage?.needle?.plus500 && yrsToTarget ? (yrsToTarget - leverage.needle.plus500).toFixed(1) : "~"} years.`
        : bottleneck.toLowerCase().includes("shock")
        ? `Directive: harden your shock resilience. Cash of ${fmt(cashStart)} vs ${fmt(monthlyExpenses * 6)} needed for 6 months. Close this gap with cash accumulation first.`
        : `Directive: resolve the primary constraint first — ${bottleneck}.`;

    const baseTxt = yrsToTarget ? `${yrsToTarget.toFixed(1)} yrs` : "–";
    const plus500Txt =
      leverage?.needle?.plus500 != null ? `${leverage.needle.plus500.toFixed(1)} yrs` : "–";
    const plus1000Txt =
      leverage?.needle?.plus1000 != null ? `${leverage.needle.plus1000.toFixed(1)} yrs` : "–";

    // ================================================================
    // COVER PAGE — PREMIUM
    // ================================================================

    // Cover-only colours (scoped to avoid conflicts)
    const cBg    = { r: 4,   g: 8,   b: 15  };
    const cN2    = { r: 8,   g: 20,  b: 38  };
    const cN3    = { r: 12,  g: 28,  b: 55  };
    const cN4    = { r: 18,  g: 40,  b: 78  };
    const cGold  = { r: 184, g: 137, b: 0   };
    const cGoldL = { r: 218, g: 170, b: 30  };
    const cGoldP = { r: 240, g: 210, b: 100 };
    const cTeal  = { r: 20,  g: 184, b: 166 };
    const cTealD = { r: 13,  g: 148, b: 136 };
    const cDim   = { r: 40,  g: 55,  b: 80  };
    const cWhite = { r: 255, g: 255, b: 255 };
    const cOff   = { r: 220, g: 228, b: 240 };

    const csf = (c: { r: number; g: number; b: number }) => doc.setFillColor(c.r, c.g, c.b);
    const csd = (c: { r: number; g: number; b: number }) => doc.setDrawColor(c.r, c.g, c.b);
    const cst = (c: { r: number; g: number; b: number }) => doc.setTextColor(c.r, c.g, c.b);

    // ── 1. Deep background ──────────────────────────────────────────────────
    csf(cBg); doc.rect(0, 0, pageW, pageH, "F");

    // Depth rings: progressively lighter navy rectangles shrinking inward
    const depthLevels: [number, number, number][] = [
      [10, 18, 44], [12, 24, 52], [14, 30, 60], [16, 36, 68],
    ];
    depthLevels.forEach(([r, g, b], i) => {
      doc.setFillColor(r, g, b);
      const s = (i + 1) * 32;
      doc.rect(s, s, pageW - s * 2, pageH - s * 2, "F");
    });

    // ── 2. Gold top bar + teal accent ───────────────────────────────────────
    csf(cGold); doc.rect(0, 0, pageW, 4, "F");
    csf(cTeal); doc.rect(0, 4, pageW, 1.5, "F");

    // ── 3. Brand strip ──────────────────────────────────────────────────────
    doc.setFont("helvetica", "bold"); doc.setFontSize(8);
    doc.setCharSpace(2.8); cst(cGoldL);
    doc.text("EQUANIMITY ENGINE", 48, 34);
    doc.setCharSpace(0);

    doc.setFont("helvetica", "normal"); doc.setFontSize(7); cst(cDim);
    doc.text("CONFIDENTIAL  ·  PERSONALISED REPORT", pageW - 48, 34, { align: "right" });

    // ── 5. Main title (top-centred) ──────────────────────────────────────────
    const titleCX = pageW / 2;

    // Subtle title backdrop glow
    doc.setFillColor(10, 22, 48);
    doc.roundedRect(48, 52, pageW - 96, 116, 6, 6, "F");

    // Gold left-edge accent bar on backdrop
    csf(cGold); doc.rect(48, 52, 3.5, 116, "F");

    doc.setFont("helvetica", "bold"); doc.setFontSize(52); cst(cOff);
    doc.setCharSpace(3);
    doc.text("LEVERAGE", titleCX, 100, { align: "center" });
    cst(cTeal);
    doc.text("BLUEPRINT", titleCX, 152, { align: "center" });
    doc.setCharSpace(0);

    // Thin teal underline accent
    const accentW = 160;
    csd(cTeal); doc.setLineWidth(1.2);
    doc.line(titleCX - accentW / 2, 163, titleCX + accentW / 2, 163);

    doc.setFont("helvetica", "normal"); doc.setFontSize(9);
    doc.setTextColor(90, 110, 140);
    const cvSub = goalName ? `Freedom Strategy · ${goalName}` : "Personalised Financial Independence Strategy";
    doc.text(cvSub.length > 52 ? cvSub.slice(0, 50) + "…" : cvSub, titleCX, 178, { align: "center" });

    // Decorative corner bracket lines (top right, above title)
    csd(cGold); doc.setLineWidth(0.5);
    for (let di = 0; di < 4; di++) {
      const off = di * 10;
      doc.line(pageW - 30 - off, 8, pageW - 30, 8 + off);
    }
    // Bottom-left corner bracket
    csd(cTealD); doc.setLineWidth(0.5);
    for (let di = 0; di < 4; di++) {
      const off = di * 10;
      doc.line(30 + off, pageH - 8, 30, pageH - 8 - off);
    }

    // ── 7. Gold + teal horizontal rules ─────────────────────────────────────
    const cvRuleY = pageH * 0.785;
    csd(cGold); doc.setLineWidth(0.8);
    doc.line(48, cvRuleY, pageW - 48, cvRuleY);
    csd(cTealD); doc.setLineWidth(0.35);
    doc.line(48, cvRuleY + 4.5, pageW - 48, cvRuleY + 4.5);

    // ── 8. Bottom band ───────────────────────────────────────────────────────
    const cvBY = cvRuleY + 24;

    // "Prepared For" — left side
    if (userName) {
      // Label
      doc.setFont("helvetica", "bold"); doc.setFontSize(6.5);
      doc.setCharSpace(2.5); cst(cGoldL);
      doc.text("PREPARED FOR", 48, cvBY);
      doc.setCharSpace(0);

      // Name
      doc.setFont("helvetica", "bold"); doc.setFontSize(22); cst(cOff);
      doc.text(userName, 48, cvBY + 20);

      // Thin teal underline beneath name
      const nameW = doc.getTextWidth(userName);
      csd(cTeal); doc.setLineWidth(0.8);
      doc.line(48, cvBY + 24, 48 + Math.min(nameW, pageW / 2 - 60), cvBY + 24);
    }

    // Date + edition (right-aligned)
    doc.setFont("helvetica", "normal"); doc.setFontSize(8);
    doc.setTextColor(90, 110, 140);
    doc.text(`Generated ${dateStr}`, pageW - 48, cvBY, { align: "right" });
    doc.setFontSize(6.5);
    doc.setTextColor(40, 55, 80);
    doc.text("Premium Edition · Equanimity Engine\u2122", pageW - 48, cvBY + 14, { align: "right" });

    // Cover footer (no page number — cover is unnumbered)
    doc.setFont("helvetica", "normal"); doc.setFontSize(6);
    doc.setTextColor(40, 55, 80);
    doc.text(
      "Educational and planning purposes only — not financial advice.",
      pageW / 2, pageH - 16, { align: "center" }
    );
    // ================================================================
    // TABLE OF CONTENTS — placeholder page (rendered at end via setPage)
    // ================================================================
    doc.addPage();
    pageNum++; // page 2
    const tocPageNum = pageNum;
    const tocEntries: Array<{ title: string; subtitle: string; page: number }> = [];

    // ================================================================
    // YOUR FINANCIAL SNAPSHOT
    // ================================================================
    doc.addPage();
    pageNum++;
    tocEntries.push({ title: "Your Financial Snapshot", subtitle: "Every number that drives your leverage score.", page: pageNum });
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
    statRow("Your Target", fmt(target), col2X, y);
    y += rowH;

    statRow("Gap to Your Target", fmt(targetGap), col1X, y);
    statRow("Freedom Number (4% Rule)", fmt(fiNumber), col2X, y);
    y += rowH;

    statRow("Emergency Runway", `${runwayMonths.toFixed(1)} months`, col1X, y);
    statRow(
      "Dependency Ratio",
      dependencyPct != null ? `${dependencyPct.toFixed(2)}%` : "–",
      col2X,
      y
    );
    y += rowH + 14;

    const snapshotNarrative =
      runwayMonths < 6
        ? `Your runway of ${runwayMonths.toFixed(1)} months is ${runwayGap.toFixed(1)} months below the 6-month safety threshold. You need ${fmt(runwayGap * monthlyExpenses)} more in cash to reach baseline stability. After investing (${fmt(monthlyInvest)}/mo), you have ${fmt(cashSurplus)}/mo for cash savings — that takes ${monthsToCloseRunwayGap ?? "~"} months of focused accumulation.`
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
    tocEntries.push({ title: "Shock Testing Lab", subtitle: "Runway, dependency and velocity stress-tested.", page: pageNum });
    sectionHeader("Shock Testing Lab", "Runway, dependency and velocity stress-tested.");
    let y1 = 110;
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
    doc.text("Scenario A: Job loss (income drops 100%)", margin, y1);
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
    doc.text("Scenario B: Pay cut (6 months)", margin, y1);
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
    doc.text("Scenario C: Sabbatical (expenses reduced 10%)", margin, y1);
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
    tocEntries.push({ title: "Leverage Breakdown", subtitle: "Four sub-systems. One constraint to fix first.", page: pageNum });
    sectionHeader("Leverage Breakdown", "Four sub-systems. One constraint to fix first.");
    let y2 = 110;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(11);
    doc.setTextColor(90);
    y2 = wrap(
      doc,
      `Your total score is a composite of four sub-systems. The fastest path to your Equanimity Number (${eqNum > 0 ? fmt(eqNum) : "calculated once expenses are entered"}) is improving the lowest sub-system first.`,
      margin,
      y2,
      pageW - margin * 2
    );
    y2 += 18;

    doc.setFont("helvetica", "bold");
    doc.setFontSize(13);
    setRGB(INK);
    doc.text(`Total Leverage Score: ${leverage?.total ?? "–"} / 100`, margin, y2);
    y2 += 22;

    const barAreaW = pageW - margin * 2;
    y2 = scoreBar("Runway Strength", breakdown.runwayScore, 30, margin, y2, barAreaW);
    y2 = scoreBar("Income Dependency", breakdown.dependencyScore, 25, margin, y2, barAreaW);
    y2 = scoreBar("Wealth Velocity", breakdown.velocityScore, 25, margin, y2, barAreaW);
    y2 = scoreBar("Shock Resistance", breakdown.shockScore, 20, margin, y2, barAreaW);
    y2 += 14;

    const subRows = [
      ["Runway strength", `${breakdown.runwayScore}/30`, runwayMonths.toFixed(1) + " months emergency runway"],
      ["Income dependency", `${breakdown.dependencyScore}/25`, dependencyPct != null ? `${dependencyPct.toFixed(1)}% annual spend / assets` : "–"],
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
    tocEntries.push({ title: "Executive Snapshot", subtitle: "The truth in one page. No fluff.", page: pageNum });
    sectionHeader("Executive Snapshot", "The truth in one page. No fluff.");

    y = 110;
    const cardW = (pageW - margin * 2 - 16) / 2;
    const cardH = 86;

    kpiCard("Leverage Score", String(leverage?.total ?? "–"), margin, y, cardW, cardH);
    kpiCard("Optionality Class", leverageLabel, margin + cardW + 16, y, cardW, cardH);
    y += cardH + 16;

    kpiCard("Monthly Surplus", fmt(surplus), margin, y, cardW, cardH);
    kpiCard("Age at Target", ageAtTarget ? `${ageAtTarget.toFixed(0)}` : "–", margin + cardW + 16, y, cardW, cardH);
    y += cardH + 22;

    callout("Diagnosis", diagnosis, margin, y, pageW - margin * 2, 110);
    y += 126;
    y = ensureRoom(y, 130);
    callout("Operator Directive", directive, margin, y, pageW - margin * 2, 110);

    footer();

    // ================================================================
    // YOUR LEVERAGE PLAYBOOK
    // ================================================================
    if (leverage?.recs && leverage.recs.length > 0) {
      doc.addPage();
      pageNum++;
      tocEntries.push({ title: "Your Leverage Playbook", subtitle: "The strategic moves behind your 12-month plan.", page: pageNum });
      sectionHeader("Your Leverage Playbook", "The strategic moves behind your 12-month plan.");
      y = 110;

      // Intro line
      doc.setFont("helvetica", "normal"); doc.setFontSize(10); setRGB(MUTED);
      const recsIntro = `Your 12-month plan sets the numbers. This section addresses the structural and behavioral decisions that determine whether those numbers get executed. Each priority is sequenced by its impact on your primary constraint: ${breakdown.bottleneck.name}.`;
      const recsIntroLines = doc.splitTextToSize(recsIntro, pageW - margin * 2);
      doc.text(recsIntroLines, margin, y);
      y += recsIntroLines.length * 13 + 12;

      leverage.recs.forEach((rec, i) => {
        // Calculate card height based on content
        doc.setFont("helvetica", "normal"); doc.setFontSize(9.5);
        const whyLines = doc.splitTextToSize(rec.why, pageW - margin * 2 - 88);
        const nextLines = doc.splitTextToSize(`Next: ${rec.nextStep}`, pageW - margin * 2 - 88);
        const cardH = 22 + whyLines.length * 12 + 8 + nextLines.length * 12 + 16;

        if (y + cardH > pageH - 50) { footer(); doc.addPage(); pageNum++; y = 50; }

        // Card background
        doc.setFillColor(248, 250, 252);
        doc.setDrawColor(BORDER.r, BORDER.g, BORDER.b);
        doc.roundedRect(margin, y, pageW - margin * 2, cardH, 8, 8, "FD");

        // Accent left bar (gold colour matching bottleneck importance)
        doc.setFillColor(ACCENT.r, ACCENT.g, ACCENT.b);
        doc.roundedRect(margin, y, 5, cardH, 8, 8, "F");

        // Number badge
        doc.setFillColor(ACCENT.r, ACCENT.g, ACCENT.b);
        doc.circle(margin + 22, y + 18, 9, "F");
        doc.setFont("helvetica", "bold"); doc.setFontSize(9);
        doc.setTextColor(255, 255, 255);
        doc.text(String(i + 1), margin + 22, y + 22, { align: "center" });

        // Title
        doc.setFont("helvetica", "bold"); doc.setFontSize(11); setRGB(INK);
        doc.text(rec.title, margin + 40, y + 22);

        // Why
        const whyY = y + 38;
        doc.setFont("helvetica", "italic"); doc.setFontSize(9); setRGB(MUTED);
        doc.text(whyLines, margin + 40, whyY);

        // Next step
        const nextY = whyY + whyLines.length * 12 + 8;
        doc.setFont("helvetica", "bold"); doc.setFontSize(8.5);
        doc.setTextColor(ACCENT.r, ACCENT.g, ACCENT.b);
        doc.text(`Next: `, margin + 40, nextY);
        const nextLabelW = doc.getTextWidth("Next: ");
        doc.setFont("helvetica", "normal"); doc.setFontSize(8.5); setRGB(INK);
        // First line of next step after label
        const firstNextLine = nextLines[0] ? nextLines[0].replace(/^Next: /, "") : "";
        doc.text(firstNextLine, margin + 40 + nextLabelW, nextY);
        if (nextLines.length > 1) {
          const remainingLines = nextLines.slice(1).map((l: string) => l.replace(/^Next: /, ""));
          doc.text(remainingLines, margin + 40, nextY + 12);
        }

        y += cardH + 10;
      });

      footer();
    }

    // ================================================================
    // FINANCIAL DEPENDENCY MAP
    // ================================================================
    doc.addPage();
    pageNum++;
    tocEntries.push({ title: "Financial Dependency Map", subtitle: "What's driving dependency — and what to fix first.", page: pageNum });
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
      `Annual expenses: ${fmt(annualExpenses)} (${fmt(monthlyExpenses)}/mo). Invested assets: ${fmt(investedStart)}. Dependency ratio: ${dependencyPct != null ? `${dependencyPct.toFixed(2)}%` : "–"} of assets consumed per year. Target dependency below 4% (safe withdrawal rate). Current gap: ${dependencyPct != null ? `${(dependencyPct - 4).toFixed(2)}%` : "–"}.`,
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
    tocEntries.push({ title: "Wealth Velocity Model", subtitle: "Milestones that change your behaviour — not just your net worth.", page: pageNum });
    sectionHeader("Wealth Velocity Model", "Milestones that change your behavior — not just your net worth.");

    y = 110;
    (autoTable as any)(doc, {
      startY: y,
      head: [["Milestone", "When (est.)", "Age", "Meaning"]],
      body: [250000, 500000, 750000, 1000000].map((t) => {
        const yy = yearsToTarget(investedStart, monthlyInvest, annualRate, t);
        const when = yy ? `${yy.toFixed(1)} yrs` : "–";
        const ageAt = yy ? `${(age + yy).toFixed(0)}` : "–";
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
      ? `At your current invest rate of ${fmt(monthlyInvest)}/mo and ${annualReturnPct.toFixed(1)}% annual return, you reach Your Target of ${fmt(target)} in ${yrsToTarget.toFixed(1)} years — age ${ageAtTarget?.toFixed(0) ?? "–"}. Adding $500/mo compresses the timeline to ${plus500Txt}. The compounding advantage of consistent investing outweighs nearly any other variable.`
      : "Set a Target to see your personalized velocity projections.";

    callout("Velocity Insight", velocityNarrative, margin, y, pageW - margin * 2, 100);

    y += 118;

    // ---- Three Milestones panel ----
    if (y + 260 > pageH - 50) { footer(); doc.addPage(); pageNum++; y = 110; }

    doc.setFont("helvetica", "bold"); doc.setFontSize(12); setRGB(INK);
    doc.text("Your Three Milestones", margin, y); y += 16;

    const mw = (pageW - margin * 2 - 16) / 3; // card width
    const mh = 128;
    const milestones: Array<{
      title: string; amount: string; formula: string; tagline: string;
      bg: [number,number,number]; border: [number,number,number]; accent: [number,number,number];
    }> = [
      {
        title:   "Equanimity Number",
        amount:  eqNum > 0 ? fmt(eqNum) : "–",
        formula: `${fmt(monthlyExpenses)}/mo × 12 × 10`,
        tagline: "Passive income covers 40% of expenses. Anxiety begins to lift.",
        bg:      [240, 253, 250],
        border:  [20, 184, 166],
        accent:  [15, 118, 110],
      },
      {
        title:   "Freedom Number",
        amount:  fiNumber > 0 ? fmt(fiNumber) : "–",
        formula: `${fmt(monthlyExpenses)}/mo × 12 × 25`,
        tagline: "Passive income covers 100% of expenses. Work becomes truly optional.",
        bg:      [254, 252, 232],
        border:  [202, 138, 4],
        accent:  [133, 77, 14],
      },
      {
        title:   "Your Target",
        amount:  target > 0 ? fmt(target) : "Not set",
        formula: "Your personal goal",
        tagline: target > 0 && fiNumber > 0
          ? (target >= fiNumber
            ? `${((target / fiNumber - 1) * 100).toFixed(0)}% above Freedom Number`
            : `${((1 - target / fiNumber) * 100).toFixed(0)}% below Freedom Number`)
          : "Set a target to track progress",
        bg:      [239, 246, 255],
        border:  [37, 99, 235],
        accent:  [30, 64, 175],
      },
    ];

    milestones.forEach((m, i) => {
      const mx = margin + i * (mw + 8);
      doc.setFillColor(...m.bg);
      doc.setDrawColor(...m.border);
      doc.setLineWidth(1.2);
      doc.roundedRect(mx, y, mw, mh, 6, 6, "FD");
      // accent top bar
      doc.setFillColor(...m.border);
      doc.roundedRect(mx, y, mw, 4, 3, 3, "F");

      doc.setFont("helvetica", "bold"); doc.setFontSize(8.5);
      doc.setTextColor(...m.accent);
      doc.text(m.title.toUpperCase(), mx + 10, y + 20);

      doc.setFont("helvetica", "bold"); doc.setFontSize(15);
      doc.setTextColor(...m.accent);
      doc.text(m.amount, mx + 10, y + 44);

      doc.setFont("helvetica", "normal"); doc.setFontSize(7.5);
      doc.setTextColor(80, 80, 80);
      doc.text(m.formula, mx + 10, y + 60);

      doc.setFont("helvetica", "normal"); doc.setFontSize(7.5);
      doc.setTextColor(...m.accent);
      doc.text(doc.splitTextToSize(m.tagline, mw - 20), mx + 10, y + 78);
    });

    y += mh + 14;

    // Comparison narrative
    const fiDiff = fiNumber - target;
    const fiDiffPct = target > 0 && fiNumber > 0 ? Math.abs(fiDiff / fiNumber) * 100 : 0;
    const targetAlignInsight =
      fiNumber <= 0
        ? "Enter your monthly expenses to see your Freedom Number and Equanimity Number."
        : target <= 0
        ? `Your Freedom Number is ${fmt(fiNumber)} and your Equanimity Number is ${fmt(eqNum)}. Set a personal Target to track your journey between these milestones.`
        : Math.abs(fiDiff) < fiNumber * 0.05
        ? `Your Target of ${fmt(target)} is aligned with your Freedom Number of ${fmt(fiNumber)} — the exact portfolio size where the 4% rule covers your lifestyle indefinitely. Your Equanimity Number of ${fmt(eqNum)} is your next meaningful milestone.`
        : fiDiff > 0
        ? `Your Target of ${fmt(target)} sits ${fiDiffPct.toFixed(0)}% below your Freedom Number of ${fmt(fiNumber)}. Consider whether your goal is full independence (${fmt(fiNumber)}) or an intermediate milestone. Your Equanimity Number — the point where real options open — is ${fmt(eqNum)}.`
        : `Your Target of ${fmt(target)} is ${fiDiffPct.toFixed(0)}% above your Freedom Number of ${fmt(fiNumber)} — a conservative buffer that protects against sequence-of-returns risk. Your Equanimity Number of ${fmt(eqNum)} is the first major milestone on that path.`;

    callout("Target Alignment", targetAlignInsight, margin, y, pageW - margin * 2, 80);
    setRGB(INK);

    y += 96;

    footer();

    // ================================================================
    // CAREER SHOCK SIMULATION
    // ================================================================
    doc.addPage();
    pageNum++;
    tocEntries.push({ title: "Career Shock Simulation", subtitle: "What happens if the job changes before you're ready.", page: pageNum });
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
    tocEntries.push({ title: "Acceleration Scenarios", subtitle: "What actually changes the timeline.", page: pageNum });
    sectionHeader("Acceleration Scenarios", "What actually changes the timeline.");

    y = 110;
    const saved500 = yrsToTarget && leverage?.needle?.plus500 ? `${(yrsToTarget - leverage.needle.plus500).toFixed(1)} yrs` : "–";
    const saved1000 = yrsToTarget && leverage?.needle?.plus1000 ? `${(yrsToTarget - leverage.needle.plus1000).toFixed(1)} yrs` : "–";
    (autoTable as any)(doc, {
      startY: y,
      head: [["Scenario", "Time to Target", "Yrs Saved", "Stress Impact"]],
      body: [
        ["Baseline (current)",        baseTxt,   "–",       "Baseline"],
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
    // What the user can actually allocate to cash savings after investing
    const affordableSavingsAmt = Math.max(0, surplus - monthlyInvest);
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
    // MONTE CARLO SIMULATION
    // ================================================================
    doc.addPage(); pageNum++;
    tocEntries.push({ title: "Monte Carlo Simulation", subtitle: "1,000 market scenarios. Probability — not a single guess.", page: pageNum });
    sectionHeader("Monte Carlo Simulation", "1,000 market scenarios. Probability — not a single guess.");

    {
      // ── Simulation parameters ──────────────────────────────────────
      const MC_SIMS     = 1000;
      const MC_STD_DEV  = 0.15; // 15% annual volatility (diversified equity)
      const MC_YEARS    = Math.min(40, Math.max(20, yrsToTarget ? Math.ceil(yrsToTarget * 2.2) : 30));
      const mcMean      = annualRate;

      // Box-Muller normal random
      const randn = (): number => {
        let u = 0, v = 0;
        while (u === 0) u = Math.random();
        while (v === 0) v = Math.random();
        return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
      };

      // Run simulations
      const simPaths: number[][] = [];
      const hitYears:  (number | null)[] = [];

      for (let s = 0; s < MC_SIMS; s++) {
        let port = investedStart;
        const path: number[] = [port];
        let hit: number | null = null;
        for (let yr = 1; yr <= MC_YEARS; yr++) {
          const r = mcMean + MC_STD_DEV * randn();
          // Monthly compounding with contributions
          for (let mo = 0; mo < 12; mo++) {
            port = Math.max(0, port * (1 + r / 12) + monthlyInvest);
          }
          path.push(port);
          if (hit === null && target > 0 && port >= target) hit = yr;
        }
        simPaths.push(path);
        hitYears.push(hit);
      }

      // Percentile helper
      const pct = (arr: number[], p: number): number => {
        const s = [...arr].sort((a, b) => a - b);
        const i = (p / 100) * (s.length - 1);
        const lo = Math.floor(i), hi = Math.ceil(i);
        return lo === hi ? s[lo] : s[lo] + (s[hi] - s[lo]) * (i - lo);
      };

      // Per-year percentiles
      const bands = Array.from({ length: MC_YEARS + 1 }, (_, yr) => {
        const vals = simPaths.map(p => p[yr]);
        return { yr, p10: pct(vals, 10), p25: pct(vals, 25), p50: pct(vals, 50), p75: pct(vals, 75), p90: pct(vals, 90) };
      });

      // Success stats
      const hitList = hitYears.filter((h): h is number => h !== null);
      const overallSuccessRate = hitList.length / MC_SIMS;
      const medianYrs   = hitList.length > 0 ? pct(hitList, 50) : null;
      const optimisticYrs  = hitList.length >= MC_SIMS * 0.1 ? pct(hitList, 10) : null;
      const pessimisticYrs = hitList.length >= MC_SIMS * 0.9 ? pct(hitList, 90) : null;

      const successAtYr = (yr: number) =>
        simPaths.filter(p => target > 0 && p[Math.min(yr, p.length - 1)] >= target).length / MC_SIMS;

      // ── Summary cards ──────────────────────────────────────────────
      let y = 110;
      const cardW3 = (pageW - margin * 2 - 24) / 3;

      const mcCard = (label: string, value: string, sub: string, x: number,
        fill: [number,number,number], accent: [number,number,number]) => {
        doc.setFillColor(...fill);
        doc.setDrawColor(...accent);
        doc.setLineWidth(0.8);
        doc.roundedRect(x, y, cardW3, 70, 6, 6, "FD");
        doc.setFillColor(...accent);
        doc.rect(x, y, cardW3, 3, "F");
        doc.setFont("helvetica", "normal"); doc.setFontSize(8); doc.setTextColor(...accent);
        doc.text(label.toUpperCase(), x + 10, y + 18);
        doc.setFont("helvetica", "bold"); doc.setFontSize(18); setRGB(INK);
        doc.text(value, x + 10, y + 42);
        doc.setFont("helvetica", "normal"); doc.setFontSize(8); setRGB(MUTED);
        doc.text(sub, x + 10, y + 58);
      };

      const srPct = `${(overallSuccessRate * 100).toFixed(0)}%`;
      const medTxt = medianYrs != null ? `${medianYrs.toFixed(1)} yrs` : "N/A";
      const rangeTxt = (optimisticYrs != null && pessimisticYrs != null)
        ? `${optimisticYrs.toFixed(1)}–${pessimisticYrs.toFixed(1)} yrs`
        : medianYrs != null ? `~${medianYrs.toFixed(0)} yrs` : "N/A";

      mcCard("Success Rate", srPct, "simulations that reach target",
        margin, [240, 253, 244], [22, 163, 74]);
      mcCard("Median Timeline", medTxt, "50th percentile outcome",
        margin + cardW3 + 12, [239, 246, 255], [37, 99, 235]);
      mcCard("Realistic Range", rangeTxt, "10th–90th percentile",
        margin + (cardW3 + 12) * 2, [254, 252, 232], [202, 138, 4]);

      y += 82;

      // ── Chart (portfolio value percentile bands) ───────────────────
      const cX  = margin;
      const cY  = y;
      const cW  = pageW - margin * 2;
      const cH  = 190;

      const yMaxVal = Math.max(bands[MC_YEARS].p90 * 1.05, target > 0 ? target * 1.15 : 1);
      const xs = (yr: number) => cX + (yr / MC_YEARS) * cW;
      const ys = (v: number)  => cY + cH - (Math.min(v, yMaxVal) / yMaxVal) * cH;

      // Background
      doc.setFillColor(248, 250, 252);
      doc.setDrawColor(BORDER.r, BORDER.g, BORDER.b);
      doc.setLineWidth(0.3);
      doc.rect(cX, cY, cW, cH, "FD");

      // Horizontal grid
      for (let i = 1; i < 4; i++) {
        const gy = cY + (i / 4) * cH;
        doc.setDrawColor(220, 228, 236); doc.setLineWidth(0.2);
        doc.line(cX, gy, cX + cW, gy);
        doc.setFont("helvetica", "normal"); doc.setFontSize(6.5); setRGB(MUTED);
        doc.text(fmt(yMaxVal * (1 - i / 4)), cX - 3, gy + 2.5, { align: "right" });
      }
      doc.setFont("helvetica", "normal"); doc.setFontSize(6.5); setRGB(MUTED);
      doc.text(fmt(0), cX - 3, cY + cH + 2.5, { align: "right" });
      doc.text(fmt(yMaxVal), cX - 3, cY + 4, { align: "right" });

      // Band drawing helper (closed polygon)
      const drawBand = (upper: [number,number][], lower: [number,number][], fill: [number,number,number]) => {
        const pts = [...upper, ...[...lower].reverse()];
        const [x0, y0] = pts[0];
        const deltas = pts.slice(1).map((p, i) => [p[0] - pts[i][0], p[1] - pts[i][1]] as [number, number]);
        doc.setFillColor(...fill);
        doc.setDrawColor(...fill);
        doc.lines(deltas, x0, y0, [1, 1], "F", true);
      };

      const p90pts: [number,number][] = bands.map(b => [xs(b.yr), ys(b.p90)]);
      const p75pts: [number,number][] = bands.map(b => [xs(b.yr), ys(b.p75)]);
      const p50pts: [number,number][] = bands.map(b => [xs(b.yr), ys(b.p50)]);
      const p25pts: [number,number][] = bands.map(b => [xs(b.yr), ys(b.p25)]);
      const p10pts: [number,number][] = bands.map(b => [xs(b.yr), ys(b.p10)]);

      drawBand(p90pts, p10pts, [219, 234, 254]); // P10–P90 lightest
      drawBand(p75pts, p25pts, [147, 197, 253]); // P25–P75 medium

      // P50 median line
      doc.setDrawColor(ACCENT.r, ACCENT.g, ACCENT.b); doc.setLineWidth(1.8);
      p50pts.forEach((pt, i) => {
        if (i === 0) return;
        doc.line(p50pts[i-1][0], p50pts[i-1][1], pt[0], pt[1]);
      });

      // Target line (dashed green)
      if (target > 0 && target <= yMaxVal) {
        const ty = ys(target);
        doc.setDrawColor(SUCCESS.r, SUCCESS.g, SUCCESS.b); doc.setLineWidth(0.9);
        doc.setLineDashPattern([4, 3], 0);
        doc.line(cX, ty, cX + cW, ty);
        doc.setLineDashPattern([], 0);
        doc.setFont("helvetica", "bold"); doc.setFontSize(7);
        doc.setTextColor(SUCCESS.r, SUCCESS.g, SUCCESS.b);
        doc.text("Target", cX + cW + 3, ty + 2.5);
      }

      // X-axis year labels
      doc.setFont("helvetica", "normal"); doc.setFontSize(7); setRGB(MUTED);
      const xStep = MC_YEARS <= 20 ? 5 : 10;
      for (let yr = 0; yr <= MC_YEARS; yr += xStep) {
        doc.text(`Yr ${yr}`, xs(yr), cY + cH + 11, { align: "center" });
        doc.setDrawColor(BORDER.r, BORDER.g, BORDER.b); doc.setLineWidth(0.2);
        doc.line(xs(yr), cY + cH, xs(yr), cY + cH + 3);
      }

      // Legend
      const legX = cX + 8, legY = cY + 12;
      const legItems: [number,number,number,string][] = [
        [219,234,254, "P10–P90 range"],
        [147,197,253, "P25–P75 range"],
        [ACCENT.r,ACCENT.g,ACCENT.b, "Median (P50)"],
      ];
      legItems.forEach(([r,g,b,label], i) => {
        doc.setFillColor(r, g, b);
        doc.rect(legX + i * 110, legY, 12, 7, "F");
        doc.setFont("helvetica", "normal"); doc.setFontSize(7); setRGB(MUTED);
        doc.text(label, legX + i * 110 + 16, legY + 6);
      });

      y = cY + cH + 20;

      // ── Success rate table at key horizons ─────────────────────────
      if (target > 0) {
        const horizons = [5, 10, 15, 20, 25, 30].filter(h => h <= MC_YEARS);
        (autoTable as any)(doc, {
          startY: y,
          head: [["Time Horizon", "Success Rate", "Median Portfolio", "Pessimistic (P90)", "Optimistic (P10)"]],
          body: horizons.map(h => {
            const vals = simPaths.map(p => p[Math.min(h, p.length - 1)]);
            return [
              `${h} years`,
              `${(successAtYr(h) * 100).toFixed(0)}%`,
              fmt(pct(vals, 50)),
              fmt(pct(vals, 90)),
              fmt(pct(vals, 10)),
            ];
          }),
          theme: "striped",
          styles: { font: "helvetica", fontSize: 9, cellPadding: 5 },
          headStyles: { fillColor: [ACCENT.r, ACCENT.g, ACCENT.b], textColor: 255, fontStyle: "bold" },
          columnStyles: { 0: { fontStyle: "bold", cellWidth: 80 }, 1: { cellWidth: 70, halign: "center" } },
          margin: { left: margin, right: margin },
        });
        y = (doc as any).lastAutoTable.finalY + 14;
      }

      // ── Insight callout ────────────────────────────────────────────
      const mcInsight = target <= 0
        ? `Set a Target to see your personalised success probability across 1,000 market scenarios.`
        : overallSuccessRate >= 0.85
        ? `At your current invest rate of ${fmt(monthlyInvest)}/mo, ${(overallSuccessRate * 100).toFixed(0)}% of ${MC_SIMS.toLocaleString()} simulated market scenarios result in you reaching ${fmt(target)} within ${MC_YEARS} years. The median timeline is ${medianYrs?.toFixed(1) ?? "–"} years. Your plan is robust — you can afford one or two bad market years without materially changing the outcome.`
        : overallSuccessRate >= 0.60
        ? `${(overallSuccessRate * 100).toFixed(0)}% of scenarios succeed within ${MC_YEARS} years — a moderate probability. The median timeline is ${medianYrs?.toFixed(1) ?? "–"} years, but the spread is wide (${rangeTxt}). An extra ${fmt(300)}–${fmt(500)}/mo invest rate would meaningfully compress this range. Sequence-of-returns risk is your primary exposure in the first 5 years.`
        : `Only ${(overallSuccessRate * 100).toFixed(0)}% of simulated scenarios reach ${fmt(target)} within ${MC_YEARS} years at current trajectory. Your plan is fragile to normal market variance. The primary lever is increasing your monthly invest rate — each ${fmt(500)}/mo added shifts the success probability significantly. Review the Acceleration Scenarios section for specific options.`;

      callout("Probability Insight", mcInsight, margin, y, pageW - margin * 2, 88);
      y += 104;

      // Assumptions note
      doc.setFont("helvetica", "italic"); doc.setFontSize(7.5); setRGB(MUTED);
      doc.text(
        `Simulation: ${MC_SIMS.toLocaleString()} scenarios · Mean return ${(mcMean * 100).toFixed(1)}% · Annual std dev ${(MC_STD_DEV * 100).toFixed(0)}% · Starting portfolio ${fmt(investedStart)} · ${fmt(monthlyInvest)}/mo contributions. Does not account for taxes, fees, or inflation.`,
        margin, y, { maxWidth: pageW - margin * 2 }
      );

      footer();
    }

    // ================================================================
    // OVERVIEW PAGE
    // ================================================================
    doc.addPage(); pageNum++;
    tocEntries.push({ title: "12-Month Leverage Plan", subtitle: "Four phases. Dollar-specific. Built from your exact numbers.", page: pageNum });
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
        ["Current Runway", `${runwayMonths.toFixed(1)} months`, "Time to Your Target", baseTxt],
        ["Invested Assets", fmt(investedStart), "Monthly Invest Rate", fmt(monthlyInvest)],
        ["Savings Rate", `${savingsRate.toFixed(1)}%`, "Your Target", fmt(target)],
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
    tocEntries.push({ title: "Phase 1: Stabilize (Days 1–90)", subtitle: "Secure the floor. Remove the worst risks. Build the habit.", page: pageNum });
    sectionHeader("Phase 1 (Days 1–90): Stabilize", "Secure the floor. Remove the worst risks. Build the habit.");
    y = 110;

    // ---- Runway vs investing trade-off logic ----
    // Determine whether the user should temporarily reduce investing to build runway faster.
    // Thresholds: < 3 months = critical (pause investing), 3–6 months = low (split surplus toward cash).
    const runway6Gap = Math.max(0, monthlyExpenses * 6 - cashStart);
    const isCriticalRunway = runwayMonths < 3 && runway6Gap > 0 && monthlyInvest > 0;
    const isLowRunway = runwayMonths >= 3 && runwayMonths < 6 && runway6Gap > 0 && monthlyInvest > 0;
    // For critical runway: pause investing entirely and redirect to cash
    const pausedInvestCashRate = surplus; // full surplus goes to cash
    const monthsToClose6WithPause = pausedInvestCashRate > 0 ? Math.ceil(runway6Gap / pausedInvestCashRate) : null;
    // For low runway: redirect half of invest amount to cash
    const reducedInvest = Math.round(monthlyInvest * 0.5 / 50) * 50;
    const splitCashRate = Math.max(0, surplus - reducedInvest);
    const monthsToClose6WithSplit = splitCashRate > 0 ? Math.ceil(runway6Gap / splitCashRate) : null;

    const p1Actions: string[] = [];
    if (surplus < 0) {
      p1Actions.push(`URGENT — Monthly deficit detected: you are burning ${fmt(Math.abs(surplus))}/mo. Identify your top 1–2 fixed costs and begin reducing them within 7 days. Every month of deficit delays every other goal in this plan.`);
    }
    p1Actions.push(`Audit every recurring charge within 7 days. Cancel or reduce subscriptions, unused services, and auto-renewals. Target: free up ${fmt(200)}–${fmt(500)}/mo with zero lifestyle impact.`);

    // Automate action — adjusted based on runway severity
    if (isCriticalRunway) {
      p1Actions.push(`Runway is critically low at ${runwayMonths.toFixed(1)} months. Temporarily pause your ${fmt(monthlyInvest)}/mo investment contribution and redirect the full ${fmt(surplus)}/mo surplus to cash until runway reaches 6 months. At this rate, the gap closes in ${monthsToClose6WithPause ?? "several"} months. The opportunity cost of pausing investments for this period is far smaller than the risk of having no runway. Once 6 months is reached, resume investing immediately at full rate.`);
      p1Actions.push(`Automate on payday: redirect the full ${fmt(surplus)}/mo to your emergency fund (temporarily suspending the ${fmt(monthlyInvest)}/mo invest transfer). Set a calendar reminder to reinstate investing the moment cash hits ${fmt(monthlyExpenses * 6)}.`);
    } else if (isLowRunway) {
      p1Actions.push(`Runway is below the 6-month minimum. Temporarily reduce monthly investing from ${fmt(monthlyInvest)}/mo to ${fmt(reducedInvest)}/mo and redirect the ${fmt(monthlyInvest - reducedInvest)}/mo difference to cash. At ${fmt(splitCashRate)}/mo toward runway, the gap closes in ${monthsToClose6WithSplit ?? "several"} months. Once runway reaches 6 months, restore investing to ${fmt(monthlyInvest)}/mo.`);
      p1Actions.push(`Automate on payday: set a standing order for investing (${fmt(reducedInvest)}/mo, temporarily reduced) and cash savings (${fmt(splitCashRate)}/mo). Restore to ${fmt(monthlyInvest)}/mo investing once the 6-month floor is reached.`);
    } else {
      const displayedSavingsAmt = Math.min(Math.max(50, monthlySavingsFor9), affordableSavingsAmt);
      const monthsTo9AtAffordable = affordableSavingsAmt > 0 && runwayGapTo9 > 0
        ? Math.ceil(runwayGapTo9 / affordableSavingsAmt)
        : null;
      const savingsNote = monthlySavingsFor9 > affordableSavingsAmt && affordableSavingsAmt > 0 && monthsTo9AtAffordable
        ? ` (at this rate, 9-month runway reached in ${monthsTo9AtAffordable} months)`
        : "";
      p1Actions.push(`Automate on payday: set a standing order for investing (${fmt(monthlyInvest)}/mo) and cash savings (${fmt(displayedSavingsAmt)}/mo)${savingsNote}. Automation removes the decision — it is the single highest-leverage habit in this plan.`);
    }

    if (runwayMonths >= 6) {
      p1Actions.push(`Runway is ${runwayMonths.toFixed(1)} months — above the minimum. Protect it. Do not dip below ${fmt(monthlyExpenses * 6)} for any reason. The moment you touch this floor, everything else becomes harder.`);
    }
    if (breakdown.bottleneck.key === "runway") {
      p1Actions.push(`Open a dedicated high-yield savings account labelled "Runway Only". Fund it with your full cash allocation each month. Keeping it separate makes it psychologically protected — you will not spend what you cannot see.`);
    }
    if (breakdown.bottleneck.key === "dependency") {
      p1Actions.push(`Your dependency ratio is ${dependencyPct !== null ? `${dependencyPct.toFixed(1)}%` : "high"} — annual expenses of ${fmt(annualExpenses)} represent ${dependencyPct !== null ? `${dependencyPct.toFixed(1)}%` : "a high percentage"} of your ${fmt(investedStart)} invested base. Target: < 4%. Required investment base at current expenses: ${fmt(targetInvestedFor4pct)}. Gap: ${fmt(dependencyGap)}.`);
    }
    if (breakdown.bottleneck.key === "velocity") {
      p1Actions.push(`Your timeline to Your Target is ${yrsToTarget ? `${yrsToTarget.toFixed(1)} years` : "not calculable at current invest rate"}. Phase 1 target: identify ${fmt(250)}/mo of additional investment capacity from audit savings alone — without touching lifestyle.`);
    }
    if (breakdown.bottleneck.key === "shock") {
      p1Actions.push(`Shock buffer is insufficient. A 6-month income loss would leave you with a shortfall of ${fmt(Math.max(0, monthlyExpenses * 6 - cashStart))}. Phase 1 priority: close this gap before increasing any investment rate. Cash now, investments later.`);
    }
    p1Actions.push(`Define your "minimum viable income" in writing: the lowest monthly income that covers fixed expenses only (${fmt(monthlyExpenses)}/mo). Knowing this number changes how you negotiate, take risk, and respond to stress.`);
    p1Actions.push(`Negotiate one fixed cost this quarter. Insurance premium, subscription bundle, interest rate, or utility plan. A ${fmt(150)}/mo reduction equals ${fmt(1800)}/yr — permanently — with zero investment required.`);

    // Checkpoint table reflects the actual recommended invest rate for Phase 1
    const p1InvestRate = isCriticalRunway ? 0 : isLowRunway ? reducedInvest : monthlyInvest;
    const p1CashRate = isCriticalRunway ? surplus : isLowRunway ? splitCashRate : affordableSavingsAmt;
    drawPhaseActions(p1Actions, ACCENT);
    drawCheckpointTable([
      ["Month 1", "Cash balance / runway", `>= ${fmt(cashStart + Math.max(0, p1CashRate))}`, "Green if runway rising"],
      ["Month 2", "Monthly surplus", `${fmt(surplus)}/mo or higher`, "Red if deficit appears"],
      ["Month 3", isCriticalRunway ? "Investing paused, cash building" : "Invest rate", isCriticalRunway ? `Cash >= ${fmt(cashStart + p1CashRate * 3)}` : `${fmt(p1InvestRate)}/mo automated`, isCriticalRunway ? "Green if cash balance rising" : "Green if auto-transfer set"],
    ], ACCENT);
    const p1RedFlag = isCriticalRunway
      ? `If cash balance has not increased after 30 days while investing is paused, your stated expenses (${fmt(monthlyExpenses)}/mo) may be understated. Review every transaction from the past 60 days to identify actual spend.`
      : `If runway has not increased after 30 days, lifestyle creep is absorbing your surplus. Run a card transaction audit week-by-week until the source is identified and eliminated.`;
    drawRedFlag(p1RedFlag);
    footer();

    // ================================================================
    // PHASE 2 — STRENGTHEN
    // ================================================================
    doc.addPage(); pageNum++;
    tocEntries.push({ title: "Phase 2: Strengthen (Months 3–6)", subtitle: "Attack your constraint. Raise your score. Build momentum.", page: pageNum });
    sectionHeader("Phase 2 (Months 3–6): Strengthen", "Attack your constraint. Raise your score. Build momentum.");
    y = 110;

    const p2Actions: string[] = [];
    if (breakdown.bottleneck.key === "runway") {
      const p2SavingsAmt = Math.min(monthlySavingsFor9, affordableSavingsAmt);
      const monthsTo9AtP2 = p2SavingsAmt > 0 && runwayGapTo9 > 0
        ? Math.ceil(runwayGapTo9 / p2SavingsAmt)
        : null;
      const p2SavingsNote = monthlySavingsFor9 > affordableSavingsAmt && monthsTo9AtP2
        ? ` At this rate, 9-month runway reached in ${monthsTo9AtP2} months.`
        : "";
      p2Actions.push(`Push runway from 6 to 9 months. Target cash: ${fmt(runway9moCash)}. You are currently at ${fmt(cashStart)}. Gap: ${fmt(runwayGapTo9)}. Add ${fmt(p2SavingsAmt)}/mo to your Runway account for 6 months.${p2SavingsNote} At month 9 of the overall plan, redirect this amount to investing.`);
      p2Actions.push(`The "promotion" moment: when runway crosses 8 months, celebrate it. Then redirect the monthly savings amount (${fmt(p2SavingsAmt)}) into your investment account. This is the moment the plan shifts from defensive to offensive.`);
    }
    if (breakdown.bottleneck.key === "dependency") {
      p2Actions.push(`Dependency ratio is ${dependencyPct !== null ? `${dependencyPct.toFixed(1)}%` : "high"} — target is < 4%. Required invested base: ${fmt(targetInvestedFor4pct)}. Gap: ${fmt(dependencyGap)}. This is a multi-year gap — the monthly strategy is consistent contribution combined with expense discipline.`);
      p2Actions.push(`Raise monthly investment from ${fmt(monthlyInvest)} to ${fmt(investTarget10pct)} (+10%). At this rate, your 6-month projected portfolio: ${fmt(fvWithStart(investedStart, investTarget10pct, annualRate, 0.5))}. Every ${fmt(500)}/mo expense cut reduces both what you need from assets AND increases what you can invest — double leverage.`);
    }
    if (breakdown.bottleneck.key === "velocity") {
      p2Actions.push(`Current timeline to Your Target: ${yrsToTarget ? `${yrsToTarget.toFixed(1)} years` : "not projected"}. Adding +$500/mo: ${leverage?.needle?.plus500 ? `${leverage.needle.plus500.toFixed(1)} years` : "–"}. Adding +$1,000/mo: ${leverage?.needle?.plus1000 ? `${leverage.needle.plus1000.toFixed(1)} years` : "–"}. Your goal this phase: identify ${fmt(500)}/mo of additional investment capacity.`);
      p2Actions.push(`Savings rate is currently ${savingsRate.toFixed(1)}%. Moving to 25% on your income of ${fmt(monthlyIncome)}/mo means investing ${fmt(targetSavingsRate25)}/mo — ${fmt(Math.max(0, targetSavingsRate25 - monthlyInvest))} more than now. This is the single most impactful lever available without changing income.`);
    }
    if (breakdown.bottleneck.key === "shock") {
      p2Actions.push(`Shock buffer target: ${fmt(monthlyExpenses * 6)}. Gap: ${fmt(Math.max(0, monthlyExpenses * 6 - cashStart))}. Phase 2 target: add ${fmt(Math.ceil(Math.max(0, monthlyExpenses * 6 - cashStart) / 6))}/mo for 6 months to close the gap completely.`);
      p2Actions.push(`Build your layoff protocol this quarter: a written one-page plan covering what you do in days 1, 7, 30, and 60 if income stops. Having the plan eliminates panic-driven decisions. It exists so you never have to improvise under stress.`);
    }
    const actualTotalSaving = monthlyInvest + Math.min(Math.max(0, monthlySavingsFor9), affordableSavingsAmt);
    p2Actions.push(`Benchmark at the 3-month mark: savings rate should be at least 20% of income (${fmt(monthlyIncome * 0.2)}/mo). Currently tracking at ${fmt(actualTotalSaving)}/mo (${((actualTotalSaving / Math.max(1, monthlyIncome)) * 100).toFixed(1)}%).`);
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
    tocEntries.push({ title: "Phase 3: Accelerate (Months 6–9)", subtitle: "Compound the gains. Raise velocity. Build the engine.", page: pageNum });
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
    tocEntries.push({ title: "Phase 4: Leverage Your Position (Months 9–12)", subtitle: "Use what you've built. Work becomes a choice, not a requirement.", page: pageNum });
    sectionHeader("Phase 4 (Months 9–12): Leverage Your Position", "Use what you've built. Work becomes a choice, not a requirement.");
    y = 110;

    const p4Actions: string[] = [];
    p4Actions.push(`Month 12 portfolio projection: ${fmt(projAt12mo)}. Annual withdrawal rate at this level: ${((annualExpenses / Math.max(1, projAt12mo)) * 100).toFixed(1)}% (target: < 4%). Freedom Number gap remaining: ${fmt(Math.max(0, target - projAt12mo))}. You are ${((projAt12mo / Math.max(1, target)) * 100).toFixed(1)}% of the way there.`);
    const projScoreAt12 = Math.min(100, breakdown.total + 15);
    const projCashAt12 = cashStart + 12 * p1CashRate;
    const projRunwayAt12 = monthlyExpenses > 0 ? projCashAt12 / monthlyExpenses : 0;
    if (projRunwayAt12 >= 6 && projScoreAt12 >= 40) {
      p4Actions.push(`Negotiate from your new position. After 12 months of executing this plan, your projected runway is ${projRunwayAt12.toFixed(1)} months and your Leverage Score is trending toward ${projScoreAt12}+. You can credibly pursue flexible hours, remote arrangements, compensation restructuring, or a role change — without financial desperation driving the outcome.`);
    } else {
      p4Actions.push(`Your runway is projected at ${projRunwayAt12.toFixed(1)} months by month 12 — still below the 6-month threshold required for genuine negotiating leverage. Do not make major career moves yet. Continue the cash-building strategy into year 2. Real optionality begins when runway exceeds 6 months. Stay the course — the constraint is clear and the path is working.`);
    }
    p4Actions.push(`Write your "Recovery Window" document: a clear 30/60/90-day plan for what you do if income stops. Document your fixed expenses (${fmt(monthlyExpenses)}/mo), minimum viable income, income sources you can activate, and decisions you would make in sequence. The plan exists so you never improvise under stress.`);
    p4Actions.push(`Lock in the year-2 investment plan before month 12 ends. Goal: invest rate of ${fmt(investTarget20pct)}/mo sustained, Freedom Number timeline trending toward ${yrsToTarget ? `${Math.max(1, yrsToTarget - 1).toFixed(0)} years` : "your original estimate"} or better. Commit to a specific number in writing.`);
    p4Actions.push(`Protect everything you have built. Review income protection insurance, life insurance, and health coverage. The greatest risk to a financial leverage plan is not market performance — it is a single uninsured life event that forces asset liquidation or debt.`);
    p4Actions.push(`Schedule your year-2 review for month 13. Recalculate your Leverage Score, update your Freedom Number (expenses may have changed), and set 4 phase goals for the next 12 months. The engine compounds — your year-2 score should be materially higher if this plan was executed.`);
    p4Actions.push(`Consider your "optionality moves": the career choices that become available once your score reaches 65+. Remote work, sabbatical negotiation, project-based work, or income diversification. Write 2–3 options down. Knowing they exist changes how you show up every day.`);

    drawPhaseActions(p4Actions, WARN);
    drawCheckpointTable([
      ["Month 10", "Target gap", `Closing steadily`, "Red if gap is widening"],
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
      head: [["Month", "Projected Portfolio", "Gap to Your Target", "% of Target", "Withdrawal Rate"]],
      body: Array.from({ length: 12 }, (_, i) => {
        const mo = i + 1;
        const proj = fvWithStart(investedStart, monthlyInvest, annualRate, mo / 12);
        const gap  = Math.max(0, target - proj);
        const pct  = target > 0 ? `${((proj / target) * 100).toFixed(1)}%` : "–";
        const wdr  = proj > 0   ? `${((annualExpenses / proj) * 100).toFixed(1)}%` : "–";
        return [`Month ${mo}`, fmt(proj), target > 0 ? fmt(gap) : "–", pct, wdr];
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
    drawRedFlag(`If your month-12 portfolio is more than 10% below projection, identify the cause: reduced invest rate, missed contributions, or unexpected cash withdrawals. Do not adjust Your Target downward to compensate — adjust the plan upward.`);
    footer();

    // ================================================================
    // NEXT STEPS CHECKLIST
    // ================================================================
    doc.addPage();
    pageNum++;
    tocEntries.push({ title: "Next Steps Checklist", subtitle: "Do these. In this order. Starting today.", page: pageNum });
    sectionHeader("Next Steps Checklist", "Do these. In this order. Starting today.");

    {
      const _runway6Cash      = monthlyExpenses * 6;
      const _runway6Gap       = Math.max(0, _runway6Cash - cashStart);
      const _runway9moCash    = monthlyExpenses * 9;
      const _runwayGapTo9     = Math.max(0, _runway9moCash - cashStart);
      const _monthlySav9      = _runwayGapTo9 > 0 ? Math.ceil(_runwayGapTo9 / 6) : 0;
      const _affordableSav    = Math.max(0, surplus - monthlyInvest);
      const _savAmt           = Math.min(Math.max(50, _monthlySav9), _affordableSav > 0 ? _affordableSav : 50);
      const _targetInvest20   = Math.round(monthlyIncome * 0.2);

      type CLItem = { urgency: "URGENT" | "HIGH" | "DO"; action: string; detail: string };
      const cl: CLItem[] = [];

      if (surplus < 0) {
        cl.push({
          urgency: "URGENT",
          action: "Stop the monthly cash deficit",
          detail: `You are spending ${fmt(Math.abs(surplus))}/mo more than you earn. Identify your top 2 fixed costs and cut them within 7 days. Every month of deficit delays every other goal.`,
        });
      }

      if (runwayMonths < 3) {
        cl.push({
          urgency: "URGENT",
          action: "Pause investing and redirect full surplus to emergency fund",
          detail: `Current runway: ${runwayMonths.toFixed(1)} months — critically low. Suspend the ${fmt(monthlyInvest)}/mo investment transfer immediately. Redirect the full ${fmt(surplus > 0 ? surplus : 0)}/mo surplus to cash. Target: ${fmt(_runway6Cash)}. Gap: ${fmt(_runway6Gap)}. Estimated months to 6-month floor: ${monthsToClose6WithPause ?? "–"}. Resume investing the moment cash hits ${fmt(_runway6Cash)}.`,
        });
      } else if (runwayMonths < 6) {
        cl.push({
          urgency: "HIGH",
          action: `Reduce investing to ${fmt(reducedInvest)}/mo and redirect difference to emergency fund`,
          detail: `Current runway: ${runwayMonths.toFixed(1)} months (${fmt(cashStart)}). Gap to 6-month floor: ${fmt(_runway6Gap)}. Redirect ${fmt(monthlyInvest - reducedInvest)}/mo from investments to cash — gap closes in ${monthsToClose6WithSplit ?? "–"} months. Restore to ${fmt(monthlyInvest)}/mo once floor is reached.`,
        });
      }

      if (isCriticalRunway) {
        cl.push({
          urgency: "HIGH",
          action: `Open a "Runway Only" savings account — fund it with full ${fmt(surplus > 0 ? surplus : 0)}/mo surplus`,
          detail: `Keep it entirely separate from your main account. Automate the transfer on payday. Target: ${fmt(_runway6Cash)} (6 months). Resume investing at ${fmt(monthlyInvest)}/mo once this target is reached.`,
        });
      } else if (isLowRunway) {
        cl.push({
          urgency: "HIGH",
          action: `Open a "Runway Only" savings account — fund it with ${fmt(splitCashRate)}/mo`,
          detail: `Keep it entirely separate from your main account. Automate the transfer on payday. Target: ${fmt(_runway6Cash)} (6 months). Restore investing to ${fmt(monthlyInvest)}/mo once floor is reached.`,
        });
      } else {
        cl.push({
          urgency: surplus > 0 ? "HIGH" : "DO",
          action: `Set up automatic investment transfer of ${fmt(monthlyInvest)}/mo`,
          detail: `Schedule a standing order to your investment account on payday. Automation removes the decision entirely — it is the single highest-leverage habit in this plan.`,
        });
      }

      const bk = breakdown.bottleneck.key;
      if (bk === "runway" && !isCriticalRunway && !isLowRunway) {
        cl.push({
          urgency: "HIGH",
          action: `Open a "Runway Only" savings account and fund it ${fmt(_savAmt)}/mo`,
          detail: `Keep it in a separate account so it is psychologically protected. Target: ${fmt(_runway9moCash)} (9 months). Gap: ${fmt(_runwayGapTo9)}.`,
        });
      } else if (bk === "dependency") {
        cl.push({
          urgency: "HIGH",
          action: "Cut your single largest non-essential fixed cost this week",
          detail: `Dependency ratio ${dependencyPct?.toFixed(1) ?? "–"}% (target < 4%). Reducing expenses cuts what you need AND increases what you can invest — compound leverage.`,
        });
      } else if (bk === "velocity") {
        cl.push({
          urgency: "HIGH",
          action: `Find ${fmt(500)}/mo of additional investment capacity`,
          detail: `Timeline to Your Target: ${baseTxt}. Each +${fmt(500)}/mo compresses this by ${leverage?.needle?.plus500 && yrsToTarget ? `${(yrsToTarget - leverage.needle.plus500).toFixed(1)} years` : "multiple years"}. Start with the subscription audit.`,
        });
      } else if (bk === "shock") {
        cl.push({
          urgency: "HIGH",
          action: "Write your layoff protocol (1 page, 30 minutes)",
          detail: `Describe exactly what you do on days 1, 7, 30, and 60 if income stops. Having it written eliminates panic-driven decisions before they happen.`,
        });
      }

      if (savingsRate < 20 && surplus > 0 && _targetInvest20 > monthlyInvest && !isCriticalRunway && !isLowRunway) {
        cl.push({
          urgency: "HIGH",
          action: `Raise monthly invest rate to ${fmt(_targetInvest20)}/mo (20% of income)`,
          detail: `Current rate: ${fmt(monthlyInvest)}/mo (${savingsRate.toFixed(1)}% of income). Gap: ${fmt(Math.max(0, _targetInvest20 - monthlyInvest))}/mo more. Every extra ${fmt(100)}/mo invested now is worth many times that later.`,
        });
      }

      if (target <= 0) {
        cl.push({
          urgency: "DO",
          action: "Set your personal Target number in the app",
          detail: `Freedom Number (4% Rule): ${fmt(fiNumber)}. Equanimity Number (10× expenses): ${fmt(eqNum)}. Pick one as your goal — the plan cannot route to a destination you haven't named.`,
        });
      } else if (fiNumber > 0 && Math.abs(target - fiNumber) > fiNumber * 0.15) {
        cl.push({
          urgency: "DO",
          action: `Confirm: is your Target of ${fmt(target)} intentional?`,
          detail: `Freedom Number (4% Rule) = ${fmt(fiNumber)}. Your Target is ${target < fiNumber ? `${((1 - target / fiNumber) * 100).toFixed(0)}% below` : `${((target / fiNumber - 1) * 100).toFixed(0)}% above`} that. Make sure this reflects a conscious choice.`,
        });
      }

      cl.push({
        urgency: "DO",
        action: "Audit every recurring charge within 7 days",
        detail: `List every subscription, auto-renewal, and standing charge. Cancel or reduce all unused ones. Target: ${fmt(200)}–${fmt(500)}/mo freed up with zero lifestyle impact.`,
      });

      cl.push({
        urgency: "DO",
        action: "Recalculate your Leverage Score in 30 days",
        detail: `Return to the Equanimity Engine with updated numbers. Progress only shows up when you measure it. Add it to your calendar now.`,
      });

      // ── Render ────────────────────────────────────────────────────
      const urgencyColor = (u: CLItem["urgency"]): { r: number; g: number; b: number } =>
        u === "URGENT" ? DANGER : u === "HIGH" ? WARN : ACCENT;
      const urgencyBg = (u: CLItem["urgency"]): [number,number,number] =>
        u === "URGENT" ? [254,242,242] : u === "HIGH" ? [255,251,235] : [239,246,255];

      let cy = 110;
      const itemH  = 52;
      const cbSize = 13;

      doc.setFont("helvetica", "normal"); doc.setFontSize(9.5); setRGB(MUTED);
      const introTxt = target > 0
        ? `${cl.length} prioritised actions derived from your data. Urgency is based on your score of ${leverage?.total ?? "–"}/100 and your primary constraint: ${breakdown.bottleneck.name}.`
        : `${cl.length} prioritised actions based on your current financial snapshot. Set a Target in the app to personalise further.`;
      doc.text(doc.splitTextToSize(introTxt, pageW - margin * 2), margin, cy);
      cy += 28;

      cl.forEach((item, i) => {
        if (cy + itemH > pageH - 50) { footer(); doc.addPage(); pageNum++; cy = 50; }

        const col = urgencyColor(item.urgency);
        const bg  = urgencyBg(item.urgency);

        doc.setFillColor(...bg);
        doc.setDrawColor(col.r, col.g, col.b);
        doc.setLineWidth(0.5);
        doc.roundedRect(margin, cy, pageW - margin * 2, itemH, 4, 4, "FD");

        doc.setFillColor(col.r, col.g, col.b);
        doc.roundedRect(margin, cy, 4, itemH, 2, 2, "F");

        doc.setFillColor(255, 255, 255);
        doc.setDrawColor(col.r, col.g, col.b);
        doc.setLineWidth(1);
        doc.roundedRect(margin + 10, cy + (itemH - cbSize) / 2, cbSize, cbSize, 2, 2, "FD");

        doc.setFont("helvetica", "bold"); doc.setFontSize(8);
        doc.setTextColor(col.r, col.g, col.b);
        doc.text(String(i + 1), margin + 10 + cbSize + 5, cy + (itemH / 2) + 3);

        const badgeLabel = item.urgency;
        doc.setFontSize(6.5);
        const bw = doc.getTextWidth(badgeLabel) + 8;
        doc.setFillColor(col.r, col.g, col.b);
        doc.roundedRect(margin + 10 + cbSize + 16, cy + (itemH / 2) - 9, bw, 12, 3, 3, "F");
        doc.setTextColor(255, 255, 255);
        doc.text(badgeLabel, margin + 10 + cbSize + 20, cy + (itemH / 2) + 0.5);

        const actionX = margin + 10 + cbSize + 16 + bw + 7;

        doc.setFont("helvetica", "bold"); doc.setFontSize(10); setRGB(INK);
        doc.text(item.action, actionX, cy + (itemH / 2) - 1);

        doc.setFont("helvetica", "normal"); doc.setFontSize(8); setRGB(MUTED);
        const detailLines = doc.splitTextToSize(item.detail, pageW - margin * 2 - (actionX - margin) - 6);
        doc.text(detailLines[0] ?? "", actionX, cy + (itemH / 2) + 13);

        cy += itemH + 6;
      });

      cy += 4;
      doc.setFont("helvetica", "italic"); doc.setFontSize(8); setRGB(MUTED);
      doc.text(
        "Full context for each action is in the corresponding section of this blueprint. Refer back to the 12-Month Leverage Plan above for step-by-step implementation.",
        margin, cy, { maxWidth: pageW - margin * 2 }
      );

      footer();
    }

    // ================================================================
    // OPERATOR MANDATE
    // ================================================================
    doc.addPage();
    pageNum++;
    tocEntries.push({ title: "Operator Mandate", subtitle: "Close the loop. Keep it simple.", page: pageNum });
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
      [`Your Target`, fmt(target)],
      [`Timeline`, baseTxt],
      [`Age at Target`, ageAtTarget ? `${ageAtTarget.toFixed(0)}` : "–"],
      [`Leverage Class`, leverageLabel],
      [`Primary Constraint`, bottleneck],
      [`Monthly Surplus`, fmt(surplus)],
      [`Savings Rate`, `${savingsRate.toFixed(1)}%`],
      [`Freedom Number (4% Rule)`, fmt(fiNumber)],
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
    // METHODOLOGY & ASSUMPTIONS
    // ================================================================
    doc.addPage();
    pageNum++;
    tocEntries.push({ title: "Methodology & Assumptions", subtitle: "Auditable formulas + model parameters.", page: pageNum });
    sectionHeader("Methodology & Assumptions", "Auditable formulas + model parameters.");
    y = 110;

    // ---- Scoring rubric table ----
    (autoTable as any)(doc, {
      startY: y,
      head: [["Pillar", "Threshold Rule", "Score Meaning"]],
      body: [
        [
          "Runway Strength\n(30 pts)",
          "0-3 mo => 0  |  3-6 => 10  |  6-9 => 20  |  9+ => 30",
          "Cash coverage reduces stress fastest.",
        ],
        [
          "Income Dependency\n(25 pts)",
          "Above 6% => 0  |  4-6% => 10  |  3-4% => 20  |  below 3% => 25",
          "Lower withdrawal rate reduces dependence.",
        ],
        [
          "Wealth Velocity\n(25 pts)",
          "No target => 0  |  >15 yrs => 0  |  10-15 yrs => 10  |  5-10 yrs => 20  |  <=5 yrs => 25",
          "A shorter timeline increases agency and consistency.",
        ],
        [
          "Shock Resistance\n(20 pts)",
          "6-mo shock runway: <=0 => 0  |  <3 => 5  |  <6 => 10  |  <12 => 15  |  12+ => 20",
          "Cash buffer is your shock throttle.",
        ],
      ],
      theme: "striped",
      styles: { font: "helvetica", fontSize: 9, cellPadding: 6 },
      headStyles: { fillColor: [ACCENT.r, ACCENT.g, ACCENT.b], textColor: 255, fontStyle: "bold" },
      columnStyles: {
        0: { cellWidth: 110, fontStyle: "bold" },
        1: { cellWidth: 220 },
        2: { cellWidth: "auto" },
      },
      margin: { left: margin, right: margin },
    });
    y = (doc as any).lastAutoTable.finalY + 16;

    // ---- FI Number callout ----
    const fiCalloutH = 72;
    callout(
      "FI Number (4% Rule) — definition",
      `FI Number = Annual Expenses × 25 = (${fmt(monthlyExpenses)}/mo × 12) × 25.\nCurrent value (based on your expenses): ${fmt(fiNumber)}.`,
      margin, y, pageW - margin * 2, fiCalloutH
    );
    y += fiCalloutH + 12;

    // ---- Your Target callout ----
    const targetCalloutH = 72;
    callout(
      "Your Target — what the plan measures",
      `Your Target (${fmt(target)}) is the milestone used for velocity projection and Monte Carlo 'hit' probability. It can be below FI Number (${fmt(fiNumber)}) so you gain leverage earlier.`,
      margin, y, pageW - margin * 2, targetCalloutH
    );
    y += targetCalloutH + 16;

    // ---- Sensitivity table ----
    if (y + 120 > pageH - 50) { footer(); doc.addPage(); pageNum++; y = 50; }
    doc.setFont("helvetica", "bold"); doc.setFontSize(11); setRGB(INK);
    doc.text("Sensitivity (Years-to-Target)", margin, y); y += 14;
    const sensRates = [0, annualReturnPct / 2, annualReturnPct];
    const sensInvests = [
      Math.round(monthlyInvest * 0.9 / 50) * 50,
      monthlyInvest,
      Math.round(monthlyInvest * 1.1 / 50) * 50,
    ];
    (autoTable as any)(doc, {
      startY: y,
      head: [["Monthly Invest", ...sensRates.map(r => `${r.toFixed(1)}% return`)]],
      body: sensInvests.map(inv => [
        `${fmt(inv)}/mo`,
        ...sensRates.map(r => {
          const yrs = yearsToTarget(investedStart, inv, r / 100, target);
          return yrs != null ? `${Math.min(yrs, 60).toFixed(1)} yrs` : "60+ yrs";
        }),
      ]),
      theme: "striped",
      styles: { font: "helvetica", fontSize: 9, cellPadding: 6, halign: "center" as const },
      headStyles: { fillColor: [ACCENT.r, ACCENT.g, ACCENT.b], textColor: 255, fontStyle: "bold" },
      columnStyles: { 0: { halign: "left" as const, cellWidth: 110 } },
      margin: { left: margin, right: margin },
    });
    y = (doc as any).lastAutoTable.finalY + 16;

    // ---- Model note callout ----
    const modelNoteH = 72;
    callout(
      "Model note (auditability)",
      "Years-to-Target uses constant annual return for compounding, constant monthly contributions, and a 60-year cap. Taxes, fees, and inflation are excluded.",
      margin, y, pageW - margin * 2, modelNoteH
    );
    y += modelNoteH + 12;
    footer();

    // ================================================================
    // FINANCIAL GLOSSARY
    // ================================================================
    doc.addPage();
    pageNum++;
    tocEntries.push({ title: "Financial Glossary", subtitle: "Every term used in this report — defined clearly.", page: pageNum });
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
      tocEntries.push({ title: "Resilience Report: Stress Test", subtitle: "Five financial shock scenarios modeled to your exact inputs.", page: pageNum });
      sectionHeader("Resilience Report: Stress Test", "Five financial shock scenarios modeled to your exact inputs.");
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
      //Footer
      footer();
    }

    // ================================================================
    // RENDER TABLE OF CONTENTS (go back to page 2)
    // ================================================================
    doc.setPage(tocPageNum);

    // Background
    doc.setFillColor(255, 255, 255);
    doc.rect(0, 0, pageW, pageH, "F");

    // Top accent bar
    doc.setFillColor(ACCENT.r, ACCENT.g, ACCENT.b);
    doc.rect(0, 0, pageW, 5, "F");
    doc.setFillColor(SUCCESS.r, SUCCESS.g, SUCCESS.b);
    doc.rect(0, 5, pageW, 1.5, "F");

    // Brand
    doc.setFont("helvetica", "bold"); doc.setFontSize(8);
    doc.setCharSpace(2.5); doc.setTextColor(ACCENT.r, ACCENT.g, ACCENT.b);
    doc.text("EQUANIMITY ENGINE", margin, 32);
    doc.setCharSpace(0);

    // Title
    doc.setFont("helvetica", "bold"); doc.setFontSize(26);
    doc.setCharSpace(2);
    setRGB(INK);
    doc.text("CONTENTS", margin, 62);
    doc.setCharSpace(0);

    doc.setFont("helvetica", "normal"); doc.setFontSize(9); setRGB(MUTED);
    doc.text("Leverage Blueprint: Personalised Financial Independence Strategy", margin, 78);

    doc.setDrawColor(BORDER.r, BORDER.g, BORDER.b);
    doc.setLineWidth(0.5);
    doc.line(margin, 88, pageW - margin, 88);

    // Entries — row height tuned to fit up to 20 entries on one page
    const tocRowH = 33;
    let tocY = 102;

    tocEntries.forEach((entry, i) => {
      const num = String(i + 1).padStart(2, "0");
      const pageStr = String(entry.page);

      // Row background (alternating subtle tint)
      if (i % 2 === 0) {
        doc.setFillColor(248, 250, 252);
        doc.rect(margin, tocY - 16, pageW - margin * 2, tocRowH - 2, "F");
      }

      // Number
      doc.setFont("helvetica", "bold"); doc.setFontSize(9);
      doc.setTextColor(ACCENT.r, ACCENT.g, ACCENT.b);
      doc.text(num, margin + 6, tocY);

      // Title
      doc.setFont("helvetica", "bold"); doc.setFontSize(10.5); setRGB(INK);
      doc.text(entry.title, margin + 28, tocY);

      // Subtitle
      doc.setFont("helvetica", "normal"); doc.setFontSize(8); setRGB(MUTED);
      doc.text(entry.subtitle, margin + 28, tocY + 13);

      // Dotted connector line
      const titleEnd = margin + 28 + doc.getTextWidth(entry.title) + 6;
      const pageNumStart = pageW - margin - doc.getTextWidth(pageStr) - 6;
      if (pageNumStart > titleEnd + 10) {
        doc.setDrawColor(BORDER.r, BORDER.g, BORDER.b);
        doc.setLineWidth(0.3);
        doc.setLineDashPattern([1.5, 3], 0);
        doc.line(titleEnd, tocY - 2, pageNumStart, tocY - 2);
        doc.setLineDashPattern([], 0);
      }

      // Page number
      doc.setFont("helvetica", "bold"); doc.setFontSize(10.5);
      doc.setTextColor(ACCENT.r, ACCENT.g, ACCENT.b);
      doc.text(pageStr, pageW - margin, tocY, { align: "right" });

      tocY += tocRowH;
    });

    // TOC footer
    doc.setDrawColor(BORDER.r, BORDER.g, BORDER.b);
    doc.setLineWidth(0.5);
    doc.line(margin, pageH - 38, pageW - margin, pageH - 38);
    doc.setFont("helvetica", "normal"); doc.setFontSize(9); setRGB(MUTED);
    doc.text("Educational only — not financial advice. Assumptions exclude taxes/fees; markets vary.", margin, pageH - 28);
    doc.text(`Page ${tocPageNum}`, pageW - margin - 30, pageH - 28);

    const fileSafeDate = new Date().toISOString().slice(0, 10);
    if (mode === "base64") {
      // Strip the data URI prefix — return raw base64 for email attachment
      const dataUri = doc.output("datauristring");
      return dataUri.split(",")[1];
    }
    doc.save(`Leverage-Blueprint-${fileSafeDate}.pdf`);
  };

  const handleGeneratePdf = async () => {
    if (!hasInputs) return;
    setIsGenerating(true);
    // Allow React to render the loading state before the synchronous PDF generation blocks the thread
    await new Promise((resolve) => setTimeout(resolve, 60));
    try {
      generateLeverageBlueprintPdf();
      // Save a base64 snapshot so email always sends the original purchased blueprint
      try {
        const base64 = generateLeverageBlueprintPdf("base64") as string;
        localStorage.setItem("ee_blueprint_pdf_snapshot", base64);
      } catch {}
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

  const handleEmailPdf = async () => {
    if (!blueprintEmail) return;
    setIsSendingEmail(true);
    setEmailError("");
    await new Promise((resolve) => setTimeout(resolve, 60));
    try {
      // Always use the snapshot saved at download time — never regenerate from live inputs
      const stored = localStorage.getItem("ee_blueprint_pdf_snapshot");
      const pdfBase64 = stored ?? (generateLeverageBlueprintPdf("base64") as string);
      const res = await fetch("/api/send-blueprint", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: blueprintEmail, pdfBase64, userName }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setEmailError((data as { error?: string }).error ?? "Something went wrong. Please try again.");
      } else {
        setEmailSent(true);
        setBlueprintDownloaded(true);
        try { localStorage.setItem("ee_blueprint_downloaded", "1"); } catch {}
      }
    } catch {
      setEmailError("Network error. Please check your connection and try again.");
    } finally {
      setIsSendingEmail(false);
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
                EQUANIMITY ENGINE™
              </div>
              <div className="text-xs text-zinc-500">
                Financial leverage for high earners who want optionality before retirement
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
            className={`ee-reveal ee-delay-3 mt-8 flex flex-col items-center gap-3 ${
              heroInView ? "ee-on" : ""
            }`}
          >
            <Button
              className="bg-blue-600 text-white hover:bg-blue-700 shadow-lg px-8 py-3 text-base"
              onClick={() => scrollTo("calculator")}
            >
              Calculate My Leverage Score — It's Free
            </Button>
            <button
              className="text-xs text-zinc-400 hover:text-zinc-600 transition-colors underline underline-offset-2"
              onClick={() => scrollTo("plan")}
            >
              Already know your score? Get the Blueprint — $197
            </button>
          </div>
        </div>

        {/* fade-out at the bottom so it dissolves into the page */}
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-24 bg-gradient-to-b from-transparent to-blue-50/60" />
      </section>

      <main className="mx-auto max-w-6xl px-4 py-6">

        {/* Floating side tab — see fixed element below */}

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

                <div>
                  <div className="flex items-center justify-between">
                    <Label>Checking buffer</Label>
                    {monthlyExpenses > 0 && bufferTarget === 0 && (
                      <button
                        type="button"
                        onClick={() => setBufferTarget(Math.round(monthlyExpenses * 1.5))}
                        className="text-[10px] text-zinc-400 underline underline-offset-2 decoration-dotted hover:text-zinc-600 transition-colors"
                      >
                        Suggest 1.5×
                      </button>
                    )}
                  </div>
                  <NumericInput value={bufferTarget} onCommit={setBufferTarget} min={0} placeholder="0" />
                  <p className="mt-1 text-[10px] text-zinc-400 leading-snug">
                    {bufferTarget > 0
                      ? `${fmt(bufferTarget)} kept idle in checking — absorbs everyday & emotional spending without touching your goals.`
                      : "Optional: the float you always keep in checking for unplanned & emotional spending."}
                  </p>
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

                {/* Target amount */}
                <div>
                  <Label required>Target amount</Label>
                  <div className="mt-1.5">
                    <NumericInput value={target} onCommit={setTarget} min={0} />
                  </div>
                </div>

                {/* Equanimity Number — auto-calculated, read-only */}
                {monthlyExpenses > 0 && (
                  <div className="relative overflow-hidden rounded-2xl border border-violet-200/70 bg-gradient-to-br from-violet-50 via-white to-indigo-50/40 p-4 shadow-sm">
                    <div className="pointer-events-none absolute -right-4 -top-4 h-20 w-20 rounded-full bg-violet-300/20 blur-2xl" />
                    <div className="pointer-events-none absolute -bottom-4 -left-4 h-16 w-16 rounded-full bg-indigo-200/25 blur-2xl" />

                    <div className="mb-1 flex items-start justify-between gap-2">
                      <div className="text-xs font-semibold text-violet-800">Equanimity Number</div>
                      <span className="text-lg font-bold text-violet-900 leading-none">{fmt(monthlyExpenses * 12 * 10)}</span>
                    </div>
                    <p className="mb-3 text-[10px] leading-snug text-zinc-500">
                      The milestone where financial anxiety fades and real options begin. Not retirement — <span className="font-medium text-zinc-600">leverage</span>. At this point your invested assets generate enough passive income to meaningfully cover a portion of your lifestyle, giving you the confidence to negotiate, pivot, or walk away from situations that don't serve you.
                    </p>

                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between text-[10px]">
                        <span className="text-zinc-400">Formula</span>
                        <span className="font-medium text-zinc-600">10× annual expenses</span>
                      </div>
                      <div className="flex items-center justify-between text-[10px]">
                        <span className="text-zinc-400">Monthly passive income (4%)</span>
                        <span className="font-medium text-violet-700">{fmt(Math.round(monthlyExpenses * 12 * 10 * 0.04 / 12))}/mo</span>
                      </div>
                      <div className="flex items-center justify-between text-[10px]">
                        <span className="text-zinc-400">Expense coverage</span>
                        <span className="font-medium text-zinc-600">~40% of your {fmt(monthlyExpenses)}/mo</span>
                      </div>
                    </div>

                    {investedStart > 0 && (
                      <div className="mt-3">
                        <div className="mb-1 flex items-center justify-between text-[10px]">
                          <span className="font-medium text-zinc-500">
                            {investedStart >= monthlyExpenses * 12 * 10
                              ? "✓ Equanimity reached"
                              : `${Math.min(100, Math.round(investedStart / (monthlyExpenses * 12 * 10) * 100))}% of the way there`}
                          </span>
                          <span className="text-zinc-400">{fmt(investedStart)} of {fmt(monthlyExpenses * 12 * 10)}</span>
                        </div>
                        <div className="h-2 overflow-hidden rounded-full bg-violet-100">
                          <div
                            className="h-full rounded-full bg-gradient-to-r from-violet-400 to-indigo-500 transition-all duration-700 ease-out"
                            style={{ width: `${Math.min(100, investedStart / (monthlyExpenses * 12 * 10) * 100)}%` }}
                          />
                        </div>
                        {investedStart < monthlyExpenses * 12 * 10 && (
                          <p className="mt-1.5 text-[10px] text-zinc-400">
                            <span className="font-medium text-zinc-500">{fmt(monthlyExpenses * 12 * 10 - investedStart)}</span> to build — this is your most important near-term milestone.
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                )}

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
                          {yrsToTarget ? `${yrsToTarget.toFixed(1)} yrs` : "–"}
                        </div>
                        <div className="mt-2 text-xs text-zinc-500">
                          Estimated age at target
                        </div>
                        <div className="mt-1 text-sm font-medium">
                          {ageAtTarget ? `${ageAtTarget.toFixed(0)} years old` : "–"}
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

                              {/* Fix-the-Gap Targets */}
                              <div>
                                <div className="text-xs font-semibold text-zinc-500 uppercase tracking-wide mb-2">Fix-the-Gap Targets</div>
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

                  {/* ── Blurred Leverage Playbook (Blueprint teaser) ── */}
                  {hasInputs && (
                    <Card className="overflow-hidden">
                      <CardContent className="p-0">
                        {/* Header */}
                        <div className="flex items-center justify-between border-b px-5 py-3">
                          <div>
                            <div className="text-sm font-semibold text-zinc-900">Your Leverage Playbook</div>
                            <div className="text-xs text-zinc-400 mt-0.5">Strategic moves behind your numbers</div>
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
                                {leverage.recs.length} strategic priorities waiting
                              </div>
                              <div className="text-xs text-zinc-500 mb-4">
                                The behavioral and structural moves behind your numbers — sequenced by impact.
                              </div>
                              <a
                                href={STRIPE_PAYMENT_LINK}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-2 rounded-2xl bg-gradient-to-r from-indigo-600 to-violet-600 px-5 py-2.5 text-sm font-semibold text-white shadow-lg hover:opacity-90 transition-opacity"
                              >
                                Unlock in Your Blueprint – $197
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
                <div className="mt-4 space-y-4">
                <div className="grid gap-4 md:grid-cols-2">
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
                        { t: 1000000, color: "emerald", label: monthlyExpenses > 0 && Math.round(1000000 * 0.04 / 12) >= monthlyExpenses ? "Dependency breaks" : "Seven-figure mark", meaning: monthlyExpenses > 0 && Math.round(1000000 * 0.04 / 12) >= monthlyExpenses ? "Work becomes a choice" : "Compounding accelerates" },
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

                  {/* RIGHT column — personal milestones */}
                  <div className="space-y-3">
                    <div className="text-sm font-semibold text-zinc-700 px-1">Personal milestones</div>

                    {!hasInputs ? (
                      <div className="rounded-2xl border bg-zinc-50 px-4 py-6 text-sm text-zinc-400 text-center">
                        Fill in all required fields to see your personal milestones.
                      </div>
                    ) : (
                      <>
                        {/* Equanimity Number milestone */}
                        {monthlyExpenses > 0 && (() => {
                          const eqNum = monthlyExpenses * 12 * 10;
                          const eqYrs = yearsToTarget(investedStart, monthlyInvest, annualRate, eqNum);
                          const progress = Math.min(100, (investedStart / eqNum) * 100);
                          const reached = investedStart >= eqNum;
                          return (
                            <div className="rounded-2xl border bg-gradient-to-br from-violet-50 to-white border-violet-100 p-4 transition-all duration-200 hover:-translate-y-[1px] hover:shadow-md">
                              <div className="flex items-start justify-between gap-2">
                                <div className="flex items-center gap-2">
                                  <span className="h-2.5 w-2.5 rounded-full shrink-0 bg-violet-500" />
                                  <div>
                                    <div className="text-xs font-semibold text-violet-700">Equanimity Number</div>
                                    <div className="text-xs text-zinc-400">Passive income covers 40% of expenses</div>
                                  </div>
                                </div>
                                <div className="text-right shrink-0">
                                  <div className="text-sm font-bold text-zinc-900">{fmt(eqNum)}</div>
                                  {reached ? (
                                    <div className="text-xs font-medium text-emerald-600">✓ Reached</div>
                                  ) : eqYrs !== null ? (
                                    <div className="text-xs font-medium text-violet-700">{eqYrs.toFixed(1)} yrs · age {(age + eqYrs).toFixed(0)}</div>
                                  ) : (
                                    <div className="text-xs text-zinc-400">beyond range</div>
                                  )}
                                </div>
                              </div>
                              <div className="mt-3">
                                <div className="flex justify-between text-[10px] text-zinc-400 mb-1">
                                  <span>Progress</span><span>{progress.toFixed(0)}%</span>
                                </div>
                                <div className="h-1.5 rounded-full bg-white/60 border border-white overflow-hidden">
                                  <div className="h-full rounded-full bg-gradient-to-r from-violet-400 to-violet-600 transition-all duration-700" style={{ width: `${progress}%` }} />
                                </div>
                              </div>
                              <div className="mt-2 text-[10px] text-zinc-400">
                                Generates <span className="font-medium text-violet-700">{fmt(Math.round(eqNum * 0.04 / 12))}/mo</span> passive · enough to negotiate on your terms
                              </div>
                            </div>
                          );
                        })()}

                        {/* Freedom Number milestone */}
                        {monthlyExpenses > 0 && (() => {
                          const fiNum = monthlyExpenses * 12 * 25;
                          const fiYrs = yearsToTarget(investedStart, monthlyInvest, annualRate, fiNum);
                          const progress = Math.min(100, (investedStart / fiNum) * 100);
                          const reached = investedStart >= fiNum;
                          return (
                            <div className="rounded-2xl border bg-gradient-to-br from-emerald-50 to-white border-emerald-100 p-4 transition-all duration-200 hover:-translate-y-[1px] hover:shadow-md">
                              <div className="flex items-start justify-between gap-2">
                                <div className="flex items-center gap-2">
                                  <span className="h-2.5 w-2.5 rounded-full shrink-0 bg-emerald-500" />
                                  <div>
                                    <div className="text-xs font-semibold text-emerald-700">Freedom Number</div>
                                    <div className="text-xs text-zinc-400">Passive income covers 100% of expenses</div>
                                  </div>
                                </div>
                                <div className="text-right shrink-0">
                                  <div className="text-sm font-bold text-zinc-900">{fmt(fiNum)}</div>
                                  {reached ? (
                                    <div className="text-xs font-medium text-emerald-600">✓ Reached</div>
                                  ) : fiYrs !== null ? (
                                    <div className="text-xs font-medium text-emerald-700">{fiYrs.toFixed(1)} yrs · age {(age + fiYrs).toFixed(0)}</div>
                                  ) : (
                                    <div className="text-xs text-zinc-400">beyond range</div>
                                  )}
                                </div>
                              </div>
                              <div className="mt-3">
                                <div className="flex justify-between text-[10px] text-zinc-400 mb-1">
                                  <span>Progress</span><span>{progress.toFixed(0)}%</span>
                                </div>
                                <div className="h-1.5 rounded-full bg-white/60 border border-white overflow-hidden">
                                  <div className="h-full rounded-full bg-gradient-to-r from-emerald-400 to-emerald-600 transition-all duration-700" style={{ width: `${progress}%` }} />
                                </div>
                              </div>
                              <div className="mt-2 text-[10px] text-zinc-400">
                                Generates <span className="font-medium text-emerald-700">{fmt(Math.round(fiNum * 0.04 / 12))}/mo</span> passive · work becomes truly optional
                              </div>
                            </div>
                          );
                        })()}

                        {/* Personal target milestone */}
                        {target > 0 && (() => {
                          const progress = Math.min(100, (investedStart / target) * 100);
                          const reached = investedStart >= target;
                          const targetCoverage = monthlyExpenses > 0 ? Math.round((target * 0.04 / 12) / monthlyExpenses * 100) : 0;
                          const targetSubtitle = targetCoverage >= 100
                            ? "Work becomes truly optional"
                            : targetCoverage >= 75 ? "Near-complete financial independence"
                            : targetCoverage >= 50 ? "Significant financial optionality"
                            : targetCoverage >= 25 ? `Covers ${targetCoverage}% of your expenses`
                            : monthlyExpenses > 0 ? `Your personal goal · ${targetCoverage}% expense coverage`
                            : "Your personal goal";
                          return (
                            <div className="rounded-2xl border bg-gradient-to-br from-amber-50 to-white border-amber-100 p-4 transition-all duration-200 hover:-translate-y-[1px] hover:shadow-md">
                              <div className="flex items-start justify-between gap-2">
                                <div className="flex items-center gap-2">
                                  <span className="h-2.5 w-2.5 rounded-full shrink-0 bg-amber-500" />
                                  <div>
                                    <div className="text-xs font-semibold text-amber-700">Your Target</div>
                                    <div className="text-xs text-zinc-400">{targetSubtitle}</div>
                                  </div>
                                </div>
                                <div className="text-right shrink-0">
                                  <div className="text-sm font-bold text-zinc-900">{fmt(target)}</div>
                                  {reached ? (
                                    <div className="text-xs font-medium text-emerald-600">🎯 Reached</div>
                                  ) : yrsToTarget !== null ? (
                                    <div className="text-xs font-medium text-amber-700">{yrsToTarget.toFixed(1)} yrs · age {(age + yrsToTarget).toFixed(0)}</div>
                                  ) : (
                                    <div className="text-xs text-zinc-400">beyond range</div>
                                  )}
                                </div>
                              </div>
                              <div className="mt-3">
                                <div className="flex justify-between text-[10px] text-zinc-400 mb-1">
                                  <span>Progress</span><span>{progress.toFixed(0)}%</span>
                                </div>
                                <div className="h-1.5 rounded-full bg-white/60 border border-white overflow-hidden">
                                  <div className="h-full rounded-full bg-gradient-to-r from-amber-400 to-amber-600 transition-all duration-700" style={{ width: `${progress}%` }} />
                                </div>
                              </div>
                              {monthlyExpenses > 0 && (
                                <div className="mt-2 text-[10px] text-zinc-400">
                                  Generates <span className="font-medium text-amber-700">{fmt(Math.round(target * 0.04 / 12))}/mo</span> passive
                                  {Math.round(target * 0.04 / 12) >= monthlyExpenses
                                    ? <span className="text-emerald-600 font-medium"> · covers expenses ✓</span>
                                    : <span> · {Math.round((target * 0.04 / 12) / monthlyExpenses * 100)}% of expenses</span>}
                                </div>
                              )}
                            </div>
                          );
                        })()}

                        {/* Prompt if no target set */}
                        {target === 0 && (
                          <div className="rounded-2xl border border-dashed border-zinc-200 bg-zinc-50/60 px-4 py-5 text-center">
                            <p className="text-xs text-zinc-400">Set a target amount in the calculator to see your personal milestone here.</p>
                          </div>
                        )}
                      </>
                    )}
                  </div>

                </div>{/* end grid */}

                {/* ── Guilt-Free Spending Calculator ── */}
                {guiltFree && (
                  <div className="relative overflow-hidden rounded-2xl border border-emerald-200/70 bg-gradient-to-br from-emerald-50 via-white to-teal-50/40 p-5 shadow-sm">
                    <div className="pointer-events-none absolute -right-6 -top-6 h-28 w-28 rounded-full bg-emerald-200/30 blur-3xl" />
                    <div className="pointer-events-none absolute -bottom-6 -left-6 h-24 w-24 rounded-full bg-teal-200/20 blur-3xl" />

                    {/* Header */}
                    <div className="mb-1 flex items-start justify-between gap-2">
                      <div>
                        <div className="text-sm font-semibold text-zinc-800">Guilt-Free Spending Calculator</div>
                        <p className="mt-0.5 text-[10px] text-zinc-400 leading-snug">
                          The maximum you can spend monthly without derailing your milestones — calculated from your income, goals, and timeline.
                        </p>
                      </div>
                    </div>

                    {/* Allocation bar */}
                    <div className="my-4">
                      <div className="mb-1.5 flex items-center justify-between text-[10px] text-zinc-400">
                        <span>Monthly income allocation</span>
                        <span className="font-medium text-zinc-600">{fmt(monthlyIncome)}/mo</span>
                      </div>
                      {(() => {
                        const expPct    = Math.round((monthlyExpenses / monthlyIncome) * 100);
                        const investPct = Math.round(((guiltFree.totalRequired - guiltFree.bufferTopup) / monthlyIncome) * 100);
                        const bufPct    = Math.round((guiltFree.bufferTopup / monthlyIncome) * 100);
                        const freePct   = Math.min(100, Math.max(0, Math.round((guiltFree.base / monthlyIncome) * 100)));
                        return (
                          <div className="flex h-4 overflow-hidden rounded-full border border-white shadow-sm">
                            <div className="h-full bg-zinc-300" style={{ width: `${expPct}%` }} title="Expenses" />
                            <div className="h-full bg-violet-400" style={{ width: `${investPct}%` }} title="Required investment" />
                            {bufPct > 0 && <div className="h-full bg-teal-400" style={{ width: `${bufPct}%` }} title="Buffer build-up" />}
                            <div className="h-full bg-emerald-400" style={{ width: `${freePct}%` }} title="Guilt-free" />
                            <div className="h-full flex-1 bg-zinc-100" />
                          </div>
                        );
                      })()}
                      <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-[9px] text-zinc-500">
                        <span className="flex items-center gap-1"><span className="inline-block h-2 w-2 rounded-sm bg-zinc-300" />Expenses {fmt(monthlyExpenses)}</span>
                        <span className="flex items-center gap-1"><span className="inline-block h-2 w-2 rounded-sm bg-violet-400" />Goals {fmt(guiltFree.totalRequired - guiltFree.bufferTopup)}</span>
                        {guiltFree.bufferTopup > 0 && <span className="flex items-center gap-1"><span className="inline-block h-2 w-2 rounded-sm bg-teal-400" />Buffer {fmt(guiltFree.bufferTopup)}</span>}
                        <span className="flex items-center gap-1"><span className="inline-block h-2 w-2 rounded-sm bg-emerald-400" />Guilt-free {fmt(guiltFree.base)}</span>
                      </div>
                    </div>

                    {/* Three spend tiers */}
                    {guiltFree.base > 0 ? (
                      <div className="grid gap-3 sm:grid-cols-3">
                        {guiltFree.tiers.map((tier) => {
                          const colors: Record<string, { card: string; badge: string; amount: string }> = {
                            emerald: { card: "border-emerald-200 bg-emerald-50/60", badge: "bg-emerald-100 text-emerald-700", amount: "text-emerald-800" },
                            violet:  { card: "border-violet-200 bg-violet-50/60",   badge: "bg-violet-100 text-violet-700",   amount: "text-violet-800" },
                            amber:   { card: "border-amber-200 bg-amber-50/60",     badge: "bg-amber-100 text-amber-700",     amount: "text-amber-800" },
                          };
                          const c = colors[tier.color];
                          const eqYrsAtTier = monthlyExpenses > 0
                            ? yearsToTarget(investedStart, tier.invest, annualRate, guiltFree.eqNum) : null;
                          const targetYrsAtTier = target > 0
                            ? yearsToTarget(investedStart, tier.invest, annualRate, target) : null;
                          return (
                            <div key={tier.key} className={`rounded-xl border p-3 ${c.card}`}>
                              <div className="flex items-center justify-between mb-1.5">
                                <span className={`rounded-full px-2 py-0.5 text-[9px] font-semibold ${c.badge}`}>{tier.label}</span>
                              </div>
                              <div className={`text-xl font-bold leading-none mb-1 ${c.amount}`}>{fmt(tier.spend)}<span className="text-xs font-normal text-zinc-400">/mo</span></div>
                              <p className="text-[10px] text-zinc-400 leading-snug mb-2">{tier.desc}</p>
                              <div className="space-y-0.5 text-[10px] text-zinc-400">
                                {eqYrsAtTier !== null && <div>Equanimity in <span className="font-medium text-zinc-600">{eqYrsAtTier.toFixed(1)} yrs</span></div>}
                                {targetYrsAtTier !== null && target > 0 && <div>Target in <span className="font-medium text-zinc-600">{targetYrsAtTier.toFixed(1)} yrs</span></div>}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <div className="rounded-xl border border-amber-200 bg-amber-50/60 px-4 py-3 text-center">
                        <p className="text-xs font-medium text-amber-700">Your current income is fully allocated to expenses and goals.</p>
                        <p className="mt-0.5 text-[10px] text-zinc-400">Increasing income or reducing expenses unlocks guilt-free spending room.</p>
                      </div>
                    )}

                    {(guiltFree.runwayTopup > 0 || guiltFree.bufferTopup > 0) && (
                      <div className="mt-3 border-t border-emerald-100 pt-3 space-y-1">
                        {guiltFree.runwayTopup > 0 && (
                          <p className="text-[10px] text-zinc-400">
                            Includes <span className="font-medium text-zinc-500">{fmt(guiltFree.runwayTopup)}/mo</span> to build your 6-month emergency runway over 12 months.
                          </p>
                        )}
                        {guiltFree.bufferTopup > 0 && (
                          <p className="text-[10px] text-zinc-400">
                            Includes <span className="font-medium text-teal-600">{fmt(guiltFree.bufferTopup)}/mo</span> to build your <span className="font-medium text-zinc-500">{fmt(bufferTarget)}</span> checking buffer over 3 months.
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                )}

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

                  {/* Comfort Buffer card */}
                  <div className={`rounded-2xl border p-4 bg-gradient-to-br ${bufferTarget > 0 ? "from-teal-50 to-white border-teal-200" : "from-zinc-50 to-white border-zinc-200"}`}>
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-2">
                        <span className="text-base">🧘</span>
                        <div className="text-sm font-semibold text-zinc-800">Comfort Buffer</div>
                      </div>
                      {bufferTarget > 0 ? (
                        <span className="rounded-full px-3 py-0.5 text-xs font-semibold bg-teal-100 text-teal-700">Active</span>
                      ) : (
                        <span className="rounded-full px-3 py-0.5 text-xs font-semibold bg-zinc-100 text-zinc-400">Not set</span>
                      )}
                    </div>
                    {bufferTarget > 0 ? (
                      <div className="mt-2 space-y-2">
                        <div className="flex items-baseline gap-1.5">
                          <span className="text-2xl font-bold text-zinc-900">{fmt(bufferTarget)}</span>
                          <span className="text-xs text-zinc-400">target float</span>
                        </div>
                        <p className="text-[10px] text-zinc-400 leading-snug">
                          Idle in checking — absorbs everyday &amp; emotional spending without touching your emergency fund or investments.
                        </p>
                        <div className="grid grid-cols-2 gap-2 pt-1">
                          <div className="rounded-xl bg-teal-50 border border-teal-100 px-3 py-2">
                            <div className="text-[9px] text-teal-600 font-medium mb-0.5">Build in 3 months</div>
                            <div className="text-sm font-bold text-teal-800">{fmt(Math.ceil(bufferTarget / 3))}/mo</div>
                          </div>
                          <div className="rounded-xl bg-zinc-50 border border-zinc-100 px-3 py-2">
                            <div className="text-[9px] text-zinc-500 font-medium mb-0.5">Covers ~</div>
                            <div className="text-sm font-bold text-zinc-700">
                              {monthlyExpenses > 0 ? `${(bufferTarget / monthlyExpenses).toFixed(1)}× expenses` : "–"}
                            </div>
                          </div>
                        </div>
                        <div className="pt-1 border-t border-teal-100">
                          <div className="flex justify-between text-[10px] text-zinc-400">
                            <span>Emergency fund</span>
                            <span className="font-medium text-zinc-600">Savings account</span>
                          </div>
                          <div className="flex justify-between text-[10px] text-zinc-400 mt-0.5">
                            <span>Comfort buffer</span>
                            <span className="font-medium text-teal-600">Checking account</span>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="mt-2">
                        <p className="text-xs text-zinc-400 leading-snug">
                          A float you always keep in checking to absorb everyday and emotional spending — separate from your emergency fund.
                        </p>
                        <p className="mt-2 text-[10px] text-zinc-400">Set a target in the calculator inputs to activate this.</p>
                      </div>
                    )}
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

                  {/* Monthly savings needed to hit runway targets */}
                  {hasInputs && monthlyExpenses > 0 && (
                    <div className="rounded-2xl border bg-gradient-to-br from-slate-50 to-white border-slate-200 p-4">
                      <div className="text-xs font-semibold text-zinc-700 mb-3">How to get there faster</div>
                      <div className="grid gap-3 sm:grid-cols-2">
                        {[
                          { label: "Hit 6-month runway", target: monthlyExpenses * 6, months: 6 },
                          { label: "Hit 12-month runway", target: monthlyExpenses * 12, months: 12 },
                        ].map(({ label, target: rTarget, months }) => {
                          const gap = Math.max(0, rTarget - cashStart);
                          const already = gap === 0;
                          const need3mo = already ? 0 : Math.ceil(gap / 3);
                          const need6mo = already ? 0 : Math.ceil(gap / 6);
                          return (
                            <div key={label} className="rounded-xl border border-slate-200 bg-white p-3">
                              <div className="text-[10px] font-semibold text-zinc-500 mb-1">{label}</div>
                              {already ? (
                                <div className="text-xs font-medium text-emerald-600">✓ Already covered</div>
                              ) : (
                                <div className="space-y-1.5">
                                  <div className="text-[10px] text-zinc-400">Gap: <span className="font-medium text-zinc-600">{fmt(gap)}</span></div>
                                  <div className="flex items-center justify-between text-[10px]">
                                    <span className="text-zinc-400">Save over 3 months</span>
                                    <span className="font-semibold text-slate-700">{fmt(need3mo)}/mo</span>
                                  </div>
                                  <div className="flex items-center justify-between text-[10px]">
                                    <span className="text-zinc-400">Save over 6 months</span>
                                    <span className="font-semibold text-slate-700">{fmt(need6mo)}/mo</span>
                                  </div>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Shock scenario mini-preview */}
                  {hasInputs && (
                    <div className="rounded-2xl border bg-gradient-to-br from-rose-50/60 to-white border-rose-100 p-4">
                      <div className="flex items-center justify-between mb-3">
                        <div className="text-xs font-semibold text-zinc-700">5-Shock Resilience Preview</div>
                        {!stressTestUnlocked && (
                          <span className="text-[9px] font-semibold uppercase tracking-widest text-violet-600 bg-violet-50 border border-violet-200 rounded-full px-2 py-0.5">Full results in Stress Test</span>
                        )}
                      </div>
                      {stressTest ? (
                        <div className="space-y-2">
                          {([stressTest.layoff, stressTest.marketCrash, stressTest.medical, stressTest.careerPivot, stressTest.lifestyleCreep] as const).map((s) => {
                            const statusColor =
                              s.status === "SURVIVES"  ? "bg-emerald-100 text-emerald-700 border-emerald-200" :
                              s.status === "AT_RISK"   ? "bg-amber-100 text-amber-700 border-amber-200" :
                                                         "bg-red-100 text-red-700 border-red-200";
                            const dot =
                              s.status === "SURVIVES"  ? "bg-emerald-500" :
                              s.status === "AT_RISK"   ? "bg-amber-500" : "bg-red-500";
                            return (
                              <div key={s.name} className="flex items-center justify-between rounded-xl border border-zinc-100 bg-white/70 px-3 py-2">
                                <div className="flex items-center gap-2">
                                  <span className={`h-2 w-2 rounded-full shrink-0 ${dot}`} />
                                  <span className="text-xs text-zinc-600">{s.name}</span>
                                </div>
                                <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${stressTestUnlocked ? statusColor : "bg-zinc-100 text-zinc-400 border-zinc-200 blur-[2px] select-none"}`}>
                                  {stressTestUnlocked ? s.status.replace("_", " ") : "LOCKED"}
                                </span>
                              </div>
                            );
                          })}
                          {!stressTestUnlocked && (
                            <p className="text-[10px] text-center text-zinc-400 pt-1">Unlock the Stress Test add-on to see your full resilience report.</p>
                          )}
                        </div>
                      ) : (
                        <p className="text-xs text-zinc-400 text-center py-2">Fill in all required fields to preview your shock resilience.</p>
                      )}
                    </div>
                  )}
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
        <section id="shock" className="mb-12 rounded-3xl bg-gradient-to-b from-zinc-100 via-zinc-200 to-zinc-300 border border-zinc-200 p-10 shadow-xl">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div>
              <div className="text-sm font-semibold text-orange-500">Real Scenario Simulator</div>
              <div className="text-sm text-zinc-600">
                Stress-test your runway with an income shock.
              </div>
            </div>
            <Button
              className="bg-blue-600 text-white hover:bg-blue-700 shadow-lg"
              onClick={() => scrollTo("plan")}
            >
              Get Your Personalised Blueprint – $197
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
          <div className="text-center">
            <div className="text-xs font-semibold uppercase tracking-widest text-zinc-400 mb-2">
              Early Access
            </div>
            <h2 className="text-2xl font-bold text-zinc-900 mb-4">
              Be among the first
            </h2>
            <p className="text-zinc-500 text-sm max-w-xl mx-auto leading-relaxed">
              Early access members get founding pricing and direct input into what gets built next. No generic advice — just the tool, your numbers, and a plan that's actually yours.
            </p>
            <div className="mt-8 flex flex-wrap justify-center gap-8">
              <div className="flex flex-col items-center gap-1">
                <div className="text-2xl font-bold text-zinc-900">$0</div>
                <div className="text-xs text-zinc-500 uppercase tracking-widest">to run your score</div>
              </div>
              <div className="w-px h-10 bg-zinc-200 self-center hidden sm:block" />
              <div className="flex flex-col items-center gap-1">
                <div className="text-2xl font-bold text-zinc-900">4</div>
                <div className="text-xs text-zinc-500 uppercase tracking-widest">leverage dimensions</div>
              </div>
              <div className="w-px h-10 bg-zinc-200 self-center hidden sm:block" />
              <div className="flex flex-col items-center gap-1">
                <div className="text-2xl font-bold text-zinc-900">12</div>
                <div className="text-xs text-zinc-500 uppercase tracking-widest">month action plan</div>
              </div>
              <div className="w-px h-10 bg-zinc-200 self-center hidden sm:block" />
              <div className="flex flex-col items-center gap-1">
                <div className="text-2xl font-bold text-zinc-900">1</div>
                <div className="text-xs text-zinc-500 uppercase tracking-widest">bottleneck to fix first</div>
              </div>
            </div>
          </div>
        </section>

        {/* 5. What's Inside the Blueprint */}
        <section className="mb-12 rounded-3xl border bg-white p-8 shadow-sm">
          <div className="text-center mb-8">
            <div className="text-xs font-semibold uppercase tracking-widest text-zinc-400 mb-2">
              The Leverage <span className="bg-gradient-to-r from-blue-500 to-cyan-400 bg-clip-text text-transparent">Blue</span>print
            </div>
            <h2 className="text-2xl font-bold text-zinc-900">
              What's inside your PDF
            </h2>
            <p className="mt-2 text-sm text-zinc-500 max-w-xl mx-auto">
              A 12-page confidential strategy document — personalized to your numbers, not a generic template.
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
                title: "Table of Contents",
                desc: "Structured overview of every section with page references so you can navigate the blueprint instantly.",
              },
              {
                page: "Page 2",
                title: "Executive Snapshot",
                desc: "KPI cards, personalized diagnosis, and a bold operator directive. The truth in one page.",
              },
              {
                page: "Page 3",
                title: "Financial Dependency Map",
                desc: "Exactly where your score comes from and how dependent you are on continued income.",
              },
              {
                page: "Page 4",
                title: "Wealth Velocity Model",
                desc: "Milestone timeline — when you hit $250k, $500k, $1M — and what changes at each level.",
              },
              {
                page: "Page 5",
                title: "Career Shock Simulation",
                desc: "Modeled outcomes for a 6-month loss, 12-month loss, and 30% pay cut using your actual numbers.",
              },
              {
                page: "Page 6",
                title: "Acceleration Scenarios",
                desc: "How +$500/mo and +$1k/mo in contributions changes your timeline — quantified.",
              },
              {
                page: "Page 7",
                title: "Shock Testing Lab",
                desc: "Three scenario tables: job loss, pay cut, and sabbatical — all modeled to your cash position.",
              },
              {
                page: "Page 8",
                title: "Monte Carlo Simulation",
                desc: "1,000 randomized market scenarios showing your probability of reaching FI — with percentile bands and success rates.",
              },
              {
                page: "Page 9",
                title: "12-Month Leverage Plan",
                desc: "Personalized 3-phase operator plan built from your bottleneck. No generic advice.",
              },
              {
                page: "Page 10",
                title: "Next Steps Checklist",
                desc: "A clear, prioritized action list you can act on today — no need to re-read the full document.",
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
        <section id="plan" className="mt-12 scroll-mt-24 rounded-3xl bg-zinc-900 p-8 text-white">
          <div className="max-w-3xl">
            <h2 className="text-3xl font-bold">
              The Leverage <span className="relative inline-block bg-gradient-to-r from-blue-400 via-cyan-300 to-blue-500 bg-clip-text text-transparent bg-[length:200%_auto] animate-[shimmer_3s_linear_infinite]">Blue</span>print
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

            <div className="mt-6 no-print">
              {/* Verifying auth with server */}
              {authVerifying && (
                <div className="flex items-center gap-2 py-3 text-xs text-zinc-500">
                  <svg className="h-3.5 w-3.5 animate-spin" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
                  </svg>
                  Verifying your access…
                </div>
              )}

              {/* Pre-purchase CTA */}
              {!authVerifying && !paymentSuccess && (
                <div className="flex flex-col items-start gap-2">
                  <PremiumCTAButton onClick={() => handleCheckout(STRIPE_PAYMENT_LINK)} disabled={!hasInputs}>
                    Get My Personalised Blueprint – $197
                  </PremiumCTAButton>
                  <p className="mt-2 text-sm text-blue-400">
                    Includes: Executive diagnosis · 12-month leverage roadmap ·
                    Scenario modeling · Milestone strategy
                  </p>
                </div>
              )}

              {/* Post-purchase: welcome + download */}
              {paymentSuccess && !blueprintDownloaded && (
                <div className="relative overflow-hidden rounded-2xl border border-emerald-800/40 bg-gradient-to-br from-emerald-950/50 via-zinc-950 to-zinc-950 p-6 shadow-[0_0_40px_rgba(16,185,129,0.08)]">
                  <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-emerald-500/40 to-transparent" />
                  <div className="pointer-events-none absolute -right-10 -top-10 h-32 w-32 rounded-full bg-emerald-500/5 blur-3xl" />

                  {/* Confirmation row */}
                  <div className="flex items-center gap-3 mb-6">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-emerald-500/15 ring-1 ring-emerald-500/30">
                      <svg className="h-4 w-4 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                    </div>
                    <div>
                      <div className="text-sm font-semibold text-emerald-300 tracking-wide">Payment confirmed — Blueprint unlocked</div>
                      <div className="text-xs text-zinc-400 mt-0.5">
                        {hasInputs
                          ? "Your personalised Leverage Blueprint is ready to generate."
                          : "Fill in your numbers in the calculator above, then come back here to generate."}
                      </div>
                    </div>
                  </div>

                  {/* Download CTA */}
                  <div className="flex flex-col items-start gap-3">
                    <button
                      onClick={hasInputs && !isGenerating ? handleGeneratePdf : undefined}
                      disabled={isGenerating || !hasInputs}
                      className={[
                        "group relative overflow-hidden rounded-xl px-8 py-4 text-sm font-semibold transition-all duration-200",
                        "bg-gradient-to-r from-violet-600 via-indigo-600 to-purple-600",
                        "shadow-[0_0_32px_rgba(139,92,246,0.5)]",
                        "text-white tracking-wide",
                        hasInputs && !isGenerating
                          ? "hover:shadow-[0_0_48px_rgba(139,92,246,0.7)] hover:scale-[1.02] active:scale-[0.98] cursor-pointer"
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
                      <span className="text-xs text-amber-400/80">Complete all required calculator fields first.</span>
                    )}
                    {hasInputs && !isGenerating && (
                      <span className="text-xs text-zinc-500">PDF · Personalised · Ready in seconds</span>
                    )}

                    {/* Email delivery */}
                    {hasInputs && (
                      <div className="mt-2 border-t border-emerald-800/30 pt-4 w-full">
                        <div className="text-[11px] text-zinc-500 mb-2">Or send to your inbox</div>
                        {emailSent ? (
                          <div className="flex items-center gap-2 text-xs text-emerald-400">
                            <svg className="h-3.5 w-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                            </svg>
                            Sent to {blueprintEmail}
                          </div>
                        ) : (
                          <div className="space-y-2">
                            <div className="flex gap-2">
                              <input
                                type="email"
                                value={blueprintEmail}
                                onChange={(e) => { setBlueprintEmail(e.target.value); setEmailError(""); }}
                                onKeyDown={(e) => e.key === "Enter" && handleEmailPdf()}
                                placeholder="your@email.com"
                                className="flex-1 min-w-0 rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-xs text-white placeholder-zinc-500 outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500/40 transition"
                              />
                              <button
                                onClick={handleEmailPdf}
                                disabled={isSendingEmail || !blueprintEmail}
                                className="shrink-0 rounded-lg bg-zinc-700 px-4 py-2 text-xs font-semibold text-white transition hover:bg-zinc-600 disabled:opacity-40 disabled:cursor-not-allowed"
                              >
                                {isSendingEmail ? (
                                  <svg className="h-3.5 w-3.5 animate-spin" viewBox="0 0 24 24" fill="none">
                                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
                                    <path className="opacity-80" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
                                  </svg>
                                ) : "Send →"}
                              </button>
                            </div>
                            {emailError && (
                              <p className="text-[10px] text-red-400">{emailError}</p>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
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
                    <div className="ml-auto flex items-center gap-2">
                      {/* Send to inbox (re-send) */}
                      {emailSent ? (
                        <span className="text-[10px] text-emerald-400">✓ Sent</span>
                      ) : (
                        <div className="flex gap-1.5">
                          <input
                            type="email"
                            value={blueprintEmail}
                            onChange={(e) => { setBlueprintEmail(e.target.value); setEmailError(""); }}
                            onKeyDown={(e) => e.key === "Enter" && handleEmailPdf()}
                            placeholder="Send to inbox…"
                            className="w-36 rounded-lg border border-zinc-700 bg-zinc-900 px-2.5 py-1.5 text-[11px] text-zinc-300 placeholder-zinc-600 outline-none focus:border-violet-500 transition"
                          />
                          <button
                            onClick={handleEmailPdf}
                            disabled={isSendingEmail || !blueprintEmail}
                            className="rounded-lg border border-zinc-700 px-2.5 py-1.5 text-[11px] text-zinc-400 transition hover:border-zinc-500 hover:text-zinc-200 disabled:opacity-40"
                          >
                            {isSendingEmail ? "…" : "Send"}
                          </button>
                        </div>
                      )}
                      <span className="flex items-center gap-1.5 text-[10px] text-zinc-600">
                        <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M12 11V7a4 4 0 10-8 0v4M5 11h14l1 9H4l1-9z" />
                        </svg>
                        Locked to original inputs
                      </span>
                    </div>
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

                  {/* Refresh blueprint */}
                  <div className="flex items-center justify-between border-t border-zinc-800/60 px-5 py-3">
                    <span className="text-xs text-zinc-600">Your inputs have changed significantly? Generate a fresh Blueprint with your updated numbers.</span>
                    <button
                      onClick={handleBlueprintRefresh}
                      className="ml-4 shrink-0 rounded-lg border border-zinc-700 px-3 py-1.5 text-xs text-zinc-500 transition hover:border-zinc-500 hover:text-zinc-300"
                    >
                      Get an updated Blueprint – $197
                    </button>
                  </div>
                </div>
              )}

              {/* Stress Test upsell — shown only after Blueprint is downloaded */}
              {paymentSuccess && blueprintDownloaded && !stressTestUnlocked && !stressUpsellDismissed && stressTest && (
                <div className="w-full mt-4 overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-950 shadow-xl">
                  <div className="flex flex-wrap items-center justify-between gap-4 border-b border-zinc-800 bg-gradient-to-r from-violet-950/40 to-zinc-950 px-5 py-4">
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <span className="rounded-md bg-violet-500/15 px-2 py-0.5 text-xs font-semibold uppercase tracking-widest text-violet-400">Add-On – $47</span>
                        <span className="rounded-md bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 text-xs font-semibold text-emerald-400">Buy once, use forever</span>
                      </div>
                      <div className="text-sm font-semibold text-white">Stress Test: Resilience Report</div>
                      <div className="mt-0.5 text-xs text-zinc-400">5 financial shock scenarios modeled to your exact numbers. Updates live as your inputs change — one clear action per scenario.</div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={handleStressCheckout}
                        className="group relative shrink-0 overflow-hidden rounded-xl bg-gradient-to-r from-violet-600 to-purple-600 px-5 py-2.5 text-xs font-semibold text-white shadow transition hover:brightness-110 active:scale-95"
                      >
                        <span className="pointer-events-none absolute inset-0 -translate-x-full skew-x-[-20deg] bg-white/10 transition-transform duration-700 group-hover:translate-x-[200%]" />
                        Unlock Stress Test – $47
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
                  {/* Header — always visible, acts as toggle */}
                  <button
                    onClick={() => setStressTestExpanded((v) => !v)}
                    className="w-full flex items-center justify-between gap-3 border-b border-zinc-800 bg-gradient-to-r from-violet-950/40 to-zinc-950 px-5 py-3.5 text-left transition hover:brightness-110"
                  >
                    <div className="flex items-center gap-3">
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-violet-500/20 ring-1 ring-violet-500/40">
                        <svg className="h-4 w-4 text-violet-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M12 2l7 4v5c0 5.25-3.5 9.74-7 11-3.5-1.26-7-5.75-7-11V6l7-4z" />
                        </svg>
                      </div>
                      <div>
                        <div className="text-sm font-semibold text-white">Resilience Report: 5 Stress Scenarios</div>
                        <div className="text-xs text-zinc-500">Updates live as you change your inputs</div>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <span className="text-xs text-zinc-500">{stressTestExpanded ? "Hide" : "Show"}</span>
                      <svg
                        className={`h-4 w-4 text-zinc-500 transition-transform duration-200 ${stressTestExpanded ? "rotate-180" : ""}`}
                        fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                      </svg>
                    </div>
                  </button>

                  {/* Collapsible body */}
                  {stressTestExpanded && (
                    <>
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
                    </>
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
            <span className="text-xs text-zinc-400">© {new Date().getFullYear()} Equanimity Engine. All rights reserved. · v1.0.0</span>
          </div>
        </footer>
      </main>

      {/* Floating side tab — Stress Test */}
      <div
        className="no-print fixed right-0 top-1/2 -translate-y-1/2 z-40 cursor-pointer flex items-center"
        onClick={() => scrollTo("shock")}
        onMouseEnter={() => setShockTabOpen(true)}
        onMouseLeave={() => setShockTabOpen(false)}
      >
        {/* Expanded panel */}
        <div className={`flex items-center gap-3 bg-gradient-to-r from-amber-500 to-orange-500 pl-5 py-5 rounded-l-2xl shadow-xl overflow-hidden whitespace-nowrap transition-all duration-500 ease-in-out ${shockTabOpen ? "w-64 pr-5 opacity-100" : "w-0 pr-0 opacity-0"}`}>
          <div>
            <div className="text-white font-semibold text-sm leading-tight">What if you lost your income?</div>
            <div className="text-orange-100 text-xs mt-1">Run the scenario →</div>
          </div>
        </div>
        {/* Always-visible tab */}
        <div className={`flex flex-col items-center justify-center gap-2 bg-gradient-to-b from-amber-500 to-orange-500 w-10 py-5 shadow-xl transition-all duration-500 ${shockTabOpen ? "rounded-l-none" : "rounded-l-2xl"}`}>
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-60" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-white" />
          </span>
          <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4 text-white" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
            <line x1="12" y1="9" x2="12" y2="13" />
            <line x1="12" y1="17" x2="12.01" y2="17" />
          </svg>
        </div>
      </div>

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
                  <p><strong className="text-zinc-900">Payments and Refunds.</strong> All purchases on Equanimity Engine are for digital products delivered immediately upon payment. Due to the instant nature of digital delivery, all sales are final and non-refundable. By completing a purchase, you acknowledge that you have read and understood this policy.</p>
                  <p><strong className="text-zinc-900">Changes.</strong> We reserve the right to modify these terms at any time. Continued use of the Service after changes constitutes acceptance.</p>
                  <p><strong className="text-zinc-900">Contact.</strong> For questions about these Terms, contact us at support@equanimityengine.com.</p>
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
