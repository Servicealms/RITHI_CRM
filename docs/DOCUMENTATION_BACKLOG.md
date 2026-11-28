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

## v0.10.313 — Product Status Check (2026-11-28)
- Asked: "Product Status Check in 1 Go and update it"; "At the time of Call Registration - What is the Status of the Product? - List all Mismatches and Update it - Do this in a Separate Screen. Non Auditable ... When i update all Affected Spare Request should also show and Update - But i should be able to get this as a Report before I update"; the example (contract entered 21 Nov back-dated to 11 Nov does not cover a call registered 20 Nov 11:00); "Add the MC No and ... State that the Contract Entry was Made after the Call was Registered. Give the Contract Entry Time as well".
- 0506 (product_database_2 module): _product_status_judged() (internal) -- per call: cover entered by the registration moment (sale_entry_date / contract_entry_date <= reg_at, else end of reg_date IST; a NULL entry time counts) and running on reg_date: WGP, else contract_cover_code(type) / 'CONTRACT (TYPE NOT RECORDED)', else OGP; blank product/serial OGP; plus cover_ref and the latest LATE entry (contract first, then warranty) covering the date but entered after registration. product_status_mismatches() (cover_code differs; + spare requests whose status would change, by OR no.) and product_status_report() (jsonb, one response, no 1,000-row cap); fix_product_status(ucns) writes item_status only, spare requests follow by 0268. Gates: Audit Mode off, mod:/product-status-check (0506 -> admin, technical_support), fix also calls.edit or calls.edit.customer. _status.sql row 412; suite product_status_check_test (incl. the user's example, and agreement with call_cover_as_of where entry time does not matter).
- NOT changed: the call screen's "Update Product Details" (call_cover_as_of) still ignores entry time -- the two rules differ for a back-dated entry.
- Screen Administration -> Product Status Check (ProductStatusCheck.tsx): Check every call, summary (stored -> correct counts, spare requests, late entries), table, Report (Excel/CSV), Update all (200 UCNs per call), re-check. NAR-031; AUDIT_HIDDEN_PATHS; MODULES_WITHOUT_REQUIREMENT reason; validationDoc process; moduleGuide.
- Write up: HOW_TO_USE Administration (the screen); CLAUDE.md note (two cover rules: as-of vs as-entered-by).

## v0.10.312 — Call registers' filters on one row; Call History Drive button (2026-11-28)
- Asked: "Add the same Drive button in Call History"; "Move all Filters to 1 Row - Applicable to Field, Pm, Installation Calls".
- DriveIcon + isDriveUrl moved to src/components/ui/DriveIcon.tsx (shared). Call History: the opened call's Drive Link and the list's Drive Link cell use the svc-drive-link chip with the Drive mark ("Drive"; a non-Drive web link reads "Open report"/"Open").
- Call registers (FieldCalls.tsx toolbar): .call-search-compact -- boxes 92px, pickers 138px, Global 140px, no wrapping among themselves at >= 1400px; "Reset filters" -> "Reset". Rendered at 1660px with the real CSS: one row.
- Write up: HOW_TO_USE call registers' search line (Reset); Call History (Drive button).

## v0.10.311 — Service Report on the status row; Drive button (2026-11-28)
- Asked (screenshot): "Add one more link to open it in Drive Directly. Next to the Service Report - Add it with Drive Symbol"; "move the Service Report to the Same row as Call Status"; "Do this change in Field, Installation, PM Calls" (one screen, FieldCalls.tsx).
- The 📄 Service Report button (and "No service report was filed") moved from the actions row into the call-status-hero, at its right (light chips on the dark bar). New "Drive" chip with an inline Drive mark (no external image): an <a> to the report URL via safeUrl, new tab, shown only when the URL is drive.google.com / docs.google.com.
- Write up: HOW_TO_USE call registers (opened call: where the report and the Drive button are).

## v0.10.310 — Drive report links mapped to live visits by UID (2026-11-28)
- Asked: "I want to be able to Map Drive Links to the Live calls as well. I has built Bulk Report Mapping, But i dont think that will work... I want to upload Drive Report Links." Chose: by the visit UID; keep an existing link (skip); a UID with no visit held back.
- 0505 (reports module): map_report_drive_links(jsonb [{uid, link}]) SECURITY DEFINER, asks has_perm('bulk.upload'), not executable by anon. Writes reports.manual_report only; "has a link" = http(s) in manual_report or data 'Manual Report' (manualReportLink's test); a non-link manual_report (AppSheet path) is filled and its old value kept in source_ref when empty. Never inserts; updated_at / call_status / visit_at untouched (reports_touch_call re-derives the same state). Returns counts + up to 500 UIDs per outcome. _status.sql row 411; suite report_drive_links_test.
- Workflow (the user): "First export the visit report, Attach the link and then re-upload" -- the Visit Reports export carries Row ID (uid) and Service Report (manual_report, often a 42Reportingv2_Images/... AppSheet path); replace the path with the Drive URL (or add a Drive Link column, which wins) and upload. A path left as it was is reported "left as it was", not an error.
- Screen: Bulk Uploads -> Visit Reports -> "Drive Report Links — map to visits by UID" (DriveReportLinks.tsx): CSV headings UID (uid / visit uid / report uid / visit id / row id) + Drive Link (drive link / drive url / report link / link / manual report / service report); 500 per call; result lists kept / not found / not a link. Audit line report.drive_links.
- Write up: HOW_TO_USE Bulk Uploads (the new upload); a requirement + test for the mapping; mention beside Bulk Report Mapping.

## v0.10.309 — Call History colour coding off by default, with a switch (2026-11-28)
- Asked: "I want to Remove the Colour Coding in Call History, But give me a Toggle button to enable or Disable Colour Coding for now."
- "🎨 Colours" tick box on the year row (beside Excel / CSV); OFF by default; localStorage rithi.callhistory.colours ('on'/'off'), per device. A React context (ColourOn) feeds HistoryStatus / HistoryUcn in the list and the opened call; off = plain text ("Solved In Winmax" label still applies).
- Write up: with v0.10.305 (the colours are now optional).

## v0.10.308 — Call History: the opened call in two columns (2026-11-28)
- Asked: "Make it 2 Columns, and Split the 2nd Column Vertically into 2 and Fit the Consumption to Lower Part of the Vertically Split 2nd Column. Move Complaint Section Up and Warranty & Contract Section Down"; "I dont want the Breakdown Date and Complaint Date in the Pop Up window".
- Layout: Call details | (Visit details over Spare consumption). Column divider drags 25-75% of the width, the row divider 20-80% of the right column's height; localStorage rithi.callhistory.split (default 48 / 58). Stacks under 1100px. ✕ moved to the Visit details head.
- Left order: Registration, Customer & Product, Complaint, Warranty & Contract (+ Other columns in the file).
- HIDDEN_IN_POPUP: Breakdown Date, Complaint Date (still in the list and the Excel/CSV).
- Write up: with v0.10.305 (supersedes its three-pane wording).

## v0.10.307 — Call History: Call Acceptance removed (2026-11-28)
- Told: "Call Acceptance - Field has been removed in the upload." Removed from CALL_HISTORY_FORMAT (34 columns now) and added to NOT_SHOWN, so a file that still carries it keeps it in `extra`, unshown.
- Write up: with v0.10.290 (the format's column list).

## v0.10.306 — Call History panes: draggable, inline values, folding sections (2026-11-28)
- Asked: "Make the pane dividers draggable like Pending Registration. Arrange the Value next to the Field Name, Dont go to Next Line. And I still want to be able to Collapse Sections."
- Dividers: Pending Registrations' drag rule (each of the first two panes 15-60%, together <= 70%), widths in localStorage rithi.callhistory.cols (default 36 / 32). Rows: .ch-kv grid -- name (min 110px, 42%) | value beside it. Sections: <details open> with the section title as the summary.
- Write up: with v0.10.305.

## v0.10.305 — Call History: three panes like Pending Registrations; status colours (2026-11-28)
- Asked: "Split it into 3 Column Screen, Screen 1 - Call Details, Complaint, Screen 2 Visit Details, Screen 3 Spare Consumption. Add the Drive Link at the Top of Screen 2"; "Remove both Recorded as and Remarks columns"; "Add the Solved / Unsolved Colour Coding. For Solved - Mark it as Solved In Winmax, for Solved - Waiting for Manual Report - Make these as Light Green"; "Match the UI with how it looks in Pending Registration".
- The opened call uses Pending Registrations' overlay and panes (reg-overlay / reg-split-3, label-over-value reg-detail-rows, fixed 36% | 32% | rest, stacks under 1100px; Esc / ✕ / outside click close). Pane 1 Call details: Registration, Customer & Product, Warranty & Contract, Complaint (+ Other columns in the file). Pane 2 Visit details: Drive Link button first, Visit & Report, Call Status. Pane 3 Spare consumption: Part, Qty, Date, Engineer.
- Colours: list's UC Number and Call Status columns and the pane: RITHI's STATE_COLOUR by bucket; plain "Solved" relabelled "Solved In Winmax" (historyStatusLabel -- list, pane, download, status dropdown; stored as the file had it); it and "Solved - Waiting for Manual Report" light green HISTORY_SOLVED_LIGHT (#a5d6a7 / #1b5e20, callstate.tsx, same in both themes).
- Write up: HOW_TO_USE Call History (the panes, the colours, "Solved In Winmax").

## v0.10.304 — Call History: spares consumed on each call (2026-11-28)
- Asked: "I want to link the Consumption for these Historical Calls. I Think the Data is already there." Probe _call_history_consumption_link.sql (live, 2026-11-28): spare_consumption_history 39,724 lines, 38,073 name a Call History UCN, 0 a live call, 1,647 neither; spare_consumption 11,335 lines, 624 name a Call History UCN, 10,681 a live call. Calls with historical consumption: 2022 3,119 / 18,414, 2023 4,663 / 6,483, 2024 5,162 / 6,652, 2025 5,165 / 6,739.
- No data change: linked at read time by UC No. (exact). callHistorySpares(ucn) reads both tables (up to 500 lines each), under the reader's RLS (sch_read / cons_read). Pop-up section "Spares consumed (n)": Part, Qty, Date, Engineer, Recorded as (Historical / RITHI · source), Remarks.
- Write up: HOW_TO_USE Call History (the pop-up's spares); the requirement for the link.

## v0.10.303 — Call History: All years first (2026-11-28)
- Asked: "Move All Years as the first tab then go Descending." Tabs: All years, years newest first, Undated; opens on All years (the first tab).
- Also: supabase/apply/_call_history_open_calls_migrated.sql (read-only, counts only, one grid) -- per year x loaded-as register x file Call Status x file Open/Close: in the same live register by UCN / another / none, found by Call Number only, and the live copy's state. Asked: "All Open Calls from Previous year were migrated to the Current Call register ... check and Confirm".
- Write up: HOW_TO_USE Call History (tab order).

## v0.10.302 — Call History dropdowns refreshed with the summary (2026-11-28)
- Reported: "Product, Engineer, Call Status Drop down is blank in Call History - Search / Filter".
- callHistoryChoices() was called once on mount and its error swallowed; now called in loadSummary (open, Refresh, after upload / delete), the pickers show loading, and a failure is shown in the summary's error banner. The view itself (call_history_choices) answered correctly when tested on a database.
- Write up: nothing beyond v0.10.289's dropdowns.

## v0.10.301 — Call History: one search row; email columns out; stable column keys (2026-11-28)
- Asked (screenshot): "Why is it still wraped to next line? Removed Email Columns from Source itself - Engineer Email, Reporting Manager Email, Regional Manager Email."
- Wrap: the search row (.call-search.ch-search) now takes the whole toolbar width (flex 1 1 100%) and holds Reset filters; it fitted one line at 1660px in a render with the real CSS.
- Engineer Email / Reporting Manager / Regional Manager removed from CALL_HISTORY_FORMAT (35 columns now: 34 of the register + Drive Link) -- not in list, pop-up or Excel/CSV; NOT_SHOWN keeps them out of "Other columns in the file" too. A file carrying them still keeps them in `extra`, unshown.
- Drive Link appeared FIRST: format keys were positional (fmt_<index>), so inserting a column shifted every later key and a saved layout read the newcomer as unknown. Keys are now named from the heading (fmt_<squashed header>); storageKey call-history-v3 resets saved layouts once.
- Write up: with v0.10.290 (the format's column list).

## v0.10.300 — Call History layout tidied (2026-11-28)
- Asked (screenshot): "Load More Stays only alongside the Page Name. Global Search Bar can be smaller and moved to the Above Row. Export can be moved to the Row where Year is mentioned. Move Filters also to the Same Row as other Filters are."
- Call History only (DCCR History unchanged): table toolbar keeps only "N shown of M"; Load more only in the page header; Excel / CSV on the year-tab row (.ch-tabs-row); Global 170px (.call-search-global-sm) in the search row; the table's ⚑ Filters (and Group) rendered into the search row through a new DataTable prop `controlsSlot` (a portal; absent = above the table as everywhere else).
- Write up: HOW_TO_USE Call History (where Load more / downloads / Filters are).

## v0.10.299 — Call History: delete a whole upload (2026-11-28)
- Asked: "Till i Finalize the Uploads, i might need to clean it up quite often, Give me a Button to Clear it, Add it to Actions list in Roles & Permission so that i can remove at my Will - the Whole Upload - So keep it at Upload Level". Replaces a one-time migration per clean-up (0502/0503).
- 0504 (daily_review): call_history.upload_batch + upload_file (text, default ''), index; the Call History upload stamps ONE batch number (UploadDef.batch, 0483's mechanism) and the file name (new UploadDef.batchFile) on every row. View call_history_uploads (security_invoker): one row per batch -- file, calls, first/last loaded, loaded_by (latest), years, sources, registers. Policy ch_delete: (select has_perm('call_history.delete')); grant delete to authenticated, never anon.
- Key call_history.delete "Delete a Call History upload" (Admin group; PERM_TREE /call-history actions). Administrators pass has_perm; any other role only when ticked. No migration grants it.
- Uploads & summary tab: an "Uploads" table above the summary, newest first; "🗑 Delete upload" (only with the key) -> confirm naming calls/years/source/type and "no undo" -> DELETE ... WHERE upload_batch = x, count returned; 0 deleted is said as such (RLS refuses silently). Audit line call_history.delete_upload (batch, count).
- Rules: a re-upload takes over the rows it names (stamped with the newer batch); deleting the newer upload removes them entirely, the earlier version is NOT restored. Rows loaded before 0504: batch '' -> "Before uploads were numbered", deletable as one.
- Tests: call_history_upload_delete_test (new); call_history_test (an engineer's delete now removes nothing, no error); _status.sql row 349 moved (delete grant allowed only beside ch_delete), row 410 new.
- Write up: HOW_TO_USE Call History (Uploads list, Delete upload, the re-upload rule); FRS for the delete + RBAC key; CLAUDE.md gotcha (call_history is deletable now -- only by upload batch, only with the key).

## v0.10.298 — Call History: the call opens in a pop-up (2026-11-28)
- Asked (with a screenshot of "Recorded by RITHI"): "I dont want this. Make it a Pop up window instead of a Drawer. I want to Hide certain fields - Engineer Email, Reporting Manager, Regional Manager."
- Drawer -> Modal (760 wide). Removed from it: the Recorded by RITHI section (Register, Source, Year, Duplicate) and the "History only" note; Engineer Email, Reporting Manager, Regional Manager (HIDDEN_IN_POPUP). All still in the list's columns and the Excel/CSV. Sections and "Other columns in the file" unchanged.
- Write up: with v0.10.294 (supersedes its drawer wording).

## v0.10.297 — Call History drawer in sections (2026-11-28)
- Asked: "Segregate it into Sections like the Field Call Form - In Call History also."
- Drawer only (list + download keep the register's order). HISTORY_SECTIONS in callHistoryFormat.ts; each format column has a `section`. The Field Call form's four, same fields: Registration (UC Number, Call Number, Call Registeration Date, Complaint Date, Call Type), Customer & Product (Party, City, State, Product, Serial, Item Status, Region), Warranty & Contract (Warranty No/Start/End, Contract No/Start/End, Contract Type), Complaint (Standard Complaint, Complaint Reported, Call Allocated To, Breakdown Date, Engineer Email, Reporting Manager, Regional Manager). Then Call Status (Call Acceptance, Open/Close, Call Status, CALL PENDING REASON, Call Solved, Call Canceled) and Visit & Report (Visiting Service Engineer, Visit Date & Time, Complaint Observation, Job Done, Service Report, Drive Link). Then Recorded by RITHI, Other columns in the file. Each foldable (<details>).
- Write up: with v0.10.294.

## v0.10.296 — Call History pages of 2,000 (2026-11-28)
- Asked: "Load More should load 2000 in one go in Call History Page [Including all Sub Pages]."
- PAGE 500 -> 2000 (first load and each Load more; every year tab, Undated, All years, any search; DCCR History shares the component). listCallHistory reads a page in slices of 1,000 (PostgREST's silent cap) under the same order, exact count from the first slice, stops on a short slice.
- Write up: HOW_TO_USE Call History (2,000 at a time).

## v0.10.295 — Call History: load who/when only on the summary (2026-11-28)
- Asked: "Dont keep tab of Who Uploaded or When it was Uploaded in the View - Move it to the Summary or Log."
- loaded_at / loaded_by taken off each call's row on the client (withoutLoad): not in the drawer, the list's column picker or the Excel/CSV ("Loaded At" dropped). The summary (Uploads & summary tab) keeps Last loaded / By per year x source x call type. Still stored on the row (the summary is counted from it). DCCR History unchanged.
- Write up: with v0.10.294.

## v0.10.294 — Call History: Calls / Uploads tabs; a call opens in a drawer (2026-11-28)
- Asked: "Keep the Log and Upload option in a Separate Tab in Call History.. Also the Summary goes there. When i click on the Row, I want the Inform to come up in a Drawer or Pop Up." Asked what "Log" is: THE SUMMARY IS THE LOG -- no separate upload log (none exists: a Call History upload writes no audit line; only each row's loaded_at / loaded_by).
- Call History only (DCCR History keeps one page): tab Calls (default; year tabs, search, list) and tab Uploads & summary (upload + "What has been loaded"). A summary row opens its year on the Calls tab.
- Row click -> drawer "Call History -- <UCN>": the 38 format columns in order (dates dd-MMM-yyyy, Drive Link as a link); Recorded by RITHI (Register, Source, Year, Duplicate, Loaded at, Loaded by); Other columns in the file (extra headings no format column shows -- otherExtra). Read only.
- Write up: HOW_TO_USE Call History (tabs, drawer); FRS-295.

## v0.10.293 — Call History emptied a second time (2026-11-28)
- Asked: "clean it again". 0503 (daily_review): 0502's rules exactly, its own once-marker '0503_call_history_emptied_again'. _status.sql row 409; call_history_emptied_test extended.
- Write up: with v0.10.292. If this keeps being asked for, an "Empty Call History" admin action would replace a migration per clean-up.

## v0.10.292 — Call History emptied once, for a clean re-load (2026-11-28)
- Asked: "Clean up what is already Loaded in Call History"; chosen: "Delete everything and re-load".
- 0502 (daily_review): TRUNCATE call_history (parent + every year's table), ONCE -- guarded by public.one_time_data_fixes row '0502_call_history_emptied' (new marker table: RLS on, no API access), so a re-run of daily_review.sql is a no-op and never deletes the re-load. Prints the count removed (numbers only). NOT touched: dccr_call_history, call_history_pre_split (0501's one-table copy -- the only way back; still to be dropped when the user says), upload audit lines. _status.sql row 408; suite call_history_emptied_test.
- Write up: BACKLOG (re-load pending: upload each yearly file again); HOW_TO_USE Call History (nothing to say beyond the re-load); CLAUDE.md pattern note (a one-time data change in a re-runnable bundle needs a done-marker).

## v0.10.291 — Call History: Drive Link column (2026-11-28)
- Asked: "one more Column for 'Drive Link' - Which should present as a Drive Link." Chosen: the FILES CARRY IT (no Drive lookup from Service Report).
- Column 38, after Service Report, screen + Excel/CSV. Read from `extra` (headings Drive Link / Drive URL / Google Drive Link / Drive, squash-matched); no migration. Shown as "Open in Drive ↗" (new tab): http(s) address as given; a bare Drive file id (25+ of A-Za-z0-9_-) -> https://drive.google.com/file/d/<id>/view; anything else shown as text, no link (driveHref, callHistoryFormat.ts). The export carries the address as text.
- Write up: HOW_TO_USE Call History (columns) + Bulk Uploads Call History (add a Drive Link column to the file); FRS-295.

## v0.10.290 — Call History in the F/I Call Register format (2026-11-28)
- Asked (with "24_v0 - F_I Call Register - Field 24.csv"): "I need the Call History in this Format."
- Call History's list AND its Excel/CSV: the register's 37 columns, its order, its headings (misspelling "Call Registeration Date" kept), then Register (chosen at upload), Source, Year, Duplicate (+ Loaded At in the file). DCCR History unchanged. Spec: src/lib/callHistoryFormat.ts (CALL_HISTORY_FORMAT).
- 16 come from call_history columns (UC Number ucn, Call Number call_no, Call Registeration Date call_at, Party Name, City, State, Product Name item_name, Product Serial Number serial, Item Status, Warranty Start Date, Contract Type, Call Type (file's own), Standard Complaint, Complaint Reported, Call Allocated To engineer, Call Status, Call Solved Date & Time solved_at). The other 21 are read from `extra` (where the upload keeps unmapped headings as written), matched by squash (letters+digits); a heading the file lacked shows blank. Dates in extra are read day-first to dd-MMM-yyyy / a real Excel date; unreadable kept as written. No migration; search/filter does not reach the extra columns.
- Upload fix: 'call registeration date' added to call_at's aliases -- the misspelt heading matched nothing, so the call date went into extra and (no Year chosen) the call to Undated. A row loaded before the fix still shows its date from extra, but stays in the year it was stored in (re-load the file to move it).
- check:uploads pins it; check-ui's Call History cover window widened 5000 -> 6000 chars (comment length only).
- Write up: HOW_TO_USE Call History (columns) + Bulk Uploads Call History (the heading); FRS-295 (the format).

## v0.10.289 — Call History stored year by year; year tabs; Field Call search (2026-11-28)
- Asked: "In Call History Add Tabs Per year, Field, Installation, PM all can be in the Same List, But Year should be in Different Tabs. For Server Search Filters - Go with these [UCN, Product, Serial, Party, Engineer, Call Status, Global] - Same as Field Call" and "It should be Stored in Separate Database for the Year." Chosen: a call in two yearly sheets is KEPT IN EACH YEAR; no year chosen -> the year of the call date.
- 0501 (daily_review): call_history PARTITIONED BY record_year -- call_history_y<year> (every year with data, and 2015-2030), call_history_undated (DEFAULT: no year). Key call_history_key = (ucn, call_no, record_year) NULLS NOT DISTINCT. Copies 0432 had tucked into a later year's record moved out into their own year, whole, with their load time; same-year other-source copies stay as that record's `duplicates` (keep_latest now within a year). Old table kept as call_history_pre_split, no API access. Year tables: RLS on, no grants -- reached only through call_history. call_history_year_default dropped (a BEFORE trigger may not change the partition key) -- the upload gives the year: chosen, else call date (India) via uploads.ts afterAsked, else undated. Upload conflict 'ucn,call_no,record_year'. Views 0495 / 0500 rebuilt on it. _status.sql row 407.
- Made replay-safe: 0429's unique index guarded by name (Postgres checks the partition rule before IF NOT EXISTS); 0430's backfill on conflict without target; 0244 sys_columns_attach handles a partitioned table (columns + trigger on the parent, a sys_id key per partition) and skips partitions in its loop.
- 0500: call_history_choices -- distinct product / engineer / call status with counts (security_invoker), for the dropdowns; values as stored. _status.sql row 406.
- Screen (Call History only; DCCR History unchanged): year tabs (newest first, Undated, All years; opens on the newest); search row UCN / Product▾ / Serial / Party / Engineer▾ / Call Status▾ / Global + Reset filters; Year/Source/Call Type pickers and Duplicates box removed; a summary row opens its year's tab. UCN / Serial / Party fragments; picks matched whole (likeWhole: escapes \ % _ only, keeps brackets/commas -- also now used by the Field Call register's Engineer / Product).
- Tests updated: call_history_test (year-by-year rules), call_history_screen_test, call_type_filters_test. check-uploads counts an asked value as filling the key.
- Write up: HOW_TO_USE Call History + Bulk Uploads Call History (key by year, no cross-year Duplicate, year from call date); FRS-278.x (duplicates rule superseded), FRS-295 (tabs/search); CLAUDE.md gotcha (partitioned call_history: the upload gives record_year; no trigger may set it).

## v0.10.288 — Reset filters on the call registers (2026-11-28)
- Asked: "Add Reset Filter Option."
- Field / Installation / PM: "✕ Reset filters" beside Open only / Re-opened. Clears UCN, Product, Serial, Party, Engineer, Call Status and Global; Re-opened off; Engineer, Pending Reason and Missed PM chips back to All; Open only back to its opening state (ON for an engineer, OFF otherwise). Disabled when nothing differs from that. Column filters inside the table are not touched.
- Write up: HOW_TO_USE call registers' search/filter line.

## v0.10.287 — Product dropdown on the call registers (2026-11-27)
- Asked: "Add Product filter dropdown too."
- The register's Product search box became a type-to-search picker of useMaster('product') -- the stored product list the call form offers (6 h on the device).
- Server: product_name ILIKE the picked name with no wildcard (whole, ignoring case) -- it was a fragment match (%x%), so VEGA also matched VEGA XT. Device-copy fallback and sheet path match whole too. No other screen pre-fills the product.
- Write up: HOW_TO_USE call registers' search line (with v0.10.284 / .286).

## v0.10.286 — Call Status search on the call registers (2026-11-27)
- Asked: "Similar to Engineer Name search, add Call Status also in filter."
- Field / Installation / PM: a Call Status picker beside Engineer: Unattended, Unsolved, Solved - Report Pending (value "Report pending"), Solved, Reopened, Cancelled -- the state the register shows (dbToCall: cancelled_at -> Cancelled, else reopened_at -> Reopened, else open_state).
- Server: Cancelled -> open_state = 'Cancelled'; Reopened -> reopened_at not null; others -> open_state = value and reopened_at null; then each row is kept only if its shown state equals the pick (so a reopened call whose latest visit reads "cancel" is only under Reopened). ANDed with the other terms. Device-copy fallback and the sheet path filter on the shown state.
- Write up: HOW_TO_USE call registers' search line; the register-search FRS (with v0.10.284's engineer search).

## v0.10.285 — Device Cache Status: open calls; PM Calls subtitle removed (2026-11-27)
- Device Cache Status: new columns Open calls / Open calls downloaded (0499: device_cache_status.open_calls / open_calls_at; device_cache_report() rebuilt with them last, 0380's body otherwise; _status.sql row 405). Each device reports the count of its open-calls copy and when it was downloaded -- nothing else. Blank for a device on a build before 0.10.285. A project without 0499 still accepts the rest of the report.
- Call registers' header: subtitles removed -- PM ("Preventive-maintenance visits (call_type = P M VISIT). Bulk-load monthly; back-dating supported.", the user: "Remove this statement"), Field and Installation ("Live ... register — new calls get a UCN and are written back.", the user: "Remove Duplicate Info"); the status line's "⟳ synced Xs ago" removed (the same time reads beside Refresh); "Loading calls from the Google Sheet…" shown only on the sheet path, and a failed read on the database path says "Could not load calls" (the user: "This is no longer true").
- Write up: HOW_TO_USE Device Cache Status (the columns); the device-copy requirement (with the v0.10.283 entry).

## v0.10.284 — Engineer search on the call registers (2026-11-27)
- Asked: "Add Engineer Search in all Calls Page like UCN, Party .. Preferably Drop down to select From."
- Field / Installation / PM registers: an Engineer picker (type-to-search, PickList) beside UCN / Product / Serial / Party. Options = useTeamEngineers(): every active User Master name for an office role, self + reports for a manager, self for an engineer (the Call Allocated To list).
- Server search: allocated_to ILIKE the picked name with no wildcard (equal ignoring case, never a fragment), ANDed with the other terms; the device-copy fallback and the sheet path match the same way.
- Pending Calls already has engineer chips; not changed.
- Write up: HOW_TO_USE call registers' search line; FRS for the register search (beside FRS-131).

## v0.10.283 — Open calls kept on each device (2026-11-27)
- Asked: "Similar to Customer, Party, Product Database, can we also cache Calls?" Chosen: OPEN calls only; used by the call registers, Pending Calls, the search box and the call-status colours. (My Workload was also chosen but reads no calls -- nothing to do there.)
- Store: machinestore.ts register `open-calls` (IndexedDB), downloaded from `pending_calls` (not the historical import), id-keyset, under the reader's RLS; keyed by the signed-in user, wiped on sign-out. Used 30 min; every 15 min / tab focus / signal back it asks `calls` (not pending_calls -- a solved call leaves that view) whether any row has sys_updated_on after the copy's latest, and re-downloads if so. Replaced only by a complete download. Indexes: 0498 (sys_columns module), _status.sql row 404.
- READ ONLY: every save (visit, edit, allot, cancel) still goes to the server; no offline saving.
- Pending Calls: shows the device copy at once, replaced by the server list; on failure keeps the copy with "Could not reach the server ... as of <time>".
- Field / Installation / PM registers: server as before; on failure, the device's open calls of that register (search terms matched on the device), with a banner; solved/cancelled calls need a connection.
- Search box: on server failure, searches the device copy (ucn, call no, party, serial, product).
- Call-status colours (listCallStates): UCNs in the copy answered from it (call_state's rule); others asked of the server. A call solved since the last check keeps its open colour for up to 15 minutes.
- Not in Device Cache Status's report yet (machines / parties / lists only).
- Write up: HOW_TO_USE (offline / device copy section, Pending Calls, the registers, search); URS/FRS for the device copy (alongside the machine-register requirement); module guide for Pending Calls.

## v0.10.282 — No "N Missed PM calls hidden" line (2026-11-27)
- The PM register and Pending Calls no longer show how many Missed PM calls the hide rules left out (the user: "Remove the line"). The rules themselves are unchanged (all / unsolved / cancelled boxes, FRS-131.24); Admin Config → PM Calls still shows which are on, and is NOT hidden in Audit Mode.
- Asked for (not built): making the rules a Non-Auditable Requirement hidden in Audit Mode while still hiding the calls. Declined because it would show an auditor a PM register with Missed PM calls removed and no trace of why. Open alternative offered: switch the rules off while Audit Mode is on.
- Write up: HOW_TO_USE PM register "Hiding Missed PM calls" (drop "says how many it left out"); FRS-131.24 (drop "saying how many and what"); the Admin Config card text is already updated.
