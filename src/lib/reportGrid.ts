// ===========================================================================
// THE BOX, FOUND BY THE FORM'S RULED LINES (report-date check, Phase A; the
// user, 2026-11-17: "instead of searching for the words, can we search be
// done based on straight line and horizontal line?" -- after the word search
// missed both of two clear samples).
//
// The printed labels are small and a phone photo blurs them; the ruled lines
// of the form are long, dark and straight, and survive. On the AIR LIQUIDE
// SERVICE REPORT the right-hand column of labels -- Engineer Name, Call Type,
// Status, Call No/UC No, Service Visit Date -- is a stack of equal rows closed
// by two vertical rules that both STOP at the bottom of the Service Visit
// Date row (the Product Name row below it is divided differently). The box
// wanted is the bottom two rows of that stack, label to value.
//
// Pure: works on a grey pixel array, no DOM, so `scripts/check-report-crop.ts`
// can test it. Nothing here is sent anywhere.
// ===========================================================================
import { similar } from './reportCrop';

export interface HLine { y: number; x0: number; x1: number }
export interface VLine { x: number; y0: number; y1: number }

/** Dark-pixel mask by local (Bradley) threshold: a pixel darker than its
 *  neighbourhood by `t` is ink. Survives uneven light across a phone photo. */
export function inkMask(g: ArrayLike<number>, w: number, h: number, t = 0.18): Uint8Array {
  const r = Math.max(8, Math.round(Math.max(w, h) / 80));
  const I = new Uint32Array((w + 1) * (h + 1));   // 255 x 5M pixels fits
  for (let y = 0; y < h; y++) {
    let row = 0;
    for (let x = 0; x < w; x++) { row += g[y * w + x]; I[(y + 1) * (w + 1) + x + 1] = I[y * (w + 1) + x + 1] + row; }
  }
  const m = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    const ya = Math.max(0, y - r), yb = Math.min(h, y + r + 1);
    for (let x = 0; x < w; x++) {
      const xa = Math.max(0, x - r), xb = Math.min(w, x + r + 1);
      const s = I[yb * (w + 1) + xb] - I[ya * (w + 1) + xb] - I[yb * (w + 1) + xa] + I[ya * (w + 1) + xa];
      const n = (yb - ya) * (xb - xa);
      if (g[y * w + x] * n < s * (1 - t)) m[y * w + x] = 1;
    }
  }
  return m;
}

/** Long horizontal runs of ink, joined across small gaps and slight tilt. */
export function horizontalLines(m: Uint8Array, w: number, h: number, minLen: number): HLine[] {
  const gap = Math.max(3, Math.round(w / 300));
  const segs: HLine[] = [];
  for (let y = 1; y < h - 1; y++) {
    let start = -1, last = -1;
    for (let x = 0; x <= w; x++) {
      const on = x < w && (m[y * w + x] || m[(y - 1) * w + x] || m[(y + 1) * w + x]);
      if (on) { if (start < 0) start = x; last = x; }
      else if (start >= 0 && x - last > gap) { if (last - start >= minLen) segs.push({ y, x0: start, x1: last }); start = -1; }
    }
  }
  return mergeH(segs, gap);
}

function mergeH(segs: HLine[], gap: number): HLine[] {
  // A thick or tilted line shows up on several neighbouring scan rows: fold
  // those into one line at their mean height.
  segs.sort((a, b) => a.y - b.y || a.x0 - b.x0);
  const groups: { ys: number[]; x0: number; x1: number; yEnd: number }[] = [];
  for (const s of segs) {
    const g = groups.find((q) => s.y - q.yEnd <= 2 && s.x0 <= q.x1 + gap && s.x1 >= q.x0 - gap);
    if (g) { g.ys.push(s.y); g.x0 = Math.min(g.x0, s.x0); g.x1 = Math.max(g.x1, s.x1); g.yEnd = s.y; }
    else groups.push({ ys: [s.y], x0: s.x0, x1: s.x1, yEnd: s.y });
  }
  return groups.map((q) => ({ y: Math.round(q.ys.reduce((a, b) => a + b, 0) / q.ys.length), x0: q.x0, x1: q.x1 }));
}

