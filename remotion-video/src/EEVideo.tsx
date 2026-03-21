import React from "react";
import {
  AbsoluteFill,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
  Sequence,
  staticFile,
} from "remotion";
import { Audio } from "@remotion/media";

// ─── Scene durations (frames @ 30fps) ─────────────────────────────────────────
const S_INTRO     = 300; // 10 s
const S_PAIN      = 240; //  8 s
const S_SCORE     = 330; // 11 s
const S_PLAN      = 240; //  8 s
const S_BLUEPRINT = 210; //  7 s
const S_CTA       = 130; //  4.3 s
const T           = 20;  // 20-frame (0.67s) overlap between every pair of scenes
// Total = last sequence start + last sequence duration
// F_CTA = 0+280+220+310+220+190 = 1220; + S_CTA 130 = 1350 frames = 45 s
export const TOTAL_DURATION = (S_INTRO - T) + (S_PAIN - T) + (S_SCORE - T) + (S_PLAN - T) + (S_BLUEPRINT - T) + S_CTA;

// ─── Design tokens ────────────────────────────────────────────────────────────
const C = {
  bg:        "#060f1d",
  bgCard:    "rgba(14, 26, 54, 0.90)",
  gold:      "#c9a84c",
  goldLight: "#e8c97a",
  indigo:    "#818cf8",
  indigoDk:  "#4f46e5",
  teal:      "#2dd4bf",
  rose:      "#f87171",
  white:     "#eef2ff",
  offWhite:  "#c8d4f0",
  muted:     "#6b7fa8",
  border:    "rgba(129,140,248,0.14)",
  borderGold:"rgba(201,168,76,0.30)",
};

// ─── Shared helpers ───────────────────────────────────────────────────────────

/** Smooth spring-slide-in, all driven by frame. delay = frames offset. */
const FadeSlide: React.FC<{
  children: React.ReactNode;
  delay?: number;
  dy?: number;
  dx?: number;
  style?: React.CSSProperties;
}> = ({ children, delay = 0, dy = 40, dx = 0, style }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const offset = Math.max(0, frame - delay);
  const sp = spring({ frame: offset, fps, config: { damping: 200 } });
  const opacity = interpolate(offset, [0, 18], [0, 1], { extrapolateRight: "clamp" });
  return (
    <div style={{
      opacity,
      transform: `translateY(${interpolate(sp, [0, 1], [dy, 0])}px) translateX(${interpolate(sp, [0, 1], [dx, 0])}px)`,
      ...style,
    }}>
      {children}
    </div>
  );
};

/** Expanding horizontal gold rule. */
const GoldRule: React.FC<{ delay?: number; width?: number }> = ({ delay = 0, width = 160 }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const sp = spring({ frame: Math.max(0, frame - delay), fps, config: { damping: 200 } });
  return (
    <div style={{
      height: 1.5,
      width,
      background: `linear-gradient(90deg, transparent 0%, ${C.gold} 40%, ${C.goldLight} 60%, transparent 100%)`,
      transform: `scaleX(${sp})`,
      transformOrigin: "center",
    }} />
  );
};

/** Small ALL-CAPS eyebrow label. */
const Eyebrow: React.FC<{ children: React.ReactNode; color?: string; delay?: number }> = ({
  children, color = C.gold, delay = 0
}) => (
  <FadeSlide delay={delay} dy={16}>
    <div style={{
      fontFamily: "'Helvetica Neue', Helvetica, Arial, sans-serif",
      fontSize: 17,
      fontWeight: 700,
      letterSpacing: 5,
      color,
      textTransform: "uppercase",
      textAlign: "center",
    }}>
      {children}
    </div>
  </FadeSlide>
);

