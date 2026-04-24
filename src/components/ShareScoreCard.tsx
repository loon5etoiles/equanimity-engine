// ShareScoreCard — branded, shareable Leverage Score card.
// Opens a modal with a 540x540 visual preview of the score, captured at 2x
// resolution (1080x1080) via html2canvas for high-DPI PNG download and
// social sharing. Designed to be visually distinctive enough that users
// actually want to post it on LinkedIn/Twitter/Reddit.

import { forwardRef, useRef, useState } from "react";
import html2canvas from "html2canvas";

interface Props {
  score: number;
  label: string;
  bottleneck: string;
}

const SHARE_URL = "https://equanimityengine.com";
const TWEET_TEXT = (score: number, label: string) =>
  `My Leverage Score is ${score} — ${label}. Find yours free at ${SHARE_URL} #FinancialIndependence #FIRE`;

export default function ShareScoreCard({ score, label, bottleneck }: Props) {
  const [open, setOpen] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [copied, setCopied] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);

  const toneClass =
    score < 30 ? "from-rose-600 via-red-600 to-orange-600"
    : score < 60 ? "from-amber-500 via-yellow-500 to-amber-600"
    : score < 80 ? "from-blue-600 via-indigo-600 to-purple-600"
    : "from-emerald-500 via-teal-500 to-cyan-500";

  const downloadPng = async () => {
    if (!cardRef.current || downloading) return;
    setDownloading(true);
    try {
      const canvas = await html2canvas(cardRef.current, {
        backgroundColor: null,
        scale: 2,
        useCORS: true,
        logging: false,
      });
      const blob: Blob | null = await new Promise((resolve) =>
        canvas.toBlob((b) => resolve(b), "image/png", 1)
      );
      if (!blob) throw new Error("Failed to encode image");
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `leverage-score-${score}.png`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error("Download PNG failed:", err);
      alert("Couldn't download the image. Please try again.");
    } finally {
      setDownloading(false);
    }
  };

  const shareTwitter = () => {
    const text = encodeURIComponent(TWEET_TEXT(score, label));
    window.open(`https://twitter.com/intent/tweet?text=${text}`, "_blank", "noopener,noreferrer");
  };

  const shareLinkedIn = () => {
    // LinkedIn's share URL only reliably uses the URL param; the title gets
    // pulled from OpenGraph tags on the landing page. We still include text
    // as a fallback for some LinkedIn contexts.
    const url = encodeURIComponent(SHARE_URL);
    window.open(`https://www.linkedin.com/sharing/share-offsite/?url=${url}`, "_blank", "noopener,noreferrer");
  };

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(SHARE_URL);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback for non-https contexts
      const ta = document.createElement("textarea");
      ta.value = SHARE_URL;
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand("copy"); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch {}
      document.body.removeChild(ta);
    }
  };

  return (
    <>
      {/* Trigger button — sits below the Leverage Score */}
      <button
        onClick={() => setOpen(true)}
        className="mt-3 w-full inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:shadow-md active:scale-[0.99]"
      >
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M4 12v7a2 2 0 002 2h12a2 2 0 002-2v-7M16 6l-4-4-4 4M12 2v13" />
        </svg>
        Share Your Score
      </button>

      {/* Modal overlay */}
      {open && (
        <div
          role="dialog"
          aria-modal="true"
          onClick={() => setOpen(false)}
          className="fixed inset-0 z-50 flex items-start sm:items-center justify-center overflow-y-auto bg-black/70 p-4 backdrop-blur-sm"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="relative my-8 w-full max-w-lg rounded-3xl bg-white p-5 sm:p-6 shadow-2xl"
          >
            {/* Close */}
            <button
              onClick={() => setOpen(false)}
              aria-label="Close"
              className="absolute top-3 right-3 grid h-8 w-8 place-items-center rounded-full bg-zinc-100 text-zinc-600 hover:bg-zinc-200 transition"
            >
              ×
            </button>

            <h3 className="text-lg font-bold text-zinc-900">Share your Leverage Score</h3>
            <p className="mt-1 text-xs text-zinc-500">Download the image or share directly. Your exact numbers stay private — only the score and label go out.</p>

            {/* Card preview — the element captured by html2canvas */}
            <div className="mt-5 flex justify-center">
              <div
                className="origin-top"
                style={{
                  transform: "scale(var(--share-scale, 1))",
                  transformOrigin: "top center",
                }}
              >
                <ScoreCardCanvas
                  ref={cardRef}
                  score={score}
                  label={label}
                  bottleneck={bottleneck}
                  toneClass={toneClass}
                />
              </div>
            </div>

            {/* Responsive scale wrapper — shrinks the 540px card on narrow screens */}
            <style>{`
              @media (max-width: 599px) {
                :root { --share-scale: 0.58; }
              }
              @media (min-width: 600px) {
                :root { --share-scale: 0.82; }
              }
            `}</style>

            {/* Share actions */}
            <div className="mt-5 grid grid-cols-2 sm:grid-cols-4 gap-2">
              <ShareButton onClick={downloadPng} disabled={downloading} icon="⬇" label={downloading ? "Saving..." : "Download"} />
              <ShareButton onClick={shareTwitter} icon="𝕏" label="Tweet" />
              <ShareButton onClick={shareLinkedIn} icon="in" label="LinkedIn" />
              <ShareButton onClick={copyLink} icon={copied ? "✓" : "🔗"} label={copied ? "Copied!" : "Copy link"} variant={copied ? "success" : "default"} />
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function ShareButton({
  onClick,
  icon,
  label,
  disabled = false,
  variant = "default",
}: {
  onClick: () => void;
  icon: string;
  label: string;
  disabled?: boolean;
  variant?: "default" | "success";
}) {
  const tone = variant === "success"
    ? "border-emerald-200 bg-emerald-50 text-emerald-700"
    : "border-zinc-200 bg-white text-zinc-800 hover:border-indigo-300 hover:bg-indigo-50";
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`flex items-center justify-center gap-1.5 rounded-xl border ${tone} px-3 py-2.5 text-xs font-semibold transition disabled:opacity-50 disabled:cursor-not-allowed`}
    >
      <span className="text-sm leading-none">{icon}</span>
      <span>{label}</span>
    </button>
  );
}

// The actual captured card. Fixed 540x540 viewport size → 1080x1080 at scale=2.
// All styles use inline `style` props so html2canvas reliably serialises them
// (it has known issues with some CSS gradients and backdrop-filter in
// modern Tailwind arbitrary values).
const ScoreCardCanvas = forwardRef<HTMLDivElement, {
  score: number;
  label: string;
  bottleneck: string;
  toneClass: string;
}>(function ScoreCardCanvas({ score, label, bottleneck, toneClass }, ref) {
  const gradientByTone: Record<string, string> = {
    "from-rose-600 via-red-600 to-orange-600":
      "linear-gradient(135deg, #e11d48 0%, #dc2626 50%, #ea580c 100%)",
    "from-amber-500 via-yellow-500 to-amber-600":
      "linear-gradient(135deg, #f59e0b 0%, #eab308 50%, #d97706 100%)",
    "from-blue-600 via-indigo-600 to-purple-600":
      "linear-gradient(135deg, #2563eb 0%, #4f46e5 50%, #9333ea 100%)",
    "from-emerald-500 via-teal-500 to-cyan-500":
      "linear-gradient(135deg, #10b981 0%, #14b8a6 50%, #06b6d4 100%)",
  };
  const accent = gradientByTone[toneClass] || gradientByTone["from-blue-600 via-indigo-600 to-purple-600"];

  // Progress arc math (SVG). 0–100 maps to 0–270° (3/4 circle arc).
  const pct = Math.max(0, Math.min(100, score)) / 100;
  const radius = 155;
  const circumference = 2 * Math.PI * radius;
  const arcLength = 0.75 * circumference; // 3/4 of the circle
  const dashOffset = arcLength * (1 - pct);

  return (
    <div
      ref={ref}
      style={{
        width: 540,
        height: 540,
        position: "relative",
        overflow: "hidden",
        borderRadius: 28,
        background: "linear-gradient(135deg, #0f172a 0%, #1e1b4b 50%, #0c0a1f 100%)",
        boxShadow: "0 24px 72px -20px rgba(79,70,229,0.4)",
        fontFamily: "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
        color: "#ffffff",
      }}
    >
      {/* Ambient gradient glow — top-right */}
      <div
        style={{
          position: "absolute", top: -120, right: -120, width: 360, height: 360,
          background: accent, opacity: 0.35, filter: "blur(80px)", borderRadius: "50%",
        }}
      />
      {/* Ambient glow — bottom-left */}
      <div
        style={{
          position: "absolute", bottom: -100, left: -100, width: 320, height: 320,
          background: "linear-gradient(135deg, #7c3aed, #2563eb)",
          opacity: 0.25, filter: "blur(90px)", borderRadius: "50%",
        }}
      />

      {/* Subtle grid pattern */}
      <div
        style={{
          position: "absolute", inset: 0, opacity: 0.04,
          backgroundImage: "radial-gradient(#ffffff 1px, transparent 1px)",
          backgroundSize: "24px 24px",
        }}
      />

      {/* Header — brand */}
      <div style={{ position: "absolute", top: 28, left: 32, right: 32, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{
            width: 32, height: 32, borderRadius: 10,
            background: "linear-gradient(135deg, #312e81, #1e40af, #6b21a8)",
            display: "flex", alignItems: "center", justifyContent: "center",
            boxShadow: "0 4px 16px rgba(99,102,241,0.4)",
          }}>
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 5C9.5 5 7 7 7 10C7 11.5 6.2 12.5 5.5 13.5C4.8 14.8 5.5 16.2 7 16.5L12 17" stroke="#a5b4fc" strokeWidth="1.5" />
              <path d="M12 5C14.5 5 17 7 17 10C17 11.5 17.8 12.5 18.5 13.5C19.2 14.8 18.5 16.2 17 16.5L12 17" stroke="#c4b5fd" strokeWidth="1.5" />
              <polyline points="7.5,15 9.5,12 11.5,13.2 15.5,9.5" stroke="#34d399" strokeWidth="1.8" />
            </svg>
          </div>
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, letterSpacing: 0.5 }}>EQUANIMITY ENGINE</div>
            <div style={{ fontSize: 10, color: "rgba(255,255,255,0.5)", marginTop: 1 }}>Financial leverage, measured.</div>
          </div>
        </div>
        <div style={{
          fontSize: 9, fontWeight: 700, letterSpacing: 2,
          padding: "5px 10px", borderRadius: 99,
          background: "rgba(255,255,255,0.08)",
          border: "1px solid rgba(255,255,255,0.12)",
        }}>
          MY SCORE
        </div>
      </div>

      {/* Score dial */}
      <div style={{
        position: "absolute", top: "50%", left: "50%",
        transform: "translate(-50%, -50%)",
        display: "flex", flexDirection: "column", alignItems: "center",
      }}>
        <div style={{ position: "relative", width: 360, height: 360 }}>
          <svg width="360" height="360" viewBox="0 0 360 360" style={{ transform: "rotate(135deg)" }}>
            <defs>
              <linearGradient id="shareArcGrad" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" stopColor="#60a5fa" />
                <stop offset="50%" stopColor="#a78bfa" />
                <stop offset="100%" stopColor="#f472b6" />
              </linearGradient>
            </defs>
            {/* Track */}
            <circle
              cx="180" cy="180" r={radius}
              fill="none"
              stroke="rgba(255,255,255,0.08)"
              strokeWidth="18"
              strokeLinecap="round"
              strokeDasharray={`${arcLength} ${circumference}`}
            />
            {/* Progress */}
            <circle
              cx="180" cy="180" r={radius}
              fill="none"
              stroke="url(#shareArcGrad)"
              strokeWidth="18"
              strokeLinecap="round"
              strokeDasharray={`${arcLength} ${circumference}`}
              strokeDashoffset={dashOffset}
            />
          </svg>
          {/* Score number (centered on top of the arc) */}
          <div style={{
            position: "absolute", inset: 0,
            display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
          }}>
            <div style={{ fontSize: 12, letterSpacing: 3, color: "rgba(255,255,255,0.45)", fontWeight: 600 }}>
              LEVERAGE SCORE
            </div>
            <div style={{
              fontSize: 140, fontWeight: 800, lineHeight: 1,
              background: "linear-gradient(135deg, #ffffff 0%, #e0e7ff 100%)",
              WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
              letterSpacing: -4, marginTop: 6,
            }}>
              {score}
            </div>
            <div style={{ fontSize: 14, color: "rgba(255,255,255,0.55)", marginTop: 6 }}>
              out of 100
            </div>
          </div>
        </div>
      </div>

      {/* Label + bottleneck */}
      <div style={{
        position: "absolute", bottom: 88, left: 32, right: 32,
        textAlign: "center",
      }}>
        <div style={{
          display: "inline-block",
          fontSize: 13, fontWeight: 800, letterSpacing: 2.5,
          padding: "8px 18px", borderRadius: 99,
          background: accent,
          boxShadow: "0 6px 20px -4px rgba(79,70,229,0.5)",
        }}>
          {label}
        </div>
        <div style={{ marginTop: 14, fontSize: 12, color: "rgba(255,255,255,0.55)", letterSpacing: 0.3 }}>
          Primary constraint
        </div>
        <div style={{ fontSize: 16, fontWeight: 600, color: "#ffffff", marginTop: 2 }}>
          {bottleneck}
        </div>
      </div>

      {/* Footer — URL + tagline */}
      <div style={{
        position: "absolute", bottom: 22, left: 32, right: 32,
        display: "flex", alignItems: "center", justifyContent: "space-between",
        fontSize: 11, color: "rgba(255,255,255,0.5)",
      }}>
        <div style={{ fontWeight: 600, letterSpacing: 0.5 }}>
          equanimityengine.com
        </div>
        <div style={{ fontStyle: "italic", opacity: 0.7 }}>
          Find yours free →
        </div>
      </div>
    </div>
  );
});
