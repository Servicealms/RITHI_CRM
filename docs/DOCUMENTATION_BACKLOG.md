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