// ─── Persistent background (dots grid + glow orbs) ───────────────────────────
const Background: React.FC = () => (
  <AbsoluteFill style={{
    background: `linear-gradient(160deg, #05101f 0%, #091626 45%, #05101f 100%)`,
  }}>
    {/* Ambient glow orbs */}
    {([
      { x: 900, y: 280,  size: 780, color: C.indigo,  op: 0.13 },
      { x: 150, y: 1640, size: 560, color: C.teal,    op: 0.10 },
      { x: 540, y: 960,  size: 420, color: "#3730a3",  op: 0.07 },
      { x: 820, y: 1400, size: 300, color: C.gold,     op: 0.06 },
    ] as const).map((o, i) => (
      <div key={i} style={{
        position: "absolute",
        left: o.x - o.size / 2,
        top:  o.y - o.size / 2,
        width: o.size,
        height: o.size,
        borderRadius: "50%",
        background: `radial-gradient(circle, ${o.color} 0%, transparent 70%)`,
        opacity: o.op,
        pointerEvents: "none",
      }} />
    ))}
    {/* Subtle dot grid */}
    <div style={{
      position: "absolute",
      inset: 0,
      backgroundImage: `radial-gradient(circle, rgba(129,140,248,0.07) 1px, transparent 1px)`,
      backgroundSize: "44px 44px",
    }} />
    {/* Thin top border accent */}
    <div style={{
      position: "absolute",
      top: 0,
      left: 0,
      right: 0,
      height: 3,
      background: `linear-gradient(90deg, transparent 0%, ${C.gold} 30%, ${C.indigo} 70%, transparent 100%)`,
    }} />
  </AbsoluteFill>
);

