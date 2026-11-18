-- ===========================================================================
-- DAILY CUT-OUTS (0487). One per visit; nobody signed in writes one (the
-- daily job writes as the database owner); an administrator reads them and
-- an engineer does not; the public key reads nothing.
-- Run after _stub.sql + every migration. Only `expect ERROR` errors allowed.
-- ===========================================================================
\set ON_ERROR_STOP off
\pset pager off

insert into auth.users (id,email) values
 ('ec487000-0000-0000-0000-000000000001','vrc_admin@x.com'),
 ('ec487000-0000-0000-0000-000000000002','vrc_eng@x.com')
on conflict do nothing;
insert into public.profiles (id,email,full_name,role) values
 ('ec487000-0000-0000-0000-000000000001','vrc_admin@x.com','VRC Admin','admin'),
 ('ec487000-0000-0000-0000-000000000002','vrc_eng@x.com','VRC Engineer','engineer')
on conflict (id) do update set role = excluded.role, full_name = excluded.full_name;

-- Two visits: 10-Nov-2026 10:30 India time, entered 12-Nov.
insert into public.reports (ucn, uid, visit_at, updated_at, engineer) values
 ('VRC0001', 'VRC-1', '2026-11-10 10:30:00+05:30', '2026-11-12 09:00:00+05:30', 'VRC Engineer'),
 ('VRC0002', 'VRC-2', '2026-11-10 10:30:00+05:30', '2026-11-12 09:00:00+05:30', 'VRC Engineer');
-- As the daily job writes them (database owner).
insert into public.visit_report_crops (report_uid, ucn, entry_day, status, method, crop_jpeg) values
 ('VRC-1', 'VRC0001', current_date - 1, 'found', 'lines', 'data:image/jpeg;base64,AAAA'),
 ('VRC-2', 'VRC0002', current_date - 1, 'no_box', '', '');

create or replace procedure public.be(p text) language plpgsql as $$
begin update public.harness set uid = (select id from auth.users where email = p), email = p; end $$;
grant select on public.harness to authenticated;

\echo '--- 1. one cut-out per visit ---'
\echo 'expect ERROR: duplicate key (visit_report_crops_report_uid)'
insert into public.visit_report_crops (report_uid, status) values ('VRC-1', 'found');

\echo '--- 2. an unknown result is refused ---'
\echo 'expect ERROR: violates check constraint'
insert into public.visit_report_crops (report_uid, status) values ('VRC-9', 'maybe');

\echo '--- 3. the engineer sees none, the administrator both ---'
\echo 'expect: 0'
call public.be('vrc_eng@x.com');
begin; set local role authenticated;
  select count(*) as engineer_sees from public.visit_report_crops where ucn like 'VRC%';
commit;
\echo 'expect: 2'
call public.be('vrc_admin@x.com');
begin; set local role authenticated;
  select count(*) as admin_sees from public.visit_report_crops where ucn like 'VRC%';
commit;

\echo '--- 4. nobody signed in writes one, not even an administrator ---'
\echo 'expect ERROR: permission denied for table visit_report_crops'
begin; set local role authenticated;
  insert into public.visit_report_crops (report_uid, status) values ('VRC-8', 'found');
commit;

\echo '--- 5. the public key reads nothing ---'
\echo 'expect ERROR: permission denied for table visit_report_crops'
begin; set local role anon; select set_config('request.jwt.claim.role', 'anon', true);
  select count(*) from public.visit_report_crops;
commit;

\echo '--- 6. an engineer cannot correct from a cut-out ---'
call public.be('vrc_eng@x.com');
\echo 'expect ERROR: Only an administrator may correct a Visit Date from a report cut-out'
begin; set local role authenticated;
  select public.review_visit_report_crop((select id from public.visit_report_crops where report_uid = 'VRC-1'), date '2026-11-09');
commit;

\echo '--- 7. CHANGE: the day moves to 9-Nov, 10:30 kept, Visit Entry Date untouched ---'
call public.be('vrc_admin@x.com');
\echo 'expect: corrected'
begin; set local role authenticated;
  select public.review_visit_report_crop((select id from public.visit_report_crops where report_uid = 'VRC-1'), date '2026-11-09');
commit;
\echo 'expect: 2026-11-09 10:30 | entry 2026-11-12 09:00'
select to_char(visit_at at time zone 'Asia/Kolkata', 'YYYY-MM-DD HH24:MI') as visit,
       to_char(updated_at at time zone 'Asia/Kolkata', 'YYYY-MM-DD HH24:MI') as entry
  from public.reports where uid = 'VRC-1';

\echo '--- 8. decided once ---'
\echo 'expect ERROR: This cut-out was already used to change the Visit Date'
begin; set local role authenticated;
  select public.review_visit_report_crop((select id from public.visit_report_crops where report_uid = 'VRC-1'), null);
commit;

\echo '--- 9. a future day is refused ---'
\echo 'expect ERROR: is in the future -- not changed'
begin; set local role authenticated;
  select public.review_visit_report_crop((select id from public.visit_report_crops where report_uid = 'VRC-2'), current_date + 5);
commit;

\echo '--- 10. RITHI IS RIGHT: the visit stays ---'
\echo 'expect: confirmed | 2026-11-10 10:30'
begin; set local role authenticated;
  select public.review_visit_report_crop((select id from public.visit_report_crops where report_uid = 'VRC-2'), null);
commit;
select to_char(visit_at at time zone 'Asia/Kolkata', 'YYYY-MM-DD HH24:MI') as visit from public.reports where uid = 'VRC-2';

\echo '--- 11. the corrections report: one row for the change, none for the confirmation ---'
\echo 'expect: Daily cut-out | VRC0001 | 2026-11-10 10:30 | 2026-11-09 10:30 | 2026-11-09 10:30 | t | VRC Admin'
call public.be('vrc_admin@x.com');
begin; set local role authenticated;
  select source, ucn,
         to_char(was_visit_at at time zone 'Asia/Kolkata', 'YYYY-MM-DD HH24:MI') as was,
         to_char(set_to_visit_at at time zone 'Asia/Kolkata', 'YYYY-MM-DD HH24:MI') as set_to,
         to_char(now_visit_at at time zone 'Asia/Kolkata', 'YYYY-MM-DD HH24:MI') as now_is,
         still_as_set, corrected_by_name
    from public.visit_date_corrections where ucn like 'VRC%';
commit;
\echo 'expect: the visit changed again later reads still_as_set false'
update public.reports set visit_at = '2026-11-08 10:30:00+05:30' where uid = 'VRC-1';
begin; set local role authenticated;
  select still_as_set from public.visit_date_corrections where ucn = 'VRC0001';
commit;
\echo 'expect: engineer sees no corrections (0)'
call public.be('vrc_eng@x.com');
begin; set local role authenticated;
  select count(*) as engineer_sees from public.visit_date_corrections where ucn like 'VRC%';
commit;
