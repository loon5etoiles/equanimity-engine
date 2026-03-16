/**
 * premiumPdf.ts — Reusable jsPDF drawing primitives for the Equanimity Blueprint.
 *
 * All coordinates are in points (pt). Letter page = 612 × 792 pt.
 * Colour palette: Navy #081426 · Gold #B88900 · Teal #14B8A6 · Charcoal #1F2937
 */

// ─── Palette ──────────────────────────────────────────────────────────────────

export const C = {
  navy:     [8,   20,  38]  as [number, number, number],
  navy800:  [13,  31,  60]  as [number, number, number],
  gold:     [184, 137, 0]   as [number, number, number],
  goldLight:[212, 160, 23]  as [number, number, number],
  teal:     [20,  184, 166] as [number, number, number],
  tealDark: [13,  148, 136] as [number, number, number],
  white:    [255, 255, 255] as [number, number, number],
  ink:      [17,  24,  39]  as [number, number, number],
  charcoal: [31,  41,  55]  as [number, number, number],
  muted:    [107, 114, 128] as [number, number, number],
  border:   [229, 231, 235] as [number, number, number],
  softBg:   [248, 250, 252] as [number, number, number],
  success:  [16,  185, 129] as [number, number, number],
  warn:     [245, 158, 11]  as [number, number, number],
  danger:   [239, 68,  68]  as [number, number, number],
};

// ─── Types ────────────────────────────────────────────────────────────────────

type Doc = any; // jsPDF instance

// ─── Low-level helpers ────────────────────────────────────────────────────────

/** Set fill colour from [r,g,b] tuple */
export function setFill(doc: Doc, rgb: [number, number, number]) {
  doc.setFillColor(rgb[0], rgb[1], rgb[2]);
}

/** Set draw colour from [r,g,b] tuple */
export function setDraw(doc: Doc, rgb: [number, number, number]) {
  doc.setDrawColor(rgb[0], rgb[1], rgb[2]);
}

/** Set text colour from [r,g,b] tuple */
export function setTxt(doc: Doc, rgb: [number, number, number]) {
  doc.setTextColor(rgb[0], rgb[1], rgb[2]);
}

/** Convenience: set font size and family */
export function font(doc: Doc, size: number, style: "normal" | "bold" | "italic" = "normal") {
  doc.setFont("helvetica", style);
  doc.setFontSize(size);
}

/** Wrap text to fit width, return new y */
export function wrapText(doc: Doc, text: string, x: number, y: number, maxW: number, lineH = 14): number {
  const lines: string[] = doc.splitTextToSize(text, maxW);
  doc.text(lines, x, y);
  return y + lines.length * lineH;
}

// ─── Gold rule ────────────────────────────────────────────────────────────────

/** Thin gold horizontal rule */
export function drawGoldRule(doc: Doc, x: number, y: number, w: number) {
  setDraw(doc, C.gold);
  doc.setLineWidth(0.75);
  doc.line(x, y, x + w, y);
  doc.setLineWidth(0.5);
}

// ─── Navy cover page ──────────────────────────────────────────────────────────

export function drawNavyCover(
  doc: Doc,
  {
    title,
    subtitle,
    name,
    date,
    pageW,
    pageH,
  }: {
    title: string;
    subtitle: string;
    name: string;
    date: string;
    pageW: number;
    pageH: number;
  }
) {
  // Full-bleed navy background
  setFill(doc, C.navy);
  doc.rect(0, 0, pageW, pageH, "F");

  // Subtle navy-800 accent band (bottom third)
  setFill(doc, C.navy800);
  doc.rect(0, pageH * 0.7, pageW, pageH * 0.3, "F");

  // Gold top bar
  setFill(doc, C.gold);
  doc.rect(0, 0, pageW, 4, "F");

  // Brand label
  font(doc, 9, "bold");
  setTxt(doc, C.goldLight);
  doc.text("EQUANIMITY ENGINE", 48, 36);

  // Gold rule under brand
  drawGoldRule(doc, 48, 44, pageW - 96);

  // Main title
  font(doc, 36, "bold");
  setTxt(doc, C.white);
  const titleLines: string[] = doc.splitTextToSize(title, pageW - 96);
  doc.text(titleLines, 48, 140);

  // Subtitle
  font(doc, 14, "normal");
  setTxt(doc, C.muted);
  doc.text(subtitle, 48, 140 + titleLines.length * 42 + 12);

  // Gold rule
  drawGoldRule(doc, 48, pageH * 0.62, pageW - 96);

  // Name + date
  font(doc, 11, "bold");
  setTxt(doc, C.white);
  doc.text(name || "Confidential", 48, pageH * 0.62 + 24);

  font(doc, 9, "normal");
  setTxt(doc, C.muted);
  doc.text(`Generated ${date}`, 48, pageH * 0.62 + 40);

  // Bottom disclaimer
  font(doc, 7, "normal");
  setTxt(doc, C.muted);
  doc.text(
    "This document is for educational and planning purposes only. It does not constitute financial advice.",
    48,
    pageH - 24
  );
}

