# Documentation backlog

The user, 2026-11-27: *"dont update documentation for now, we can do that after
all the work is completed. Just keep a Track of the changes in a Documentation
backlog and we can do it later - keep it brief, keep all the logics."*

Each entry below is a change whose documentation has **not** been written yet.
Write it up into the places named, then delete the entry. Until then the code is
the fact; these notes hold every rule so nothing is lost.

Places a change usually reaches: `docs/HOW_TO_USE.md` (handbook) ·
`src/lib/validation.ts` (URS / FRS / OQ) then `npm run docs:reqs` ·
`src/lib/moduleGuide.ts` · `src/lib/flows.ts` · `CLAUDE.md` · `docs/BACKLOG.md`.

Changes up to v0.10.281 (Call History screen, DCCR History, the three Missed PM
hide boxes) are already documented.

---

<!-- New entries go below, newest first. Format:
## vX.Y.Z — title (date)
- What changed, and every rule/decision behind it.
- Where it must be written: handbook section, FRS to add/amend, module guide, etc.
-->

## v0.10.282 — No "N Missed PM calls hidden" line (2026-11-27)
- The PM register and Pending Calls no longer show how many Missed PM calls the hide rules left out (the user: "Remove the line"). The rules themselves are unchanged (all / unsolved / cancelled boxes, FRS-131.24); Admin Config → PM Calls still shows which are on, and is NOT hidden in Audit Mode.
- Asked for (not built): making the rules a Non-Auditable Requirement hidden in Audit Mode while still hiding the calls. Declined because it would show an auditor a PM register with Missed PM calls removed and no trace of why. Open alternative offered: switch the rules off while Audit Mode is on.
- Write up: HOW_TO_USE PM register "Hiding Missed PM calls" (drop "says how many it left out"); FRS-131.24 (drop "saying how many and what"); the Admin Config card text is already updated.
