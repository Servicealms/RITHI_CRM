-- ===========================================================================
-- THE ENTRIES BEFORE A COUNT, ON REQUEST (0485).
--   handstock_movements_history carries every movement handstock_movements
--   does, PLUS those entered before the latest count of the line, marked
--   before_count. The figure is unchanged: summing the history's rows that are
--   NOT before_count gives the balance. A line never counted has no row marked.
--   It runs as its reader (an engineer sees only their own), and the public
--   key reads nothing.
-- Run after _stub.sql + every migration. Only `expect ERROR` errors allowed.
-- ===========================================================================
\set ON_ERROR_STOP off
\pset pager off

insert into auth.users (id,email) values
 ('ec485000-0000-0000-0000-000000000001','hbc_admin@x.com'),
 ('ec485000-0000-0000-0000-000000000002','hbc_eng@x.com'),
 ('ec485000-0000-0000-0000-000000000003','hbc_other@x.com')
on conflict do nothing;
insert into public.profiles (id,email,full_name,role) values
 ('ec485000-0000-0000-0000-000000000001','hbc_admin@x.com','HBC Admin','admin'),
 ('ec485000-0000-0000-0000-000000000002','hbc_eng@x.com','HBC Engineer','engineer'),
 ('ec485000-0000-0000-0000-000000000003','hbc_other@x.com','HBC Other','engineer')
on conflict (id) do update set role = excluded.role, full_name = excluded.full_name;
insert into public.user_directory (name, email, validity) values
 ('HBC Engineer', 'hbc_eng@x.com', true), ('HBC Other', 'hbc_other@x.com', true);
insert into public.parts (code, description, item_detail, category) values
 ('HBC-001', 'HBC PART ONE', 'HBC-001|HBC PART ONE', 'Spare'),
 ('HBC-002', 'HBC PART TWO', 'HBC-002|HBC PART TWO', 'Spare');
insert into public.handstock_opening (engineer, part, qty, as_of, source) values
 ('HBC Engineer', 'HBC-001|HBC PART ONE', 10, current_date - 3, 'HBC pool'),
 ('HBC Engineer', 'HBC-002|HBC PART TWO', 5,  current_date - 3, 'HBC pool'),
 ('HBC Other',    'HBC-001|HBC PART ONE', 7,  current_date - 3, 'HBC pool');
insert into public.handstock_adjustments (engineer, part, qty, reason)
values ('HBC Engineer', 'HBC-001|HBC PART ONE', -2, 'before the count');
set session_replication_role = replica;
update public.handstock_opening set sys_created_on = now() - interval '3 days' where engineer_key in ('hbc engineer', 'hbc other');
update public.handstock_adjustments set sys_created_on = now() - interval '2 days' where engineer_key = 'hbc engineer';
set session_replication_role = origin;

create or replace procedure public.be(p text) language plpgsql as $$
begin update public.harness set uid = (select id from auth.users where email = p), email = p; end $$;
grant select on public.harness to authenticated;

\echo '--- 1. the administrator counts HBC-001 at 6 ---'
call public.be('hbc_admin@x.com');
begin;
  set local role authenticated;
  insert into public.handstock_reconciliations (engineer, part, physical_qty) values ('HBC Engineer', 'HBC-001|HBC PART ONE', 6);
commit;

\echo '--- 2. the figure reads only the count; the history shows the opening and the adjustment too, marked ---'
\echo 'expect: movements 1 row (Reconciliation) | history 3 rows: Opening t, Adjustment t, Reconciliation f'
select count(*) as movements from public.handstock_movements where engineer_key = 'hbc engineer' and part_code = 'HBC-001';
select movement, before_count from public.handstock_movements_history
 where engineer_key = 'hbc engineer' and part_code = 'HBC-001' order by before_count desc, movement;

\echo '--- 3. the figure is unchanged: the history without the marked rows sums to the balance (6) ---'
\echo 'expect: 6 | 6'
select (select coalesce(sum(case when direction = 'IN' then qty else -qty end), 0) from public.handstock_movements
         where engineer_key = 'hbc engineer' and part_code = 'HBC-001') as from_movements,
       (select coalesce(sum(case when direction = 'IN' then qty else -qty end), 0) from public.handstock_movements_history
         where engineer_key = 'hbc engineer' and part_code = 'HBC-001' and not before_count) as from_history;

\echo '--- 4. a line never counted has nothing marked, and the two views agree row for row ---'
\echo 'expect: 0 marked | t'
select count(*) filter (where before_count) as marked from public.handstock_movements_history
 where engineer_key = 'hbc engineer' and part_code = 'HBC-002';
select not exists (
  select direction, movement, engineer_key, part_code, qty, moved_at, ref from public.handstock_movements
  except all
  select direction, movement, engineer_key, part_code, qty, moved_at, ref from public.handstock_movements_history where not before_count
) and not exists (
  select direction, movement, engineer_key, part_code, qty, moved_at, ref from public.handstock_movements_history where not before_count
  except all
  select direction, movement, engineer_key, part_code, qty, moved_at, ref from public.handstock_movements
) as same_rows;

\echo '--- 5. as the engineer: their own history only ---'
\echo 'expect: HBC Engineer rows > 0 | HBC Other rows 0'
call public.be('hbc_eng@x.com');
begin;
  set local role authenticated;
  select count(*) filter (where engineer_key = 'hbc engineer') as mine,
         count(*) filter (where engineer_key = 'hbc other') as theirs
    from public.handstock_movements_history;
rollback;

\echo '--- 6. the public key reads nothing ---'
begin;
  set local role anon;
\echo 'expect ERROR: permission denied for view handstock_movements_history'
  select count(*) from public.handstock_movements_history;
rollback;
