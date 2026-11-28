-- ===========================================================================
-- A CALL HISTORY UPLOAD, DELETED AS A WHOLE (0504): listed one row per upload;
-- deleted only by a holder of call_history.delete; another upload untouched;
-- the public key refused. Every error printed is labelled `expect ERROR`.
-- ===========================================================================
\set ON_ERROR_STOP off
\pset pager off

insert into auth.users (id, email) values
  ('10c00000-0000-0000-0000-0000000005a1', 'chud-admin@x.com'),
  ('10c00000-0000-0000-0000-0000000005a2', 'chud-office@x.com')
on conflict do nothing;
insert into public.profiles (id, email, full_name, role) values
  ('10c00000-0000-0000-0000-0000000005a1', 'chud-admin@x.com', 'CHUD Admin', 'admin'),
  ('10c00000-0000-0000-0000-0000000005a2', 'chud-office@x.com', 'CHUD Office', 'hotline')
on conflict do nothing;
-- An office role that may read every call but NOT delete.
update public.app_roles set permissions = (
  select coalesce(jsonb_agg(distinct p), '[]'::jsonb)
    from jsonb_array_elements_text(coalesce(permissions, '[]'::jsonb) || '["calls.view","bulk.upload"]'::jsonb) p
   where p <> 'call_history.delete')
 where role = 'hotline';

create or replace procedure public.be(p_email text) language plpgsql as $$
begin
  update public.harness set uid = (select id from auth.users where email = p_email), email = p_email;
end $$;
grant select on public.harness to anon, authenticated;

insert into public.call_history (ucn, call_no, call_at, source, record_year, register, upload_batch, upload_file) values
  ('CHUD-1', 'A', '2023-03-01 10:00+05:30', 'Yearly sheet', 2023, 'Field', 'B-ONE', 'field-23.csv'),
  ('CHUD-2', 'A', '2023-04-01 10:00+05:30', 'Yearly sheet', 2023, 'Field', 'B-ONE', 'field-23.csv'),
  ('CHUD-3', 'A', '2024-01-05 10:00+05:30', 'Yearly sheet', 2024, 'PM',    'B-TWO', 'pm-24.csv');

select (select calls from public.call_history_uploads where upload_batch = 'B-ONE') = 2
   and (select upload_file from public.call_history_uploads where upload_batch = 'B-ONE') = 'field-23.csv'
   and (select years from public.call_history_uploads where upload_batch = 'B-TWO') = '2024'
       as "each upload is one row, with its file, calls and years";

\echo ''
\echo '--- an office role without call_history.delete: nothing goes ---'
call public.be('chud-office@x.com');
set role authenticated;
delete from public.call_history where upload_batch = 'B-ONE';
reset role;
select (select count(*) from public.call_history where upload_batch = 'B-ONE') = 2
       as "without the permission, the upload is untouched";

\echo ''
\echo '--- an administrator: the whole upload goes, the other stays ---'
call public.be('chud-admin@x.com');
set role authenticated;
delete from public.call_history where upload_batch = 'B-ONE';
reset role;
select (select count(*) from public.call_history where upload_batch = 'B-ONE') = 0
   and (select count(*) from public.call_history where upload_batch = 'B-TWO') = 1
       as "the whole upload is deleted, and only that upload";

\echo ''
\echo '--- the permission ticked for the office role: it may delete ---'
update public.app_roles set permissions = permissions || '["call_history.delete"]'::jsonb where role = 'hotline';
call public.be('chud-office@x.com');
set role authenticated;
delete from public.call_history where upload_batch = 'B-TWO';
reset role;
select (select count(*) from public.call_history where upload_batch = 'B-TWO') = 0
       as "a role given call_history.delete may delete an upload";

\echo ''
\echo '--- the public key: refused ---'
update public.harness set uid = null, email = null;
set role anon;
\echo 'expect ERROR: permission denied for table call_history'
delete from public.call_history where upload_batch = 'B-TWO';
reset role;
