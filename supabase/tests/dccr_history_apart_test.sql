-- ===========================================================================
-- DCCR HISTORY LEAVES CALL HISTORY, WHOLE (0496).
--
-- Call History as it stood before 0496: DCCR-register records shown in it, a
-- DCCR row holding other sources' copies, and a yearly-sheet row holding a
-- DCCR copy. Re-running 0496 must move every DCCR record to dccr_call_history
-- and lose nothing -- not a DCCR record, not another source's copy, not a load
-- time -- and running it again must change nothing.
-- Every error printed is labelled `expect ERROR`.
-- ===========================================================================
\set ON_ERROR_STOP off
\pset pager off

alter table public.call_history disable trigger user;
insert into public.call_history (ucn, call_no, call_at, call_type, item_name, serial, call_status, source, record_year,
                                 register, duplicate, duplicates, extra, loaded_at) values
  -- M1: a DCCR row on its own.
  ('DA-1', 'C1', '2025-01-10 10:00+05:30', 'FIELD', 'VEGA', '11', 'Solved', 'DCCR register', 2025, 'Field', false, '[]',
   '{"imported_from":"DCCR register (historical)"}', '2026-10-13 09:00+05:30'),
  -- M2: a DCCR row shown, holding a 2024 yearly sheet and a 2023 WinMax copy.
  ('DA-2', 'C2', '2025-02-10 10:00+05:30', 'FIELD', 'VEGA', '12', 'Solved', 'DCCR register', 2025, 'Field', true,
   '[{"source":"Yearly sheet","record_year":2024,"call_at":"2024-12-30T10:00:00+05:30","call_type":"FIELD","item_name":"VEGA YS","serial":"12","call_status":"Unsolved","loaded_at":"2026-11-01T09:00:00+05:30","extra":{"from":"ys"}},
     {"source":"WinMax","record_year":2023,"call_at":"2023-06-01T10:00:00+05:30","call_type":"FIELD","item_name":"VEGA WM","serial":"12","call_status":"Open","loaded_at":"2026-10-01T09:00:00+05:30"}]',
   '{"imported_from":"DCCR register (historical)"}', '2026-10-13 09:00+05:30'),
  -- M3: a 2025 yearly sheet shown, holding the DCCR copy it replaced.
  ('DA-3', 'C3', '2025-03-10 10:00+05:30', 'P M VISIT', 'VEGA YS3', '13', 'Solved', 'Yearly sheet', 2025, 'PM', true,
   '[{"source":"DCCR register","record_year":2025,"call_at":"2025-03-10T10:00:00+05:30","call_type":"P M VISIT","item_name":"VEGA DCCR3","serial":"13","call_status":"Unsolved","loaded_at":"2026-10-13T09:00:00+05:30","extra":{"imported_from":"DCCR register (historical)"}}]',
   '{}', '2026-11-20 09:00+05:30'),
  -- M4: a yearly-sheet row with nothing to do with the DCCR register.
  ('DA-4', 'C4', '2024-04-10 10:00+05:30', 'FIELD', 'VEGA', '14', 'Solved', 'Yearly sheet', 2024, 'Field', false, '[]',
   '{}', '2026-11-21 09:00+05:30');
alter table public.call_history enable trigger user;

\i supabase/migrations/0496_dccr_history_apart.sql

select (select count(*) from public.call_history where ucn like 'DA-%' and (source = 'DCCR register'
          or duplicates @? '$[*] ? (@.source == "DCCR register")')) = 0
       as "no DCCR record is left in Call History";
select (select string_agg(ucn, ',' order by ucn) from public.dccr_call_history where ucn like 'DA-%') = 'DA-1,DA-2,DA-3'
       as "every DCCR record is in DCCR History";
select (select item_name = 'VEGA' and call_status = 'Solved' and record_year = 2025 and register = 'Field'
               and loaded_at = '2026-10-13 09:00+05:30' and extra->>'moved_by' = '0496'
          from public.dccr_call_history where ucn = 'DA-1')
   and not exists (select 1 from public.call_history where ucn = 'DA-1')
       as "M1 moved whole, its load time kept, and left Call History";
select (select source = 'Yearly sheet' and record_year = 2024 and item_name = 'VEGA YS' and call_status = 'Unsolved'
               and duplicate and jsonb_array_length(duplicates) = 1 and duplicates->0->>'source' = 'WinMax'
               and loaded_at = '2026-11-01 09:00+05:30'
          from public.call_history where ucn = 'DA-2')
       as "M2: the latest other copy became the Call History row, the older one stays its duplicate";
select (select item_name = 'VEGA' and call_status = 'Solved' from public.dccr_call_history where ucn = 'DA-2')
       as "M2: the DCCR record keeps the DCCR register's own values";
select (select source = 'Yearly sheet' and item_name = 'VEGA YS3' and not duplicate and duplicates = '[]'::jsonb
          from public.call_history where ucn = 'DA-3')
   and (select item_name = 'VEGA DCCR3' and call_status = 'Unsolved' and register = 'PM' and record_year = 2025
          from public.dccr_call_history where ucn = 'DA-3')
       as "M3: the DCCR copy moved out, and the yearly sheet is no longer flagged Duplicate";
select (select source = 'Yearly sheet' and not duplicate and loaded_at = '2026-11-21 09:00+05:30'
          from public.call_history where ucn = 'DA-4')
   and not exists (select 1 from public.dccr_call_history where ucn = 'DA-4')
       as "M4 is untouched";
select exists (select 1 from public.record_audit where table_name = 'call_history' and op = 'BULK MOVE'
                and new_data->>'note' like '0496:%' and (new_data->>'rows')::int = 2 and (new_data->>'copies')::int = 1)
       as "one audit record says what moved";

\i supabase/migrations/0496_dccr_history_apart.sql
select (select count(*) from public.dccr_call_history where ucn like 'DA-%') = 3
   and (select count(*) from public.call_history where ucn like 'DA-%') = 3
   and (select count(*) from public.record_audit where table_name = 'call_history' and op = 'BULK MOVE' and new_data->>'note' like '0496:%') = 1
       as "a re-run changes nothing";

\echo ''
\echo '--- a new Call History upload of the same call is not a duplicate of DCCR ---'
insert into public.call_history (ucn, call_no, call_at, source, record_year, call_status)
values ('DA-1', 'C1', '2025-01-10 10:00+05:30', 'Yearly sheet', 2025, 'Solved');
select (select not duplicate and source = 'Yearly sheet' from public.call_history where ucn = 'DA-1')
   and exists (select 1 from public.dccr_call_history where ucn = 'DA-1')
       as "the call is in both, and neither is flagged";

\echo ''
\echo '--- the public key, and a signed-in writer: refused ---'
set role anon;
\echo 'expect ERROR: permission denied for table dccr_call_history'
select count(*) from public.dccr_call_history;
reset role;
set role authenticated;
\echo 'expect ERROR: permission denied for table dccr_call_history'
insert into public.dccr_call_history (ucn, call_no) values ('DA-X', '1');
reset role;

delete from public.call_history where ucn like 'DA-%';
delete from public.dccr_call_history where ucn like 'DA-%';