// ─── Page header / footer ─────────────────────────────────────────────────────

export function drawPageHeader(
  doc: Doc,
  { section, pageW, pageNum }: { section: string; pageW: number; pageNum: number }
) {
  setFill(doc, C.navy);
  doc.rect(0, 0, pageW, 28, "F");

  font(doc, 7, "bold");
  setTxt(doc, C.goldLight);
  doc.text("EQUANIMITY ENGINE · LEVERAGE BLUEPRINT", 48, 17);

  font(doc, 7, "normal");
  setTxt(doc, C.muted);
  doc.text(section.toUpperCase(), pageW / 2, 17, { align: "center" });
  doc.text(String(pageNum), pageW - 48, 17, { align: "right" });
}

export function drawPageFooter(doc: Doc, { pageW, pageH }: { pageW: number; pageH: number }) {
  setFill(doc, C.navy);
  doc.rect(0, pageH - 20, pageW, 20, "F");
  font(doc, 6, "normal");
  setTxt(doc, C.muted);
  doc.text(
    "Equanimity Engine · equanimityengine.com · For educational purposes only",
    pageW / 2,
    pageH - 8,
    { align: "center" }
  );
}

// ─── Section title ────────────────────────────────────────────────────────────

/** Large section heading with teal accent bar on the left */
export function drawSectionTitle(doc: Doc, title: string, x: number, y: number): number {
  setFill(doc, C.teal);
  doc.rect(x, y - 11, 3, 16, "F");

  font(doc, 16, "bold");
  setTxt(doc, C.navy);
  doc.text(title, x + 10, y);

  return y + 20;
}

/** Smaller sub-section heading */
export function drawSubTitle(doc: Doc, title: string, x: number, y: number): number {
  font(doc, 11, "bold");
  setTxt(doc, C.charcoal);
  doc.text(title, x, y);
  return y + 16;
}

// ─── KPI grid ─────────────────────────────────────────────────────────────────

export interface KpiCell {
  label: string;
  value: string;
  sub?: string;
  accent?: [number, number, number];
}

/**
 * Draw a row of KPI tiles.
 * Returns the y position below the grid.
 */
export function drawKpiGrid(
  doc: Doc,
  {
    cells,
    x,
    y,
    w,
    h = 68,
  }: {
    cells: KpiCell[];
    x: number;
    y: number;
    w: number;
    h?: number;
  }
): number {
  const gap = 6;
  const cellW = (w - gap * (cells.length - 1)) / cells.length;

  cells.forEach((cell, i) => {
    const cx = x + i * (cellW + gap);

    // Card background
    setFill(doc, C.softBg);
    setDraw(doc, C.border);
    doc.setLineWidth(0.5);
    doc.roundedRect(cx, y, cellW, h, 6, 6, "FD");

    // Accent top bar
    const accent = cell.accent ?? C.teal;
    setFill(doc, accent);
    doc.roundedRect(cx, y, cellW, 3, 2, 2, "F");

    // Label
    font(doc, 7, "bold");
    setTxt(doc, C.muted);
    doc.text(cell.label.toUpperCase(), cx + 10, y + 16);

    // Value
    font(doc, 18, "bold");
    setTxt(doc, C.navy);
    doc.text(cell.value, cx + 10, y + 36);

    // Sub
    if (cell.sub) {
      font(doc, 8, "normal");
      setTxt(doc, C.muted);
      doc.text(cell.sub, cx + 10, y + 50);
    }
  });

  return y + h + 10;
}

