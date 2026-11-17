// ===========================================================================
// WHERE IS THE "CALL NO/UC NO + SERVICE VISIT DATE" BOX ON A SERVICE REPORT
// PHOTO? (the report-date check, Phase A, the user 2026-11-17: "Crop and send"
// -- only that box may ever leave our systems, never the customer's name,
// address or product).
//
// Given the words an on-device reader found in the photo (printed labels read
// well; handwriting does not, and is not needed here), find the PRINTED label
// "Service Visit Date" -- or, failing it, "Call No/UC No" -- and work out the
// box from it. Matching is loose, because a phone photo comes back as
// "Service Vist Das" and "Call HeslC Ns".
//
// The form (AIR LIQUIDE SERVICE REPORT): the right-hand column holds, top to
// bottom, Engineer Name, Call Type, Status, Call No/UC No, Service Visit Date;
// each label in its own cell with the handwritten value to its right. The box
// wanted spans the Call No/UC No and Service Visit Date rows, label to the
// right edge of the value cell.
//
// NOTHING IS GUESSED SILENTLY: no label found means no box (null), and a box
// that would be implausibly large -- wide or tall enough to take in the
// customer's side of the form -- is refused too. The ratios are in BOX so the
// Phase A trial can tune them against real photos.
//
// Pure: no DOM, no network, so `scripts/check-report-crop.ts` can test it.
// ===========================================================================

export interface OcrWord { text: string; x0: number; y0: number; x1: number; y1: number }
export interface OcrLine { words: OcrWord[] }
export interface CropBox { x: number; y: number; w: number; h: number; anchor: 'Service Visit Date' | 'Call No/UC No' | 'Ruled lines'; label: string }

/** Tuning, in multiples of the label's own height (h) and width (w). */
export const BOX = {
  // From "Service Visit Date": one row above it (Call No/UC No) to just below it.
  visit: { left: 0.3, right: 3.6, up: 2.8, down: 1.0 },
  // From "Call No/UC No": just above it to one row below it (Service Visit Date).
  callNo: { left: 0.3, right: 4.0, up: 0.9, down: 2.9 },
  // Never more than this share of the photo: a bigger box is a misread label
  // and could carry the customer's side of the form.
  maxWidth: 0.7,
  maxHeight: 0.4,
};

const norm = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]/g, '');

/** 0..1, 1 = identical: one minus the edit distance over the longer length. */
export function similar(a: string, b: string): number {
  const x = norm(a), y = norm(b);
  if (!x || !y) return 0;
  const m = x.length, n = y.length;
  const d: number[] = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    let prev = d[0]; d[0] = i;
    for (let j = 1; j <= n; j++) {
      const tmp = d[j];
      d[j] = Math.min(d[j] + 1, d[j - 1] + 1, prev + (x[i - 1] === y[j - 1] ? 0 : 1));
      prev = tmp;
    }
  }
  return 1 - d[n] / Math.max(m, n);
}

const union = (ws: OcrWord[]): OcrWord => ({
  text: ws.map((w) => w.text).join(' '),
  x0: Math.min(...ws.map((w) => w.x0)), y0: Math.min(...ws.map((w) => w.y0)),
  x1: Math.max(...ws.map((w) => w.x1)), y1: Math.max(...ws.map((w) => w.y1)),
});

/** The printed "Service Visit Date" label, if any line carries it. */
export function findVisitLabel(lines: OcrLine[]): OcrWord | null {
  for (const l of lines) {
    const w = l.words;
    for (let i = 0; i + 1 < w.length; i++) {
      if (similar(w[i].text, 'SERVICE') < 0.7) continue;
      const v = norm(w[i + 1].text);
      if (similar(v, 'VISIT') < 0.6 && !v.startsWith('VIS')) continue;
      const parts = [w[i], w[i + 1]];
      if (w[i + 2] && similar(w[i + 2].text, 'DATE') >= 0.5) parts.push(w[i + 2]);
      return union(parts);
    }
  }
  return null;
}

/** The printed "Call No/UC No" label: CALL followed by anything but TYPE or DATE
 *  (Call Type and Call Date are the other two labels starting with Call). */
export function findCallNoLabel(lines: OcrLine[]): OcrWord | null {
  for (const l of lines) {
    const w = l.words;
    for (let i = 0; i + 1 < w.length; i++) {
      if (similar(w[i].text, 'CALL') < 0.75) continue;
      const next = w[i + 1].text;
      if (similar(next, 'TYPE') >= 0.5 || similar(next, 'DATE') >= 0.5) continue;
      const n = norm(next);
      if (!(n.startsWith('NO') || n.includes('UC') || similar(n, 'NOUCNO') >= 0.4 || similar(n, 'NO') >= 0.5)) continue;
      const parts = [w[i], w[i + 1]];
      if (w[i + 2] && (similar(w[i + 2].text, 'UC') >= 0.5 || similar(w[i + 2].text, 'NO') >= 0.5)) parts.push(w[i + 2]);
      return union(parts);
    }
  }
  return null;
}

function boxFrom(label: OcrWord, k: { left: number; right: number; up: number; down: number }, imgW: number, imgH: number) {
  const h = Math.max(1, label.y1 - label.y0);
  const w = Math.max(1, label.x1 - label.x0);
  const x0 = Math.max(0, label.x0 - k.left * h);
  const x1 = Math.min(imgW, label.x0 + k.right * w);
  const y0 = Math.max(0, label.y0 - k.up * h);
  const y1 = Math.min(imgH, label.y1 + k.down * h);
  return { x: Math.round(x0), y: Math.round(y0), w: Math.round(x1 - x0), h: Math.round(y1 - y0) };
}

/** The box to send, or null with the reason. */
export function findReportBox(lines: OcrLine[], imgW: number, imgH: number): { box: CropBox | null; why: string; word?: OcrWord } {
  const tries: [OcrWord | null, CropBox['anchor'], typeof BOX.visit][] = [
    [findVisitLabel(lines), 'Service Visit Date', BOX.visit],
    [findCallNoLabel(lines), 'Call No/UC No', BOX.callNo],
  ];
  let why = 'neither "Service Visit Date" nor "Call No/UC No" was found on the photo';
  for (const [label, anchor, k] of tries) {
    if (!label) continue;
    const b = boxFrom(label, k, imgW, imgH);
    if (b.w > BOX.maxWidth * imgW || b.h > BOX.maxHeight * imgH) {
      why = `"${anchor}" found, but the box would be too large (${Math.round(100 * b.w / imgW)}% x ${Math.round(100 * b.h / imgH)}% of the photo) -- not sent`;
      continue;
    }
    if (b.w < 20 || b.h < 10) { why = `"${anchor}" found, but the box is too small to read`; continue; }
    return { box: { ...b, anchor, label: label.text }, why: '', word: label };
  }
  return { box: null, why };
}
