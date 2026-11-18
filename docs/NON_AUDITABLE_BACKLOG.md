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
| 2 | 2026-11-18 | "KPI & Failure Analysis" | **Quality & Analytics → KPI & Failure Analysis** (`/kpi`) and its Version History entries. | Waiting for "Act on Non Auditable Backlog" |
| 3 | 2026-11-18 | "Objective" | **Objective** (`/objective`) and its Version History entries. | Waiting for "Act on Non Auditable Backlog" |
| 4 | 2026-11-18 | "Spare Insight" | **Spare Insights** (`/spare-insights`) and its Version History entries. | Waiting for "Act on Non Auditable Backlog" |
| 5 | 2026-11-18 | "Training Module" | **Training** (`/training`) and its Version History entries. | Waiting for "Act on Non Auditable Backlog" |
| 6 | 2026-11-18 | "Product Database 2.0" | **Product Database 2.0** (`/product-database-2`) and its Version History entries. The original Product Database (`/product-database`) is NOT on this list. | Waiting for "Act on Non Auditable Backlog" |
| 7 | 2026-11-18 | "Indoor and Everything under that" | The whole **Indoor Service** menu group: Indoor Service Register (`/indoor`), Spare Recycling (`/indoor/recycling`, already hidden as NAR-008), Pre-Delivery Quality Check (`/indoor/pdqc`), the Indoor DC Approvals queue (`/indoor-dc-approvals`), the Indoor DCs card on My Workload, the Indoor print pages (`/indoor-pdt/…`, `/indoor-pdqc/…`, `/indoor-register/…`, `/indoor-dc/…`) and their Version History entries. | Waiting for "Act on Non Auditable Backlog" |
| 8 | 2026-11-18 | "Call Review" | **Call Review** (`/call-review`) and its Version History entries. The Daily Complaint Review Register (R/SER/35, `/daily-review`) is NOT on this list. | Waiting for "Act on Non Auditable Backlog" |
| 9 | 2026-11-18 | "Report - Not consumed Against this call" | **Reports → Not Consumed Against this Call** (`/exports/unused`) and its Version History entries. | Waiting for "Act on Non Auditable Backlog" |
| 10 | 2026-11-18 | "Report - Feedback Without Report" | **Feedback Without a Report** (`/feedback-without-report`) and its Version History entries. | Waiting for "Act on Non Auditable Backlog" |
| 11 | 2026-11-18 | "Report - Visit Date Check" | Same screen as item 1 (`/visit-date-check`), named again; confirms it. | Waiting for "Act on Non Auditable Backlog" |
| 12 | 2026-11-18 | "Machines Without Installation Calls" | **Machines Without an Installation Call** (`/install-calls-unmapped`) and its Version History entries. | Waiting for "Act on Non Auditable Backlog" |
