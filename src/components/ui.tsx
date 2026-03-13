import React from "react";

export function LeverageGauge({
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
        <div className="absolute inset-0 bg-gradient-to-r from-red-400 via-blue-500 to-emerald-500 opacity-30" />
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

export function PremiumCTAButton({
  children,
  onClick,
  disabled = false,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex flex-col items-start gap-1.5">
      <button
        onClick={disabled ? undefined : onClick}
        disabled={disabled}
        className={[
          "group relative inline-flex items-center justify-center rounded-2xl p-[2px] transition-all duration-200",
          disabled
            ? "opacity-40 cursor-not-allowed shadow-none"
            : "shadow-[0_12px_40px_rgba(37,99,235,0.35)] hover:shadow-[0_18px_55px_rgba(37,99,235,0.45)]",
        ].join(" ")}
      >
        <span
          className={[
            "absolute inset-0 rounded-2xl bg-gradient-to-r from-blue-500 via-indigo-500 to-purple-500 transition-opacity duration-200",
            disabled ? "opacity-60" : "opacity-90 group-hover:opacity-100",
          ].join(" ")}
        />
        <span
          className="
            relative z-10 inline-flex items-center justify-center
            rounded-2xl bg-zinc-950/90 text-white
            px-6 py-4 text-base font-semibold
            backdrop-blur-xl border border-white/10
            transition-transform duration-200
            group-hover:-translate-y-[1px] active:translate-y-0
            whitespace-nowrap
          "
        >
          {children}
          {!disabled && (
            <span className="ml-2 opacity-80 group-hover:opacity-100 transition-opacity">→</span>
          )}
        </span>
      </button>
      {disabled && (
        <span className="text-xs text-amber-400/80">
          Fill in all calculator fields above to unlock.
        </span>
      )}
    </div>
  );
}

export function ColorCard({
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

export function CardHeaderRow({
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

export function Card({
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

export function CardContent({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return <div className={"p-5 " + className}>{children}</div>;
}

export function Button({
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
  const outline = "border bg-white hover:bg-zinc-50 text-zinc-900";

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

export function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
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

export function Label({ children }: { children: React.ReactNode }) {
  return <div className="text-xs font-medium text-zinc-600">{children}</div>;
}

export function Badge({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center rounded-2xl bg-zinc-100 px-3 py-1 text-xs text-zinc-700">
      {children}
    </span>
  );
}

export function Separator() {
  return <div className="h-px w-full bg-zinc-100" />;
}

export function InfoTooltip({ text }: { text: string }) {
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
