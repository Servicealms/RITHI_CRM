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
| 14 | 2026-11-19 | "Product Failure Ananlysis should also be Hidden. It is showing under Quality and Analytics." | **Quality & Analytics → Product Failure Analysis** (`/product-failure`): one line on `AUDIT_HIDDEN_PATHS`, a NAR, and its Version History entries marked. | **Done, v0.10.274** ("Finish all Audit mode Changes", 2026-11-26) |
| 15 | 2026-11-19 | "Move those Requirements to Non-Auditable Requirements and Hide the Complete Non-Auditable Requirements. But Park this Activity for now." | (a) MOVE to Non-Auditable Requirements the validation entries that are about the hidden screens only — 11 URS (URS-045, 046, 050, 051, 055, 069, 098, 116, 117, 171, 180), the 14 FRS implementing only them and the 15 tests proving only them — each keeping its old ID as "(was …)", the NAR-013 way; re-check URS-045 ("Controlled vocabulary is chosen, not typed") and URS-046 ("Repeat failure determined") first, as their filing under /kpi and /call-review looks broader than those screens. (b) HIDE THE WHOLE Non-Auditable Requirements section of Software Validation while Audit Mode is on — every NAR, not only those marked `auditHidden`. | **Done, v0.10.274** ("Finish all Audit mode Changes", 2026-11-26) |
| 16 | 2026-11-26 | "Move FFR Logs into Non Auditable Requirement. And Hide it when Audit Mode is enabled" | The **Update log** on each Field Failure Report and **Load old update log** on the register; their Module Guide lines and Version History entries. The database still records every change (ffr_history). | **Done, v0.10.273** (NAR-026) |
| 17 | 2026-11-26 | "When Audit mode is enabled, Set the Version to v3.0.0 and Hide Version History. Hide Build ID , ID , Built" | The footer, the update banner, Version History, the device list, the How-To on the Build ID, version tags on Software Validation. | **Done, v0.10.274** (NAR-027) |
| 18 | 2026-11-26 | "Auto Save in Daily Complaint Review Register is also a Non Auditable Requirement, Hide it in Audit Mode" | The Auto save switch; off while hidden. | **Done, v0.10.274** (NAR-028) |
