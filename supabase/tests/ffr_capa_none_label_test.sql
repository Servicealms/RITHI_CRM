-- ===========================================================================
-- THE "NO CAPA" WORDS ARE A SETTING (0494). "No" by default; Admin Config
-- changes them and every report follows; an earlier wording on a later write
-- is saved with today's; only config.manage (or an administrator) may change
-- them, and the public key cannot call it at all.
-- Run after _stub.sql + every migration. Only `expect ERROR` errors allowed.
-- ===========================================================================
\set ON_ERROR_STOP off
\pset pager off

insert into auth.users (id,email) values
 ('ec494000-0000-0000-0000-000000000001','cnl_admin@x.com'),
 ('ec494000-0000-0000-0000-000000000002','cnl_eng@x.com')
on conflict do nothing;
insert into public.profiles (id,email,full_name,role) values
 ('ec494000-0000-0000-0000-000000000001','cnl_admin@x.com','CNL Admin','admin'),
 ('ec494000-0000-0000-0000-000000000002','cnl_eng@x.com','CNL Engineer','engineer')
on conflict (id) do update set role = excluded.role;
create or replace procedure public.be(p text) language plpgsql as $$
begin update public.harness set uid = (select id from auth.users where email = p), email = p; end $$;
grant select on public.harness to authenticated;

insert into public.field_failure_reports (ucn, capa_responsibility) values
 ('CNL1', 'No'), ('CNL2', 'NRCK');

\echo -- 1. the default is No, and an old wording written now is saved as No
select public.ffr_capa_none_label() = 'No' as default_is_no;
insert into public.field_failure_reports (ucn, capa_responsibility) values ('CNL3', 'CAPA Not Required');
select capa_responsibility = 'No' as reworded from public.field_failure_reports where ucn = 'CNL3';

\echo -- 2. an engineer cannot change it -- expect ERROR (RBAC)
call public.be('cnl_eng@x.com');
set role authenticated;
select public.set_ffr_capa_none_label('Nil');
reset role;

\echo -- 3. an administrator can, and every report follows (expect 2 changed; NRCK untouched)
call public.be('cnl_admin@x.com');
set role authenticated;
select public.set_ffr_capa_none_label('Nil') as changed;
reset role;
select string_agg(ucn || '=' || capa_responsibility, ', ' order by ucn) from public.field_failure_reports where ucn like 'CNL%';

\echo -- 4. blank is refused -- expect ERROR
select public.set_ffr_capa_none_label('  ');

\echo -- 5. the public key cannot call it -- expect ERROR (permission denied)
set role anon;
select public.set_ffr_capa_none_label('X');
reset role;
