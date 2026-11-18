# Non-Auditable Backlog

Items the user has named as **non-auditable requirements**: when **Audit Mode**
is ON, each is to be **hidden** (the screen, the tab, the report or the change
history entry), the way Spare Recycling (NAR-008) already is.

**THIS IS A HOLDING LIST, NOT WORK DONE.** The user, 2026-11-18:

> "I am going to be giving you a List of Items that needs to be Moved into Non
> Auditable Requirement - So when Audit Mode is Enabled all these should be
> Hidden. Dont Act on it directly, Wait for me to "Act on Non Auditable
> Backlog" for now, keep adding these into a Separate Backlog."

Nothing below is hidden yet. When the user says **"Act on Non Auditable
Backlog"**, each item becomes a NAR requirement in `src/lib/validation.ts`, is
hidden in Audit Mode (menu, route and any changelog lines, `auditHidden` /
`auditHiddenChanges`), and is marked done here with the version that did it.

| # | Added | Item (the user's words) | What it covers | Status |
|---|---|---|---|---|
| 1 | 2026-11-18 | "Add a Flag that the Date was Corrected and Present this as a Report. This is a Non-Auditable Requirement, So when i hide it, this visit Date Check should be hidden along with this Report." | **Reports → Visit Date Check** (`/visit-date-check`) as a whole — its tabs Daily cut-outs, Haiku Read and **Corrected dates** (0489, v0.10.265) — and the Version History entries for v0.10.252–v0.10.265 that describe it. The report itself is BUILT (v0.10.265); only the hiding waits. | Waiting for "Act on Non Auditable Backlog" |