// ─── Horizontal progress bar ──────────────────────────────────────────────────

export function drawProgressBar(
  doc: Doc,
  {
    x, y, w, h = 8,
    pct,
    fillColor = C.teal,
    bgColor = C.border,
    label,
    valueLabel,
  }: {
    x: number; y: number; w: number; h?: number;
    pct: number;               // 0–1
    fillColor?: [number, number, number];
    bgColor?: [number, number, number];
    label?: string;
    valueLabel?: string;
  }
): number {
  if (label) {
    font(doc, 8, "bold");
    setTxt(doc, C.charcoal);
    doc.text(label, x, y - 3);
  }

  // Track
  setFill(doc, bgColor);
  doc.roundedRect(x, y, w, h, h / 2, h / 2, "F");

  // Fill
  const fillW = Math.max(4, Math.min(w, w * pct));
  setFill(doc, fillColor);
  doc.roundedRect(x, y, fillW, h, h / 2, h / 2, "F");

  if (valueLabel) {
    font(doc, 7, "bold");
    setTxt(doc, C.charcoal);
    doc.text(valueLabel, x + w + 6, y + h - 1);
  }

  return y + h + 6;
}

// ─── Pillar score bars ────────────────────────────────────────────────────────

export interface PillarBar {
  name: string;
  score: number;
  max: number;
  isBottleneck?: boolean;
}

export function drawPillarBars(
  doc: Doc,
  { bars, x, y, w }: { bars: PillarBar[]; x: number; y: number; w: number }
): number {
  let cy = y;
  bars.forEach((bar) => {
    const pct = bar.max > 0 ? bar.score / bar.max : 0;
    const color: [number, number, number] = bar.isBottleneck
      ? C.warn
      : pct >= 0.7
      ? C.teal
      : pct >= 0.4
      ? C.goldLight
      : C.danger;

    font(doc, 9, "bold");
    setTxt(doc, bar.isBottleneck ? C.warn : C.charcoal);
    doc.text(bar.name + (bar.isBottleneck ? "  ← bottleneck" : ""), x, cy);

    cy = drawProgressBar(doc, {
      x, y: cy + 4, w, h: 10,
      pct,
      fillColor: color,
      valueLabel: `${bar.score} / ${bar.max}`,
    });
    cy += 4;
  });
  return cy;
}

// ─── Pentagon radar (5-pillar) ────────────────────────────────────────────────

/**
 * Draw a 5-axis radar chart using only jsPDF primitives.
 * Axes are labeled; polygon filled semi-transparently.
 */
export function drawRadar(
  doc: Doc,
  {
    cx, cy, r,
    scores,   // array of 5 values 0–1
    labels,   // array of 5 strings
  }: {
    cx: number;
    cy: number;
    r: number;
    scores: number[];
    labels: string[];
  }
) {
  const n = 5;
  const angle0 = -Math.PI / 2; // start at top

  const pt = (i: number, scale = 1): [number, number] => {
    const a = angle0 + (2 * Math.PI * i) / n;
    return [cx + r * scale * Math.cos(a), cy + r * scale * Math.sin(a)];
  };

  // Grid rings (20%, 40%, 60%, 80%, 100%)
  [0.2, 0.4, 0.6, 0.8, 1.0].forEach((ring) => {
    setDraw(doc, C.border);
    doc.setLineWidth(ring === 1.0 ? 0.75 : 0.4);
    const pts = Array.from({ length: n }, (_, i) => pt(i, ring));
    doc.lines(
      pts.slice(1).map((p, i) => [p[0] - pts[i][0], p[1] - pts[i][1]]),
      pts[0][0], pts[0][1],
      [1, 1], "S", true
    );
  });

  // Spokes
  setDraw(doc, C.border);
  doc.setLineWidth(0.4);
  for (let i = 0; i < n; i++) {
    const [ex, ey] = pt(i, 1.0);
    doc.line(cx, cy, ex, ey);
  }

  // Filled polygon (score shape)
  const pts = scores.map((s, i) => pt(i, Math.max(0.05, Math.min(1, s))));
  setFill(doc, C.teal);
  setDraw(doc, C.tealDark);
  doc.setLineWidth(1);
  doc.setGState(new doc.GState({ opacity: 0.35 }));
  doc.lines(
    pts.slice(1).map((p, i) => [p[0] - pts[i][0], p[1] - pts[i][1]]),
    pts[0][0], pts[0][1],
    [1, 1], "FD", true
  );
  doc.setGState(new doc.GState({ opacity: 1 }));

  // Dots at vertices
  setFill(doc, C.tealDark);
  pts.forEach(([px, py]) => doc.circle(px, py, 2.5, "F"));

  // Labels
  font(doc, 8, "bold");
  setTxt(doc, C.charcoal);
  labels.forEach((lbl, i) => {
    const [lx, ly] = pt(i, 1.28);
    doc.text(lbl, lx, ly, { align: "center" });
  });
}

