import { coverCode } from './fieldcall';

// ===========================================================================
// THE FINANCIAL RULE OF THE PRODUCT STATUS CHECK (the user, 2026-11-28).
//
//   NON-IMPACTING: OGP -> CMC, OGP -> AMC, WGP -> CMC.
//   IMPACT:        CMC -> OGP, CMC -> AMC, WGP -> OGP, WGP -> AMC --
//   EXCEPT each of those four is NON-IMPACTING when no spare was requested
//   and none was consumed on the call.
//
// In one line: a spare is FREE under WGP and CMC and CHARGED under OGP and
// AMC; a change has an impact when the call read FREE and the correct status
// is CHARGED -- the spares on it should have been charged -- and only if a
// spare was requested or consumed. Every other change (charged -> free, or
// within the same charging) costs nothing. A status this cannot place (a
// contract with no type, a blank) is treated as possibly free -> charged, so
// it is never waved through, and the same exception applies.
// ===========================================================================

export type Charge = 'Charged' | 'Free' | 'Unknown';
export const chargeOf = (status: string): Charge => {
  const c = coverCode(status);
  return c === 'OGP' || c === 'AMC' ? 'Charged' : c === 'WGP' || c === 'CMC' ? 'Free' : 'Unknown';
};

export interface ImpactJudgement { impact: boolean; charge: string; note: string }

export function financialImpact(stored: string, correct: string, sparesRequested: number, sparesConsumed: number): ImpactJudgement {
  const before = chargeOf(stored);
  const after = chargeOf(correct);
  const charge = `${before} → ${after}`;
  const freeToCharged = (before === 'Free' && after === 'Charged') || before === 'Unknown' || after === 'Unknown';
  if (!freeToCharged) {
    return { impact: false, charge,
      note: before === after ? 'None — spare charging is the same' : 'None — the call was chargeable; it is free at registration' };
  }
  if (sparesRequested === 0 && sparesConsumed === 0) {
    return { impact: false, charge, note: 'None — no spare requested or consumed on the call' };
  }
  return { impact: true, charge,
    note: `Spares should have been charged — ${sparesRequested} requested, ${sparesConsumed} consumed` };
}
