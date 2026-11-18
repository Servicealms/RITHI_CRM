# Non-Auditable Backlog

Items the user has named as **non-auditable requirements**: when **Audit Mode**
is ON, each is to be **hidden** (the screen, the tab, the report or the change
history entry), the way Spare Recycling (NAR-008) already is.

**THIS IS A HOLDING LIST, NOT WORK DONE.** The user, 2026-11-18:

> "I am going to be giving you a List of Items that needs to be Moved into Non
> Auditable Requirement - So when Audit Mode is Enabled all these should be
> Hidden. Dont Act on it directly, Wait for me to "Act on Non Auditable
> Backlog" for now, keep adding these into a Separate Backlog."

**ACTED ON 2026-11-18 ("Act on Non Auditable Backlog"), v0.10.268.** Items 1–13
are hidden in Audit Mode through ONE list, `src/lib/auditHidden.ts`, read by the
menu, global search, Module Guide, How to Use, the route guard (an open page,
link or typed address returns home), Roles & Permissions / User Master ->
Access / My Profile, My Workload and the data flows; their Version History
entries carry `auditHidden` / `auditHiddenChanges`. Requirements NAR-014 to
NAR-025 in `src/lib/validation.ts`. Hiding is a VIEW decision: nobody's
permissions and no records change.

**A new item** goes on `AUDIT_HIDDEN_PATHS` (a screen) or `AUDIT_HIDDEN_KEYS`
(a permission), gets a NAR, and its Version History entries are marked.

**Still showing in Audit Mode, waiting for the user's decision:** the existing
URS / FRS / tests in the Software Validation package that are about these
screens only (11 URS, 14 FRS, 15 tests -- e.g. URS-116/117/171/180/050/051
Indoor, URS-098 Objective, URS-055 Call Review, URS-069 Product Database 2.0).

| # | Added | Item (the user's words) | What it covers | Status |
|---|---|---|---|---|
| 1 | 2026-11-18 | "Add a Flag that the Date was Corrected and Present this as a Report. This is a Non-Auditable Requirement, So when i hide it, this visit Date Check should be hidden along with this Report." | **Reports → Visit Date Check** (`/visit-date-check`) as a whole — its tabs Daily cut-outs, Haiku Read and **Corrected dates** (0489, v0.10.265) — and the Version History entries for v0.10.252–v0.10.265 that describe it. The report itself is BUILT (v0.10.265); only the hiding waits. | **Done, v0.10.268** |
| 2 | 2026-11-18 | "KPI & Failure Analysis" | **Quality & Analytics → KPI & Failure Analysis** (`/kpi`) and its Version History entries. | **Done, v0.10.268** |
| 3 | 2026-11-18 | "Objective" | **Objective** (`/objective`) and its Version History entries. | **Done, v0.10.268** |
| 4 | 2026-11-18 | "Spare Insight" | **Spare Insights** (`/spare-insights`) and its Version History entries. | **Done, v0.10.268** |
| 5 | 2026-11-18 | "Training Module" | **Training** (`/training`) and its Version History entries. | **Done, v0.10.268** |
| 6 | 2026-11-18 | "Product Database 2.0" | **Product Database 2.0** (`/product-database-2`) and its Version History entries. The original Product Database (`/product-database`) is NOT on this list. | **Done, v0.10.268** |
| 7 | 2026-11-18 | "Indoor and Everything under that" | The whole **Indoor Service** menu group: Indoor Service Register (`/indoor`), Spare Recycling (`/indoor/recycling`, already hidden as NAR-008), Pre-Delivery Quality Check (`/indoor/pdqc`), the Indoor DC Approvals queue (`/indoor-dc-approvals`), the Indoor DCs card on My Workload, the Indoor print pages (`/indoor-pdt/…`, `/indoor-pdqc/…`, `/indoor-register/…`, `/indoor-dc/…`) and their Version History entries. | **Done, v0.10.268** |
| 8 | 2026-11-18 | "Call Review" | **Call Review** (`/call-review`) and its Version History entries. The Daily Complaint Review Register (R/SER/35, `/daily-review`) is NOT on this list. | **Done, v0.10.268** |
| 9 | 2026-11-18 | "Report - Not consumed Against this call" | **Reports → Not Consumed Against this Call** (`/exports/unused`) and its Version History entries. | **Done, v0.10.268** |
| 10 | 2026-11-18 | "Report - Feedback Without Report" | **Feedback Without a Report** (`/feedback-without-report`) and its Version History entries. | **Done, v0.10.268** |
| 11 | 2026-11-18 | "Report - Visit Date Check" | Same screen as item 1 (`/visit-date-check`), named again; confirms it. | **Done, v0.10.268** |
| 12 | 2026-11-18 | "Machines Without Installation Calls" | **Machines Without an Installation Call** (`/install-calls-unmapped`) and its Version History entries. | **Done, v0.10.268** |
| 13 | 2026-11-18 | "Signature Edit / Add option for Admins" | Viewing and uploading a person's signature on **User Master** (`users.signature.view`, `users.signature.upload`). **Already hidden in Audit Mode on User Master** (NAR-011 view, NAR-012 upload). Still showing in Audit Mode: the two permission ticks on Roles & Permissions (they are not in `AUDIT_HIDDEN_ACTIONS`), and any Version History entries about them. Those are what is left. | **Done, v0.10.268** |