// ─── Callout box ─────────────────────────────────────────────────────────────

/** Highlighted callout (navy background, gold/teal accent) */
export function drawCallout(
  doc: Doc,
  {
    x, y, w,
    heading,
    body,
    accentColor = C.gold,
  }: {
    x: number; y: number; w: number;
    heading: string;
    body: string;
    accentColor?: [number, number, number];
  }
): number {
  // Measure height
  font(doc, 9, "normal");
  const bodyLines: string[] = doc.splitTextToSize(body, w - 28);
  const h = 14 + 16 + bodyLines.length * 13 + 16;

  setFill(doc, C.navy800);
  doc.roundedRect(x, y, w, h, 6, 6, "F");

  setFill(doc, accentColor);
  doc.roundedRect(x, y, 3, h, 2, 2, "F");

  font(doc, 9, "bold");
  setTxt(doc, accentColor);
  doc.text(heading, x + 12, y + 16);

  font(doc, 9, "normal");
  setTxt(doc, [200, 210, 220] as any);
  doc.text(bodyLines, x + 12, y + 30);

  return y + h + 8;
}

// ─── Status badge ─────────────────────────────────────────────────────────────

export function drawStatusBadge(
  doc: Doc,
  { x, y, status }: { x: number; y: number; status: "SURVIVES" | "AT_RISK" | "CRITICAL" }
) {
  const color: [number, number, number] =
    status === "SURVIVES" ? C.success : status === "AT_RISK" ? C.warn : C.danger;
  const label = status === "SURVIVES" ? "SURVIVES" : status === "AT_RISK" ? "AT RISK" : "CRITICAL";

  setFill(doc, color);
  doc.roundedRect(x, y - 8, 52, 12, 4, 4, "F");
  font(doc, 6.5, "bold");
  setTxt(doc, C.white);
  doc.text(label, x + 26, y - 1, { align: "center" });
}

// ─── Simple two-column table ──────────────────────────────────────────────────

export function drawSimpleTable(
  doc: Doc,
  {
    x, y, w,
    headers,
    rows,
    colWidths,   // absolute widths summing to w
  }: {
    x: number; y: number; w: number;
    headers: string[];
    rows: string[][];
    colWidths: number[];
  }
): number {
  const rowH = 20;
  const pad = 8;

  // Header row
  setFill(doc, C.navy);
  doc.roundedRect(x, y, w, rowH, 4, 4, "F");
  font(doc, 8, "bold");
  setTxt(doc, C.white);
  let hx = x + pad;
  headers.forEach((h, i) => {
    doc.text(h, hx, y + 13);
    hx += colWidths[i];
  });

  // Data rows
  rows.forEach((row, ri) => {
    const ry = y + rowH + ri * (rowH + 2);
    setFill(doc, ri % 2 === 0 ? C.softBg : C.white);
    doc.roundedRect(x, ry, w, rowH, 3, 3, "F");
    font(doc, 8, "normal");
    setTxt(doc, C.charcoal);
    let rx = x + pad;
    row.forEach((cell, i) => {
      doc.text(String(cell), rx, ry + 13);
      rx += colWidths[i];
    });
  });

  return y + rowH + rows.length * (rowH + 2) + 6;
}

