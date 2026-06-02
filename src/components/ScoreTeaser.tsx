// ScoreTeaser — the pre-input state of the Leverage Score card.
// Designed to feel alive and full instead of an empty "fill in fields"
// placeholder. Shows progress, a hint of what's coming, and a rotating
// sample reel of other HENRYs' scores so the card stays useful even
// before the user has finished entering data.

import { useEffect, useState } from "react";
import { Activity, Target, MessageCircle, Calendar } from "lucide-react";

interface Props {
  completedFields: number;
  totalFields: number;
}

// Sample HENRY scores that cycle through the bottom of the teaser.
// Purposely diverse — score range, bottleneck pattern, and profile shape —
// so visitors see they're not alone in whatever their situation turns out to be.
const SAMPLE_HENRYS = [
  {
    score: 47,
    band: "STABLE BUT DEPENDENT",
    profile: "TC $280K · Age 36 · Tech IC",
    bottleneck: "Income Dependency",
    quote: "Everything depends on one job.",
    tone: "amber",
  },
  {
    score: 62,
    band: "BUILDING LEVERAGE",
    profile: "TC $450K · Age 42 · Finance",
    bottleneck: "Wealth Velocity",
    quote: "Solid runway, slow trajectory.",
    tone: "indigo",
  },
  {
    score: 38,
    band: "FINANCIALLY EXPOSED",
    profile: "TC $320K · Age 31 · Consulting",
    bottleneck: "Runway Strength",
    quote: "Earns offense, plays no defense.",
    tone: "rose",
  },
  {
    score: 71,
    band: "BUILDING LEVERAGE",
    profile: "TC $510K · Age 44 · Medicine",
    bottleneck: "Shock Resistance",
    quote: "Income outran the safety net.",
    tone: "indigo",
  },
] as const;

const TONES: Record<string, { bg: string; ring: string; text: string }> = {
  amber:  { bg: "bg-amber-50",  ring: "ring-amber-200",  text: "text-amber-700" },
  indigo: { bg: "bg-indigo-50", ring: "ring-indigo-200", text: "text-indigo-700" },
  rose:   { bg: "bg-rose-50",   ring: "ring-rose-200",   text: "text-rose-700" },
};

export default function ScoreTeaser({ completedFields, totalFields }: Props) {
  const progress = Math.round((completedFields / Math.max(1, totalFields)) * 100);

  // Rotate sample HENRYs every 4 seconds.
  const [idx, setIdx] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setIdx((i) => (i + 1) % SAMPLE_HENRYS.length), 4000);
    return () => clearInterval(t);
  }, []);

  return (
    <div className="space-y-4">
      {/* Progress bar — fills as user enters required fields. Visual feedback
          that they're making progress toward the reveal. */}
      <div>
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
            Required fields
          </span>
          <span className="text-[11px] font-bold text-zinc-700">
            {completedFields} / {totalFields}
          </span>
        </div>
        <div className="h-2 rounded-full bg-zinc-100 overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-indigo-500 via-purple-500 to-blue-500 transition-all duration-700 ease-out"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      {/* Animated ghost gauge — needle position follows progress, gives a sense
          of "where you'll land" before the actual score appears. */}
      <div className="relative rounded-2xl bg-gradient-to-br from-zinc-50 via-white to-zinc-50 border border-zinc-100 p-5 overflow-hidden">
        {/* Pulsing background blob for life */}
        <div className="absolute -top-12 -right-12 w-40 h-40 rounded-full bg-gradient-to-br from-indigo-100 to-purple-100 opacity-50 blur-2xl animate-pulse" />
        <div className="relative">
          <div className="text-[10px] font-semibold uppercase tracking-widest text-zinc-400 text-center mb-3">
            Your score will appear here
          </div>
          <div className="flex items-baseline justify-center gap-1 mb-3">
            <div className="text-5xl font-extrabold text-zinc-300 tabular-nums">??</div>
            <div className="text-base text-zinc-300 font-semibold">/ 100</div>
          </div>
          <div className="relative h-2.5 rounded-full bg-zinc-100 overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-r from-rose-400 via-amber-400 via-blue-500 to-emerald-500 opacity-30" />
            <div
              className="absolute top-0 bottom-0 w-2.5 rounded-full bg-indigo-600 shadow-md transition-all duration-700 ease-out"
              style={{ left: `calc(${progress}% - 5px)` }}
            />
          </div>
          <div className="flex justify-between mt-2 text-[10px] text-zinc-400 font-medium tracking-wider">
            <span>EXPOSED</span>
            <span>OPTIONALITY</span>
          </div>
        </div>
      </div>

      {/* What you'll unlock — concrete preview of the reveal. */}
      <div>
        <div className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500 mb-2">
          What you'll get
        </div>
        <div className="grid grid-cols-2 gap-2 text-xs">
          {[
            { Icon: Activity,       text: "Your Leverage Score" },
            { Icon: Target,         text: "Your #1 bottleneck" },
            { Icon: MessageCircle,  text: "A peer-tone verdict" },
            { Icon: Calendar,       text: "Coast / Chubby / Fat FIRE" },
          ].map(({ Icon, text }, i) => (
            <div key={i} className="flex items-center gap-1.5 rounded-lg bg-zinc-50 border border-zinc-100 px-2.5 py-1.5 text-zinc-700">
              <Icon className="h-3.5 w-3.5 shrink-0 text-indigo-500" />
              <span className="truncate">{text}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Rotating sample HENRYs — cycles through 4 example scores every 4s.
          Adds movement to the card and shows the kind of output HENRYs get. */}
      <div className="rounded-2xl border border-zinc-200 bg-white p-4">
        <div className="flex items-center justify-between mb-2.5">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
            What other HENRYs see
          </div>
          <div className="flex gap-1">
            {SAMPLE_HENRYS.map((_, i) => (
              <div
                key={i}
                className={`h-1 w-3 rounded-full transition-colors duration-500 ${
                  i === idx ? "bg-indigo-500" : "bg-zinc-200"
                }`}
              />
            ))}
          </div>
        </div>
        <div className="relative h-[88px]">
          {SAMPLE_HENRYS.map((s, i) => {
            const tone = TONES[s.tone] ?? TONES.indigo;
            return (
              <div
                key={i}
                className="absolute inset-0 transition-all duration-500"
                style={{
                  opacity: idx === i ? 1 : 0,
                  transform: idx === i ? "translateY(0)" : "translateY(6px)",
                  pointerEvents: idx === i ? "auto" : "none",
                }}
              >
                <div className="flex items-baseline justify-between gap-2">
                  <div className="flex items-baseline gap-1">
                    <span className="text-3xl font-extrabold text-zinc-900 tabular-nums">{s.score}</span>
                    <span className="text-xs text-zinc-400 font-semibold">/ 100</span>
                  </div>
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ring-1 ${tone.bg} ${tone.ring} ${tone.text}`}>
                    {s.band}
                  </span>
                </div>
                <div className="text-[11px] text-zinc-500 mt-1">{s.profile}</div>
                <div className="mt-1.5 text-xs text-zinc-700 italic leading-snug">
                  <span className="text-zinc-400">→</span> "{s.quote}"
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Final nudge */}
      <div className="rounded-xl bg-gradient-to-r from-rose-50 to-amber-50 border border-rose-100 px-3 py-2.5 text-center">
        <p className="text-[11px] font-medium text-rose-700">
          {completedFields === totalFields
            ? "All set — calculating your score…"
            : `${totalFields - completedFields} more required field${totalFields - completedFields === 1 ? "" : "s"} to reveal your score`}
        </p>
      </div>
    </div>
  );
}
