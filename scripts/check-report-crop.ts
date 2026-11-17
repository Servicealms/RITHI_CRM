// check:reportcrop -- the crop rule behind the report-date check (src/lib/reportCrop.ts).
// Pure: no reader, no browser. The words are shaped like what the on-device
// reader returned for the user's own sample (2026-11-17), misreads included.
import { findReportBox, findVisitLabel, findCallNoLabel, similar, type OcrLine } from '../src/lib/reportCrop';
import { findBoxByLines, inkMask, estimateSkew } from '../src/lib/reportGrid';

let failed = 0;
const ok = (label: string, cond: boolean) => { console.log(`${cond ? '  ✓' : '  ✗'} ${label}`); if (!cond) failed++; };
const W = (text: string, x0: number, y0: number, x1: number, y1: number) => ({ text, x0, y0, x1, y1 });

// The sample as read: misspelt labels, the handwritten values beside them.
const sample: OcrLine[] = [
  { words: [W('SERVICE', 700, 150, 820, 175), W('REPORT', 830, 150, 960, 175)] },
  { words: [W('Call', 720, 330, 745, 345), W('Type', 750, 330, 780, 345), W('BD/PM', 800, 330, 850, 345)] },
  { words: [W('Call', 720, 352, 745, 367), W('HeslC', 750, 352, 790, 367), W('Ns', 795, 352, 810, 367), W('26K', 840, 350, 880, 370)] },
  { words: [W('Service', 720, 374, 765, 389), W('Vist', 770, 374, 795, 389), W('Das', 800, 374, 822, 389), W('13/11/2026', 840, 372, 950, 392)] },
  { words: [W('CUSTOMER', 60, 300, 160, 315), W('NAME', 165, 300, 210, 315)] },
];

console.log('-- the matcher --');
ok('"Vist" reads as VISIT, "SERVICE REPORT" does not', !!findVisitLabel(sample) && findVisitLabel(sample)!.text.startsWith('Service Vist'));
ok('"Call HeslC Ns" is not taken as Call No/UC No (unreadable), "Call Type" never is',
   findCallNoLabel(sample) === null || !/Type/i.test(findCallNoLabel(sample)!.text));
ok('"Call No/UC No." is found when read cleanly', !!findCallNoLabel([{ words: [W('Call', 0, 0, 20, 10), W('No/UC', 22, 0, 50, 10), W('No.', 52, 0, 64, 10)] }]));
ok('"Call Date" is never taken as Call No/UC No', findCallNoLabel([{ words: [W('Call', 0, 0, 20, 10), W('Date', 22, 0, 50, 10)] }]) === null);
ok('similar() forgives one wrong letter', similar('Vist', 'VISIT') >= 0.6 && similar('Servlce', 'SERVICE') >= 0.7);

console.log('-- the box --');
const { box } = findReportBox(sample, 2000, 700);
ok('a box is found, from Service Visit Date', !!box && box.anchor === 'Service Visit Date');
ok('it covers the Call No/UC No row above and the date row', !!box && box.y <= 352 && box.y + box.h >= 392);
ok('it reaches the handwritten values to the right', !!box && box.x + box.w >= 950);
ok("it stays clear of the customer's side of the form", !!box && box.x > 210);
const none = findReportBox([{ words: [W('CUSTOMER', 60, 300, 160, 315)] }], 2000, 700);
ok('no label, no box -- and the reason is given', none.box === null && /neither/.test(none.why));
const huge = findReportBox([{ words: [W('Service', 100, 100, 400, 300), W('Visit', 420, 100, 700, 300)] }], 1000, 800);
ok('a box too large to be the date box is refused, not sent', huge.box === null && /too large/.test(huge.why));

console.log('-- the box by the ruled lines (reportGrid.ts) --');
// A page drawn with the form's layout: customer box on the left, the label
// column (5 equal rows) and the value column on the right, the Product Name
// row below with its own divider. 1000 x 700, white, rules 3 px.
function form(opts: { gapInRule?: boolean; tilt?: number } = {}) {
  const w = 1000, h = 700, g = new Uint8Array(w * h).fill(255);
  const t = Math.tan(((opts.tilt ?? 0) * Math.PI) / 180);
  const dot = (x: number, y: number) => { const yy = Math.round(y + (x - 500) * t); for (let k = 0; k < 3; k++) if (yy + k >= 0 && yy + k < h) g[(yy + k) * w + x] = 20; };
  const hl = (y: number, x0: number, x1: number, skip?: [number, number]) => { for (let x = x0; x <= x1; x++) if (!skip || x < skip[0] || x > skip[1]) dot(x, y); };
  const vl = (x: number, y0: number, y1: number) => { for (let y = y0; y <= y1; y++) for (let k = 0; k < 3; k++) g[Math.round(y + (x - 500) * t) * w + x + k] = 20; };
  hl(100, 50, 950); hl(350, 50, 950); hl(420, 50, 950);              // table top, Product Name row
  for (const y of [150, 200, 250]) hl(y, 550, 950);                  // label rows
  hl(300, 550, 950, opts.gapInRule ? [600, 640] : undefined);          // Call No/UC No row top
  for (const y of [160, 210, 260, 310]) hl(y, 70, 520);               // customer writing lines
  vl(50, 100, 420); vl(950, 100, 420);                                 // form edges
  vl(550, 100, 350); vl(680, 100, 350);                                // the label column
  vl(800, 150, 200); vl(400, 350, 420);                                // Call Date, Serial Nos
  return { g, w, h };
}
{
  const { g, w, h } = form();
  const r = findBoxByLines(g, w, h);
  ok('the label column is found from the lines alone: 5 rows', !!r.box && r.rows === 5);
  ok('the box is the Call No/UC No and Service Visit Date rows', !!r.box && Math.abs(r.box.y - 250) <= 12 && Math.abs(r.box.y + r.box.h - 350) <= 12);
  ok('from the label column to the form\'s right-hand rule', !!r.box && Math.abs(r.box.x - 550) <= 12 && Math.abs(r.box.x + r.box.w - 950) <= 12);
  ok('clear of the customer\'s side (its lines end at 520)', !!r.box && r.box.x > 520);
  ok('read as upright', r.upright);
  const flip = Uint8Array.from(g).reverse();
  ok('the same page upside down is found and said to be upside down', findBoxByLines(flip, w, h).upright === false);
}
{
  const { g, w, h } = form({ gapInRule: true });
  ok('a rule broken where the ink is faint still counts', findBoxByLines(g, w, h).rows === 5);
}
{
  const { g, w, h } = form({ tilt: 1 });
  const sk = estimateSkew(inkMask(g, w, h), w, h);
  ok(`a page tilted 1 degree is measured as tilted about 1 degree (${sk})`, Math.abs(sk - 1) <= 0.2);
  ok('an upright page measures no tilt', estimateSkew(inkMask(form().g, w, h), w, h) === 0);
}
{
  const blank = new Uint8Array(1000 * 700).fill(255);
  const r = findBoxByLines(blank, 1000, 700);
  ok('a page without the form gives no box, with the reason', r.box === null && /not found/.test(r.why));
}

console.log(failed ? `\n${failed} FAILED` : '\nall passed');
process.exit(failed ? 1 : 0);
