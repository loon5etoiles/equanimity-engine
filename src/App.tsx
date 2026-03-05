import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import React, { useEffect, useMemo, useState, useRef } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";
import {
  TrendingUp,
  Wallet,
  Share2,
  Calculator,
  HeartHandshake,
} from "lucide-react";


// ---------- Tiny UI helpers (no external UI libs) ----------
function LeverageGauge({
  value,
  label,
}: {
  value: number; // 0–100
  label: string;
}) {
  const v = Math.max(0, Math.min(100, value));
  const left = `${v}%`;

  const tone =
    v < 30
      ? "bg-red-100 text-red-700 border-red-200"
      : v < 60
      ? "bg-amber-100 text-amber-800 border-amber-200"
      : v < 80
      ? "bg-blue-100 text-blue-700 border-blue-200"
      : "bg-emerald-100 text-emerald-700 border-emerald-200";

  return (
    <div className="mt-3">
      <div className="flex items-center justify-between">
        <div className="text-xs text-zinc-500">LOW LEVERAGE</div>
        <div className="text-xs text-zinc-500">HIGH LEVERAGE</div>
      </div>

      <div className="relative mt-2 h-3 rounded-full bg-zinc-200 overflow-hidden">
        {/* subtle gradient fill */}
        <div className="absolute inset-0 bg-gradient-to-r from-red-400 via-blue-500 to-emerald-500 opacity-30" />
        {/* position marker */}
        <div
          className="absolute top-1/2 -translate-y-1/2"
          style={{ left }}
        >
          <div className="h-4 w-4 rounded-full bg-blue-600 border-2 border-white shadow-md" />
        </div>
      </div>

      <div className="mt-3 flex items-center justify-between">
        <div className="text-sm font-semibold">{v}</div>
        <span className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold ${tone}`}>
          {label}
        </span>
      </div>
    </div>
  );
}
function PremiumCTAButton({
  children,
  onClick,
}: {
  children: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="
        group relative inline-flex items-center justify-center
        rounded-2xl p-[2px]
        shadow-[0_12px_40px_rgba(37,99,235,0.35)]
        hover:shadow-[0_18px_55px_rgba(37,99,235,0.45)]
        transition-all duration-200
      "
    >
      {/* Gradient border */}
      <span
        className="
          absolute inset-0 rounded-2xl
          bg-gradient-to-r from-blue-500 via-indigo-500 to-purple-500
          opacity-90
          blur-[0px]
          transition-opacity duration-200
          group-hover:opacity-100
        "
      />
      {/* Inner fill */}
      <span
        className="
          relative z-10 inline-flex items-center justify-center
          rounded-2xl
          bg-zinc-950/90 text-white
          px-6 py-4 text-base font-semibold
          backdrop-blur-xl
          border border-white/10
          transition-transform duration-200
          group-hover:-translate-y-[1px]
          active:translate-y-0
          whitespace-nowrap
        "
      >
        {children}
        <span className="ml-2 opacity-80 group-hover:opacity-100 transition-opacity">
          →
        </span>
      </span>
    </button>
  );
}
function ColorCard({
  children,
  className = "",
  tone = "blue",
}: {
  children: React.ReactNode;
  className?: string;
  tone?:
    | "blue"
    | "indigo"
    | "purple"
    | "emerald"
    | "teal"
    | "amber"
    | "rose"
    | "slate";
}) {
  const tones: Record<string, string> = {
    blue: "from-blue-50/90 to-white border-blue-100/70 ring-blue-200/40",
    indigo: "from-indigo-50/90 to-white border-indigo-100/70 ring-indigo-200/40",
    purple: "from-purple-50/90 to-white border-purple-100/70 ring-purple-200/40",
    emerald: "from-emerald-50/90 to-white border-emerald-100/70 ring-emerald-200/40",
    teal: "from-teal-50/90 to-white border-teal-100/70 ring-teal-200/40",
    amber: "from-amber-50/90 to-white border-amber-100/70 ring-amber-200/40",
    rose: "from-rose-50/90 to-white border-rose-100/70 ring-rose-200/40",
    slate: "from-slate-50/90 to-white border-slate-100/70 ring-slate-200/40",
  };

  return (
    <div
      className={[
        "group rounded-3xl border bg-gradient-to-b backdrop-blur-xl",
        "shadow-sm transition-all duration-200",
        "hover:-translate-y-[2px] hover:shadow-xl",
        "ring-1",
        tones[tone],
        className,
      ].join(" ")}
    >
      {children}
    </div>
  );
}

function CardHeaderRow({
  icon,
  title,
  right,
  tone = "blue",
}: {
  icon?: React.ReactNode;
  title: string;
  right?: React.ReactNode;
  tone?: "blue" | "indigo" | "purple" | "emerald" | "teal" | "amber" | "rose" | "slate";
}) {
  const iconTone: Record<string, string> = {
    blue: "bg-blue-600/10 text-blue-700 ring-blue-600/20",
    indigo: "bg-indigo-600/10 text-indigo-700 ring-indigo-600/20",
    purple: "bg-purple-600/10 text-purple-700 ring-purple-600/20",
    emerald: "bg-emerald-600/10 text-emerald-700 ring-emerald-600/20",
    teal: "bg-teal-600/10 text-teal-700 ring-teal-600/20",
    amber: "bg-amber-600/10 text-amber-800 ring-amber-600/20",
    rose: "bg-rose-600/10 text-rose-700 ring-rose-600/20",
    slate: "bg-slate-600/10 text-slate-700 ring-slate-600/20",
  };

  return (
    <div className="flex items-center justify-between gap-3">
      <div className="flex items-center gap-2">
        {icon ? (
          <span
            className={[
              "inline-flex h-8 w-8 items-center justify-center rounded-2xl ring-1",
              iconTone[tone],
              "transition group-hover:scale-[1.03]",
            ].join(" ")}
          >
            {icon}
          </span>
        ) : null}
        <div className="text-sm font-semibold text-zinc-900">{title}</div>
      </div>
      {right ? <div className="shrink-0">{right}</div> : null}
    </div>
  );
}

function Card({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={
        "rounded-3xl border border-white/40 bg-white/60 backdrop-blur-xl shadow-xl " +
        className
      }
    >
      {children}
    </div>
  );
}
function CardContent({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return <div className={"p-5 " + className}>{children}</div>;
}
function Button({
  children,
  onClick,
  variant = "solid",
  className = "",
  type = "button",
}: {
  children: React.ReactNode;
  onClick?: () => void;
  variant?: "solid" | "outline";
  className?: string;
  type?: "button" | "submit" | "reset";
}) {
  const base =
    "inline-flex items-center justify-center gap-2 rounded-2xl px-4 py-2 text-sm font-medium transition active:scale-[0.99]";
  const solid = "bg-zinc-900 text-white hover:bg-zinc-800";
  const outline = "border bg-white hover:bg-zinc-50 text-zinc-900";
 // Button Component with 'outline' variant and default 'solid' styling
  return (
  <button
    type={type}
    onClick={onClick}
    className={`${base} ${variant === "outline" ? outline : ""} ${className}`}
  >
    {children}
  </button>
);
}
function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={
        "w-full rounded-2xl border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-zinc-200 " +
        (props.className ?? "")
      }
    />
  );
}
function Label({ children }: { children: React.ReactNode }) {
  return <div className="text-xs font-medium text-zinc-600">{children}</div>;
}
function Badge({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center rounded-2xl bg-zinc-100 px-3 py-1 text-xs text-zinc-700">
      {children}
    </span>
  );
}
function Separator() {
  return <div className="h-px w-full bg-zinc-100" />;
}

function InfoTooltip({ text }: { text: string }) {
  return (
    <span className="relative group inline-flex items-center ml-1">
      <span className="cursor-help text-zinc-400 hover:text-zinc-600 text-xs">
        ⓘ
      </span>

      <span
        className="
          absolute left-0 top-full mt-2
          hidden group-hover:block
          w-72 rounded-xl border border-zinc-200
          bg-white p-3 text-xs text-zinc-700 shadow-xl
          z-[9999]
        "
      >
        {text}
      </span>
    </span>
  );
}

// ---------- Math helpers ----------
const clamp = (n: number, min: number, max: number) =>
  Math.max(min, Math.min(max, n));
const fmt = (n: number) =>
  n.toLocaleString(undefined, {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  });

function fvMonthly(pmt: number, annualRate: number, years: number) {
  const r = annualRate / 12;
  const n = Math.round(years * 12);
  if (r === 0) return pmt * n;
  return pmt * ((Math.pow(1 + r, n) - 1) / r);
}
function fvWithStart(
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
function buildSeries(
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
function yearsToTarget(
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

// ---------- Share state in URL ----------


// const heroRef = React.useRef<HTMLElement | null>(null);
// const [heroInView, setHeroInView] = useState(false);

// useEffect(() => {
//   const el = heroRef.current;
//   if (!el) return;

//   const obs = new IntersectionObserver(
//     ([entry]) => {
//       if (entry.isIntersecting) setHeroInView(true);
//     },
//     { threshold: 0.35 }
//   );

//   obs.observe(el);
//   return () => obs.disconnect();
// }, []);

function encodeState(obj: any) {
  const json = JSON.stringify(obj);
  return btoa(unescape(encodeURIComponent(json)));
}
function decodeState(b64: string) {
  try {
    const json = decodeURIComponent(escape(atob(b64)));
    return JSON.parse(json);
  } catch {
    return null;
  }
}

export default function App() {
  // Defaults aligned with your scenario (editable by anyone)
  const [age, setAge] = useState<number>(42);
  const [investedStart, setInvestedStart] = useState<number>(104000);
  const [cashStart, setCashStart] = useState<number>(60000);
  const [monthlyIncome, setMonthlyIncome] = useState<number>(16214);
  const [monthlyExpenses, setMonthlyExpenses] = useState<number>(12815);
  const [monthlyInvest, setMonthlyInvest] = useState<number>(4749);
  const [annualReturnPct, setAnnualReturnPct] = useState<number>(7);
  const [target, setTarget] = useState<number>(1000000);
  const [years, setYears] = useState<number>(10);
  const [shockMonths, setShockMonths] = useState<number>(6);
  const [incomeDropPct, setIncomeDropPct] = useState<number>(100); // 100 = total loss
  const [tab, setTab] = useState<"projection" | "milestones" | "runway">(
    "projection"
    
  );

  // Stripe redirect success flag
  const [paymentSuccess, setPaymentSuccess] = useState(false);

  useEffect(() => {
const params = new URLSearchParams(window.location.search);

const success = params.get("success") === "1";
setPaymentSuccess(success);

// Restore explicit share state if present
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

// If returned from Stripe success, restore transient saved form
if (success) {
try {
const saved = localStorage.getItem(FORM_SAVED_KEY);
if (saved) {
const decoded = JSON.parse(saved);
setAge(decoded.age ?? 42);
setInvestedStart(decoded.investedStart ?? 104000);
setCashStart(decoded.cashStart ?? 60000);
setMonthlyIncome(decoded.monthlyIncome ?? 16214);
setMonthlyExpenses(decoded.monthlyExpenses ?? 12815);
setMonthlyInvest(decoded.monthlyInvest ?? 4749);
setAnnualReturnPct(decoded.annualReturnPct ?? 7);
setTarget(decoded.target ?? 1000000);
setYears(decoded.years ?? 10);
localStorage.removeItem(FORM_SAVED_KEY);
}
} catch (e) {
// ignore parse/storage errors
}
}
}, []);

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
  const netBurn = monthlyExpenses - keptIncome; // how much cash you burn per month
  const cashAfter = cashStart - netBurn * shockMonths;

  const survives = cashAfter >= 0;
  const runwayInShock =
    netBurn > 0 ? cashStart / netBurn : Infinity; // months you can last in shock scenario

  return {
    keptIncome,
    netBurn,
    cashAfter,
    survives,
    runwayInShock,
  };
}, [monthlyIncome, monthlyExpenses, cashStart, shockMonths, incomeDropPct]);

  // // Burnout Leverage Score (0–100)
  // const leverageScore = useMemo(() => {
  //   let score = 0;

  //   // 1️⃣ Runway Score (0–30)
  //   if (runwayMonths < 3) score += 0;
  //   else if (runwayMonths < 6) score += 10;
  //   else if (runwayMonths < 9) score += 20;
  //   else score += 30;

  //   // 2️⃣ Dependency Score (0–25)
  //   const annualExpenses = monthlyExpenses * 12;
  //   const dependencyRatio = investedStart > 0 ? annualExpenses / investedStart : 1;

  //   if (dependencyRatio > 0.06) score += 0;
  //   else if (dependencyRatio > 0.04) score += 10;
  //   else if (dependencyRatio > 0.03) score += 20;
  //   else score += 25;

  //   // 3️⃣ Wealth Velocity (0–25)
  //   if (!yrsToTarget) score += 0;
  //   else if (yrsToTarget > 15) score += 0;
  //   else if (yrsToTarget > 10) score += 10;
  //   else if (yrsToTarget > 5) score += 20;
  //   else score += 25;

  //   // 4️⃣ Shock Resistance (0–20)
  //   const sixMonthShockCash = cashStart - monthlyExpenses * 6;
  //   const shockRunway =
  //     sixMonthShockCash > 0 ? sixMonthShockCash / monthlyExpenses : 0;

  //   if (shockRunway <= 0) score += 0;
  //   else if (shockRunway < 3) score += 5;
  //   else if (shockRunway < 6) score += 10;
  //   else if (shockRunway < 12) score += 15;
  //   else score += 20;

  //   return Math.min(score, 100);
  // }, [runwayMonths, monthlyExpenses, investedStart, yrsToTarget, cashStart]);
const leverage = useMemo(() => {
  // Component scores
  let runwayPts = 0;
  let dependencyPts = 0;
  let velocityPts = 0;
  let shockPts = 0;

  // 1) Runway (0–30)
  if (runwayMonths < 3) runwayPts = 0;
  else if (runwayMonths < 6) runwayPts = 10;
  else if (runwayMonths < 9) runwayPts = 20;
  else runwayPts = 30;

  // 2) Dependency (0–25) – annual expenses / invested assets
  const annualExpenses = monthlyExpenses * 12;
  const dependencyRatio = investedStart > 0 ? annualExpenses / investedStart : 1;

  if (dependencyRatio > 0.06) dependencyPts = 0;
  else if (dependencyRatio > 0.04) dependencyPts = 10;
  else if (dependencyRatio > 0.03) dependencyPts = 20;
  else dependencyPts = 25;

  // 3) Wealth velocity (0–25) – years to target
  if (!yrsToTarget) velocityPts = 0;
  else if (yrsToTarget > 15) velocityPts = 0;
  else if (yrsToTarget > 10) velocityPts = 10;
  else if (yrsToTarget > 5) velocityPts = 20;
  else velocityPts = 25;

  // 4) Shock resistance (0–20) – cash after 6 months
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

  // Identify bottleneck = lowest component by % of max
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

  // Smart recommendations
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
            : "You’re already at/above the 6–8 month target. Maintain it and shift excess toward investing.",
      },
      {
        title: "Cut one fixed cost (not everything)",
        why: "Small permanent reductions compound and immediately increase runway and surplus.",
        nextStep:
          "Pick one line item to reduce by $100–$300/month (insurance, subscriptions, renegotiate utilities, etc.).",
      },
      {
        title: "Add a ‘bridge’ income option",
        why: "Even $500–$1,000/month drastically improves resilience in layoffs.",
        nextStep: "Define 1 low-stress option you can activate in 30 days if needed.",
      }
    );
  }

  if (bottleneck.key === "dependency") {
    recs.push(
      {
        title: "Lower your dependency ratio",
        why: "If annual expenses consume a high % of invested assets, you’re forced to keep earning at your current level.",
        nextStep: "Aim for expenses ≤ 4% of invested assets (or grow assets faster than expenses).",
      },
      {
        title: "Reduce rigid expenses (housing / fixed payments)",
        why: "Rigid costs are what trap you in a job even with a good income.",
        nextStep: "Identify your top 1–2 fixed payments and explore refinance, recast, downsizing, or restructuring.",
      },
      {
        title: "Increase invest rate by a ‘non-painful’ amount",
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
        title: "Create a ‘shock protocol’",
        why: "Decisions are worst during stress. A protocol prevents rash moves.",
        nextStep:
          "Write a 1-page plan: expense cuts, timeline, how you’ll search, and what you will NOT do.",
      },
      {
        title: "Keep liquidity for optionality",
        why: "Liquidity buys time; time buys better decisions.",
        nextStep: "Maintain a cash floor that you don’t invest below (e.g., 6 months).",
      }
    );
  }

  // “Needle movers” quick deltas (simple simulations)
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

  const shareLink = useMemo(() => {
    const state = {
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
    const s = encodeState(state);
    const url = new URL(window.location.href);
    url.searchParams.set("s", s);
    return url.toString();
  }, [
    age,
    investedStart,
    cashStart,
    monthlyIncome,
    monthlyExpenses,
    monthlyInvest,
    annualReturnPct,
    target,
    years,
  ]);

  const scrollTo = (id: string) =>
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth" });

  const clearSuccessFlag = () => {
    const url = new URL(window.location.href);
    url.searchParams.delete("success");
    window.history.replaceState({}, "", url.toString());
    setPaymentSuccess(false);
  };
  // Clear success flag helper
  const FORM_SAVED_KEY = "bl_form_data_v1";

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
    } catch (e) {
      // ignore storage errors
    }
    // perform navigation to Stripe
    window.location.href = url;
  };

//   const generateBurnoutLeveragePlanPdf = () => {
//   const doc = new jsPDF({ unit: "pt", format: "letter" });

//   const pageWidth = doc.internal.pageSize.getWidth();
//   const margin = 48;

//   const title = "Burnout Leverage Plan";
//   const subtitle = "Personalized optionality + leverage report (educational only)";

//   const leverageLabel =
//     leverage.total < 30
//       ? "Financially Exposed"
//       : leverage.total < 60
//       ? "Stable but Dependent"
//       : leverage.total < 80
//       ? "Building Leverage"
//       : "Strong Optionality";

//   const annualExpenses = monthlyExpenses * 12;
//   const dependencyRatio = investedStart > 0 ? annualExpenses / investedStart : 0;

//   // Career shock modeling (simple, consistent with score)
//   const shock6Cash = cashStart - monthlyExpenses * 6;
//   const shock12Cash = cashStart - monthlyExpenses * 12;

//   const shock6Runway = shock6Cash > 0 ? shock6Cash / monthlyExpenses : 0;
//   const shock12Runway = shock12Cash > 0 ? shock12Cash / monthlyExpenses : 0;

//   // Acceleration scenarios
//   const baseYrsToTarget = yrsToTarget;
//   const yrsPlus1k = yearsToTarget(
//     investedStart,
//     monthlyInvest + 1000,
//     annualRate,
//     target
//   );
//   const yrsPlus2k = yearsToTarget(
//     investedStart,
//     monthlyInvest + 2000,
//     annualRate,
//     target
//   );

//   // Header
//   doc.setFont("helvetica", "bold");
//   doc.setFontSize(22);
//   doc.text(title, margin, 72);

//   doc.setFont("helvetica", "normal");
//   doc.setFontSize(11);
//   doc.setTextColor(80);
//   doc.text(subtitle, margin, 92);

//   doc.setDrawColor(230);
//   doc.line(margin, 110, pageWidth - margin, 110);

//   doc.setTextColor(20);

//   // Executive snapshot
//   doc.setFont("helvetica", "bold");
//   doc.setFontSize(14);
//   doc.text("Executive Snapshot", margin, 140);

//   doc.setFont("helvetica", "normal");
//   doc.setFontSize(11);

//   const snapshotRows = [
//     ["Burnout Leverage Score", `${leverage.total} (${leverageLabel})`],
//     ["Runway (months)", `${runwayMonths.toFixed(1)}`],
//     ["Monthly Surplus", fmt(surplus)],
//     ["Invested Assets", fmt(investedStart)],
//     ["Emergency Fund (Cash)", fmt(cashStart)],
//     ["Years to Target", baseYrsToTarget ? `${baseYrsToTarget.toFixed(1)} yrs` : "—"],
//     ["Estimated Age at Target", ageAtTarget ? `${ageAtTarget.toFixed(0)}` : "—"],
//     ["Annual Expenses", fmt(annualExpenses)],
//     ["Expenses / Invested Assets", investedStart > 0 ? `${(dependencyRatio * 100).toFixed(2)}%` : "—"],
//   ];

//   autoTable(doc, {
//     startY: 152,
//     head: [["Metric", "Value"]],
//     body: snapshotRows,
//     theme: "grid",
//     styles: { font: "helvetica", fontSize: 10, cellPadding: 6 },
//     headStyles: { fillColor: [24, 24, 27] }, // zinc-900
//     margin: { left: margin, right: margin },
//   });

//   // --- Score Breakdown (Paid detail) ---
// let y = (doc as any).lastAutoTable.finalY + 28;

// doc.setFont("helvetica", "bold");
// doc.setFontSize(14);
// doc.setTextColor(20);
// doc.text("Burnout Leverage Score Breakdown", margin, y);

// doc.setFont("helvetica", "normal");
// doc.setFontSize(11);
// doc.setTextColor(90);
// doc.text("This explains exactly where your score comes from.", margin, y + 16);
// doc.setTextColor(20);

// const compRows = leverage.components.map((c) => [
//   c.name,
//   `${c.points}/${c.max}`,
//   c.points / c.max < 0.34 ? "Weak" : c.points / c.max < 0.67 ? "Medium" : "Strong",
// ]);

// autoTable(doc, {
//   startY: y + 28,
//   head: [["Component", "Score", "Strength"]],
//   body: compRows,
//   theme: "grid",
//   styles: { font: "helvetica", fontSize: 10, cellPadding: 6 },
//   headStyles: { fillColor: [24, 24, 27] },
//   margin: { left: margin, right: margin },
// });

// // --- Personalized Summary ---
// y = (doc as any).lastAutoTable.finalY + 28;

// doc.setFont("helvetica", "bold");
// doc.setFontSize(14);
// doc.text("Your Bottleneck (What to Fix First)", margin, y);

// doc.setFont("helvetica", "normal");
// doc.setFontSize(11);
// doc.setTextColor(70);
// doc.text(
//   `Your primary constraint is: ${leverage.bottleneck.name}. Fixing this first reduces stress the fastest.`,
//   margin,
//   y + 16,
//   { maxWidth: pageWidth - margin * 2 }
// );
// doc.setTextColor(20);

// // --- Top Recommendations (Paid detail) ---
// y = y + 40;

// doc.setFont("helvetica", "bold");
// doc.setFontSize(14);
// doc.text("Top 3 Recommended Moves", margin, y);

// const recRows = leverage.recs.slice(0, 3).map((r, idx) => [
//   `${idx + 1}. ${r.title}`,
//   r.why,
//   r.nextStep,
// ]);

// autoTable(doc, {
//   startY: y + 16,
//   head: [["Move", "Why it matters", "Next step"]],
//   body: recRows,
//   theme: "grid",
//   styles: { font: "helvetica", fontSize: 10, cellPadding: 6 },
//   headStyles: { fillColor: [24, 24, 27] },
//   margin: { left: margin, right: margin },
// });

// // --- Needle Movers (Paid detail) ---
// y = (doc as any).lastAutoTable.finalY + 28;

// doc.setFont("helvetica", "bold");
// doc.setFontSize(14);
// doc.text("What Moves the Needle (Time-to-Target)", margin, y);

// doc.setFont("helvetica", "normal");
// doc.setFontSize(11);
// doc.setTextColor(90);
// doc.text("Small changes can cut years off your timeline.", margin, y + 16);
// doc.setTextColor(20);

// const base = yrsToTarget ? yrsToTarget.toFixed(1) + " yrs" : "—";
// const plus500 = leverage.needle.plus500 ? leverage.needle.plus500.toFixed(1) + " yrs" : "—";
// const plus1000 = leverage.needle.plus1000 ? leverage.needle.plus1000.toFixed(1) + " yrs" : "—";

// autoTable(doc, {
//   startY: y + 28,
//   head: [["Scenario", "Time to target"]],
//   body: [
//     ["Current", base],
//     ["Invest +$500/mo", plus500],
//     ["Invest +$1,000/mo", plus1000],
//   ],
//   theme: "grid",
//   styles: { font: "helvetica", fontSize: 10, cellPadding: 6 },
//   headStyles: { fillColor: [24, 24, 27] },
//   margin: { left: margin, right: margin },
// });

//   // Career shock section
//   const afterSnapshotY = (doc as any).lastAutoTable.finalY + 28;

//   doc.setFont("helvetica", "bold");
//   doc.setFontSize(14);
//   doc.text("Career Shock Modeling", margin, afterSnapshotY);

//   doc.setFont("helvetica", "normal");
//   doc.setFontSize(11);
//   doc.setTextColor(70);
//   doc.text(
//     "Simulates an income loss where expenses continue as-is using your cash runway.",
//     margin,
//     afterSnapshotY + 16
//   );
//   doc.setTextColor(20);

//   const shockRows = [
//     [
//       "6-month income loss",
//       shock6Cash >= 0 ? "Cash remains positive" : "Cash goes negative",
//       `Runway after shock: ${shock6Runway.toFixed(1)} mo`,
//     ],
//     [
//       "12-month income loss",
//       shock12Cash >= 0 ? "Cash remains positive" : "Cash goes negative",
//       `Runway after shock: ${shock12Runway.toFixed(1)} mo`,
//     ],
//   ];

//   autoTable(doc, {
//     startY: afterSnapshotY + 28,
//     head: [["Scenario", "Outcome", "Impact"]],
//     body: shockRows,
//     theme: "grid",
//     styles: { font: "helvetica", fontSize: 10, cellPadding: 6 },
//     headStyles: { fillColor: [24, 24, 27] },
//     margin: { left: margin, right: margin },
//   });

//   // Acceleration paths
//   const afterShockY = (doc as any).lastAutoTable.finalY + 28;

//   doc.setFont("helvetica", "bold");
//   doc.setFontSize(14);
//   doc.text("Acceleration Paths", margin, afterShockY);

//   doc.setFont("helvetica", "normal");
//   doc.setFontSize(11);
//   doc.setTextColor(70);
//   doc.text(
//     "How contribution changes affect time-to-target (same return assumptions).",
//     margin,
//     afterShockY + 16
//   );
//   doc.setTextColor(20);

//   const accelRows = [
//     ["Current monthly invest", fmt(monthlyInvest), baseYrsToTarget ? `${baseYrsToTarget.toFixed(1)} yrs` : "—"],
//     ["+ $1,000 / month", fmt(monthlyInvest + 1000), yrsPlus1k ? `${yrsPlus1k.toFixed(1)} yrs` : "—"],
//     ["+ $2,000 / month", fmt(monthlyInvest + 2000), yrsPlus2k ? `${yrsPlus2k.toFixed(1)} yrs` : "—"],
//   ];

//   autoTable(doc, {
//     startY: afterShockY + 28,
//     head: [["Scenario", "Monthly Invest", "Time to Target"]],
//     body: accelRows,
//     theme: "grid",
//     styles: { font: "helvetica", fontSize: 10, cellPadding: 6 },
//     headStyles: { fillColor: [24, 24, 27] },
//     margin: { left: margin, right: margin },
//   });

//   // 12-month action plan
//   const afterAccelY = (doc as any).lastAutoTable.finalY + 28;

//   doc.setFont("helvetica", "bold");
//   doc.setFontSize(14);
//   doc.text("12-Month Action Plan", margin, afterAccelY);

//   doc.setFont("helvetica", "normal");
//   doc.setFontSize(11);
//   doc.setTextColor(70);
//   doc.text(
//     "Practical, stress-reducing moves (customize to your situation).",
//     margin,
//     afterAccelY + 16
//   );
//   doc.setTextColor(20);

//   const actionRows = [
//     ["Runway", "Build 6–8 months of expenses in cash (reduce anxiety during layoffs)."],
//     ["Automate", "Automate monthly investing so progress continues even during stress."],
//     ["Expense rigidity", "Lower fixed costs where possible (subscriptions, insurance, refinancing review)."],
//     ["Optionality", "Aim for 1–2 “escape routes”: skills, interview readiness, side income, or reduced burn."],
//     ["Review cadence", "Update this plan monthly. Optionality compounds with consistency."],
//   ];

//   autoTable(doc, {
//     startY: afterAccelY + 28,
//     head: [["Focus", "Recommended Move"]],
//     body: actionRows,
//     theme: "grid",
//     styles: { font: "helvetica", fontSize: 10, cellPadding: 6 },
//     headStyles: { fillColor: [24, 24, 27] },
//     margin: { left: margin, right: margin },
//   });

//   // Footer disclaimer
//   const footerY = doc.internal.pageSize.getHeight() - 42;
//   doc.setFont("helvetica", "normal");
//   doc.setFontSize(9);
//   doc.setTextColor(120);
//   doc.text(
//     "Educational only — not financial advice. Returns are assumptions; taxes/fees not included.",
//     margin,
//     footerY
//   );

// OLD Verion (simpler, less polished)

// const generateBurnoutLeveragePlanPdf = () => {
//   const doc = new jsPDF({ unit: "pt", format: "letter" });

//   const pageWidth = doc.internal.pageSize.getWidth();
//   const pageHeight = doc.internal.pageSize.getHeight();
//   const margin = 48;

//   const now = new Date();
//   const dateStr = now.toLocaleDateString(undefined, {
//     year: "numeric",
//     month: "short",
//     day: "2-digit",
//   });

//   // ---------- Helpers ----------
//   const hr = (y: number) => {
//     doc.setDrawColor(230);
//     doc.line(margin, y, pageWidth - margin, y);
//   };

//   const addPageHeader = (title: string, subtitle?: string) => {
//     doc.setTextColor(20);
//     doc.setFont("helvetica", "bold");
//     doc.setFontSize(16);
//     doc.text(title, margin, 56);

//     if (subtitle) {
//       doc.setFont("helvetica", "normal");
//       doc.setFontSize(10);
//       doc.setTextColor(100);
//       doc.text(subtitle, margin, 72);
//     }

//     hr(84);
//   };

//   const addFooter = () => {
//     doc.setFont("helvetica", "normal");
//     doc.setFontSize(9);
//     doc.setTextColor(120);
//     doc.text(
//       "Educational only — not financial advice. Assumptions exclude taxes/fees; markets vary.",
//       margin,
//       pageHeight - 32
//     );
//   };

//   const safeText = (t: string) => t.replace(/\s+/g, " ").trim();

//   const paragraph = (text: string, y: number) => {
//     doc.setFont("helvetica", "normal");
//     doc.setFontSize(11);
//     doc.setTextColor(40);
//     const maxWidth = pageWidth - margin * 2;
//     const lines = doc.splitTextToSize(safeText(text), maxWidth);
//     doc.text(lines, margin, y);
//     return y + lines.length * 14;
//   };

//   const callout = (label: string, text: string, y: number) => {
//     doc.setDrawColor(230);
//     doc.setFillColor(250, 250, 250);
//     doc.roundedRect(margin, y, pageWidth - margin * 2, 72, 10, 10, "FD");
//     doc.setFont("helvetica", "bold");
//     doc.setFontSize(11);
//     doc.setTextColor(20);
//     doc.text(label, margin + 14, y + 22);

//     doc.setFont("helvetica", "normal");
//     doc.setFontSize(10);
//     doc.setTextColor(70);
//     const maxWidth = pageWidth - margin * 2 - 28;
//     const lines = doc.splitTextToSize(safeText(text), maxWidth);
//     doc.text(lines, margin + 14, y + 40);
//     return y + 86;
//   };

//   const ensureSpace = (y: number, needed: number) => {
//     if (y + needed > pageHeight - 70) {
//       addFooter();
//       doc.addPage();
//       return 96; // after header space on new page (we’ll call addPageHeader separately per page)
//     }
//     return y;
//   };

//   // ---------- Core metrics ----------
//   const annualExpenses = monthlyExpenses * 12;
//   const dependencyRatio = investedStart > 0 ? annualExpenses / investedStart : 1;
//   const dependencyPct = investedStart > 0 ? dependencyRatio * 100 : null;

//   const baseYrs = yrsToTarget;
//   const ageAt = ageAtTarget;

//   const leverageLabel =
//     leverage.total < 30
//       ? "FINANCIALLY EXPOSED"
//       : leverage.total < 60
//       ? "STABLE BUT DEPENDENT"
//       : leverage.total < 80
//       ? "BUILDING LEVERAGE"
//       : "STRONG OPTIONALITY";

//   const bottleneckName = leverage.bottleneck?.name ?? "Unknown";

//   // Shock scenarios
//   const cashAfter6 = cashStart - monthlyExpenses * 6;
//   const cashAfter12 = cashStart - monthlyExpenses * 12;

//   const runwayAfter6 = cashAfter6 > 0 ? cashAfter6 / monthlyExpenses : 0;
//   const runwayAfter12 = cashAfter12 > 0 ? cashAfter12 / monthlyExpenses : 0;

//   // Contribution scenarios
//   const yrsPlus500 = leverage.needle?.plus500 ?? null;
//   const yrsPlus1000 = leverage.needle?.plus1000 ?? null;

//   // Milestones interpretation
//   const milestoneMeaning = (t: number) => {
//     if (t === 250000) {
//       return "You stop feeling fragile. You can walk away from bad situations without panic.";
//     }
//     if (t === 500000) {
//       return "You gain negotiating power. You can trade money for sanity (role, hours, pace).";
//     }
//     if (t === 1000000) {
//       return "You break dependency. Work becomes a choice — not a requirement.";
//     }
//     return "Your options expand as your dependency drops.";
//   };

//   // Bold diagnosis based on bottleneck + thresholds
//   const diagnosis = (() => {
//     if (runwayMonths < 6) {
//       return "Your stress is rational: your runway is below 6 months. Fix runway first. Optionality requires time, and time requires cash coverage.";
//     }
//     if (dependencyRatio > 0.05) {
//       return "You are income-dependent. Your expenses are too large relative to invested assets. You don’t need perfection — you need a better ratio.";
//     }
//     if (!baseYrs || baseYrs > 10) {
//       return "Your velocity is the issue. Your timeline is long enough to keep you psychologically trapped. You need a contribution or income strategy that is sustainable.";
//     }
//     return "You are in a strong position. The goal now is to maintain runway and push velocity without triggering burnout relapse.";
//   })();

//   const topDirective = (() => {
//     if (bottleneckName.toLowerCase().includes("runway")) {
//       return "Directive: increase runway to 6–8 months before optimizing anything else.";
//     }
//     if (bottleneckName.toLowerCase().includes("dependency")) {
//       return "Directive: reduce dependency by growing assets faster than expenses (or reducing fixed costs).";
//     }
//     if (bottleneckName.toLowerCase().includes("velocity")) {
//       return "Directive: increase wealth velocity with a sustainable invest-rate bump (no heroics).";
//     }
//     if (bottleneckName.toLowerCase().includes("shock")) {
//       return "Directive: harden your layoff scenario with cash + fixed-cost reduction.";
//     }
//     return `Directive: resolve the primary constraint first — ${bottleneckName}.`;
//   })();

//   const phasePlan = (() => {
//     // Bold + assertive plan templates keyed off bottleneck
//     const base = {
//       phase1: [
//         "Lock a cash floor (minimum runway) and stop financial drift.",
//         "Automate one behavior that moves money without willpower.",
//         "Eliminate one fixed cost or renegotiate one bill. Small permanent wins compound.",
//       ],
//       phase2: [
//         "Increase invest rate to a sustainable level and make it automatic.",
//         "Reduce dependency by controlling fixed costs (housing, debt, subscriptions).",
//         "Add one ‘bridge option’ (interview-ready, consulting-ready, or low-stress income).",
//       ],
//       phase3: [
//         "Run quarterly reviews: runway, invest rate, and time-to-target.",
//         "Build optionality: role leverage, geographic flexibility, or compensation structure.",
//         "Protect performance and health — burnout destroys compounding.",
//       ],
//     };

//     if (runwayMonths < 6) {
//       return {
//         phase1: [
//           "Raise runway to at least 6 months. This is non-negotiable if you want stress relief.",
//           "Freeze non-essential spending for 30 days. Redirect to cash until runway target is reached.",
//           "Automate a monthly cash transfer — remove decision fatigue.",
//         ],
//         phase2: [
//           "Once runway is secured, restart investing automatically at your baseline.",
//           "Reduce one fixed cost (insurance, subscriptions, utilities negotiation).",
//           "Create a layoff protocol: what you cut first, what you keep, how you search.",
//         ],
//         phase3: [
//           "Increase investing only if stress stays stable for 60 days.",
//           "Build 1 escape route (interview-ready or small side income).",
//           "Quarterly check: runway still ≥ 6 months; time-to-target trending down.",
//         ],
//       };
//     }

//     if (dependencyRatio > 0.05) {
//       return {
//         phase1: [
//           "Identify the top 2 fixed costs. Dependency is driven by rigidity.",
//           "Set a target: expenses ≤ 4% of invested assets (or grow assets aggressively).",
//           "Make one immediate cut or restructure to reduce fixed monthly burn.",
//         ],
//         phase2: [
//           "Increase monthly investing by a sustainable amount (+$250 to +$1,000).",
//           "Attack fixed costs again: housing strategy, debt payoff, subscriptions cleanup.",
//           "Protect income: avoid burnout-driven performance drops.",
//         ],
//         phase3: [
//           "Re-run scenarios quarterly: 30% pay cut, 6-month income loss, timeline to $1M.",
//           "Lock in lifestyle constraints: no new fixed payments for 90 days at a time.",
//           "Optionality moves: role negotiation, remote flexibility, or comp strategy upgrades.",
//         ],
//       };
//     }

//     if (!baseYrs || baseYrs > 10) {
//       return {
//         phase1: [
//           "Stop the bleed: remove one recurring cost and automate the baseline investing.",
//           "Pick ONE sustainable lever: +$500/mo invest, or income increase, not both at once.",
//           "Re-run the model weekly for 30 days to keep urgency high without panic.",
//         ],
//         phase2: [
//           "Increase investing to the highest level you can maintain without burnout.",
//           "Treat health as part of the plan: burnout resets velocity to zero.",
//           "Build a bridge option (consulting, interviewing, internal transfer).",
//         ],
//         phase3: [
//           "Quarterly: raise invest rate again if stress is stable.",
//           "Aim for milestone acceleration: first $250k, then $500k, then $1M.",
//           "Keep fixed costs flat while income/assets rise.",
//         ],
//       };
//     }

//     return base;
//   })();

//   // ---------- PAGE 1: Cover + Executive Snapshot ----------
//   // Cover header
//   doc.setFont("helvetica", "bold");
//   doc.setFontSize(24);
//   doc.setTextColor(20);
//   doc.text("Burnout Leverage Blueprint", margin, 92);

//   doc.setFont("helvetica", "normal");
//   doc.setFontSize(12);
//   doc.setTextColor(90);
//   doc.text("A decision document for high earners who want control — not dependence.", margin, 114);

//   doc.setFontSize(10);
//   doc.setTextColor(120);
//   doc.text(`Generated: ${dateStr}`, margin, 136);

//   hr(156);

//   // Big score block
//   doc.setFont("helvetica", "bold");
//   doc.setFontSize(14);
//   doc.setTextColor(20);
//   doc.text("Executive Snapshot", margin, 188);

//   doc.setFont("helvetica", "normal");
//   doc.setFontSize(11);
//   doc.setTextColor(60);
//   doc.text(`Leverage Score:`, margin, 214);
//   doc.setFont("helvetica", "bold");
//   doc.setFontSize(28);
//   doc.setTextColor(20);
//   doc.text(`${leverage.total}`, margin, 246);

//   doc.setFont("helvetica", "bold");
//   doc.setFontSize(12);
//   doc.setTextColor(20);
//   doc.text(leverageLabel, margin + 86, 242);

//   doc.setFont("helvetica", "normal");
//   doc.setFontSize(11);
//   doc.setTextColor(70);
//   doc.text(`Primary constraint: ${bottleneckName}`, margin, 274);

//   // Summary callouts
//   let y = 300;
//   y = callout("Diagnosis", diagnosis, y);
//   y = callout("Operator Directive", topDirective, y);

//   // Snapshot table
//   y = ensureSpace(y, 260);
//   autoTable(doc, {
//     startY: y,
//     head: [["Metric", "Value"]],
//     body: [
//       ["Monthly Surplus", fmt(surplus)],
//       ["Runway (months)", runwayMonths.toFixed(1)],
//       ["Monthly Invest", fmt(monthlyInvest)],
//       ["Invested Assets", fmt(investedStart)],
//       ["Emergency Fund (Cash)", fmt(cashStart)],
//       ["Annual Expenses", fmt(annualExpenses)],
//       ["Expenses / Invested Assets", dependencyPct !== null ? `${dependencyPct.toFixed(2)}%` : "—"],
//       ["Time to Target", baseYrs ? `${baseYrs.toFixed(1)} yrs` : "—"],
//       ["Estimated Age at Target", ageAt ? `${ageAt.toFixed(0)}` : "—"],
//     ],
//     theme: "grid",
//     styles: { font: "helvetica", fontSize: 10, cellPadding: 6 },
//     headStyles: { fillColor: [24, 24, 27] },
//     margin: { left: margin, right: margin },
//   });

//   addFooter();

//   // ---------- PAGE 2: Stress Diagnosis ----------
//   doc.addPage();
//   addPageHeader("Stress Diagnosis", "What is actually driving your pressure — in plain terms.");

//   y = 110;
//   y = paragraph(
//     "This is not about retiring early. It’s about removing job dependency. Dependency is created by a simple equation: fixed obligations + insufficient runway + slow velocity. Your numbers tell you what to fix first.",
//     y
//   );
//   y += 10;

//   y = paragraph(`Primary constraint: ${bottleneckName}.`, y);
//   y += 6;

//   y = callout(
//     "Hard Truth",
//     runwayMonths < 6
//       ? "With runway below 6 months, you don’t have time. Time is leverage. Fix runway first."
//       : dependencyRatio > 0.05
//       ? "Your lifestyle is larger than your assets can support. That’s why the job feels mandatory."
//       : !baseYrs || baseYrs > 10
//       ? "Your timeline is long enough to keep you trapped mentally. Velocity needs to increase."
//       : "You are closer than you think. Your job is optionality fuel — protect it and stay consistent.",
//     y
//   );

//   y = ensureSpace(y, 220);
//   autoTable(doc, {
//     startY: y,
//     head: [["Scenario", "Outcome", "Impact"]],
//     body: [
//       [
//         "6-month income loss",
//         cashAfter6 >= 0 ? "Cash stays positive" : "Cash goes negative",
//         `Runway after shock: ${runwayAfter6.toFixed(1)} mo`,
//       ],
//       [
//         "12-month income loss",
//         cashAfter12 >= 0 ? "Cash stays positive" : "Cash goes negative",
//         `Runway after shock: ${runwayAfter12.toFixed(1)} mo`,
//       ],
//       [
//         "30% pay cut (behavior unchanged)",
//         "Stress increases unless expenses adjust",
//         "This is where fixed costs trap you.",
//       ],
//     ],
//     theme: "grid",
//     styles: { font: "helvetica", fontSize: 10, cellPadding: 6 },
//     headStyles: { fillColor: [24, 24, 27] },
//     margin: { left: margin, right: margin },
//   });

//   addFooter();

//   // ---------- PAGE 3: Score Breakdown ----------
//   doc.addPage();
//   addPageHeader("Score Breakdown", "Where your leverage score comes from — and what to strengthen.");

//   y = 110;
//   y = paragraph(
//     "Your score is not a vibe. It’s a composite of four drivers. If you improve the weakest driver, stress drops fastest.",
//     y
//   );
//   y += 8;

//   const compRows = leverage.components.map((c) => {
//     const strength =
//       c.points / c.max < 0.34 ? "WEAK" : c.points / c.max < 0.67 ? "MEDIUM" : "STRONG";
//     const meaning =
//       c.key === "runway"
//         ? "Time buffer. Without it, every setback feels existential."
//         : c.key === "dependency"
//         ? "How forced you are to keep earning."
//         : c.key === "velocity"
//         ? "How quickly you’re buying your freedom."
//         : "How you handle income disruption.";
//     return [c.name, `${c.points}/${c.max}`, strength, meaning];
//   });

//   autoTable(doc, {
//     startY: y,
//     head: [["Component", "Score", "Strength", "Meaning"]],
//     body: compRows,
//     theme: "grid",
//     styles: { font: "helvetica", fontSize: 10, cellPadding: 6 },
//     headStyles: { fillColor: [24, 24, 27] },
//     margin: { left: margin, right: margin },
//   });

//   y = (doc as any).lastAutoTable.finalY + 24;

//   y = callout(
//     "The Rule",
//     "Do not optimize everything. Fix the bottleneck. Then improve velocity. Then keep your lifestyle flat while assets rise.",
//     y
//   );

//   addFooter();

//   // ---------- PAGE 4: 12-Month Leverage Plan ----------
//   doc.addPage();
//   addPageHeader("12-Month Leverage Plan", "A phased operator plan. No heroics. No fluff.");

//   y = 110;
//   y = paragraph(
//     "This plan is designed to reduce dependency and increase control. Execute it in phases so you don’t relapse into burnout. Your job is the engine — protect the engine while you build leverage.",
//     y
//   );
//   y += 10;

//   const phaseTable = (phaseTitle: string, bullets: string[], startY: number) => {
//     doc.setFont("helvetica", "bold");
//     doc.setFontSize(12);
//     doc.setTextColor(20);
//     doc.text(phaseTitle, margin, startY);

//     const rows = bullets.map((b) => [b]);
//     autoTable(doc, {
//       startY: startY + 10,
//       head: [["Actions"]],
//       body: rows,
//       theme: "grid",
//       styles: { font: "helvetica", fontSize: 10, cellPadding: 7 },
//       headStyles: { fillColor: [24, 24, 27] },
//       margin: { left: margin, right: margin },
//     });

//     return (doc as any).lastAutoTable.finalY + 22;
//   };

//   y = phaseTable("Phase 1 (0–90 days): Stabilize", phasePlan.phase1, y);
//   y = ensureSpace(y, 220);
//   y = phaseTable("Phase 2 (3–6 months): Strengthen", phasePlan.phase2, y);
//   y = ensureSpace(y, 220);
//   y = phaseTable("Phase 3 (6–12 months): Accelerate", phasePlan.phase3, y);

//   addFooter();

//   // ---------- PAGE 5: Scenario Modeling + Needle Movers ----------
//   doc.addPage();
//   addPageHeader("Scenario Modeling", "What changes outcomes — and what doesn’t.");

//   y = 110;
//   y = paragraph(
//     "You don’t need more information. You need leverage moves that actually change the timeline and reduce stress. Below are the needle movers using your current assumptions.",
//     y
//   );
//   y += 10;

//   const baseTxt = baseYrs ? `${baseYrs.toFixed(1)} yrs` : "—";
//   const plus500Txt = yrsPlus500 ? `${yrsPlus500.toFixed(1)} yrs` : "—";
//   const plus1000Txt = yrsPlus1000 ? `${yrsPlus1000.toFixed(1)} yrs` : "—";

//   autoTable(doc, {
//     startY: y,
//     head: [["Scenario", "Result"]],
//     body: [
//       ["Current time-to-target", baseTxt],
//       ["Invest +$500/mo", plus500Txt],
//       ["Invest +$1,000/mo", plus1000Txt],
//       ["6-month income loss", cashAfter6 >= 0 ? "Survivable with cash buffer" : "Forces painful decisions"],
//       ["12-month income loss", cashAfter12 >= 0 ? "Survivable with discipline" : "High-risk without changes"],
//       ["30% pay cut", "Requires expense adjustment to avoid dependency spiral"],
//     ],
//     theme: "grid",
//     styles: { font: "helvetica", fontSize: 10, cellPadding: 7 },
//     headStyles: { fillColor: [24, 24, 27] },
//     margin: { left: margin, right: margin },
//   });

//   y = (doc as any).lastAutoTable.finalY + 24;

//   y = callout(
//     "Bottom Line",
//     "If you want relief fast: runway first. If you want freedom faster: invest-rate increase. If you want durability: lower fixed costs. Pick one as your focus for 30 days.",
//     y
//   );

//   addFooter();

//   // ---------- PAGE 6: Optionality Milestones ----------
//   doc.addPage();
//   addPageHeader("Optionality Milestones", "When the game changes — and what to do at each level.");

//   y = 110;
//   y = paragraph(
//     "Milestones matter because they change behavior. Your goal isn’t just more money. Your goal is less dependency. These checkpoints are where most people notice the stress curve dropping.",
//     y
//   );
//   y += 10;

//   const milestoneRows = [250000, 500000, 1000000].map((t) => {
//     const yTo = yearsToTarget(investedStart, monthlyInvest, annualRate, t);
//     const when = yTo ? `${yTo.toFixed(1)} yrs (age ${(age + yTo).toFixed(0)})` : "—";
//     return [fmt(t), when, milestoneMeaning(t)];
//   });

//   autoTable(doc, {
//     startY: y,
//     head: [["Milestone", "When (est.)", "What changes"]],
//     body: milestoneRows,
//     theme: "grid",
//     styles: { font: "helvetica", fontSize: 10, cellPadding: 7 },
//     headStyles: { fillColor: [24, 24, 27] },
//     margin: { left: margin, right: margin },
//   });

//   y = (doc as any).lastAutoTable.finalY + 24;
//   y = callout(
//     "Final Directive",
//     "Do not wait for permission to build leverage. Your job is optionality fuel. Protect your energy, build runway, increase velocity, and keep fixed costs from creeping up.",
//     y
//   );

//   addFooter();

//   // Save
//   const fileSafeDate = new Date().toISOString().slice(0, 10);
//   doc.save(`Burnout-Leverage-Blueprint-${fileSafeDate}.pdf`);
// };

//   const fileSafeDate = new Date().toISOString().slice(0, 10);
//   doc.save(`Burnout-Leverage-Plan-${fileSafeDate}.pdf`);
// };
// Calculation Helpers

type LeverageBreakdown = {
  total: number;
  runwayScore: number;      // 0–30
  dependencyScore: number;  // 0–25
  velocityScore: number;    // 0–25
  shockScore: number;       // 0–20
  bottleneck: { key: "runway" | "dependency" | "velocity" | "shock"; name: string; why: string };
};

function clamp01(n: number) {
  return Math.max(0, Math.min(1, n));
}

function fmtUSD(n: number) {
  return n.toLocaleString(undefined, { style: "currency", currency: "USD", maximumFractionDigits: 0 });
}

function computeScenario({
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

function computeLeverageBreakdown({
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
  const dependencyRatio = investedStart > 0 ? annualExpenses / investedStart : 1; // higher is worse
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

  // Bottleneck = lowest “percent of max”
  const ratios = [
    { key: "runway" as const, score: runwayScore, max: 30, name: "Runway strength" },
    { key: "dependency" as const, score: dependencyScore, max: 25, name: "Income dependency" },
    { key: "velocity" as const, score: velocityScore, max: 25, name: "Wealth velocity" },
    { key: "shock" as const, score: shockScore, max: 20, name: "Shock resistance" },
  ].map(x => ({ ...x, pct: x.max ? x.score / x.max : 0 }));

  ratios.sort((a, b) => a.pct - b.pct);
  const b = ratios[0];

  const why =
    b.key === "runway"
      ? "Your cash coverage is the fastest lever for reducing fear and pressure."
      : b.key === "dependency"
      ? "Your invested base isn’t yet large enough relative to annual spend."
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

function build12MonthPlan({
  runwayMonths,
  surplus,
  bottleneckKey,
}: {
  runwayMonths: number;
  surplus: number;
  bottleneckKey: LeverageBreakdown["bottleneck"]["key"];
}) {
  // “Operator plan” actions — picked based on bottleneck + runway
  const actions: { phase: "0–14 days" | "15–60 days" | "61–180 days" | "181–365 days"; items: string[] }[] = [
    { phase: "0–14 days", items: [] },
    { phase: "15–60 days", items: [] },
    { phase: "61–180 days", items: [] },
    { phase: "181–365 days", items: [] },
  ];

  // universal
  actions[0].items.push("Automate bills + transfers: remove decision fatigue.");
  actions[0].items.push("Define a minimum cash floor (6 months) and protect it.");
  actions[0].items.push("Cut 1–2 recurring expenses you don’t feel (subscriptions, unused services).");

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
    actions[1].items.push("Pick a ‘speed target’: +$1k/mo or +$2k/mo and lock it in.");
    actions[2].items.push("Review big 3 expenses (housing, transport, insurance) for compounding impact.");
  }

  if (bottleneckKey === "shock") {
    actions[1].items.push("Create a layoff protocol: reduce burn triggers + define decision deadlines.");
    actions[2].items.push("Build a ‘shock buffer’: additional 2–4 months beyond base runway.");
  }

  if (bottleneckKey === "runway") {
    actions[1].items.push("Turn runway into a system: separate ‘runway’ account, auto-fund weekly.");
    actions[2].items.push("Negotiate fixed costs down (insurance, utilities, interest rates, subscriptions).");
  }

  // long range: wellbeing optionality
  actions[3].items.push("Use leverage at work: boundaries, negotiation, or role change from calm.");
  actions[3].items.push("Design a 1–2 month ‘recovery window’ plan if burnout spikes.");

  // If surplus is negative, adapt
  if (surplus < 0) {
    actions[0].items.unshift("Stop the bleed: you are running a monthly deficit — fix burn first.");
    actions[1].items.unshift("Stabilize cashflow: reduce fixed costs or increase income immediately.");
  }

  return actions;
}

// Drawing Helpers

function wrap(doc: any, text: string, x: number, y: number, w: number, lineH = 14) {
  const lines = doc.splitTextToSize(text, w);
  doc.text(lines, x, y);
  return y + lines.length * lineH;
}

function sectionTitle(doc: any, title: string, x: number, y: number) {
  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.text(title, x, y);
  return y + 18;
}

function drawTable(doc: any, {
  x,
  y,
  w,
  headers,
  rows,
  colPercents,
  rowH = 18,
}: {
  x: number; y: number; w: number;
  headers: string[];
  rows: (string | number)[][];
  colPercents: number[]; // sum ~ 1
  rowH?: number;
}) {
  const colW = colPercents.map(p => w * p);

  // header bg
  doc.setDrawColor(220);
  doc.setFillColor(245, 245, 245);
  doc.roundedRect(x, y, w, rowH, 8, 8, "FD");

  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(55);

  let cx = x + 10;
  headers.forEach((h, i) => {
    doc.text(String(h), cx, y + 12);
    cx += colW[i];
  });

  // rows
  doc.setFont("helvetica", "normal");
  doc.setTextColor(50);

  let ry = y + rowH;
  rows.forEach((r, idx) => {
    doc.setFillColor(255, 255, 255);
    doc.roundedRect(x, ry, w, rowH, 8, 8, "FD");

    let rcx = x + 10;
    r.forEach((cell, i) => {
      doc.text(String(cell), rcx, ry + 12);
      rcx += colW[i];
    });
    ry += rowH + 8;
  });

  return ry;
}

// Adding Generator  to use current values
const generateBurnoutLeveragePlanPdf = () => {
  const doc = new jsPDF({ unit: "pt", format: "letter" });
  // Added fo additional calculations needed for the plan
  const surplus = monthlyIncome - monthlyExpenses;
  const runwayMonths = monthlyExpenses > 0 ? cashStart / monthlyExpenses : 0;

// if you already compute yrsToTarget earlier, reuse it
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
// rest of the code to draw the PDF using doc, using the plan and breakdown data

  // ----- Brand styling (subtle blue) -----
  const ACCENT = { r: 37, g: 99, b: 235 }; // #2563EB (blue-600)
  const INK = { r: 17, g: 24, b: 39 }; // near #111827
  const MUTED = { r: 107, g: 114, b: 128 }; // #6B7280
  const BORDER = { r: 229, g: 231, b: 235 }; // #E5E7EB
  const SOFT_BG = { r: 248, g: 250, b: 252 }; // #F8FAFC

  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 48;

  const fmtMoney = (n: number) =>
    n.toLocaleString(undefined, {
      style: "currency",
      currency: "USD",
      maximumFractionDigits: 0,
    });

  const now = new Date();
  const dateStr = now.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "2-digit",
  });

  // ----- Helpers -----
  const setRGB = (c: { r: number; g: number; b: number }) =>
    doc.setTextColor(c.r, c.g, c.b);

  const line = (y: number) => {
    doc.setDrawColor(BORDER.r, BORDER.g, BORDER.b);
    doc.line(margin, y, pageW - margin, y);
  };

  const footer = () => {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    setRGB(MUTED);
    doc.text(
      "Educational only — not financial advice. Assumptions exclude taxes/fees; markets vary.",
      margin,
      pageH - 28
    );
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

  // Draw pill (top-left based)
  doc.setFillColor(ACCENT.r, ACCENT.g, ACCENT.b);
  doc.roundedRect(x, y, width, height, height / 2, height / 2, "F");

  // Text centered vertically
  doc.setTextColor(255, 255, 255);
  doc.text(text, x + padX, y + 15);

  setRGB(INK);
};

  const callout = (title: string, body: string, x: number, y: number, w: number) => {
    // Soft background
    doc.setFillColor(SOFT_BG.r, SOFT_BG.g, SOFT_BG.b);
    doc.setDrawColor(BORDER.r, BORDER.g, BORDER.b);
    doc.roundedRect(x, y, w, 92, 12, 12, "FD");

    // Blue left strip
    doc.setFillColor(ACCENT.r, ACCENT.g, ACCENT.b);
    doc.roundedRect(x, y, 6, 92, 12, 12, "F");

    // Text
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    setRGB(INK);
    doc.text(title, x + 16, y + 26);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    setRGB(MUTED);

    const lines = doc.splitTextToSize(body, w - 24);
    doc.text(lines, x + 16, y + 46);

    setRGB(INK);
  };

  const kpiCard = (label: string, value: string, x: number, y: number, w: number, h: number) => {
    doc.setFillColor(255, 255, 255);
    doc.setDrawColor(BORDER.r, BORDER.g, BORDER.b);
    doc.roundedRect(x, y, w, h, 14, 14, "FD");

    // tiny accent line
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

  const ensureRoom = (y: number, needed: number) => {
    if (y + needed > pageH - 70) {
      footer();
      doc.addPage();
      return 96;
    }
    return y;
  };

  // ----- Derived metrics -----
  const annualExpenses = monthlyExpenses * 12;
  const dependencyRatio = investedStart > 0 ? annualExpenses / investedStart : 1;
  const dependencyPct = investedStart > 0 ? dependencyRatio * 100 : null;

  const label =
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
      ? "Your runway is below 6 months. That is why the job feels mandatory. Fix runway before optimizing anything else."
      : dependencyRatio > 0.05
      ? "You are structurally dependent on income. Expenses are too large relative to invested assets. Reduce fixed costs and increase velocity."
      : !yrsToTarget || yrsToTarget > 10
      ? "Velocity is your constraint. Your timeline is long enough to keep you psychologically trapped. Increase invest-rate sustainably."
      : "You are in a strong position. The mission now is consistency: protect the engine and keep fixed costs from creeping up.";

  const directive =
    bottleneck.toLowerCase().includes("runway")
      ? "Directive: increase runway to 6–8 months first. Stress drops fastest here."
      : bottleneck.toLowerCase().includes("dependency")
      ? "Directive: reduce dependency by keeping lifestyle flat while assets rise."
      : bottleneck.toLowerCase().includes("velocity")
      ? "Directive: increase wealth velocity with a sustainable invest-rate bump."
      : bottleneck.toLowerCase().includes("shock")
      ? "Directive: harden your layoff scenario with cash + fixed-cost reduction."
      : `Directive: resolve the primary constraint first — ${bottleneck}.`;

  // Shock scenarios
  const cashAfter6 = cashStart - monthlyExpenses * 6;
  const cashAfter12 = cashStart - monthlyExpenses * 12;

  // Needle movers
  const baseTxt = yrsToTarget ? `${yrsToTarget.toFixed(1)} yrs` : "—";
  const plus500Txt =
    leverage?.needle?.plus500 != null ? `${leverage.needle.plus500.toFixed(1)} yrs` : "—";
  const plus1000Txt =
    leverage?.needle?.plus1000 != null ? `${leverage.needle.plus1000.toFixed(1)} yrs` : "—";

  // ----- COVER PAGE (cinematic) -----
  doc.setFont("helvetica", "bold");
  doc.setFontSize(28);
  setRGB(INK);
  doc.text("Burnout Leverage Blueprint", margin, 110);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(12);
  setRGB(MUTED);
  doc.text("Confidential Operator Strategy Document", margin, 134);

  doc.setFontSize(10);
  doc.text(`Generated: ${dateStr}`, margin, 154);

  doc.setDrawColor(ACCENT.r, ACCENT.g, ACCENT.b);
  doc.setLineWidth(2);
  doc.line(margin, 176, pageW - margin, 176);
  doc.setLineWidth(1);

  // Score + class card
  doc.setFillColor(255, 255, 255);
  doc.setDrawColor(BORDER.r, BORDER.g, BORDER.b);
  doc.roundedRect(margin, 210, pageW - margin * 2, 140, 18, 18, "FD");

  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  setRGB(INK);
  doc.text("Burnout Leverage Score", margin + 20, 244);

  doc.setFontSize(40);
  doc.text(String(leverage?.total ?? "—"), margin + 20, 292);

  badge(label, margin + 150, 252);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(11);
  setRGB(MUTED);
  doc.text(`Primary constraint: ${bottleneck}`, margin + 20, 328);

  // Scenario Table Page

  doc.addPage();

// Title
let y1 = 70;
y1 = sectionTitle(doc, "Shock Testing Lab", margin,  y1);
doc.setFont("helvetica", "normal");
doc.setFontSize(11);
doc.setTextColor(90);
y1 = wrap(doc, "These scenarios model how long your current system holds under disruption — so you make decisions from calm, not panic.", margin, y1, pageW - margin * 2);
y1 += 10;

// Job loss table (100% drop)
const jobLossRows = [3,6,9,12].map(m => {
  const s = computeScenario({ monthlyIncome, monthlyExpenses, cashStart, months: m, incomeDropPct: 100 });
  return [
    `${m} mo`,
    fmtUSD(s.netBurn),
    fmtUSD(s.cashAfter),
    s.survives ? "OK" : "BREAKS",
  ];
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

// Pay cut table (30% drop)
const payCutRows = [10,20,30].map(p => {
  const s = computeScenario({ monthlyIncome, monthlyExpenses, cashStart, months: 6, incomeDropPct: p });
  return [
    `${p}% cut`,
    fmtUSD(s.keptIncome),
    fmtUSD(s.netBurn),
    fmtUSD(s.cashAfter),
  ];
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

// Sabbatical table (income to 0 but assume you can reduce expenses by 10%)
const sabbaticalRows = [1,3,6].map(m => {
  const reducedExpenses = monthlyExpenses * 0.9;
  const s = computeScenario({ monthlyIncome: 0, monthlyExpenses: reducedExpenses, cashStart, months: m, incomeDropPct: 0 });
  return [
    `${m} mo`,
    fmtUSD(reducedExpenses),
    fmtUSD(s.cashAfter),
    s.survives ? "OK" : "BREAKS",
  ];
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

// Subscores breakdown + bottleneck narrative page

doc.addPage();
let y2 = 70;
y2 = sectionTitle(doc, "Leverage Breakdown", margin, y2);

doc.setFont("helvetica", "normal");
doc.setFontSize(11);
doc.setTextColor(90);
y2 = wrap(doc, "Your total score is a composite. The fastest path to equanimity is improving the lowest sub-system first.", margin, y2, pageW - margin * 2);
y2 += 12;

const subRows = [
  ["Runway strength", `${breakdown.runwayScore}/30`, runwayMonths.toFixed(1) + " months"],
  ["Income dependency", `${breakdown.dependencyScore}/25`, "Annual spend vs invested base"],
  ["Wealth velocity", `${breakdown.velocityScore}/25`, yrsToTarget ? `${yrsToTarget.toFixed(1)} yrs to target` : "No target projection"],
  ["Shock resistance", `${breakdown.shockScore}/20`, "6–12 month disruption tolerance"],
];

y2 = drawTable(doc, {
  x: margin,
  y: y2,
  w: pageW - margin * 2,
  headers: ["Component", "Score", "Interpretation"],
  rows: subRows,
  colPercents: [0.42, 0.18, 0.36],
});

y2 += 10;

doc.setFont("helvetica", "bold");
doc.setFontSize(12);
doc.setTextColor(40);
doc.text("Primary constraint (bottleneck)", margin, y2);
y2 += 16;

doc.setFont("helvetica", "normal");
doc.setFontSize(11);
doc.setTextColor(70);
y2 = wrap(
  doc,
  `${breakdown.bottleneck.name}. ${breakdown.bottleneck.why}`,
  margin,
  y2,
  pageW - margin * 2
);


  // Mini KPIs
  const boxY = 380;
  const colW = (pageW - margin * 2 - 24) / 2;
  kpiCard("Time to $1M", baseTxt, margin, boxY, colW, 90);
  kpiCard(
    "Runway (months)",
    runwayMonths.toFixed(1),
    margin + colW + 24,
    boxY,
    colW,
    90
  );

  footer();

  // ----- PAGE 1: Executive Snapshot -----
  doc.addPage();
  sectionHeader("Executive Snapshot", "The truth in one page. No fluff.");

  let y = 110;
  const cardW = (pageW - margin * 2 - 16) / 2;
  const cardH = 86;

  kpiCard("Leverage Score", String(leverage?.total ?? "—"), margin, y, cardW, cardH);
  kpiCard("Optionality Class", label, margin + cardW + 16, y, cardW, cardH);

  y += cardH + 16;

  kpiCard("Monthly Surplus", fmtMoney(surplus), margin, y, cardW, cardH);
  kpiCard("Age at Target", ageAtTarget ? `${ageAtTarget.toFixed(0)}` : "—", margin + cardW + 16, y, cardW, cardH);

  y += cardH + 22;

  callout("Diagnosis", diagnosis, margin, y, pageW - margin * 2);
  y += 108;
  y = ensureRoom(y, 120);
  callout("Operator Directive", directive, margin, y, pageW - margin * 2);

  footer();

  // ----- PAGE 2: Financial Dependency Map (table) -----
  doc.addPage();
  sectionHeader("Financial Dependency Map", "What’s driving dependency — and what to fix first.");

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
          ? "How quickly you’re buying freedom."
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
    `Annual expenses: ${fmtMoney(annualExpenses)}. Expenses / invested assets: ${
      dependencyPct != null ? `${dependencyPct.toFixed(2)}%` : "—"
    }. Lower this ratio and the job stops feeling mandatory.`,
    margin,
    y,
    pageW - margin * 2
  );

  footer();

  // ----- PAGE 3: Wealth Velocity Model -----
  doc.addPage();
  sectionHeader("Wealth Velocity Model", "Milestones that change your behavior — not just your net worth.");

  y = 110;
  (autoTable as any)(doc, {
    startY: y,
    head: [["Milestone", "When (est.)", "Meaning"]],
    body: [250000, 500000, 750000, 1000000].map((t) => {
      const yy = yearsToTarget(investedStart, monthlyInvest, annualRate, t);
      const when = yy ? `${yy.toFixed(1)} yrs (age ${(age + yy).toFixed(0)})` : "—";
      const meaning =
        t === 250000
          ? "You stop feeling fragile. You can walk away without panic."
          : t === 500000
          ? "Negotiation power. You can trade money for sanity."
          : t === 750000
          ? "Momentum becomes visible. Your choices expand."
          : "Dependency breaks. Work becomes a choice.";
      return [fmtMoney(t), when, meaning];
    }),
    theme: "grid",
    styles: { font: "helvetica", fontSize: 10, cellPadding: 6 },
    headStyles: { fillColor: [ACCENT.r, ACCENT.g, ACCENT.b], textColor: 255 },
    margin: { left: margin, right: margin },
  });

  y = (doc as any).lastAutoTable.finalY + 18;

  callout(
    "Strategic Insight",
    "The early phase feels slow. That is normal. Your job is to stay consistent long enough for compounding to become leverage.",
    margin,
    y,
    pageW - margin * 2
  );

  footer();

  // ----- PAGE 4: Career Shock Simulation -----
  doc.addPage();
  sectionHeader("Career Shock Simulation", "What happens if the job changes before you’re ready.");

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
      ? `Cash stays positive. You can absorb the shock with discipline. Remaining cash: ${fmtMoney(
          cashAfter6
        )}.`
      : `Cash goes negative. You’ll be forced into cuts fast. Shortfall: ${fmtMoney(
          Math.abs(cashAfter6)
        )}.`
  );

  scenarioPanel(
    "Scenario: 12-month income loss",
    cashAfter12 >= 0
      ? `Survivable with strong discipline. Remaining cash: ${fmtMoney(cashAfter12)}.`
      : `High risk. You will be forced into major tradeoffs. Shortfall: ${fmtMoney(
          Math.abs(cashAfter12)
        )}.`
  );

  scenarioPanel(
    "Scenario: 30% pay cut",
    "If behavior is unchanged, dependency rises. This is why fixed costs are dangerous. Reduce rigidity before it reduces you."
  );

  footer();

  // ----- PAGE 5: Acceleration Scenarios -----
  doc.addPage();
  sectionHeader("Acceleration Scenarios", "What actually changes the timeline.");

  y = 110;
  (autoTable as any)(doc, {
    startY: y,
    head: [["Scenario", "Time to $1M", "Stress Impact"]],
    body: [
      ["Baseline", baseTxt, "Baseline"],
      ["Invest +$500/mo", plus500Txt, "Medium relief"],
      ["Invest +$1,000/mo", plus1000Txt, "High relief"],
      ["Expense optimization", "Varies", "High relief if fixed costs drop"],
      ["Mortgage reallocation", "Varies", "Medium (depends on rigidity)"],
    ],
    theme: "grid",
    styles: { font: "helvetica", fontSize: 10, cellPadding: 6 },
    headStyles: { fillColor: [ACCENT.r, ACCENT.g, ACCENT.b], textColor: 255 },
    margin: { left: margin, right: margin },
  });

  y = (doc as any).lastAutoTable.finalY + 18;

  callout(
    "Highest Leverage Variable",
    "Your savings rate and fixed-cost rigidity matter more than perfect return assumptions. Optimize what you can control.",
    margin,
    y,
    pageW - margin * 2
  );

  footer();

  // ----- PAGE 6: 12-Month Leverage Plan -----
  doc.addPage();
  sectionHeader("12-Month Leverage Plan", "Operator execution. Three phases.");

  y = 110;

  const phaseBox = (title: string, bullets: string[]) => {
    const w = pageW - margin * 2;
    const h = 150;
    doc.setFillColor(255, 255, 255);
    doc.setDrawColor(BORDER.r, BORDER.g, BORDER.b);
    doc.roundedRect(margin, y, w, h, 14, 14, "FD");

    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    setRGB(ACCENT);
    doc.text(title, margin + 16, y + 28);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    setRGB(INK);

    let yy = y + 52;
    bullets.slice(0, 5).forEach((b) => {
      doc.text("• " + b, margin + 16, yy, { maxWidth: w - 32 } as any);
      yy += 16;
    });

    setRGB(INK);
    y += h + 14;
  };

  // Use your existing phase logic if you have it; otherwise keep it simple:
  const phase1 =
    runwayMonths < 6
      ? [
          "Raise runway to 6–8 months. Non-negotiable for stress relief.",
          "Freeze non-essential spending for 30 days to stop drift.",
          "Automate cash transfers until runway target is hit.",
        ]
      : [
          "Lock a cash floor and stop lifestyle creep.",
          "Automate investing so discipline isn’t required daily.",
          "Cut one fixed cost permanently (subscriptions, insurance, utilities).",
        ];

  const phase2 = [
    "Increase investing to a sustainable level (no burnout heroics).",
    "Reduce rigidity: keep fixed payments flat for 90 days at a time.",
    "Build one bridge option (interview-ready or small side income).",
  ];

  const phase3 = [
    "Quarterly review: runway, invest-rate, time-to-target trending down.",
    "Negotiate role leverage: comp, flexibility, or pace control.",
    "Protect health: burnout kills compounding.",
  ];

  phaseBox("Phase 1 (0–90 days): Stabilize", phase1);
  phaseBox("Phase 2 (3–6 months): Strengthen", phase2);
  phaseBox("Phase 3 (6–12 months): Accelerate", phase3);

  footer();



  // ----- FINAL PAGE: Operator Mandate (cinematic) -----
  doc.addPage();
  sectionHeader("OPERATOR MANDATE", "Close the loop. Keep it simple.");

  // Big statement
  doc.setFont("helvetica", "bold");
  doc.setFontSize(24);
  setRGB(INK);
  const big = [
    "You do not need to retire early.",
    "You need to remove dependency.",
  ];
  doc.text(big, margin, 170);

  // Divider
  doc.setDrawColor(ACCENT.r, ACCENT.g, ACCENT.b);
  doc.setLineWidth(2);
  doc.line(margin, 210, pageW - margin, 210);
  doc.setLineWidth(1);

  // Summary
  doc.setFont("helvetica", "normal");
  doc.setFontSize(12);
  setRGB(MUTED);
  doc.text(`Target: ${fmtMoney(target)}`, margin, 250);
  doc.text(`Timeline: ${baseTxt}`, margin, 274);
  doc.text(`Class: ${label}`, margin, 298);
  doc.text(`Constraint: ${bottleneck}`, margin, 322);

  footer();

  const fileSafeDate = new Date().toISOString().slice(0, 10);
  doc.save(`Burnout-Leverage-Blueprint-${fileSafeDate}.pdf`);
};
  const STRIPE_PAYMENT_LINK =
    "https://buy.stripe.com/test_dRm9AT7JOc2yfJAeOI8bS00";


    // --- Cursor-reactive background ---
const bgRef = React.useRef<HTMLDivElement | null>(null);

useEffect(() => {
  const el = bgRef.current;
  if (!el) return;

  let raf = 0;

  const onMove = (e: PointerEvent) => {
    // throttle to animation frames for performance
    if (raf) return;
    raf = requestAnimationFrame(() => {
      raf = 0;

      const x = e.clientX / window.innerWidth;  // 0..1
      const y = e.clientY / window.innerHeight; // 0..1

      // small parallax offsets (keep subtle)
      const dx = (x - 0.5) * 40; // px
      const dy = (y - 0.5) * 40; // px

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
 
// JSX Structure
return (
    <div className="min-h-screen text-zinc-900 relative overflow-hidden bg-gradient-to-br from-blue-50 via-purple-50 to-indigo-50">
      <div className="absolute inset-0 -z-10 bg-gradient-to-br from-blue-100 via-purple-100 to-indigo-100 opacity-60 animate-gradient">
        
      </div>
      
      <header className="sticky top-0 z-30 border-b border-white/40 bg-white/50 backdrop-blur-xl">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
          <div className="flex items-center gap-2">
            <div className="grid h-9 w-9 place-items-center rounded-2xl bg-zinc-900 text-white shadow-sm">
              <TrendingUp className="h-5 w-5" />
            </div>
            <div
  ref={bgRef}
  className="absolute inset-0 -z-10"
  style={
    {
      // defaults if no pointer move yet
      ["--dx" as any]: "0px",
      ["--dy" as any]: "0px",
    } as React.CSSProperties
  }
>
  {/* Base gradient */}
  <div className="absolute inset-0 bg-gradient-to-br from-blue-100 via-purple-100 to-indigo-100 opacity-60" />

  {/* Soft blobs that follow the cursor slightly */}
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

  {/* Optional subtle “texture” so it feels more premium */}
  <div className="absolute inset-0 opacity-[0.06] [background-image:radial-gradient(#000_1px,transparent_1px)] [background-size:24px_24px]" />
</div>
            <div>
              <div className="text-sm font-semibold leading-tight">
                EQUANIMITY ENGINE: a burnout leverage calculator and plan
              </div>
              <div className="text-xs text-zinc-500">
                For high earners who want freedom before retirement
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2 no-print"> 
        <Button
  className="bg-blue-600 text-white hover:bg-blue-700 
             shadow-lg hover:shadow-xl 
             transition-all duration-200"
  onClick={() => scrollTo("plan")}
>
  Get My Burnout Leverage Plan ($149)
</Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-6">
        {/* Success banner */}
        {paymentSuccess && (
          <div className="mb-6 rounded-3xl border bg-white p-5 shadow-sm">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="text-sm font-semibold">Payment successful ✅</div>
                <div className="mt-1 text-sm text-zinc-600">
                  You’re all set. Next: generate/download your Burnout Leverage Plan.
                </div>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => scrollTo("plan")}>
                  Go to Plan
                </Button>
                <Button variant="outline" onClick={clearSuccessFlag}>
                  Dismiss
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Hero */}
        
   <section
  ref={heroRef}
  className="mb-12 rounded-3xl bg-gradient-to-b from-zinc-100 via-zinc-200 to-zinc-300 border border-zinc-200 p-10 shadow-xl"
>
  {/* Brand */}
  <div className={`ee-reveal ${heroInView ? "ee-on" : ""}`}>
    {/* your EQUANIMITY ENGINE brand block here */}
  </div>

  {/* Headline */}
  <h1
    className={`ee-reveal ee-delay-1 text-4xl sm:text-5xl font-bold leading-tight text-center max-w-3xl mx-auto ${
      heroInView ? "ee-on" : ""
    }`}
  >
    You don’t want to{" "}
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

  {/* Subtext */}
  <p
    className={`ee-reveal ee-delay-2 mt-5 text-lg text-zinc-600 text-center max-w-2xl mx-auto ${
      heroInView ? "ee-on" : ""
    }`}
  >
    Measure your runway, model income shocks, and build financial leverage—so your
    wellbeing isn’t tied to your next performance cycle.
  </p>

  {/* CTAs */}
  <div
    className={`ee-reveal ee-delay-3 mt-7 flex justify-center gap-3 flex-wrap ${
      heroInView ? "ee-on" : ""
    }`}
  >
    <Button
      className="bg-blue-600 text-white hover:bg-blue-700 shadow-lg"
      onClick={() => scrollTo("plan")}
    >
      Get My Burnout Leverage Plan — $149
    </Button>

    <Button variant="outline" onClick={() => scrollTo("calculator")}>
      Open Optionality Calculator
    </Button>
  </div>
</section>


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
      Get My Blueprint — $149
    </Button>
  </div>

  <div className="mt-6 grid gap-6 lg:grid-cols-3">
    {/* Controls */}
    <div className="rounded-2xl border bg-white p-5">
      <div className="text-xs font-medium text-zinc-500">
        Income shock duration
      </div>
      <div className="mt-2 flex items-center gap-3">
        <Input
          type="number"
          value={shockMonths}
          min={1}
          max={24}
          onChange={(e) => setShockMonths(clamp(Number(e.target.value || 0), 1, 24))}
        />
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

    {/* Results */}
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
                {Number.isFinite(shock.runwayInShock) ? shock.runwayInShock.toFixed(1) : "∞"} months
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

        <div id="calculator" className="grid gap-4 lg:grid-cols-3">
          <ColorCard tone="amber" className="lg:col-span-1">
            <CardContent>
              <div className="mb-4 flex items-center gap-2">
                <Calculator className="h-5 w-5" />
                <div className="text-sm font-semibold">Your inputs</div>
              </div>

              <div className="grid gap-4">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>Age</Label>
                    <Input
                      value={age}
                      type="number"
                      onChange={(e) =>
                        setAge(clamp(Number(e.target.value || 0), 18, 90))
                      }
                    />
                  </div>
                  <div>
                    <Label>Starting invested</Label>
                    <Input
                      value={investedStart}
                      type="number"
                      onChange={(e) =>
                        setInvestedStart(Math.max(0, Number(e.target.value || 0)))
                      }
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>Emergency fund (cash)</Label>
                    <Input
                      value={cashStart}
                      type="number"
                      onChange={(e) =>
                        setCashStart(Math.max(0, Number(e.target.value || 0)))
                      }
                    />
                  </div>
                  <div>
                    <Label>Monthly invest</Label>
                    <Input
                      value={monthlyInvest}
                      type="number"
                      onChange={(e) =>
                        setMonthlyInvest(Math.max(0, Number(e.target.value || 0)))
                      }
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>Monthly income</Label>
                    <Input
                      value={monthlyIncome}
                      type="number"
                      onChange={(e) =>
                        setMonthlyIncome(Math.max(0, Number(e.target.value || 0)))
                      }
                    />
                  </div>
                  <div>
                    <Label>Monthly expenses</Label>
                    <Input
                      value={monthlyExpenses}
                      type="number"
                      onChange={(e) =>
                        setMonthlyExpenses(Math.max(0, Number(e.target.value || 0)))
                      }
                    />
                  </div>
                </div>

                <Separator />

                <div>
                  <div className="flex items-center justify-between">
                    <Label>Assumed annual return</Label>
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
                    onChange={(e) =>
                      setAnnualReturnPct(clamp(Number(e.target.value), 0, 12))
                    }
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>Projection years</Label>
                    <Input
                      value={years}
                      type="number"
                      onChange={(e) =>
                        setYears(clamp(Number(e.target.value || 0), 1, 40))
                      }
                    />
                  </div>
                  <div>
                    <Label>Target (“options” goal)</Label>
                    <Input
                      value={target}
                      type="number"
                      onChange={(e) =>
                        setTarget(Math.max(0, Number(e.target.value || 0)))
                      }
                    />
                  </div>
                </div>

                <div
  className={`rounded-2xl p-4 text-white transition-colors duration-300 ${
    surplus >= 0
      ? "bg-green-600"
      : "bg-red-600"
  }`}
>
  <div className="text-xs opacity-90">Current monthly surplus</div>

  <div className="mt-1 text-2xl font-semibold">
    {fmt(surplus)}
  </div>

  <div className="mt-2 text-xs opacity-90">
    Emergency fund coverage (months of expenses)
  </div>

  <div className="mt-1 text-sm font-medium">
    {runwayMonths.toFixed(1)} months
  </div>
</div>
<div className="mt-5 rounded-2xl bg-gradient-to-b from-zinc-100 to-zinc-200 border border-zinc-200 p-4">

  <div className="text-xs font-semibold text-zinc-500 uppercase tracking-wide mb-2">
    Burnout Reality Check
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
              <div className="flex flex-wrap gap-2 no-print">
                <Button
                  variant={tab === "projection" ? "solid" : "outline"}
                  onClick={() => setTab("projection")}
                >
                  Projection
                </Button>
                <Button
                  variant={tab === "milestones" ? "solid" : "outline"}
                  onClick={() => setTab("milestones")}
                >
                  Milestones
                </Button>
                <Button
                  variant={tab === "runway" ? "solid" : "outline"}
                  onClick={() => setTab("runway")}
                >
                  Runway & stress
                </Button>
              </div>

              {tab === "projection" && (
                <div className="mt-4">
                  <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-2">
                  <ColorCard tone="rose" className="relative z-10">
  <CardContent className="p-4">
    <div className="text-xs text-zinc-500 flex items-center">
      Burnout Leverage Score
      <InfoTooltip text="A 0–100 measure of how dependent you are on your job. Higher = more flexibility. Full breakdown is included in the paid PDF." />
    </div>

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

    <div className="mt-3 text-xs text-zinc-500">
      Primary constraint:{" "}
      <span className="font-medium text-zinc-700">{leverage.bottleneck.name}</span>
    </div>

    <div className="mt-3 text-xs text-zinc-500">
      Full breakdown + 12-month plan included in the PDF.
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
                          {ageAtTarget
                            ? `${ageAtTarget.toFixed(0)} years old`
                            : "—"}
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
                  <Card>
  <CardContent className="p-4">
    <div className="text-sm font-semibold">Smart recommendations</div>
    <div className="mt-2 space-y-3">
      {leverage.recs.slice(0, 3).map((r) => (
        <div key={r.title} className="rounded-2xl border bg-white px-3 py-2">
          <div className="text-sm font-medium">{r.title}</div>
          <div className="mt-1 text-xs text-zinc-600">{r.why}</div>
          <div className="mt-1 text-xs text-zinc-500">
            Next: <span className="text-zinc-700">{r.nextStep}</span>
          </div>
        </div>
      ))}
    </div>
  </CardContent>
</Card>

                  <div className="mt-4 rounded-3xl border bg-white p-4">
                    <div className="mb-3 flex items-center justify-between">
                      <div className="text-sm font-semibold">Growth chart</div>
                      <Badge>Quarterly points</Badge>
                    </div>
                    <div className="h-[320px]">
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart
                          data={projection.series}
                          margin={{ top: 10, right: 20, left: 0, bottom: 0 }}
                        >
                          <CartesianGrid strokeDasharray="3 3" />
                          <XAxis
                            dataKey="year"
                            tickFormatter={(v) => `${Math.round(Number(v))}y`}
                            minTickGap={20}
                          />
                          <YAxis
                            tickFormatter={(v) =>
                              `$${Math.round(Number(v) / 1000)}k`
                            }
                            width={60}
                          />
                          <Tooltip
                            formatter={(v: any) => fmt(Number(v))}
                            labelFormatter={(l) => `Year ~ ${Number(l).toFixed(1)}`}
                          />
                          <Line
                            type="monotone"
                            dataKey="value"
                            strokeWidth={2}
                            dot={false}
                          />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                </div>
              )}

              {tab === "milestones" && (
                <div className="mt-4 grid gap-4 md:grid-cols-2">
                  <ColorCard tone="blue">
                    <CardContent className="p-4">
                      <div className="text-sm font-semibold">
                        When you hit key milestones
                      </div>
                      <div className="mt-2 space-y-2 text-sm">
                        {milestones.length === 0 ? (
                          <div className="text-zinc-500">
                            Add a positive monthly invest amount to see milestones.
                          </div>
                        ) : (
                          milestones.map((m) => (
                            <div
                              key={m.t}
                              className="flex items-center justify-between rounded-2xl border bg-white px-3 py-2"
                            >
                              <div className="font-medium">{fmt(m.t)}</div>
                              <div className="text-zinc-600">{`${m.y.toFixed(
                                1
                              )} yrs (age ${(age + m.y).toFixed(0)})`}</div>
                            </div>
                          ))
                        )}
                      </div>
                    </CardContent>
                  </ColorCard>

                  <Card>
                    <CardContent className="p-4">
                      <div className="text-sm font-semibold">Make it shareable</div>
                      <div className="mt-2 text-sm text-zinc-700">
                        This page generates a share link that encodes inputs in the URL.
                        No accounts, no database. Nothing is stored server-side.
                      </div>
                      <div className="mt-3">
                        <Label>Share link</Label>
                        <Input className="mt-1" value={shareLink} readOnly />
                      </div>
                      <div className="mt-3 flex gap-2 no-print">
                        <Button
                          onClick={async () => {
                            try {
                              await navigator.clipboard.writeText(shareLink);
                            } catch {}
                          }}
                        >
                          <Share2 className="h-4 w-4" /> Copy
                        </Button>
                        <Button
                          variant="outline"
                          onClick={() => {
                            const url = new URL(window.location.href);
                            url.searchParams.delete("s");
                            window.history.replaceState({}, "", url.toString());
                          }}
                        >
                          Reset share state
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                </div>
              )}

              {tab === "runway" && (
                <div className="mt-4 grid gap-4 md:grid-cols-3">
                  <Card className="md:col-span-2">
                    <CardContent className="p-4">
                      <div className="flex items-center gap-2">
                        <Wallet className="h-4 w-4" />
                        <div className="text-sm font-semibold">Runway estimator</div>
                      </div>
                      <div className="mt-2 text-sm text-zinc-700">
                        Your cash fund covers{" "}
                        <span className="font-semibold">
                          {runwayMonths.toFixed(1)} months
                        </span>{" "}
                        of expenses.
                      </div>

                      <div className="mt-4 grid gap-3 sm:grid-cols-2">
                        <div className="rounded-2xl border p-3">
                          <div className="text-xs text-zinc-500">
                            6-month target (cash)
                          </div>
                          <div className="mt-1 text-lg font-semibold">
                            {fmt(monthlyExpenses * 6)}
                          </div>
                          <div className="mt-1 text-xs text-zinc-500">
                            Gap: {fmt(Math.max(0, monthlyExpenses * 6 - cashStart))}
                          </div>
                        </div>
                        <div className="rounded-2xl border p-3">
                          <div className="text-xs text-zinc-500">
                            12-month target (cash)
                          </div>
                          <div className="mt-1 text-lg font-semibold">
                            {fmt(monthlyExpenses * 12)}
                          </div>
                          <div className="mt-1 text-xs text-zinc-500">
                            Gap: {fmt(Math.max(0, monthlyExpenses * 12 - cashStart))}
                          </div>
                        </div>
                      </div>

                      <div className="mt-4 text-sm text-zinc-700">
                        <span className="font-semibold">Stress-first approach:</span>{" "}
                        build 6–8 months of runway, then automate long-term investing
                        toward $1M.
                      </div>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardContent className="p-4">
                      <div className="text-sm font-semibold">Community guidelines</div>
                      <ul className="mt-2 space-y-2 text-sm text-zinc-700">
                        <li>• No shaming. Everyone’s numbers are personal.</li>
                        <li>• No get-rich-quick. Focus on consistency.</li>
                        <li>• Protect privacy: share ranges, not exact IDs.</li>
                        <li>• Encourage rest: burnout kills compounding.</li>
                      </ul>
                    </CardContent>
                  </Card>
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

        {/* Offer section */}
        <section id="plan" className="mt-12 rounded-3xl bg-zinc-900 p-8 text-white">
          <div className="max-w-3xl">
           <h2 className="text-3xl font-bold">
  The Burnout Leverage Blueprint
</h2>
<p className="mt-4 text-zinc-300 max-w-2xl">
  A strategic decision document for high-income professionals who want to
  stop feeling financially trapped and start building real optionality.
</p>
<p className="mt-2 text-xl font-semibold text-blue-400">
  $149 — One-Time
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
            <div className="mt-6 grid gap-3 sm:grid-cols-2">
              <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                <div className="text-sm font-semibold">Optionality Snapshot</div>
                <div className="mt-1 text-sm text-zinc-300">
                  Burnout Leverage Score, runway months, years to $1M, stress exposure
                  rating.
                </div>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                <div className="text-sm font-semibold">Career Shock Modeling</div>
                <div className="mt-1 text-sm text-zinc-300">
                  See what happens in a 6–12 month income loss or a 30% pay cut.
                </div>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                <div className="text-sm font-semibold">Acceleration Paths</div>
                <div className="mt-1 text-sm text-zinc-300">
                  Compare timelines if you invest +$1k / +$2k monthly or optimize
                  mortgage strategy.
                </div>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                <div className="text-sm font-semibold">12-Month Leverage Plan</div>
                <div className="mt-1 text-sm text-zinc-300">
                  Concrete moves to increase runway, reduce dependency, and lower stress
                  exposure.
                </div>
              </div>
            </div>

            <div className="mt-6 no-print flex flex-wrap gap-3">
            <div className="flex flex-col items-start gap-2">
  {/* <span className="text-xs uppercase tracking-wide text-zinc-400">
    Limited beta pricing
  </span> */}

<PremiumCTAButton
  //className="rounded-2xl px-6 py-4 text-base font-semibold 
           //  bg-blue-600 text-white 
            // shadow-lg hover:bg-blue-700 hover:shadow-2xl 
            // hover:scale-[1.02] transition-all duration-200"
 onClick={() =>
handleCheckout("https://buy.stripe.com/test_dRm9AT7JOc2yfJAeOI8bS00")
}
>
  Get My Burnout Leverage Plan ($149)
</PremiumCTAButton>
<p className="mt-3 text-sm text-blue-400">
  Includes: Executive diagnosis • 12-month leverage roadmap •
  Scenario modeling • Milestone strategy
</p>
</div>
              {paymentSuccess && (
                <Button
                  variant="outline"
                 onClick={generateBurnoutLeveragePlanPdf}
                >
                  Generate / Download My Plan
                </Button>
              )}

              {!paymentSuccess && (
                <div className="text-xs text-zinc-300 self-center">
                  After payment, you’ll be redirected back here automatically.
                </div>
              )}
            </div>

            <div className="mt-6 text-xs text-zinc-400">
              Educational only, not financial advice.
            </div>
          </div>
        </section>

        <footer className="mx-auto mt-8 max-w-6xl px-1 pb-10">
          <div className="flex flex-col items-start justify-between gap-3 rounded-3xl border bg-white p-5 sm:flex-row sm:items-center">
            <div>
              <div className="text-sm font-semibold">Next step: launch it publicly</div>
              <div className="text-sm text-zinc-600">
                Deploy this as a free, shareable site (Vercel/Netlify) in minutes.
              </div>
            </div>
            <div className="flex gap-2 no-print">
              <Button onClick={() => window.print()}>Print / save PDF</Button>
              <Button
                variant="outline"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(shareLink);
                  } catch {}
                }}
              >
                <Share2 className="h-4 w-4" /> Share
              </Button>
            </div>
          </div>
        </footer>
      </main>
    </div>
  );
}