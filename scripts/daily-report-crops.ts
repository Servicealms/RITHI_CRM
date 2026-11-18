// ===========================================================================
// DAILY CUT-OUTS OF THE SERVICE VISIT DATE (0487) -- run by
// .github/workflows/daily-report-crops.yml every morning at 06:00 India time
// (the user, 2026-11-17: "do this check for all calls with report updated
// yesterday ... without involving Haiku.. just the presentation of data").
//
// For every visit whose Visit Entry Date (reports.updated_at) fell on one of
// the last DAYS days (India time, up to yesterday), that has a manual report
// and has not been cropped yet:
//   1. open the report through the CallReg bridge (the same `drivefile`
//      action the app uses), page 1 of a PDF rendered by pdftoppm;
//   2. find the "Call No/UC No + Service Visit Date" box exactly as the app
//      does (src/lib/reportOcr.ts) -- levelled, by the ruled lines with the
//      label cells read to confirm them (src/lib/reportGrid.ts), else by the
//      printed label fitted to the rules around it -- tried upright, then
//      turned 180, 90, 270;
//   3. store the cut-out (a small JPEG) in public.visit_report_crops.
// NO MODEL IS CALLED. The full report exists only in this runner's memory and
// a temp folder deleted at the end; only the cut-out is stored, in Supabase.
//
// THE REPOSITORY AND ITS LOGS ARE PUBLIC: this prints COUNTS ONLY -- never a
// UCN, a name, a link or a file name.
//
// Local check without a database: `node <bundle> --file report.jpg` prints
// what it found and writes the cut-out beside the file.
// ===========================================================================
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync, rmSync, existsSync, appendFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import sharp from 'sharp';
import Tesseract from 'tesseract.js';
import { findBoxByLines, gridLines, snapToRules, inkMask, estimateSkew, labelCells, labelsConfirm, formRegion } from '../src/lib/reportGrid';
import { findReportBox, type OcrLine, type CropBox } from '../src/lib/reportCrop';
import { driveFileId } from '../src/lib/drive';

const TARGET = 2600;              // the long side the app reads at (reportOcr.ts)
const DAYS = Math.max(1, Math.min(31, Number(process.env.DAYS || 3)));
// ONE CHOSEN DAY (the user, 2026-11-18: "Add a provision to run it manually for
// a choosen date"): DATE=YYYY-MM-DD crops the visits ENTERED on that India-time
// day instead of the look-back window. Anything else is refused, not guessed.
const DATE = (process.env.DATE ?? '').trim();
if (DATE && !/^\d{4}-\d{2}-\d{2}$/.test(DATE)) { console.log('::error::DATE must be YYYY-MM-DD'); process.exit(1); }
const DB = process.env.SUPABASE_DB_URL ?? '';
const work = mkdtempSync(join(tmpdir(), 'crops-'));

// The bridge URL: the app's own default, read from the one place it is kept.
const BRIDGE = process.env.BRIDGE_URL
  || /const DEFAULT_SHEETS_URL = '([^']+)'/.exec(readFileSync(join(process.cwd(), 'src/lib/sheets.ts'), 'utf8'))?.[1] || '';

type Worker = Awaited<ReturnType<typeof Tesseract.createWorker>>;
let worker: Worker | null = null;
async function ocr(): Promise<Worker> {
  if (!worker) {
    worker = await Tesseract.createWorker('eng', 1, {
      langPath: join(process.cwd(), 'node_modules/@tesseract.js-data/eng/4.0.0_best_int'),
      cacheMethod: 'none', gzip: true,
    });
  }
  return worker;
}

interface Page { png: Buffer; grey: Buffer; w: number; h: number }

