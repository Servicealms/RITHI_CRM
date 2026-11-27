// ===========================================================================
// A MISSED PM -- the PM register's flag (the user, 2026-10-16: "In PM register,
// add a flag in all Missed PM"; asked: the rule the PM objective already uses,
// shown as a badge on the row, a column in the register and its CSV, a filter,
// and in the opened call).
//
// A MISSED PM is a PM call whose Added On date falls after the last day of the
// month it is registered for -- a March PM added in October (0418, the
// objective's rule, word for word). A call with no Added On date is never a
// Missed PM: nothing says it was added late. Every call PM Due generates for a
// missed visit is one, since it is dated the 1st of that visit's month and
// Added On the day it is made.
//
// "After the last day of the month" is "in a later month", so the two dates are
// compared by their year and month alone. Pure, so check:ui pins the rule.
// ===========================================================================
import { toIsoDate } from './dates';

const month = (v: unknown): string => (toIsoDate(v) ?? '').slice(0, 7);

/** Is this PM call a Missed PM -- Added On in a later month than it is registered for? */
export function isMissedPm(regDate: unknown, addedOn: unknown): boolean {
  const reg = month(regDate), added = month(addedOn);
  return !!reg && !!added && added > reg;
}

export const MISSED_PM_LABEL = 'Missed PM';

/** THE PM HIDE RULES (Admin Config) -- three tick boxes, any of them on (the
 *  user, 2026-11-27: "Hide All PM Calls with Flag Missed PM, Hide All Unsolved
 *  PM Calls with Flag Missed PM, Hide All Canceled PM Calls with Flag Missed PM
 *  -- It is multiple tick box"):
 *   all       every Missed PM call, solved ones too;
 *   unsolved  a Missed PM call that is neither Solved nor Cancelled -- open,
 *             report pending or reopened;
 *   cancelled a cancelled Missed PM call.
 *  (Until 2026-11-27 "unsolved" also hid cancelled calls; cancelled is its own
 *  box now.) A call that is not a Missed PM is never hidden. */
export interface PmHideRules { all: boolean; unsolved: boolean; cancelled: boolean }
export const NO_PM_HIDE: PmHideRules = { all: false, unsolved: false, cancelled: false };
export const pmHideOn = (r: PmHideRules) => r.all || r.unsolved || r.cancelled;
export function hiddenByMissedPmRule(rules: PmHideRules, regDate: unknown, addedOn: unknown, callState: unknown): boolean {
  if (!pmHideOn(rules) || !isMissedPm(regDate, addedOn)) return false;
  if (rules.all) return true;
  const s = String(callState ?? '').trim();
  if (s === 'Cancelled') return rules.cancelled;
  return rules.unsolved && s !== 'Solved';
}
export const MISSED_PM_TITLE = 'Added On after the month it is registered for';