/** The same for vertical lines, by transposing the question. */
export function verticalLines(m: Uint8Array, w: number, h: number, minLen: number): VLine[] {
  const gap = Math.max(3, Math.round(h / 300));
  const segs: HLine[] = [];
  for (let x = 1; x < w - 1; x++) {
    let start = -1, last = -1;
    for (let y = 0; y <= h; y++) {
      const on = y < h && (m[y * w + x] || m[y * w + x - 1] || m[y * w + x + 1]);
      if (on) { if (start < 0) start = y; last = y; }
      else if (start >= 0 && y - last > gap) { if (last - start >= minLen) segs.push({ y: x, x0: start, x1: last }); start = -1; }
    }
  }
  return mergeH(segs, gap).map((l) => ({ x: l.y, y0: l.x0, y1: l.x1 }));
}

export interface Stack {
  ys: number[]; box: { x: number; y: number; w: number; h: number }; upright: boolean;
  /** The label column's two rules, left and right, for reading its labels. */
  labelX: [number, number];
  /** Every vertical rule the rows share, left to right: the cell borders. */
  cols: number[];
}

/** THE LABEL COLUMN, FOUND BY ITS LINES ALONE. On the form the labels Engineer
 *  Name, Call Type, Status, Call No/UC No and Service Visit Date sit in one
 *  column of equal rows, closed on both sides by a vertical rule that ENDS at
 *  the bottom of the Service Visit Date row (below it the Product Name row
 *  has different divisions). So: two vertical rules, at least four evenly
 *  spaced horizontal rules running across the gap between them, and the
 *  column stopping at the last of those. The box is its bottom two rows,
 *  from the column's left rule to where those rows' lines end on the right. */
export function findLabelStacks(hs: HLine[], vs: VLine[], w: number, h: number): Stack[] {
  const tol = Math.max(6, Math.round(Math.max(w, h) * 0.008));
  type Cand = { a: VLine; b: VLine; ys: number[]; ratio: number };
  const cands: Cand[] = [];
  for (const a of vs) for (const b of vs) {
    const gapX = b.x - a.x;
    if (gapX < w * 0.04 || gapX > w * 0.35) continue;
    const top = Math.max(a.y0, b.y0) - tol, bot = Math.min(a.y1, b.y1) + tol;
    if (bot - top < tol * 4) continue;
    const ys = rulesAcross(hs, a.x, b.x, top, bot, tol);
    if (ys.length < 4) continue;
    const last = ys[ys.length - 1];
    // The column must END at its last rule: at least one side stops there.
    if (Math.abs(a.y1 - last) > tol * 1.5 && Math.abs(b.y1 - last) > tol * 1.5) continue;
    const gaps = ys.slice(1).map((y, i) => y - ys[i]);
    const ratio = Math.max(...gaps) / Math.min(...gaps);
    if (ratio > 2.2 || gaps[gaps.length - 1] < h * 0.012) continue;
    cands.push({ a, b, ys, ratio });
  }
  // Most rows first, then the most even rows. A page can carry several such
  // stacks (a PM checklist is all tables), so EVERY distinct one is returned,
  // best first, for the caller to confirm by reading its labels.
  cands.sort((p, q) => q.ys.length - p.ys.length || p.ratio - q.ratio);
  const out: Stack[] = [];
  const used = new Set<Cand>();
  for (const best of cands) {
  if (used.has(best)) continue;
  const last = best.ys[best.ys.length - 1];
  // The same rows are seen between the label column's two rules and between
  // the value column's: take the box from the LEFTMOST rule that shares them,
  // so the printed labels are in the cut-out with the values.
  const same = cands.filter((c) => !used.has(c) && c.ys.length === best.ys.length && Math.abs(c.ys[c.ys.length - 1] - last) <= tol
    && Math.abs(c.ys[0] - best.ys[0]) <= tol);
  same.forEach((c) => used.add(c));
  const left = Math.min(...same.map((c) => c.a.x));
  const labelRight = Math.min(...same.filter((c) => c.a.x === left).map((c) => c.b.x));
  const target = best.ys.slice(-3);
  // Follow those rows' rules rightwards from the column to where they end.
  let reach = Math.max(...same.map((c) => c.b.x));
  const near = (l: HLine) => target.some((y) => Math.abs(l.y - y) <= tol);
  for (let moved = true; moved;) {
    moved = false;
    for (const l of hs) if (near(l) && l.x0 <= reach + 2 * tol && l.x1 > reach) { reach = l.x1; moved = true; }
  }
  // ...but no further than the form's own right-hand rule, if one runs down
  // beside those rows (past it is the table, the photo's edge or a border).
  const edge = vs.filter((v) => v.x > Math.max(...same.map((c) => c.b.x)) + tol && v.x <= reach + tol
    && v.y0 <= target[0] + tol && v.y1 >= last - tol).map((v) => v.x);
  if (edge.length) reach = Math.min(reach, Math.max(...edge));
  // UPRIGHT? The bottom rule of the column runs the full width of the form
  // (it is the top of the Product Name row). On an upright form the label
  // column sits right of the form's middle; on a page upside down, left.
  const full = hs.filter((l) => Math.abs(l.y - last) <= tol);
  const mid = (Math.min(...full.map((l) => l.x0)) + Math.max(...full.map((l) => l.x1))) / 2;
  const x0 = Math.max(0, left - tol), y0 = Math.max(0, target[0] - tol);
  const x1 = Math.min(w, reach + tol), y1 = Math.min(h, last + tol);
  out.push({ ys: best.ys, labelX: [left, labelRight], cols: [...new Set(same.flatMap((c) => [c.a.x, c.b.x]))].sort((p, q) => p - q), upright: (left + reach) / 2 > mid, box: { x: x0, y: y0, w: x1 - x0, h: y1 - y0 } });
  if (out.length >= 6) break;
  }
  return out;
}

