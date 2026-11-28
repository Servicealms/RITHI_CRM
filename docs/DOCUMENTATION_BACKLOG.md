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
