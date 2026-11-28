-- ===========================================================================
-- PRODUCT STATUS CHECK (0506): every call's Item Status against its cover AT
-- THE MOMENT IT WAS REGISTERED -- a contract entered after the call, even one
-- back-dated to cover the day, did not count then (the user's own example).
-- The report lists the mismatches and the spare requests they would move; the
-- update writes the status, the spare requests follow; Audit Mode, the page
-- key and the public key all refuse. Every error printed is labelled
-- `expect ERROR`.
-- ===========================================================================
\set ON_ERROR_STOP off
\pset pager off

insert into auth.users (id, email) values
  ('10c00000-0000-0000-0000-0000000007a1', 'psc-admin@x.com'),
  ('10c00000-0000-0000-0000-0000000007a2', 'psc-eng@x.com')
on conflict do nothing;
insert into public.profiles (id, email, full_name, role) values
  ('10c00000-0000-0000-0000-0000000007a1', 'psc-admin@x.com', 'PSC Admin', 'admin'),
  ('10c00000-0000-0000-0000-0000000007a2', 'psc-eng@x.com', 'PSC Eng', 'engineer')
on conflict do nothing;
create or replace procedure public.be(p_email text) language plpgsql as $$
begin
  update public.harness set uid = (select id from auth.users where email = p_email), email = p_email;
end $$;
grant select on public.harness to anon, authenticated;
update public.app_settings set value = 'off' where key = 'audit_mode';

-- THE USER'S EXAMPLE (PSC-1): a contract that ended on 10 Nov; a CMC from 11 Nov
-- ENTERED on 21 Nov; the call registered on 20 Nov 11:00. At registration: OGP.
insert into public.contract_entries (mc_number, party_name, entry_at, contract_type, contract_start, contract_end) values
  ('PSC-MC-OLD', 'PSC PARTY', '2025-11-11 10:00+05:30', 'CMC', '2025-11-11', '2026-11-10'),
  ('PSC-MC-NEW', 'PSC PARTY', '2026-11-21 10:00+05:30', 'CMC', '2026-11-11', '2027-11-10');
insert into public.contract_items (mc_number, product_name, serial_number) values
  ('PSC-MC-OLD', 'PSC MODEL', 'PSC-S1'), ('PSC-MC-NEW', 'PSC MODEL', 'PSC-S1');
-- PSC-2: a warranty entered long before, running on the day, stored OGP -> WGP.
-- PSC-3: the same machine, already right. PSC-4: no serial, stored CMC -> OGP.
insert into public.sale_entries (sa_number, party_name, entry_at, warranty_start, warranty_end) values
  ('PSC-SA-1', 'PSC PARTY', '2026-01-02 10:00+05:30', '2026-01-01', '2027-12-31');
insert into public.sale_items (sa_number, product_name, serial_number) values ('PSC-SA-1', 'PSC MODEL', 'PSC-S2');

insert into public.field_calls (ucn, call_number, call_type, product_name, serial, reg_date, reg_at, complaint_date, party_name, item_status, allocated_to) values
  ('PSC-1', 'C-PSC1', 'FIELD', 'PSC MODEL', 'PSC-S1', '2026-11-20', '2026-11-20 11:00+05:30', '2026-11-20', 'PSC PARTY', 'CMC', 'E'),
  ('PSC-2', 'C-PSC2', 'FIELD', 'PSC MODEL', 'PSC-S2', '2026-11-20', '2026-11-20 11:00+05:30', '2026-11-20', 'PSC PARTY', 'OGP', 'E'),
  ('PSC-3', 'C-PSC3', 'FIELD', 'PSC MODEL', 'PSC-S2', '2026-11-21', '2026-11-21 11:00+05:30', '2026-11-21', 'PSC PARTY', 'WGP', 'E'),
  ('PSC-4', 'C-PSC4', 'FIELD', 'PSC MODEL', '',       '2026-11-20', '2026-11-20 11:00+05:30', '2026-11-20', 'PSC PARTY', 'CMC', 'E');
insert into public.spare_requests (uid, engineer, ucn, complaint, item_status) values ('PSC-R2', 'E', 'PSC-2', 'x', 'OGP');

\echo '--- the rule ---'
select (select correct_status from public._product_status_judged() where ucn = 'PSC-1') = 'OGP'
       as "the user's example: a CMC entered the day AFTER registration did not count -> OGP";
select (select item_status from public.call_cover_as_of('PSC MODEL', 'PSC-S1', '2026-11-20')) = 'CMC'
       as "...where the old per-call rule, blind to entry time, says CMC";
select (select correct_status from public._product_status_judged() where ucn = 'PSC-2')
         = (select item_status from public.call_cover_as_of('PSC MODEL', 'PSC-S2', '2026-11-20'))
   and (select correct_status from public._product_status_judged() where ucn = 'PSC-2') = 'WGP'
       as "where entry time does not matter, the set-based rule agrees with call_cover_as_of";
select (select correct_status from public._product_status_judged() where ucn = 'PSC-4') = 'OGP'
       as "no serial -> OGP";

\echo '--- an engineer without the page: refused ---'
call public.be('psc-eng@x.com');
set role authenticated;
\echo 'expect ERROR: RBAC: the Product Status Check needs its page'
select count(*) from public.product_status_mismatches();
reset role;

\echo '--- the report, as an administrator ---'
call public.be('psc-admin@x.com');
set role authenticated;
create temp table rep as select * from public.product_status_mismatches() where ucn like 'PSC-%';
reset role;
select (select string_agg(ucn || ':' || stored_status || '>' || correct_status, ',' order by ucn) from rep)
         = 'PSC-1:CMC>OGP,PSC-2:OGP>WGP,PSC-4:CMC>OGP'
       as "the report lists the three mismatches, not the call already right";
select (select spare_requests from rep where ucn = 'PSC-2') = 1
   and (select spare_request_refs from rep where ucn = 'PSC-2') <> ''
       as "...with the spare request each would move (named by its OR number)";
select (select late_ref from rep where ucn = 'PSC-1') = 'PSC-MC-NEW'
   and (select late_note from rep where ucn = 'PSC-1') = 'Contract entry made after the call was registered'
   and (select late_entered_at from rep where ucn = 'PSC-1') = '2026-11-21 10:00+05:30'::timestamptz
       as "the example names the MC entered after registration, says so, and gives its entry time";
select (select cover_ref from rep where ucn = 'PSC-2') = 'PSC-SA-1' and (select late_ref from rep where ucn = 'PSC-2') = ''
       as "...and a call judged on cover that existed names that cover, with nothing entered late";

select (select spares_requested from rep where ucn = 'PSC-2') = 1 and (select spares_consumed from rep where ucn = 'PSC-2') = 0
   and (select spares_requested from rep where ucn = 'PSC-1') = 0
       as "each call carries its spares requested and consumed (0507)";

\echo '--- Audit Mode: refused ---'
update public.app_settings set value = 'on' where key = 'audit_mode';
set role authenticated;
\echo 'expect ERROR: Audit Mode is ON: the Product Status Check is not available'
select count(*) from public.product_status_mismatches();
reset role;
update public.app_settings set value = 'off' where key = 'audit_mode';

\echo '--- the update ---'
set role authenticated;
create temp table fixed as select public.fix_product_status(array['PSC-1', 'PSC-2', 'PSC-3', 'PSC-4']) as r;
reset role;
select (select (r->>'calls')::int from fixed) = 3 and (select (r->>'spare_requests')::int from fixed) = 1
       as "three calls and one spare request updated; the call already right is left";
select (select item_status from public.calls where ucn = 'PSC-1') = 'OGP'
   and (select item_status from public.calls where ucn = 'PSC-2') = 'WGP'
   and (select item_status from public.spare_requests where uid = 'PSC-R2') = 'WGP'
       as "the calls read their status at registration, and the spare request follows its call";
set role authenticated;
select not exists (select 1 from public.product_status_mismatches() where ucn like 'PSC-%') as "a second check finds nothing";
reset role;

\echo '--- the public key: refused ---'
update public.harness set uid = null, email = null;
set role anon;
\echo 'expect ERROR: permission denied for function product_status_mismatches'
select count(*) from public.product_status_mismatches();
\echo 'expect ERROR: permission denied for function fix_product_status'
select public.fix_product_status(array['PSC-1']);
reset role;
