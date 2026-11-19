-- ===========================================================================
-- THE STORED ITEM STATUS IS BROUGHT UP TO TODAY (0490). A warranty that ran
-- out yesterday stops reading WGP, a warranty still running reads WGP however
-- it was stored, a second run changes nothing, and the API roles cannot run it.
-- Run after _stub.sql + every migration. Only `expect ERROR` errors allowed.
-- ===========================================================================
\set ON_ERROR_STOP off
\pset pager off

insert into public.products (item_name, serial_number, party_name, warranty_start, warranty_end, item_status) values
 ('PSR MODEL', 'PSR-1', 'PSR PARTY', current_date - 400, current_date - 1, 'WGP'),   -- ran out yesterday
 ('PSR MODEL', 'PSR-2', 'PSR PARTY', current_date - 30,  current_date + 300, 'CMC'), -- warranty first
 ('PSR MODEL', 'PSR-3', 'PSR PARTY', current_date - 30,  current_date + 300, 'WGP'); -- already right

\echo -- 1. what the view says today: PSR-1 OGP, PSR-2 WGP, PSR-3 WGP
select serial_number, item_status from public.product_database where serial_number like 'PSR-%' order by 1;

\echo -- 2. the refresh changes the two that are out of date (expect 2)
select public.refresh_product_item_status() as changed;
select serial_number, item_status from public.products where serial_number like 'PSR-%' order by 1;

\echo -- 3. a second run changes nothing (expect 0)
select public.refresh_product_item_status() as changed;

\echo -- 4. a signed-in user cannot run it -- expect ERROR (permission denied)
set role authenticated;
select public.refresh_product_item_status();
reset role;

delete from public.products where serial_number like 'PSR-%';
