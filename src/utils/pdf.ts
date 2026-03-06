export function wrap(doc: any, text: string, x: number, y: number, w: number, lineH = 14) {
  const lines = doc.splitTextToSize(text, w);
  doc.text(lines, x, y);
  return y + lines.length * lineH;
}

export function sectionTitle(doc: any, title: string, x: number, y: number) {
  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.text(title, x, y);
  return y + 18;
}

export function drawTable(
  doc: any,
  {
    x,
    y,
    w,
    headers,
    rows,
    colPercents,
    rowH = 18,
  }: {
    x: number;
    y: number;
    w: number;
    headers: string[];
    rows: (string | number)[][];
    colPercents: number[];
    rowH?: number;
  }
) {
  const colW = colPercents.map((p) => w * p);

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

  doc.setFont("helvetica", "normal");
  doc.setTextColor(50);

  let ry = y + rowH;
  rows.forEach((r) => {
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