/** A page at ~2,600 px, greyed and contrasted as the app does, turned by `deg`. */
async function prep(src: Buffer, deg: 0 | 90 | 180 | 270, already = false): Promise<Page> {
  const m = await sharp(src).metadata();
  const s = TARGET / Math.max(m.width ?? TARGET, m.height ?? TARGET);
  let pipe = sharp(src).flatten({ background: '#ffffff' })
    .resize(Math.round((m.width ?? TARGET) * s), Math.round((m.height ?? TARGET) * s))
    .rotate(deg).grayscale();
  // A zoomed-in cut of a page already greyed and contrasted is not done twice.
  if (!already) pipe = pipe.linear(1.4, -51.2);
  const png = await pipe.png().toBuffer();
  return withGrey(png);
}
async function withGrey(png: Buffer): Promise<Page> {
  const { data, info } = await sharp(png).extractChannel(0).raw().toBuffer({ resolveWithObject: true });
  return { png, grey: data, w: info.width, h: info.height };
}
async function level(p: Page): Promise<{ page: Page; skew: number }> {
  const skew = estimateSkew(inkMask(p.grey, p.w, p.h), p.w, p.h);
  if (Math.abs(skew) < 0.2) return { page: p, skew: 0 };
  const turned = await sharp(p.png).rotate(-skew, { background: '#ffffff' }).png().toBuffer();
  return { page: await withGrey(turned), skew };
}

async function readCell(p: Page, c: { x: number; y: number; w: number; h: number }): Promise<string> {
  const w = await ocr();
  await w.setParameters({ tessedit_pageseg_mode: '7' as never });
  const buf = await sharp(p.png).extract({ left: c.x, top: c.y, width: c.w, height: c.h })
    .resize({ height: 90 }).extend({ top: 20, bottom: 20, left: 20, right: 20, background: '#ffffff' }).png().toBuffer();
  return ((await w.recognize(buf)).data.text ?? '').trim();
}
async function readPage(p: Page): Promise<OcrLine[]> {
  const w = await ocr();
  await w.setParameters({ tessedit_pageseg_mode: '3' as never });
  const { data } = await w.recognize(p.png, {}, { blocks: true });
  const lines: OcrLine[] = [];
  for (const b of data.blocks ?? []) for (const para of b.paragraphs) for (const l of para.lines) {
    lines.push({ words: l.words.map((x) => ({ text: x.text, x0: x.bbox.x0, y0: x.bbox.y0, x1: x.bbox.x1, y1: x.bbox.y1 })) });
  }
  return lines;
}

interface Found { status: 'found' | 'no_box'; method: string; note: string; crop: string }

/** The app's cropReportBox, server side. */
interface Seen { w: number; h: number; skew: number; tables: number; words: number; why: string }

/** One pass over a picture, upright then turned 180, 90, 270. */
async function onePass(src: Buffer, already: boolean, seen: Seen): Promise<Found | null> {
  for (const deg of [0, 180, 90, 270] as const) {
    const { page, skew } = await level(await prep(src, deg, already));
    if (deg === 0) { seen.w = page.w; seen.h = page.h; seen.skew = skew; }
    const grid = gridLines(page.grey, page.w, page.h);
    const r = findBoxByLines(page.grey, page.w, page.h, grid);
    const turn = `${deg ? `, turned ${deg}°` : ''}${skew ? `, levelled ${skew}°` : ''}${already ? ', zoomed into the form' : ''}`;
    const upright = r.boxes.filter((b) => b.upright);
    seen.tables = Math.max(seen.tables, upright.length);
    for (const cand of upright) {
      const read: { row: 'call' | 'visit'; text: string }[] = [];
      for (const cell of labelCells(cand.stack)) read.push({ row: cell.row, text: await readCell(page, cell) });
      const ok = labelsConfirm(read);
      if (ok.ok) return { status: 'found', method: 'lines', note: `by the ruled lines, label read as "${ok.label}"${turn}`, crop: await jpeg(page, cand.box) };
    }
    const lines = await readPage(page);
    seen.words = Math.max(seen.words, lines.reduce((t, l) => t + l.words.length, 0));
    const { box, why, word } = findReportBox(lines, page.w, page.h);
    if (box && word && box.anchor !== 'Ruled lines') {
      const snapped = snapToRules(word, box.anchor, grid.hs, grid.vs, page.w, page.h);
      const fits = snapped && snapped.w <= 0.7 * page.w && snapped.h <= 0.4 * page.h;
      const b: CropBox | { x: number; y: number; w: number; h: number } = fits ? snapped! : box;
      return { status: 'found', method: fits ? 'label+lines' : 'label',
               note: `by the printed label "${box.label}"${fits ? ', cut at the ruled lines' : ''}${turn}`, crop: await jpeg(page, b) };
    }
    if (!seen.why) seen.why = why;
  }
  return null;
}