/** The best stack alone (the drawn-form checks). */
export function findLabelStack(hs: HLine[], vs: VLine[], w: number, h: number): Stack | null {
  return findLabelStacks(hs, vs, w, h)[0] ?? null;
}

/** HOW FAR THE PAGE IS TILTED, in degrees (positive = the right-hand end of a
 *  ruled line sits LOWER than its left). The ruled lines make the row
 *  profile of the ink sharpest when the page is read at the right angle:
 *  try angles from -4 to +4 degrees and keep the sharpest. */
export function estimateSkew(m: Uint8Array, w: number, h: number): number {
  const step = Math.max(1, Math.round(Math.max(w, h) / 1300));
  let best = 0, bestScore = -1;
  for (let deg = -4; deg <= 4.0001; deg += 0.1) {
    const t = Math.tan((deg * Math.PI) / 180);
    const off = Math.ceil(Math.abs(t) * w) + 1;
    const prof = new Float64Array(h + 2 * off);
    for (let y = 0; y < h; y += step) for (let x = 0; x < w; x += step) {
      if (m[y * w + x]) prof[Math.round(y - x * t) + off]++;
    }
    let s = 0; for (const v of prof) s += v * v;
    if (s > bestScore) { bestScore = s; best = deg; }
  }
  return Math.round(best * 10) / 10;
}

/** The heights at which a ruled line runs across [xa, xb]. A rule on a bent
 *  or tilted page comes in pieces a few pixels apart in height, so pieces
 *  within `tol` of each other count as one rule, and the rule must cover
 *  most of the span between them (a short gap where ink is faint is fine). */