// ─── Scene 1: Intro ───────────────────────────────────────────────────────────
const SceneIntro: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Letter-spacing animation on brand name
  const brandSp = spring({ frame, fps, config: { damping: 200 } });
  const letterSpacing = interpolate(brandSp, [0, 1], [6, 22]);

  const stats = [
    { label: "Leverage Score", value: "0–100" },
    { label: "12-Month Plan",  value: "Tailored" },
    { label: "Blueprint PDF",  value: "Included" },
  ];

  return (
    <AbsoluteFill style={{
      display: "flex", flexDirection: "column",
      alignItems: "center", justifyContent: "center",
      padding: "0 72px",
    }}>
      {/* Brand label */}
      <FadeSlide delay={0} dy={20}>
        <div style={{
          fontFamily: "'Helvetica Neue', Helvetica, Arial, sans-serif",
          fontSize: 20,
          fontWeight: 700,
          letterSpacing,
          color: C.gold,
          textTransform: "uppercase",
          textAlign: "center",
          marginBottom: 20,
        }}>
          Equanimity
        </div>
      </FadeSlide>

      {/* Hero word */}
      <FadeSlide delay={18} dy={60}>
        <div style={{
          fontFamily: "'Helvetica Neue', Helvetica, Arial, sans-serif",
          fontSize: 124,
          fontWeight: 900,
          color: C.white,
          textAlign: "center",
          lineHeight: 0.92,
          letterSpacing: -4,
        }}>
          ENGINE
        </div>
      </FadeSlide>

      {/* Gold rule */}
      <div style={{ marginTop: 28, marginBottom: 28 }}>
        <GoldRule delay={46} width={200} />
      </div>

      {/* Tagline — two lines */}
      <FadeSlide delay={72} dy={32}>
        <div style={{
          fontFamily: "'Helvetica Neue', Helvetica, Arial, sans-serif",
          fontSize: 28,
          fontWeight: 400,
          color: C.offWhite,
          textAlign: "center",
          lineHeight: 1.5,
        }}>
          Financial leverage for high earners
        </div>
      </FadeSlide>
      <FadeSlide delay={88} dy={28}>
        <div style={{
          fontFamily: "'Helvetica Neue', Helvetica, Arial, sans-serif",
          fontSize: 28,
          fontWeight: 400,
          color: C.muted,
          textAlign: "center",
          lineHeight: 1.5,
          marginBottom: 72,
        }}>
          who want optionality before retirement
        </div>
      </FadeSlide>

      {/* 3-stat pills */}
      <div style={{ display: "flex", flexDirection: "row", gap: 22 }}>
        {stats.map((s, i) => {
          const sp = spring({ frame: Math.max(0, frame - (120 + i * 22)), fps, config: { damping: 200 } });
          const opacity = interpolate(Math.max(0, frame - (120 + i * 22)), [0, 18], [0, 1], { extrapolateRight: "clamp" });
          const ty = interpolate(sp, [0, 1], [30, 0]);
          return (
            <div key={i} style={{
              opacity,
              transform: `translateY(${ty}px)`,
              textAlign: "center",
              padding: "22px 26px",
              background: "rgba(129,140,248,0.06)",
              border: `1px solid ${C.border}`,
              borderRadius: 20,
              minWidth: 190,
            }}>
              <div style={{
                fontSize: 13,
                color: C.gold,
                fontWeight: 700,
                letterSpacing: 2.5,
                textTransform: "uppercase",
                marginBottom: 10,
                fontFamily: "'Helvetica Neue', Helvetica, Arial, sans-serif",
              }}>{s.label}</div>
              <div style={{
                fontSize: 22,
                color: C.white,
                fontWeight: 800,
                fontFamily: "'Helvetica Neue', Helvetica, Arial, sans-serif",
              }}>{s.value}</div>
            </div>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};

// ─── Scene 2: Pain Point ──────────────────────────────────────────────────────
const ScenePainPoint: React.FC = () => (
  <AbsoluteFill style={{
    display: "flex", flexDirection: "column",
    alignItems: "center", justifyContent: "center",
    padding: "0 80px",
  }}>
    <Eyebrow delay={0}>The Problem</Eyebrow>

    <div style={{ height: 40 }} />

    <FadeSlide delay={22} dy={50}>
      <div style={{
        fontFamily: "'Helvetica Neue', Helvetica, Arial, sans-serif",
        fontSize: 72,
        fontWeight: 900,
        color: C.white,
        textAlign: "center",
        lineHeight: 1.1,
        marginBottom: 16,
      }}>
        You earn well.
      </div>
    </FadeSlide>

    <FadeSlide delay={54} dy={44}>
      <div style={{
        fontFamily: "'Helvetica Neue', Helvetica, Arial, sans-serif",
        fontSize: 52,
        fontWeight: 700,
        color: C.indigo,
        textAlign: "center",
        lineHeight: 1.2,
        marginBottom: 60,
      }}>
        But how free are you?
      </div>
    </FadeSlide>

    <FadeSlide delay={100} dy={32}>
      <div style={{
        background: "rgba(248,65,65,0.07)",
        border: "1px solid rgba(248,113,113,0.22)",
        borderRadius: 24,
        padding: "32px 44px",
        textAlign: "center",
        maxWidth: 860,
      }}>
        <div style={{
          fontFamily: "'Helvetica Neue', Helvetica, Arial, sans-serif",
          fontSize: 24,
          color: "#fca5a5",
          fontWeight: 400,
          lineHeight: 1.6,
        }}>
          Most high earners are{" "}
          <span style={{ fontWeight: 800, color: "#fecaca" }}>
            one income event away
          </span>{" "}
          from financial stress — with no clear path to optionality.
        </div>
      </div>
    </FadeSlide>

    <div style={{ height: 56 }} />

    {/* 3 micro-stats */}
    <FadeSlide delay={150} dy={24}>
      <div style={{ display: "flex", flexDirection: "row", gap: 28 }}>
        {[
          { icon: "⚠", text: "No runway clarity" },
          { icon: "⛓", text: "Income dependent" },
          { icon: "🎯", text: "No 12-month target" },
        ].map((item, i) => (
          <div key={i} style={{
            display: "flex", flexDirection: "column",
            alignItems: "center", gap: 10,
            padding: "18px 24px",
            background: "rgba(255,255,255,0.03)",
            border: `1px solid ${C.border}`,
            borderRadius: 16,
            minWidth: 186,
          }}>
            <span style={{ fontSize: 28 }}>{item.icon}</span>
            <span style={{
              fontSize: 16, fontWeight: 600,
              color: C.muted, textAlign: "center",
              fontFamily: "'Helvetica Neue', Helvetica, Arial, sans-serif",
            }}>{item.text}</span>
          </div>
        ))}
      </div>
    </FadeSlide>
  </AbsoluteFill>
);

// ─── Scene 3: Leverage Score ──────────────────────────────────────────────────
const TARGET_SCORE = 68;
const RADIUS = 110;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;
const ARC = CIRCUMFERENCE * 0.75; // 270° arc length

const ScoreGauge: React.FC<{ animProg: number }> = ({ animProg }) => {
  const filled = ARC * (TARGET_SCORE / 100) * animProg;
  return (
    <svg width={290} height={290} viewBox="0 0 300 300"
      style={{ transform: "rotate(135deg)", overflow: "visible" }}>
      <defs>
        <linearGradient id="gaugeGrad" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%"   stopColor={C.indigoDk} />
          <stop offset="50%"  stopColor={C.indigo} />
          <stop offset="100%" stopColor={C.teal} />
        </linearGradient>
        {/* Glow filter */}
        <filter id="gaugeGlow">
          <feGaussianBlur stdDeviation="4" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>
      {/* Track arc */}
      <circle cx="150" cy="150" r={RADIUS}
        fill="none"
        stroke="rgba(129,140,248,0.10)"
        strokeWidth="18"
        strokeDasharray={`${ARC} ${CIRCUMFERENCE}`}
        strokeLinecap="round"
      />
      {/* Score arc (animated) */}
      <circle cx="150" cy="150" r={RADIUS}
        fill="none"
        stroke="url(#gaugeGrad)"
        strokeWidth="18"
        strokeDasharray={`${filled} ${CIRCUMFERENCE}`}
        strokeLinecap="round"
        filter="url(#gaugeGlow)"
      />
    </svg>
  );
};

const SceneScore: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const gaugeProg = spring({ frame: Math.max(0, frame - 30), fps, config: { damping: 200 } });
  const displayScore = Math.round(interpolate(gaugeProg, [0, 1], [0, TARGET_SCORE]));

  const pillars = [
    { name: "Runway Strength",    pts: 18, max: 30, color: "#4ade80" },
    { name: "Income Dependency",  pts: 14, max: 25, color: "#f59e0b" },
    { name: "Wealth Velocity",    pts: 22, max: 25, color: C.indigo  },
    { name: "Shock Resistance",   pts: 14, max: 20, color: C.teal    },
  ];

  return (
    <AbsoluteFill style={{
      display: "flex", flexDirection: "column",
      alignItems: "center", justifyContent: "center",
      padding: "0 68px",
    }}>
      <Eyebrow delay={0}>Your Leverage Score</Eyebrow>
      <div style={{ height: 32 }} />

      {/* Gauge */}
      <FadeSlide delay={20} dy={30}>
        <div style={{ position: "relative", width: 290, height: 290 }}>
          <ScoreGauge animProg={gaugeProg} />
          {/* Score overlay */}
          <div style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
          }}>
            <div style={{
              fontFamily: "'Helvetica Neue', Helvetica, Arial, sans-serif",
              fontSize: 86,
              fontWeight: 900,
              color: C.white,
              lineHeight: 1,
              letterSpacing: -3,
            }}>{displayScore}</div>
            <div style={{
              fontSize: 17,
              color: C.muted,
              fontWeight: 500,
              fontFamily: "'Helvetica Neue', Helvetica, Arial, sans-serif",
              marginTop: 4,
            }}>out of 100</div>
          </div>
        </div>
      </FadeSlide>

      <div style={{ height: 40 }} />

      {/* Pillars */}
      <div style={{ width: "100%", display: "flex", flexDirection: "column", gap: 22 }}>
        {pillars.map((p, i) => {
          const delay = 95 + i * 28;
          const barProg = spring({ frame: Math.max(0, frame - delay), fps, config: { damping: 200 } });
          const opacity  = interpolate(Math.max(0, frame - delay), [0, 18], [0, 1], { extrapolateRight: "clamp" });
          const ty       = interpolate(barProg, [0, 1], [24, 0]);
          return (
            <div key={i} style={{ opacity, transform: `translateY(${ty}px)` }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
                <div style={{
                  fontFamily: "'Helvetica Neue', Helvetica, Arial, sans-serif",
                  fontSize: 18, fontWeight: 600, color: C.white,
                }}>{p.name}</div>
                <div style={{
                  fontFamily: "'Helvetica Neue', Helvetica, Arial, sans-serif",
                  fontSize: 18, fontWeight: 800, color: p.color,
                }}>{p.pts}<span style={{ color: C.muted, fontWeight: 400, fontSize: 14 }}>/{p.max}</span></div>
              </div>
              <div style={{
                height: 9, borderRadius: 5,
                background: "rgba(255,255,255,0.05)",
                overflow: "hidden",
              }}>
                <div style={{
                  height: "100%",
                  width: `${(p.pts / p.max) * 100 * barProg}%`,
                  background: `linear-gradient(90deg, ${p.color}88 0%, ${p.color} 100%)`,
                  borderRadius: 5,
                  boxShadow: `0 0 12px ${p.color}66`,
                }} />
              </div>
            </div>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};

// ─── Scene 4: 12-Month Plan ───────────────────────────────────────────────────
const ScenePlan: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const phases = [
    { num: "01", label: "Phase 1", title: "Stabilize",   desc: "Close runway gaps. Identify your primary constraint.", accent: "#f59e0b" },
    { num: "02", label: "Phase 2", title: "Build",        desc: "Systematic surplus allocation. Reduce income dependency.", accent: C.teal },
    { num: "03", label: "Phase 3", title: "Accelerate",   desc: "Boost wealth velocity. Compress your freedom timeline.", accent: C.indigo },
    { num: "04", label: "Phase 4", title: "Leverage",     desc: "Negotiate from strength. Create real, lasting optionality.", accent: C.gold },
  ];

  return (
    <AbsoluteFill style={{
      display: "flex", flexDirection: "column",
      alignItems: "center", justifyContent: "center",
      padding: "0 64px",
    }}>
      <Eyebrow delay={0}>Personalised Execution</Eyebrow>
      <div style={{ height: 16 }} />
      <FadeSlide delay={18} dy={36}>
        <div style={{
          fontFamily: "'Helvetica Neue', Helvetica, Arial, sans-serif",
          fontSize: 56,
          fontWeight: 900,
          color: C.white,
          textAlign: "center",
          lineHeight: 1.1,
          marginBottom: 48,
        }}>
          Your 12-Month Plan
        </div>
      </FadeSlide>

      <div style={{ width: "100%", display: "flex", flexDirection: "column", gap: 18 }}>
        {phases.map((p, i) => {
          const delay = 48 + i * 30;
          const sp    = spring({ frame: Math.max(0, frame - delay), fps, config: { damping: 200 } });
          const opacity = interpolate(Math.max(0, frame - delay), [0, 18], [0, 1], { extrapolateRight: "clamp" });
          const tx    = interpolate(sp, [0, 1], [-60, 0]);
          return (
            <div key={i} style={{
              opacity,
              transform: `translateX(${tx}px)`,
              display: "flex",
              flexDirection: "row",
              alignItems: "center",
              gap: 24,
              background: C.bgCard,
              border: `1px solid ${C.border}`,
              borderLeft: `3px solid ${p.accent}`,
              borderRadius: 20,
              padding: "22px 28px",
              backdropFilter: "blur(12px)",
            }}>
              {/* Phase number badge */}
              <div style={{
                width: 52, height: 52, borderRadius: 14,
                background: `${p.accent}18`,
                border: `1px solid ${p.accent}44`,
                display: "flex", alignItems: "center", justifyContent: "center",
                flexShrink: 0,
              }}>
                <span style={{
                  fontFamily: "'Helvetica Neue', Helvetica, Arial, sans-serif",
                  fontSize: 15, fontWeight: 900, color: p.accent, letterSpacing: 1,
                }}>{p.num}</span>
              </div>
              {/* Text */}
              <div style={{ flex: 1 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
                  <span style={{
                    fontFamily: "'Helvetica Neue', Helvetica, Arial, sans-serif",
                    fontSize: 12, fontWeight: 700, color: p.accent,
                    textTransform: "uppercase", letterSpacing: 2.5,
                  }}>{p.label}</span>
                  <div style={{ flex: 1, height: 1, background: `${p.accent}22` }} />
                  <span style={{
                    fontFamily: "'Helvetica Neue', Helvetica, Arial, sans-serif",
                    fontSize: 20, fontWeight: 800, color: C.white,
                  }}>{p.title}</span>
                </div>
                <div style={{
                  fontFamily: "'Helvetica Neue', Helvetica, Arial, sans-serif",
                  fontSize: 16, fontWeight: 400, color: C.muted, lineHeight: 1.4,
                }}>{p.desc}</div>
              </div>
            </div>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};

// ─── Scene 5: The Blueprint ───────────────────────────────────────────────────
const SceneBlueprint: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const features = [
    { icon: "🧠", label: "Smart Recommendations",   sub: "Sequenced by bottleneck impact" },
    { icon: "📋", label: "Your Leverage Playbook",  sub: "Strategic moves behind the numbers" },
    { icon: "⚡", label: "Stress Test Results",       sub: "Income-loss scenario modelling" },
    { icon: "📊", label: "Methodology & Proof",       sub: "Scoring engine fully explained" },
  ];

  // Animated document card
  const docProg = spring({ frame: Math.max(0, frame - 30), fps, config: { damping: 200 } });
  const docOpacity = interpolate(Math.max(0, frame - 30), [0, 20], [0, 1], { extrapolateRight: "clamp" });
  const docScale   = interpolate(docProg, [0, 1], [0.88, 1]);

  return (
    <AbsoluteFill style={{
      display: "flex", flexDirection: "column",
      alignItems: "center", justifyContent: "center",
      padding: "0 68px",
    }}>
      <Eyebrow delay={0} color={C.indigo}>Premium Blueprint</Eyebrow>
      <div style={{ height: 20 }} />

      <FadeSlide delay={16} dy={40}>
        <div style={{
          fontFamily: "'Helvetica Neue', Helvetica, Arial, sans-serif",
          fontSize: 52,
          fontWeight: 900,
          color: C.white,
          textAlign: "center",
          lineHeight: 1.1,
          marginBottom: 8,
        }}>
          Unlock Your
        </div>
      </FadeSlide>
      <FadeSlide delay={28} dy={36}>
        <div style={{
          fontFamily: "'Helvetica Neue', Helvetica, Arial, sans-serif",
          fontSize: 52,
          fontWeight: 900,
          textAlign: "center",
          lineHeight: 1.1,
          marginBottom: 48,
          background: `linear-gradient(135deg, ${C.indigo} 0%, ${C.teal} 100%)`,
          WebkitBackgroundClip: "text",
          WebkitTextFillColor: "transparent",
        }}>
          Leverage Blueprint
        </div>
      </FadeSlide>

      {/* Document preview card */}
      <div style={{
        opacity: docOpacity,
        transform: `scale(${docScale})`,
        width: "100%",
        background: "linear-gradient(145deg, rgba(79,70,229,0.12) 0%, rgba(45,212,191,0.08) 100%)",
        border: `1px solid ${C.borderGold}`,
        borderRadius: 28,
        padding: "28px 36px",
        marginBottom: 36,
        backdropFilter: "blur(16px)",
        boxShadow: `0 0 60px rgba(79,70,229,0.15), 0 0 0 1px rgba(201,168,76,0.08) inset`,
      }}>
        {/* PDF header row */}
        <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 24 }}>
          <div style={{
            width: 44, height: 44, borderRadius: 12,
            background: `linear-gradient(135deg, ${C.indigoDk}, ${C.teal})`,
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 22,
          }}>📄</div>
          <div>
            <div style={{
              fontFamily: "'Helvetica Neue', Helvetica, Arial, sans-serif",
              fontSize: 17, fontWeight: 800, color: C.white,
            }}>Leverage Blueprint</div>
            <div style={{
              fontFamily: "'Helvetica Neue', Helvetica, Arial, sans-serif",
              fontSize: 13, color: C.gold, letterSpacing: 2, textTransform: "uppercase", fontWeight: 600,
            }}>Personalised Report</div>
          </div>
          <div style={{ flex: 1 }} />
          <div style={{
            padding: "8px 16px",
            background: `${C.gold}18`,
            border: `1px solid ${C.gold}40`,
            borderRadius: 10,
            fontFamily: "'Helvetica Neue', Helvetica, Arial, sans-serif",
            fontSize: 13, fontWeight: 700, color: C.gold, letterSpacing: 1,
          }}>PDF</div>
        </div>

        {/* Feature list */}
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {features.map((f, i) => {
            const d = 60 + i * 22;
            const itemOp = interpolate(Math.max(0, frame - d), [0, 16], [0, 1], { extrapolateRight: "clamp" });
            const itemSp = spring({ frame: Math.max(0, frame - d), fps, config: { damping: 200 } });
            return (
              <div key={i} style={{
                opacity: itemOp,
                transform: `translateX(${interpolate(itemSp, [0, 1], [32, 0])}px)`,
                display: "flex", flexDirection: "row", alignItems: "center", gap: 16,
              }}>
                <div style={{
                  width: 36, height: 36, borderRadius: 10,
                  background: "rgba(255,255,255,0.05)",
                  border: `1px solid ${C.border}`,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 18, flexShrink: 0,
                }}>{f.icon}</div>
                <div>
                  <div style={{
                    fontFamily: "'Helvetica Neue', Helvetica, Arial, sans-serif",
                    fontSize: 16, fontWeight: 700, color: C.white,
                  }}>{f.label}</div>
                  <div style={{
                    fontFamily: "'Helvetica Neue', Helvetica, Arial, sans-serif",
                    fontSize: 13, color: C.muted,
                  }}>{f.sub}</div>
                </div>
                <div style={{ flex: 1 }} />
                <div style={{
                  width: 20, height: 20, borderRadius: "50%",
                  background: `${C.teal}20`,
                  border: `1.5px solid ${C.teal}`,
                  display: "flex", alignItems: "center", justifyContent: "center",
                }}>
                  <span style={{ fontSize: 10, color: C.teal }}>✓</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </AbsoluteFill>
  );
};

// ─── Scene 6: CTA ─────────────────────────────────────────────────────────────
const SceneCTA: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Pulse animation on the CTA pill
  const pulse = interpolate(
    Math.sin((frame / fps) * 2 * Math.PI * 0.8),
    [-1, 1], [0.90, 1.04],
  );

  return (
    <AbsoluteFill style={{
      display: "flex", flexDirection: "column",
      alignItems: "center", justifyContent: "center",
      padding: "0 72px",
    }}>
      {/* Extra glow pulse on CTA scene */}
      <div style={{
        position: "absolute",
        inset: 0,
        background: `radial-gradient(ellipse at 50% 50%, rgba(79,70,229,0.12) 0%, transparent 65%)`,
      }} />

      <FadeSlide delay={0} dy={50}>
        <div style={{
          fontFamily: "'Helvetica Neue', Helvetica, Arial, sans-serif",
          fontSize: 70,
          fontWeight: 900,
          color: C.white,
          textAlign: "center",
          lineHeight: 1.05,
          letterSpacing: -2,
        }}>
          Know your number.
        </div>
      </FadeSlide>

      <FadeSlide delay={24} dy={44}>
        <div style={{
          fontFamily: "'Helvetica Neue', Helvetica, Arial, sans-serif",
          fontSize: 70,
          fontWeight: 900,
          textAlign: "center",
          lineHeight: 1.05,
          letterSpacing: -2,
          marginBottom: 52,
          background: `linear-gradient(135deg, ${C.gold} 0%, ${C.goldLight} 50%, ${C.gold} 100%)`,
          WebkitBackgroundClip: "text",
          WebkitTextFillColor: "transparent",
        }}>
          Own your options.
        </div>
      </FadeSlide>

      <div style={{ marginBottom: 56 }}>
        <GoldRule delay={48} width={240} />
      </div>

      {/* CTA pill */}
      <FadeSlide delay={60} dy={28}>
        <div style={{
          transform: `scale(${pulse})`,
          padding: "26px 64px",
          background: `linear-gradient(135deg, ${C.indigoDk} 0%, #6d28d9 100%)`,
          borderRadius: 999,
          boxShadow: `0 0 40px rgba(79,70,229,0.45), 0 0 80px rgba(79,70,229,0.20)`,
          border: `1px solid rgba(129,140,248,0.35)`,
          textAlign: "center",
          marginBottom: 36,
        }}>
          <div style={{
            fontFamily: "'Helvetica Neue', Helvetica, Arial, sans-serif",
            fontSize: 16, fontWeight: 700, color: "rgba(255,255,255,0.6)", letterSpacing: 4,
            textTransform: "uppercase", marginBottom: 6,
          }}>
            Coming Soon
          </div>
          <div style={{
            fontFamily: "'Helvetica Neue', Helvetica, Arial, sans-serif",
            fontSize: 26, fontWeight: 900, color: C.goldLight, letterSpacing: 1,
          }}>
            equanimityengine.com
          </div>
        </div>
      </FadeSlide>

      {/* Brand footer */}
      <FadeSlide delay={80} dy={16}>
        <div style={{ display: "flex", flexDirection: "row", alignItems: "center", gap: 14 }}>
          {/* EE logo placeholder */}
          <div style={{
            width: 44, height: 44, borderRadius: 12,
            background: `linear-gradient(135deg, ${C.indigoDk} 0%, ${C.teal} 100%)`,
            display: "flex", alignItems: "center", justifyContent: "center",
            boxShadow: `0 4px 20px rgba(79,70,229,0.4)`,
          }}>
            <span style={{ fontSize: 22 }}>⚡</span>
          </div>
          <div>
            <div style={{
              fontFamily: "'Helvetica Neue', Helvetica, Arial, sans-serif",
              fontSize: 16, fontWeight: 800, color: C.white, letterSpacing: 1,
            }}>EQUINIMITY ENGINE</div>
            <div style={{
              fontFamily: "'Helvetica Neue', Helvetica, Arial, sans-serif",
              fontSize: 13, color: C.muted, letterSpacing: 2.5, textTransform: "uppercase",
            }}>Financial Leverage</div>
          </div>
        </div>
      </FadeSlide>
    </AbsoluteFill>
  );
};

// ─── Scene wrapper: fades out over the last T frames so scenes crossfade ─────
const SceneWrapper: React.FC<{ children: React.ReactNode; duration: number }> = ({
  children,
  duration,
}) => {
  const frame = useCurrentFrame();
  const opacity = interpolate(frame, [duration - T, duration], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  return <AbsoluteFill style={{ opacity }}>{children}</AbsoluteFill>;
};

// Sequence start positions (each overlaps the previous by T frames)
const F_INTRO     = 0;
const F_PAIN      = F_INTRO     + S_INTRO     - T;
const F_SCORE     = F_PAIN      + S_PAIN      - T;
const F_PLAN      = F_SCORE     + S_SCORE     - T;
const F_BLUEPRINT = F_PLAN      + S_PLAN      - T;
const F_CTA       = F_BLUEPRINT + S_BLUEPRINT - T;

// ─── Root composition ─────────────────────────────────────────────────────────
export const EEVideo: React.FC = () => {
  const FADE_IN  = 60;  // 2 s
  const FADE_OUT = 90;  // 3 s
  const VOL      = 0.38;

  return (
    <AbsoluteFill>
      {/* Zen lounge background music — drop music.mp3 into remotion-video/public/ */}
      <Audio
        src={staticFile("music.mp3")}
        loop
        loopVolumeCurveBehavior="extend"
        volume={(f) => {
          if (f < FADE_IN) return interpolate(f, [0, FADE_IN], [0, VOL], { extrapolateRight: "clamp" });
          if (f > TOTAL_DURATION - FADE_OUT) return interpolate(f, [TOTAL_DURATION - FADE_OUT, TOTAL_DURATION], [VOL, 0], { extrapolateRight: "clamp" });
          return VOL;
        }}
      />
      <Background />

      <Sequence from={F_INTRO}     durationInFrames={S_INTRO}     premountFor={T}>
        <SceneWrapper duration={S_INTRO}><SceneIntro /></SceneWrapper>
      </Sequence>
      <Sequence from={F_PAIN}      durationInFrames={S_PAIN}      premountFor={T}>
        <SceneWrapper duration={S_PAIN}><ScenePainPoint /></SceneWrapper>
      </Sequence>
      <Sequence from={F_SCORE}     durationInFrames={S_SCORE}     premountFor={T}>
        <SceneWrapper duration={S_SCORE}><SceneScore /></SceneWrapper>
      </Sequence>
      <Sequence from={F_PLAN}      durationInFrames={S_PLAN}      premountFor={T}>
        <SceneWrapper duration={S_PLAN}><ScenePlan /></SceneWrapper>
      </Sequence>
      <Sequence from={F_BLUEPRINT} durationInFrames={S_BLUEPRINT} premountFor={T}>
        <SceneWrapper duration={S_BLUEPRINT}><SceneBlueprint /></SceneWrapper>
      </Sequence>
      <Sequence from={F_CTA}       durationInFrames={S_CTA}       premountFor={T}>
        <SceneWrapper duration={S_CTA}><SceneCTA /></SceneWrapper>
      </Sequence>
    </AbsoluteFill>
  );
};