/** The app's cropReportBox, server side -- and, when nothing is found, a
 *  second pass ZOOMED INTO THE FORM (v0.10.262): a whole sheet photographed
 *  with the form small in the frame. A "no box" says what was seen. */
async function cropReport(src: Buffer): Promise<Found> {
  const seen: Seen = { w: 0, h: 0, skew: 0, tables: 0, words: 0, why: '' };
  const first = await onePass(src, false, seen);
  if (first) return first;
  // Where the form is, on the levelled upright page; cut to it and try again.
  const { page } = await level(await prep(src, 0));
  const reg = formRegion(page.grey, page.w, page.h);
  let zoomed = 'no smaller form area to zoom into';
  if (reg) {
    const cut = await sharp(page.png).extract({ left: reg.x, top: reg.y, width: reg.w, height: reg.h }).png().toBuffer();
    const second = await onePass(cut, true, { ...seen });
    if (second) return second;
    zoomed = `zoomed into the form area (${Math.round(100 * reg.w / page.w)}% x ${Math.round(100 * reg.h / page.h)}% of the page) and tried again`;
  }
  const note = `${seen.why || 'no box found'} -- page ${seen.w}x${seen.h} px, tilt ${seen.skew}°, ` +
    `${seen.tables} ruled table${seen.tables === 1 ? '' : 's'} of even rows, ${seen.words} words read; ${zoomed}`;
  return { status: 'no_box', method: '', note: note.slice(0, 480), crop: '' };
}

async function jpeg(p: Page, b: { x: number; y: number; w: number; h: number }): Promise<string> {
  const x = Math.max(0, Math.round(b.x)), y = Math.max(0, Math.round(b.y));
  // To the page's right edge, whatever width the box found (the user,
  // 2026-11-18: "Keep only the starting point on the left, go till end of the
  // width") -- the app does the same (reportOcr.ts).
  const w = p.w - x, h = Math.min(p.h - y, Math.round(b.h));
  const out = await sharp(p.png).extract({ left: x, top: y, width: w, height: h })
    .resize({ width: 900, height: 900, fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 72 }).toBuffer();
  return `data:image/jpeg;base64,${out.toString('base64')}`;
}

/** Page 1 of a PDF as a PNG (pdftoppm, poppler-utils). */
function pdfPage1(pdf: Buffer): Buffer {
  const inp = join(work, 'in.pdf'), out = join(work, 'page');
  writeFileSync(inp, pdf);
  const r = spawnSync('pdftoppm', ['-f', '1', '-l', '1', '-r', '200', '-png', '-singlefile', inp, out]);
  if (r.status !== 0 || !existsSync(`${out}.png`)) throw new Error('pdftoppm could not render page 1');
  const png = readFileSync(`${out}.png`);
  rmSync(`${out}.png`, { force: true }); rmSync(inp, { force: true });
  return png;
}

async function openReport(link: string): Promise<{ ok: true; bytes: Buffer } | { ok: false; why: string }> {
  const id = driveFileId(link);
  if (!id) return { ok: false, why: 'no Drive id' };
  if (!BRIDGE) return { ok: false, why: 'no bridge URL' };
  try {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), 90_000);
    const res = await fetch(`${BRIDGE}?action=drivefile&id=${encodeURIComponent(id)}`, { redirect: 'follow', signal: ctl.signal });
    clearTimeout(t);
    if (!res.ok) return { ok: false, why: `bridge ${res.status}` };
    const j = await res.json() as { ok?: boolean; mimeType?: string; dataBase64?: string; error?: string };
    if (!j.ok || !j.dataBase64) return { ok: false, why: 'bridge refused' };
    const raw = Buffer.from(j.dataBase64, 'base64');
    if (/pdf/i.test(j.mimeType ?? '')) return { ok: true, bytes: pdfPage1(raw) };
    if (/^image\//i.test(j.mimeType ?? '')) return { ok: true, bytes: raw };
    return { ok: false, why: 'not a photo or PDF' };
  } catch {
    return { ok: false, why: 'bridge unreachable' };
  }
}

function psql(sql: string): string {
  const r = spawnSync('psql', [DB, '-X', '-q', '-At', '-v', 'ON_ERROR_STOP=1'], { input: sql, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });
  // The URI holds the password: an error is reported without it.
  if (r.status !== 0) throw new Error(`database error: ${(r.stderr || '').replace(DB, '<db>').split('\n')[0]}`);
  return r.stdout;
}

