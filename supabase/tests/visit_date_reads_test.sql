-- ===========================================================================
-- VISIT DATE CHECK (0486).
--   A reading is one per visit; nobody signed in can write one (only the Edge
--   Function, as the service role). The report is visible to a holder of
--   visitdate.view -- an administrator -- and to nobody else by default.
--   resolve_visit_date_read(): APPLY moves the visit's day to the day read,
--   keeping its time of day and leaving the Visit Entry Date alone; KEEP leaves
--   the visit; each reading is decided once; a date in the future is refused;
--   only a holder of visitdate.fix may decide; the public key cannot call it.
-- Run after _stub.sql + every migration. Only `expect ERROR` errors allowed.
-- ===========================================================================
\set ON_ERROR_STOP off
\pset pager off

insert into auth.users (id,email) values
 ('ec486000-0000-0000-0000-000000000001','vdr_admin@x.com'),
 ('ec486000-0000-0000-0000-000000000002','vdr_eng@x.com')
on conflict do nothing;
insert into public.profiles (id,email,full_name,role) values
 ('ec486000-0000-0000-0000-000000000001','vdr_admin@x.com','VDR Admin','admin'),
 ('ec486000-0000-0000-0000-000000000002','vdr_eng@x.com','VDR Engineer','engineer')
on conflict (id) do update set role = excluded.role, full_name = excluded.full_name;

-- Two visits: 10-Nov-2026 10:30 India time, entered 12-Nov.
insert into public.reports (ucn, uid, visit_at, updated_at, engineer) values
 ('VDR0001', 'VDR-1', '2026-11-10 10:30:00+05:30', '2026-11-12 09:00:00+05:30', 'VDR Engineer'),
 ('VDR0002', 'VDR-2', '2026-11-10 10:30:00+05:30', '2026-11-12 09:00:00+05:30', 'VDR Engineer');
-- Readings as the Edge Function writes them (service role).
insert into public.visit_date_reads (report_uid, ucn, recorded_visit_at, read_date, read_as_written, outcome, model, tried) values
 ('VDR-1', 'VDR0001', '2026-11-10 10:30:00+05:30', '2026-11-09', '9/11/26', 'mismatch', 'claude-haiku-5-5', '{claude-haiku-5-5}'),
 ('VDR-2', 'VDR0002', '2026-11-10 10:30:00+05:30', current_date + 5, 'x', 'mismatch', 'claude-sonnet-5-5', '{claude-haiku-5-5,claude-sonnet-5-5}');

create or replace procedure public.be(p text) language plpgsql as $$
begin update public.harness set uid = (select id from auth.users where email = p), email = p; end $$;
grant select on public.harness to authenticated;

\echo '--- 1. one reading per visit ---'
\echo 'expect ERROR: duplicate key (visit_date_reads_report_uid)'
insert into public.visit_date_reads (report_uid, outcome) values ('VDR-1', 'match');

\echo '--- 2. who sees the report: the engineer nothing, the administrator both ---'
\echo 'expect: engineer 0'
call public.be('vdr_eng@x.com');
begin; set local role authenticated;
  select count(*) as engineer_sees from public.visit_date_check where ucn like 'VDR%';
commit;
\echo 'expect: admin 2'
call public.be('vdr_admin@x.com');
begin; set local role authenticated;
  select count(*) as admin_sees from public.visit_date_check where ucn like 'VDR%';
commit;

\echo '--- 3. nobody signed in writes a reading, not even an administrator ---'
\echo 'expect ERROR: permission denied for table visit_date_reads'
begin; set local role authenticated;
  insert into public.visit_date_reads (report_uid, outcome) values ('VDR-9', 'match');
commit;

\echo '--- 4. an engineer cannot decide ---'
call public.be('vdr_eng@x.com');
\echo 'expect ERROR: Only an administrator may correct a Visit Date'
begin; set local role authenticated;
  select public.resolve_visit_date_read((select id from public.visit_date_reads where report_uid = 'VDR-1'), true);
commit;

\echo '--- 5. APPLY: the day moves to 9-Nov, 10:30 kept, Visit Entry Date untouched ---'
call public.be('vdr_admin@x.com');
\echo 'expect: applied'
begin; set local role authenticated;
  select public.resolve_visit_date_read((select id from public.visit_date_reads where report_uid = 'VDR-1'), true);
commit;
\echo 'expect: 2026-11-09 10:30 | entry 2026-11-12 09:00'
select to_char(visit_at at time zone 'Asia/Kolkata', 'YYYY-MM-DD HH24:MI') as visit,
       to_char(updated_at at time zone 'Asia/Kolkata', 'YYYY-MM-DD HH24:MI') as entry
  from public.reports where uid = 'VDR-1';
\echo 'expect: applied | old 2026-11-10 10:30 | new 2026-11-09 10:30 | by VDR Admin'
select resolution,
       to_char(old_visit_at at time zone 'Asia/Kolkata', 'YYYY-MM-DD HH24:MI') as old_at,
       to_char(new_visit_at at time zone 'Asia/Kolkata', 'YYYY-MM-DD HH24:MI') as new_at,
       resolved_by_name
  from public.visit_date_check where report_uid = 'VDR-1';

\echo '--- 6. a reading is decided once ---'
\echo 'expect ERROR: This reading was already applied to the visit'
begin; set local role authenticated;
  select public.resolve_visit_date_read((select id from public.visit_date_reads where report_uid = 'VDR-1'), false);
commit;

\echo '--- 7. a date in the future is not applied ---'
\echo 'expect ERROR: is in the future -- not applied'
begin; set local role authenticated;
  select public.resolve_visit_date_read((select id from public.visit_date_reads where report_uid = 'VDR-2'), true);
commit;

\echo '--- 8. KEEP: the visit stays as it was ---'
\echo 'expect: kept | 2026-11-10 10:30'
begin; set local role authenticated;
  select public.resolve_visit_date_read((select id from public.visit_date_reads where report_uid = 'VDR-2'), false);
commit;
select to_char(visit_at at time zone 'Asia/Kolkata', 'YYYY-MM-DD HH24:MI') as visit from public.reports where uid = 'VDR-2';

\echo '--- 9. the public key cannot call it ---'
\echo 'expect ERROR: permission denied for function resolve_visit_date_read'
begin; set local role anon;
  select public.resolve_visit_date_read(1, false);
commit;
