-- ===========================================================================
-- THE CALL HISTORY SCREEN'S SUMMARY (0495): one row per year x source x call
-- type, counted by the database, read as its reader, refused to the public key.
-- Every error printed is labelled `expect ERROR`.
-- ===========================================================================
\set ON_ERROR_STOP off
\pset pager off

insert into auth.users (id, email) values
  ('10c00000-0000-0000-0000-0000000004a1', 'chs-admin@x.com')
on conflict do nothing;
insert into public.profiles (id, email, full_name, role) values
  ('10c00000-0000-0000-0000-0000000004a1', 'chs-admin@x.com', 'CHS Admin', 'admin')
on conflict do nothing;

create or replace procedure public.be(p_email text) language plpgsql as $$
begin
  update public.harness set uid = (select id from auth.users where email = p_email), email = p_email;
end $$;
grant select on public.harness to anon, authenticated;

-- Through the triggers, as an upload writes them: the year comes from the
-- sheet when given, else from the call date.
-- The year is given, as the upload gives it (0501).
insert into public.call_history (ucn, call_no, call_at, source, record_year, register, serial) values
  ('CHS5-1', 'A', '2023-03-01 10:00+05:30', 'Yearly sheet', 2023, 'Field', '101'),
  ('CHS5-2', 'A', '2023-04-01 10:00+05:30', 'Yearly sheet', 2023, 'Field', ''),
  ('CHS5-3', 'A', '2023-05-01 10:00+05:30', 'Yearly sheet', 2023, 'PM',    '103'),
  ('CHS5-4', 'A', '2024-01-05 10:00+05:30', 'WinMax',       2024, 'Field', '104');
-- The same call from ANOTHER SOURCE of 2023: one record, the other flagged with it.
insert into public.call_history (ucn, call_no, call_at, source, record_year, register, serial) values
  ('CHS5-1', 'A', '2023-03-01 10:00+05:30', 'e-service', 2023, 'Field', '101')
on conflict (ucn, call_no, record_year) do update set source = excluded.source,
  call_at = excluded.call_at, register = excluded.register, serial = excluded.serial;

select (select calls from public.call_history_summary where record_year = 2023 and source = 'Yearly sheet' and register = 'Field') = 1
   and (select calls from public.call_history_summary where record_year = 2023 and source = 'e-service' and register = 'Field') = 1
       as "a call is counted once in its year, under the source it is shown with";
select (select duplicates from public.call_history_summary where record_year = 2023 and source = 'e-service' and register = 'Field') = 1
       as "the duplicate is counted";
select (select without_serial from public.call_history_summary where record_year = 2023 and source = 'Yearly sheet' and register = 'Field') = 1
       as "a call with no serial is counted";
select (select calls from public.call_history_summary where record_year = 2023 and register = 'PM') = 1
   and (select calls from public.call_history_summary where record_year = 2024 and source = 'WinMax') = 1
       as "PM is its own row, and each year its own";
select (select sum(calls) from public.call_history_summary where source in ('Yearly sheet', 'WinMax', 'e-service')) = 4
       as "the rows add up to the calls held";

\echo ''
\echo '--- signed in as an administrator: reads the same totals ---'
call public.be('chs-admin@x.com');
set role authenticated;
select (select sum(calls) from public.call_history_summary where source in ('Yearly sheet', 'WinMax', 'e-service')) = 4
       as "an administrator reads every call";
reset role;

\echo ''
\echo '--- the public key: refused ---'
update public.harness set uid = null, email = null;
set role anon;
\echo 'expect ERROR: permission denied for view call_history_summary'
select count(*) from public.call_history_summary;
reset role;

select exists (select 1 from public.app_roles where role = 'admin'
                and (jsonb_array_length(permissions) = 0 or permissions ? 'mod:/call-history'))
       as "the page key is the administrator's";