interface Visit { uid: string; ucn: string; engineer: string; visit_at: string | null; entry_at: string | null; entry_day: string; manual_report: string }

async function main() {
  // Local check: --file <path>
  const fi = process.argv.indexOf('--file');
  if (fi > 0) {
    const f = process.argv[fi + 1];
    const raw = readFileSync(f);
    const bytes = /\.pdf$/i.test(f) ? pdfPage1(raw) : raw;
    const t0 = Date.now();
    const r = await cropReport(bytes);
    console.log(`${r.status} · ${r.method} · ${r.note} · ${Date.now() - t0} ms`);
    if (r.crop) writeFileSync(`${f}.crop.jpg`, Buffer.from(r.crop.split(',')[1], 'base64'));
    return;
  }
  if (!DB) { console.log('::warning::SUPABASE_DB_URL is not set -- nothing to do.'); return; }

  const today = "(now() at time zone 'Asia/Kolkata')::date";
  const visits: Visit[] = JSON.parse(psql(`
    select coalesce(json_agg(t), '[]') from (
      select r.uid, r.ucn, coalesce(r.engineer, '') as engineer, r.visit_at, r.updated_at as entry_at,
             (r.updated_at at time zone 'Asia/Kolkata')::date as entry_day, r.manual_report
        from public.reports r
       where coalesce(r.manual_report, '') <> '' and coalesce(r.uid, '') <> ''
         and ${DATE ? `(r.updated_at at time zone 'Asia/Kolkata')::date = date '${DATE}'`
                    : `(r.updated_at at time zone 'Asia/Kolkata')::date between ${today} - ${DAYS} and ${today} - 1`}
         and not exists (select 1 from public.visit_report_crops c where c.report_uid = r.uid)
       order by r.updated_at, r.id
       limit 3000) t;`).trim() || '[]');

  const tally = { visits: visits.length, found: 0, lines: 0, label: 0, noBox: 0, notOpened: 0, reused: 0 };
  const byLink = new Map<string, Found>();   // one report shared by several visits is cropped once
  for (const v of visits) {
    const t0 = Date.now();
    let found = byLink.get(v.manual_report);
    if (found) tally.reused++;
    else {
      const opened = await openReport(v.manual_report);
      if (!opened.ok) { tally.notOpened++; continue; }   // not stored: tried again next run
      try { found = await cropReport(opened.bytes); } catch { tally.notOpened++; continue; }
      byLink.set(v.manual_report, found);
    }
    if (found.status === 'found') { tally.found++; if (found.method === 'lines') tally.lines++; else tally.label++; } else tally.noBox++;
    const row = { ...v, status: found.status, method: found.method, note: found.note, crop_jpeg: found.crop, ms: Date.now() - t0 };
    psql(`insert into public.visit_report_crops
            (report_uid, ucn, engineer, visit_at, entry_at, entry_day, manual_report, status, method, note, crop_jpeg, ms)
          select x.uid, x.ucn, x.engineer, x.visit_at, x.entry_at, x.entry_day, x.manual_report, x.status, x.method, x.note, x.crop_jpeg, x.ms
            from json_to_record($j$${JSON.stringify(row).replace(/\$j\$/g, '')}$j$::json)
                 as x(uid text, ucn text, engineer text, visit_at timestamptz, entry_at timestamptz, entry_day date,
                      manual_report text, status text, method text, note text, crop_jpeg text, ms integer)
          on conflict (report_uid) do nothing;`);
  }
  const line = `${DATE ? `Visits entered on ${DATE}` : `Visits entered in the last ${DAYS} day(s) up to yesterday`}, not yet cropped: ${tally.visits} · box found ${tally.found} (lines ${tally.lines}, label ${tally.label}) · no box ${tally.noBox} · could not open ${tally.notOpened} (tried again next run) · same report reused ${tally.reused}`;
  console.log(line);
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `### Daily Visit Date cut-outs\n\n${line}\n`);
}

main()
  .catch((e) => { console.log(`::error::${e instanceof Error ? e.message : String(e)}`); process.exitCode = 1; })
  .finally(async () => { await worker?.terminate(); rmSync(work, { recursive: true, force: true }); });