export function rulesAcross(hs: HLine[], xa: number, xb: number, top: number, bot: number, tol: number): number[] {
  const near = hs.filter((l) => l.y >= top && l.y <= bot && l.x1 > xa && l.x0 < xb).sort((p, q) => p.y - q.y);
  const out: number[] = [];
  let i = 0;
  while (i < near.length) {
    const grp = [near[i]];
    while (i + 1 < near.length && near[i + 1].y - grp[grp.length - 1].y <= tol) grp.push(near[++i]);
    i++;
    const spans = grp.map((l) => [Math.max(xa, l.x0), Math.min(xb, l.x1)] as [number, number]).sort((p, q) => p[0] - q[0]);
    let cov = 0, cur = spans[0].slice() as [number, number];
    for (const sp of spans.slice(1)) { if (sp[0] <= cur[1]) cur[1] = Math.max(cur[1], sp[1]); else { cov += cur[1] - cur[0]; cur = sp.slice() as [number, number]; } }
    cov += cur[1] - cur[0];
    if (cov >= 0.6 * (xb - xa)) out.push(Math.round(grp.reduce((t, l) => t + l.y * (l.x1 - l.x0), 0) / grp.reduce((t, l) => t + (l.x1 - l.x0), 0)));
  }
  return out;
}

export interface LinesBox { box: { x: number; y: number; w: number; h: number }; upright: boolean; rows: number; stack: Stack }
export interface LinesResult { boxes: LinesBox[]; why: string }

/** Mask, lines, columns -- in one call, on a grey image (one byte a pixel).
 *  Every stack the lines suggest, best first, within the size limits. They
 *  are CANDIDATES: a table of even rows is common on these forms (a PM
 *  checklist is little else), so the caller confirms one by reading its
 *  label cells before using it (labelCells, labelsConfirm). */
export function gridLines(grey: ArrayLike<number>, w: number, h: number): { hs: HLine[]; vs: VLine[] } {
  const m = inkMask(grey, w, h);
  const L = Math.max(w, h);
  return { hs: horizontalLines(m, w, h, L * 0.05), vs: verticalLines(m, w, h, L * 0.025) };
}

export function findBoxByLines(grey: ArrayLike<number>, w: number, h: number, grid = gridLines(grey, w, h)): LinesResult {
  const stacks = findLabelStacks(grid.hs, grid.vs, w, h);
  if (!stacks.length) return { boxes: [], why: 'no ruled column of even rows like the label column (Engineer Name ... Service Visit Date) was found' };
  const boxes = stacks.filter((st) => st.box.w <= 0.7 * w && st.box.h <= 0.4 * h)
    .map((st) => ({ box: st.box, upright: st.upright, rows: st.ys.length - 1, stack: st }));
  return { boxes, why: boxes.length ? '' : 'the lines gave only boxes too large to be the date box -- not sent' };
}

export interface Cell { row: 'call' | 'visit'; x: number; y: number; w: number; h: number }

/** The cells of the box's two rows, to read the printed labels from: one per
 *  column the rows share, plus a column's width to the LEFT of the first
 *  (where the label column is when its left-hand rule was too faint to
 *  find). Inset from the rules, which spoil the reading. Read on the device
 *  only: these are never sent. */
export function labelCells(st: Stack): Cell[] {
  const cols = st.cols;
  const cw = cols.length > 1 ? cols[1] - cols[0] : st.labelX[1] - st.labelX[0];
  const xs = [Math.max(0, cols[0] - cw), ...cols];
  const out: Cell[] = [];
  const n = st.ys.length;
  for (const [row, i] of [['call', n - 3], ['visit', n - 2]] as const) {
    const ins = Math.round((st.ys[i + 1] - st.ys[i]) * 0.15);
    for (let k = 0; k + 1 < xs.length; k++) {
      const x = xs[k] + ins, y = st.ys[i] + ins, cw2 = xs[k + 1] - ins - x, ch = st.ys[i + 1] - ins - y;
      if (cw2 >= 10 && ch >= 6) out.push({ row, x, y, w: cw2, h: ch });
    }
  }
  return out;
}

/** Do the cells read as the labels? "Service Visit Date" in the lower row
 *  (similarity 0.4 or more: the blurriest sample read "Barve Vist Ons", 0.44)
 *  or "Call No/UC No" in the upper (0.6). Checklist words seen on PM pages --
 *  "Low in O2", "Patient disconnection", "Apnea alarm" -- score 0.25 or less. */
