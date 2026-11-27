-- ===========================================================================
-- 0498 -- A DEVICE'S COPY OF THE OPEN CALLS ASKS WHETHER ANYTHING CHANGED (the
-- user, 2026-11-27: "Similar to Customer, Party, Product Database, can we also
-- cache Calls?"; asked, chose: open calls only).
--
-- Each phone and laptop now keeps the open calls (machinestore.ts), downloaded
-- from pending_calls, and every 15 minutes -- and when the tab comes back --
-- asks `calls` whether any call was written after the latest sys_updated_on in
-- its copy, as it does for the machines and the Party Master (0460). It asks
-- `calls`, not pending_calls, because a call that is SOLVED leaves the view and
-- its closing write must still be seen. `calls` is a UNION ALL of the three
-- call tables, so a predicate on sys_updated_on reaches each table; these three
-- indexes keep that one LIMIT 1 lookup cheap for every device.
--
-- In the sys_columns module beside 0460: sys_updated_on is the column 0244
-- adds, and that module runs last on a fresh apply.
-- ===========================================================================
create index if not exists field_calls_sys_updated_on_idx on public.field_calls (sys_updated_on desc);
create index if not exists installation_calls_sys_updated_on_idx on public.installation_calls (sys_updated_on desc);
create index if not exists pm_calls_sys_updated_on_idx on public.pm_calls (sys_updated_on desc);
