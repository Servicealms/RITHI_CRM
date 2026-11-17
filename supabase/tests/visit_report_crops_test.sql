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