export function labelsConfirm(read: { row: 'call' | 'visit'; text: string }[]): { ok: boolean; label: string } {
  let best = { score: 0, label: '' };
  for (const r of read) {
    const t = r.text.replace(/\s+/g, ' ').trim();
    if (!t) continue;
    const sc = r.row === 'visit' ? similar(t, 'SERVICE VISIT DATE') / 0.4 : similar(t, 'CALL NO UC NO') / 0.6;
    if (sc > best.score) best = { score: sc, label: t };
  }
  return { ok: best.score >= 1, label: best.label };
}

/** A PRINTED LABEL, SNAPPED TO THE RULES AROUND IT (v0.10.256). The PM report
 *  is laid out differently from the Field report -- its label column runs on
 *  below Service Visit Date (Start Time) and its rows are not the Field
 *  form's heights -- so a box worked out from the label's own size took in
 *  Call Type, Status and Start Time, and cut the list of UC Nos short. With
 *  the label found, the rules around it give the real cells:
 *    rows    -- the rule just above and just below the label; for "Service
 *               Visit Date" plus the row above it (Call No/UC No), for
 *               "Call No/UC No" plus the row below it;
 *    left    -- the vertical rule just left of the label;
 *    right   -- past the rule just right of the label (label | value), the
 *               NEXT vertical rule that runs down beside BOTH rows: the end
 *               of the value cells. Nothing beyond it is taken -- on the PM
 *               form other sections sit to the right.
 *  Null when the rules do not bracket the label plausibly: the caller then
 *  keeps the label-sized box. */
export function snapToRules(word: { x0: number; y0: number; x1: number; y1: number }, anchor: 'Service Visit Date' | 'Call No/UC No',
  hs: HLine[], vs: VLine[], w: number, h: number): { x: number; y: number; w: number; h: number } | null {
  const tol = Math.max(6, Math.round(Math.max(w, h) * 0.008));
  const lh = Math.max(1, word.y1 - word.y0), cy = (word.y0 + word.y1) / 2;
  const ys = rulesAcross(hs, word.x0, word.x1, 0, h, tol);
  const above = ys.filter((y) => y < word.y0 + lh * 0.3);
  const below = ys.filter((y) => y > word.y1 - lh * 0.3);
  if (!above.length || !below.length) return null;
  const a = above[above.length - 1], b = below[0];
  const rowH = b - a;
  if (rowH < lh * 1.0 || rowH > lh * 4) return null;
  let top: number, bot: number;
  if (anchor === 'Service Visit Date') {
    if (above.length < 2) return null;
    top = above[above.length - 2]; bot = b;
  } else {
    if (below.length < 2) return null;
    top = a; bot = below[1];
  }
  if (bot - top > rowH * 3.2) return null;          // the neighbour row is not one row
  const spans = (v: VLine, y0: number, y1: number) => v.y0 <= y0 + tol && v.y1 >= y1 - tol;
  const leftRules = vs.filter((v) => v.x <= word.x0 + tol && v.x >= word.x0 - lh * 3 && spans(v, cy, cy));
  const left = leftRules.length ? Math.max(...leftRules.map((v) => v.x)) : word.x0 - lh * 0.3;
  const divider = vs.filter((v) => v.x >= word.x1 - tol && spans(v, cy, cy)).sort((p, q) => p.x - q.x)[0];
  if (!divider) return null;
  const end = vs.filter((v) => v.x > divider.x + lh * 2 && spans(v, top + (bot - top) * 0.25, bot - (bot - top) * 0.25)).sort((p, q) => p.x - q.x)[0];
  if (!end) return null;
  const x0 = Math.max(0, Math.round(left - tol)), y0 = Math.max(0, Math.round(top - tol));
  const x1 = Math.min(w, Math.round(end.x + tol)), y1 = Math.min(h, Math.round(bot + tol));
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}
