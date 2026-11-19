// ===========================================================================
// A MACHINE'S COVER, AS OF TODAY (the user, 2026-10-15, Product & Party Search:
// "Current Item Status ... If warranty is Active then highlight those details,
// if Contract is active highlight those details. Add a Filter with Potential
// Expiry in the Current and Next Month. And a Separate filter for Products in
// OGP").
//
// Settled with the user the same day:
//   * the CURRENT status is worked out for TODAY from the dates, by the
//     database's own rule (sync_product_machine, 0391): a contract active
//     today is its type (CMC / AMC); else a warranty active today is WGP; else
//     a machine with any warranty or contract on record is OGP; one with none
//     keeps the status it was stored with. The stored status is only worked
//     out when a machine's records change, so it can be days out of date;
//   * EXPIRING is a warranty OR contract still active today whose end date
//     falls on or before the last day of NEXT month.
//
// Pure, no imports beyond the cover vocabulary, and TODAY is passed in -- so
// check:ui can pin the rule itself. Dates are yyyy-mm-dd and compare as text.
// ===========================================================================
import { coverCode } from './fieldcall';

type Sheet = Record<string, unknown>;
const s = (r: Sheet, k: string) => String(r[k] ?? '').trim();
const day = (v: string) => (/^\d{4}-\d{2}-\d{2}/.test(v) ? v.slice(0, 10) : '');

export const warrantyEnd = (r: Sheet) => day(s(r, 'Warranty End Date'));
export const contractEnd = (r: Sheet) => day(s(r, 'Contract End Date'));

/** The warranty is in force today. */
export function warrantyActive(r: Sheet, today: string): boolean {
  const e = warrantyEnd(r);
  return !!e && e >= today;
}
/** The contract is in force today. */
export function contractActive(r: Sheet, today: string): boolean {
  const e = contractEnd(r);
  return !!e && e >= today;
}

/** The cover a machine has TODAY: CMC / AMC / WGP / OGP, else as stored. */
export function currentItemStatus(r: Sheet, today: string): string {
  if (contractActive(r, today)) return coverCode(s(r, 'Contract Type')) || 'CMC';
  if (warrantyActive(r, today)) return 'WGP';
  const onRecord = warrantyEnd(r) || contractEnd(r) || s(r, 'Warranty Number') || s(r, 'Contract Number');
  if (onRecord) return 'OGP';
  return coverCode(s(r, 'Item Status'));
}

/** contract_cover_code() (0218), the client copy: a contract TYPE as its
 *  cover code -- labour AMC, comprehensive CMC, anything else through the cover
 *  vocabulary and otherwise unchanged; blank is ''. */
export function contractCoverCode(v: unknown): string {
  const raw = String(v ?? '').trim();
  if (!raw) return '';
  const k = raw.toLowerCase().replace(/[^a-z0-9]/g, '');
  if (['labour', 'labor', 'labourcontract', 'laborcontract', 'amc', 'annualmaintenancecontract', 'underamc', 'labouramc', 'laboramc'].includes(k)) return 'AMC';
  if (['comprehensive', 'comprehensivecontract', 'cmc', 'comprehensivemaintenancecontract', 'undercmc'].includes(k)) return 'CMC';
  return coverCode(raw);
}

/** THE PRODUCT DATABASE'S ITEM STATUS FOR TODAY -- the server view's rule
 *  (public.product_database, 0235/0239), on the device copy (the user,
 *  2026-11-19: "Contract Expired Yesterday, but still the Status shows as CMC
 *  in Product Database"; "It needs to reflect in Product Database - which is
 *  called for during Call Registeration"). The copy holds the STORED status,
 *  written only when a machine's records change, so a contract that ran out
 *  went on reading CMC -- and a call registered on it was CMC too. WARRANTY
 *  FIRST, then the contract (its type, or CONTRACT (TYPE NOT RECORDED)), else
 *  OGP -- the view's words exactly, so the device and the server agree. */
export function itemStatusToday(r: Sheet, today: string): string {
  if (warrantyActive(r, today)) return 'WGP';
  if (contractActive(r, today)) return contractCoverCode(s(r, 'Contract Type')) || 'CONTRACT (TYPE NOT RECORDED)';
  return 'OGP';
}

// THE MONTH WINDOWS (the user, 2026-10-15: "Both Expiring this month, expiring
// next month ... All, Expiring this month, expiring next month, OGP"; asked:
// this month is the WHOLE month, the 1st to the last day, so cover that already
// ended earlier this month is in it). Calendar arithmetic, not a Date, so no
// time zone can move a day.
const lastDay = (y: number, m: number) => {
  const leap = (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
  return [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][m - 1];
};
/** The first and last day of the month `offset` months after `today`'s. */
export function monthBounds(today: string, offset = 0): { from: string; to: string } {
  const [y0, m0] = today.split('-').map(Number);
  const k = (m0 - 1) + offset;
  const y = y0 + Math.floor(k / 12);
  const m = ((k % 12) + 12) % 12 + 1;
  const mm = String(m).padStart(2, '0');
  return { from: `${y}-${mm}-01`, to: `${y}-${mm}-${String(lastDay(y, m)).padStart(2, '0')}` };
}
/** The last day of the month after `today`'s, yyyy-mm-dd. */
export function endOfNextMonth(today: string): string {
  return monthBounds(today, 1).to;
}

/** Which cover ends between `from` and `to` (inclusive), in words -- '' when
 *  neither the warranty nor the contract does. */
export function coverEndingIn(r: Sheet, from: string, to: string): string {
  const parts: string[] = [];
  const w = warrantyEnd(r), c = contractEnd(r);
  if (w && w >= from && w <= to) parts.push(`Warranty ${w}`);
  if (c && c >= from && c <= to) parts.push(`Contract ${c}`);
  return parts.join(' · ');
}
