-- ===========================================================================
-- WARRANTY FIRST EVERYWHERE (0491). A machine with BOTH a warranty and a
-- contract running reads WGP in the stored status (sync_product_machine), in
-- machine_cover and in the Product Database view; once the warranty ends it
-- reads the contract's type in all three.
-- Run after _stub.sql + every migration. Only `expect ERROR` errors allowed.
-- ===========================================================================
\set ON_ERROR_STOP off
\pset pager off

insert into public.products (item_name, serial_number, party_name) values ('WF MODEL', 'WF-1', 'WF PARTY');
insert into public.sale_entries (sa_number, party_name, warranty_start, warranty_end)
values ('SA-WF-1', 'WF PARTY', current_date - 200, current_date + 100);
insert into public.sale_items (sa_number, product_code, product_name, serial_number)
values ('SA-WF-1', 'WF MODEL', 'WF MODEL', 'WF-1');
insert into public.contract_entries (mc_number, party_name, contract_start, contract_end, contract_type)
values ('MC-WF-1', 'WF PARTY', current_date - 10, current_date + 300, 'Labour');
insert into public.contract_items (mc_number, product_code, product_name, serial_number)
values ('MC-WF-1', 'WF MODEL', 'WF MODEL', 'WF-1');
select public.sync_product_machine('WF MODEL', 'WF-1');

\echo -- 1. both running: expect WGP three times
select 'stored' as what, item_status from public.products where serial_number = 'WF-1'
union all select 'machine_cover', item_status from public.machine_cover where serial_number = 'WF-1'
union all select 'view', item_status from public.product_database where serial_number = 'WF-1';

\echo -- 2. the warranty ended yesterday: expect the contract in all three (stored and machine_cover write the type as recorded, Labour; the view reads AMC)
update public.sale_entries set warranty_end = current_date - 1 where sa_number = 'SA-WF-1';
select public.sync_product_machine('WF MODEL', 'WF-1');
select 'stored' as what, item_status from public.products where serial_number = 'WF-1'
union all select 'machine_cover', item_status from public.machine_cover where serial_number = 'WF-1'
union all select 'view', item_status from public.product_database where serial_number = 'WF-1';
