-- ===========================================================================
-- DRIVE REPORT LINKS MAPPED TO VISITS BY UID (0505): fills only a visit with
-- no report link, keeps one that has, names a UID with no visit, refuses a
-- value that is not a link, leaves the call's status alone, and asks
-- bulk.upload. Every error printed is labelled `expect ERROR`.
-- ===========================================================================
\set ON_ERROR_STOP off
\pset pager off

insert into auth.users (id, email) values
  ('10c00000-0000-0000-0000-0000000006a1', 'rdl-admin@x.com'),
  ('10c00000-0000-0000-0000-0000000006a2', 'rdl-eng@x.com')
on conflict do nothing;
insert into public.profiles (id, email, full_name, role) values
  ('10c00000-0000-0000-0000-0000000006a1', 'rdl-admin@x.com', 'RDL Admin', 'admin'),
  ('10c00000-0000-0000-0000-0000000006a2', 'rdl-eng@x.com', 'RDL Eng', 'engineer')
on conflict do nothing;
create or replace procedure public.be(p_email text) language plpgsql as $$
begin
  update public.harness set uid = (select id from auth.users where email = p_email), email = p_email;
end $$;
grant select on public.harness to anon, authenticated;

insert into public.reports (ucn, uid, call_status, manual_report, visit_at, updated_at) values
  ('RDL-1', 'RDL-V1', 'Solved - Report Pending', '', '2026-11-01 10:00+05:30', '2026-11-01 10:00+05:30'),
  ('RDL-2', 'RDL-V2', 'Solved - Report Completed', 'https://drive.google.com/file/d/old/view', '2026-11-02 10:00+05:30', '2026-11-02 10:00+05:30'),
  ('RDL-3', 'RDL-V3', 'Unsolved', '42Reportingv2_Images/x.jpg', '2026-11-03 10:00+05:30', '2026-11-03 10:00+05:30');

\echo '--- an engineer without bulk.upload: refused ---'
call public.be('rdl-eng@x.com');
set role authenticated;
\echo 'expect ERROR: Mapping Drive report links needs "Load registers in bulk"'
select public.map_report_drive_links('[{"uid":"RDL-V1","link":"https://drive.google.com/file/d/new1/view"}]');
reset role;

\echo '--- an administrator ---'
call public.be('rdl-admin@x.com');
set role authenticated;
create temp table res as select public.map_report_drive_links('[
  {"uid":"RDL-V1","link":"https://drive.google.com/file/d/new1/view"},
  {"uid":"RDL-V2","link":"https://drive.google.com/file/d/new2/view"},
  {"uid":"RDL-V3","link":"https://drive.google.com/file/d/new3/view"},
  {"uid":"RDL-NONE","link":"https://drive.google.com/file/d/x/view"},
  {"uid":"RDL-V1","link":"not a link"},
  {"uid":"","link":"https://drive.google.com/file/d/y/view"}]'::jsonb) as r;
reset role;

select (select (r->>'mapped')::int from res) = 2 as "a visit with no link, and one holding a path, are filled";
select (select r->'already_uids' from res) = '["RDL-V2"]'::jsonb as "a visit that already has a link is skipped and named";
select (select r->'not_found_uids' from res) = '["RDL-NONE"]'::jsonb as "a UID with no visit is held back and named";
select (select r->'bad_link_uids' from res) = '["RDL-V1"]'::jsonb and (select (r->>'blank_uid')::int from res) = 1
       as "a value that is not a link, and a blank UID, are refused and counted";
select (select manual_report from public.reports where uid = 'RDL-V1') = 'https://drive.google.com/file/d/new1/view'
   and (select manual_report from public.reports where uid = 'RDL-V2') = 'https://drive.google.com/file/d/old/view'
       as "the new link is written, the old one kept";
select (select source_ref from public.reports where uid = 'RDL-V3') = '42Reportingv2_Images/x.jpg'
       as "the path it replaced is kept in source_ref";
select (select call_status from public.reports where uid = 'RDL-V1') = 'Solved - Report Pending'
   and (select updated_at from public.reports where uid = 'RDL-V1') = '2026-11-01 10:00+05:30'::timestamptz
       as "the visit's status and entry time are untouched";
select not exists (select 1 from public.reports where uid = 'RDL-NONE') as "no visit is created";

\echo '--- the public key: refused ---'
update public.harness set uid = null, email = null;
set role anon;
\echo 'expect ERROR: permission denied for function map_report_drive_links'
select public.map_report_drive_links('[]');
reset role;
