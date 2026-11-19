-- ===========================================================================
-- A COVER IS ACTIVE FROM ITS START, NOT ONLY UNTIL ITS END (0491 / 0492).
-- A contract entered ahead (starting after today) is not running: the saved
-- status, machine_cover and the Product Database view all read the warranty
-- while it runs, and OGP once it has ended and before the contract begins.
-- The order (warranty vs contract) is NOT tested here -- it is on hold.
-- Run after _stub.sql + every migration. Only `expect ERROR` errors allowed.
-- ===========================================================================
\set ON_ERROR_STOP off
\pset pager off

insert into public.products (item_name, serial_number, party_name) values
 ('CAS MODEL', 'CAS-1', 'CAS PARTY'),   -- warranty running, contract starts next year
 ('CAS MODEL', 'CAS-2', 'CAS PARTY');   -- warranty ended, contract starts next month
insert into public.sale_entries (sa_number, party_name, warranty_start, warranty_end) values
 ('SA-CAS-1', 'CAS PARTY', current_date - 200, current_date + 100),
 ('SA-CAS-2', 'CAS PARTY', current_date - 400, current_date - 35);
insert into public.sale_items (sa_number, product_code, product_name, serial_number) values
 ('SA-CAS-1', 'CAS MODEL', 'CAS MODEL', 'CAS-1'),
 ('SA-CAS-2', 'CAS MODEL', 'CAS MODEL', 'CAS-2');
insert into public.contract_entries (mc_number, party_name, contract_start, contract_end, contract_type) values
 ('MC-CAS-1', 'CAS PARTY', current_date + 101, current_date + 466, 'CMC'),
 ('MC-CAS-2', 'CAS PARTY', current_date + 30,  current_date + 395, 'CMC');
insert into public.contract_items (mc_number, product_code, product_name, serial_number) values
 ('MC-CAS-1', 'CAS MODEL', 'CAS MODEL', 'CAS-1'),
 ('MC-CAS-2', 'CAS MODEL', 'CAS MODEL', 'CAS-2');
select public.sync_product_machine('CAS MODEL', 'CAS-1');
select public.sync_product_machine('CAS MODEL', 'CAS-2');

\echo -- expect CAS-1 WGP and CAS-2 OGP in all three (no CMC: neither contract has started)
select 'saved' as what, serial_number, item_status from public.products where serial_number like 'CAS-%'
union all select 'machine_cover', serial_number, item_status from public.machine_cover where serial_number like 'CAS-%'
union all select 'view', serial_number, item_status from public.product_database where serial_number like 'CAS-%'
order by 2, 1;