// ─── Monte Carlo fan chart (jsPDF native) ────────────────────────────────────

/**
 * Draw a fan chart showing P10–P90 bands + median line.
 * `values` should be arrays of length `yearCount`, indexed year 0 = year 1.
 */
export function drawMonteCarloFan(
  doc: Doc,
  {
    x, y, w, h,
    p10, p25, p50, p75, p90,
    target,
    maxVal,
    yearCount,
  }: {
    x: number; y: number; w: number; h: number;
    p10: number[]; p25: number[]; p50: number[]; p75: number[]; p90: number[];
    target: number;
    maxVal: number;
    yearCount: number;
  }
) {
  if (maxVal <= 0) return;

  const toX = (i: number) => x + (i / (yearCount - 1)) * w;
  const toY = (v: number) => y + h - (Math.min(v, maxVal) / maxVal) * h;

  // Outer band P10–P90 (very light teal)
  const outerPts = [
    ...p10.map((v, i) => [toX(i), toY(v)] as [number, number]),
    ...[...p90].reverse().map((v, i) => [toX(yearCount - 1 - i), toY(v)] as [number, number]),
  ];
  setFill(doc, C.teal);
  doc.setGState(new doc.GState({ opacity: 0.1 }));
  const [ox0, oy0] = outerPts[0];
  doc.lines(
    outerPts.slice(1).map((p, i) => [p[0] - outerPts[i][0], p[1] - outerPts[i][1]]),
    ox0, oy0, [1, 1], "F", true
  );

  // Inner band P25–P75
  const innerPts = [
    ...p25.map((v, i) => [toX(i), toY(v)] as [number, number]),
    ...[...p75].reverse().map((v, i) => [toX(yearCount - 1 - i), toY(v)] as [number, number]),
  ];
  setFill(doc, C.teal);
  doc.setGState(new doc.GState({ opacity: 0.2 }));
  const [ix0, iy0] = innerPts[0];
  doc.lines(
    innerPts.slice(1).map((p, i) => [p[0] - innerPts[i][0], p[1] - innerPts[i][1]]),
    ix0, iy0, [1, 1], "F", true
  );

  doc.setGState(new doc.GState({ opacity: 1 }));

  // Median line (P50)
  setDraw(doc, C.tealDark);
  doc.setLineWidth(1.5);
  p50.forEach((v, i) => {
    if (i === 0) doc.moveTo(toX(i), toY(v));
    else doc.lineTo(toX(i), toY(v));
  });
  doc.stroke();

  // Target line
  if (target <= maxVal) {
    setDraw(doc, C.gold);
    doc.setLineWidth(1);
    doc.setLineDash([4, 3], 0);
    const ty = toY(target);
    doc.line(x, ty, x + w, ty);
    doc.setLineDash([], 0);
    font(doc, 7, "bold");
    setTxt(doc, C.gold);
    doc.text("Freedom Number", x + w + 4, ty + 3);
  }

  // Axis lines
  setDraw(doc, C.border);
  doc.setLineWidth(0.5);
  doc.line(x, y, x, y + h);        // Y axis
  doc.line(x, y + h, x + w, y + h); // X axis

  // Legend
  const ly = y + h + 14;
  font(doc, 7, "normal");

  // P10–P90 swatch
  setFill(doc, C.teal);
  doc.setGState(new doc.GState({ opacity: 0.15 }));
  doc.rect(x, ly - 6, 12, 8, "F");
  doc.setGState(new doc.GState({ opacity: 1 }));
  setTxt(doc, C.muted);
  doc.text("P10–P90 range", x + 15, ly);

  // P25–P75 swatch
  setFill(doc, C.teal);
  doc.setGState(new doc.GState({ opacity: 0.3 }));
  doc.rect(x + 90, ly - 6, 12, 8, "F");
  doc.setGState(new doc.GState({ opacity: 1 }));
  doc.text("P25–P75 range", x + 105, ly);

  // Median swatch
  setDraw(doc, C.tealDark);
  doc.setLineWidth(1.5);
  doc.line(x + 180, ly - 2, x + 192, ly - 2);
  doc.text("Median (P50)", x + 195, ly);
}
