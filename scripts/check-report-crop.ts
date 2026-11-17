// check:reportcrop -- the crop rule behind the report-date check (src/lib/reportCrop.ts).
// Pure: no reader, no browser. The words are shaped like what the on-device
// reader returned for the user's own sample (2026-11-17), misreads included.
import { findReportBox, findVisitLabel, findCallNoLabel, similar, type OcrLine } from '../src/lib/reportCrop';

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

console.log(failed ? `\n${failed} FAILED` : '\nall passed');
process.exit(failed ? 1 : 0);
