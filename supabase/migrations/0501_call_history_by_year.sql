-- ===========================================================================
-- 0501 -- CALL HISTORY IS STORED YEAR BY YEAR (the user, 2026-11-28: "In Call
-- History Add Tabs Per year ... It should be Stored in Separate Database for
-- the Year."; asked, chose: a call that appears in two yearly sheets is KEPT
-- IN EACH YEAR, and a call whose file names no year takes the year of its call
-- date).
--
-- call_history becomes a table PARTITIONED BY record_year: each year's calls
-- are stored in a table of their own -- call_history_y2023, call_history_y2024
-- ... -- and call_history_undated holds a call with no year at all. The name
-- every screen, upload and Machine History uses is unchanged.
--
-- WHAT CHANGES WITH IT:
--   * The key is UC No. + Call No. + YEAR. The same call in the 2023 and the
--     2024 sheet is two records, each as that year's file had it -- no longer
--     one record showing the later year with the earlier tucked inside it.
--     The copies 0432 tucked inside a later year's record (`duplicates`) move
--     OUT into their own year, whole, with their own load time.
--   * Within ONE year, two sources of the same call (e-service and WinMax both
--     naming 2021) are still one record: the newer load shows, the other is
--     kept in `duplicates` and the call flagged Duplicate (0432's rule, now
--     within a year).
--   * The YEAR IS GIVEN BY THE UPLOAD, never filled in here. A row is routed to
--     its year's table BEFORE any trigger runs, so a trigger may not change it
--     -- call_history_year_default (0432) is dropped. The Call History upload
--     sends the year chosen, else the year of each call's call date
--     (uploads.ts); a row with neither lands in call_history_undated.
--
-- HOW: a new partitioned table is built beside the old one, every record is
-- copied into it -- triggers held off, so no load time is rewritten -- the
-- dependent views are rebuilt on it, and the names are swapped. THE OLD TABLE
-- IS KEPT, as call_history_pre_split, locked away from every API role, until
-- somebody decides it can go. One record_audit row says what moved.
--
-- RE-RUNNABLE: once call_history is partitioned this skips the move and only
-- makes sure every year from 2015 to 2030 has its table.
-- ===========================================================================

-- ---- 1. the move --------------------------------------------------------------
do $$
declare
  v_kind   "char";
  y        integer;
  v_rows   bigint := 0;
  v_copies bigint := 0;
  v_merged bigint := 0;
  e        record;
  v_rec    jsonb;
begin
  if to_regclass('public.call_history') is null then return; end if;
  select c.relkind into v_kind from pg_class c where c.oid = 'public.call_history'::regclass;
  if v_kind = 'p' then return; end if;

  -- The new table, partitioned by year: the same columns, defaults and checks.
  create table public.call_history_by_year
    (like public.call_history including defaults including constraints)
    partition by list (record_year);
  -- The id keeps its sequence, owned now by the table that will carry the name.
  alter sequence public.call_history_id_seq owned by public.call_history_by_year.id;

  -- A table for every year there is a record of, and for 2015-2030.
  for y in
    select distinct v from (
      select h.record_year as v from public.call_history h where h.record_year is not null
      union
      select public.call_history_year((d->>'record_year')::int, (d->>'call_at')::timestamptz)
        from public.call_history h, jsonb_array_elements(coalesce(h.duplicates, '[]'::jsonb)) d
      union
      select generate_series(2015, 2030)
    ) s where v is not null order by 1
  loop
    execute format('create table public.%I partition of public.call_history_by_year for values in (%s)',
                   'call_history_y' || y, y);
  end loop;
  create table public.call_history_undated partition of public.call_history_by_year default;

  -- THE KEY: UC No. + Call No. + year. NULLS NOT DISTINCT, so an undated call
  -- loaded twice is one record, not two.
  create unique index call_history_by_year_key on public.call_history_by_year
    (ucn, call_no, record_year) nulls not distinct;

  -- Every record as it stands -- its own year's duplicates stay with it.
  insert into public.call_history_by_year select h.* from public.call_history h;
  get diagnostics v_rows = row_count;
  update public.call_history_by_year b
     set duplicates = k.same, duplicate = jsonb_array_length(k.same) > 0
    from (select h.id,
                 coalesce(jsonb_agg(d) filter (
                   where public.call_history_year((d->>'record_year')::int, (d->>'call_at')::timestamptz)
                         is not distinct from h.record_year), '[]'::jsonb) as same
            from public.call_history h
           cross join lateral jsonb_array_elements(h.duplicates) d
           where jsonb_array_length(coalesce(h.duplicates, '[]'::jsonb)) > 0
           group by h.id, h.record_year) k
   where b.id = k.id;

  -- ...and every copy of ANOTHER year, out into its own year, whole.
  for e in
    select h.ucn, h.call_no, d as rec,
           public.call_history_year((d->>'record_year')::int, (d->>'call_at')::timestamptz) as yr
      from public.call_history h
     cross join lateral jsonb_array_elements(coalesce(h.duplicates, '[]'::jsonb)) d
     where public.call_history_year((d->>'record_year')::int, (d->>'call_at')::timestamptz)
           is distinct from h.record_year
     order by (d->>'loaded_at')::timestamptz desc nulls last
  loop
    if exists (select 1 from public.call_history_by_year b
                where b.ucn = e.ucn and b.call_no = e.call_no and b.record_year is not distinct from e.yr) then
      -- That year already holds the call (from another source): kept with it.
      update public.call_history_by_year b
         set duplicates = b.duplicates || jsonb_build_array(e.rec), duplicate = true
       where b.ucn = e.ucn and b.call_no = e.call_no and b.record_year is not distinct from e.yr;
      v_merged := v_merged + 1;
    else
      insert into public.call_history_by_year (ucn, call_no, call_at, call_type, party_name, state, city, engineer,
             item_code, item_name, serial, standard_complaint, complaint_reported, item_status, warranty_start,
             contract_type, call_status, solved_at, extra, loaded_at, source, record_year, duplicate, duplicates, register)
      values (e.ucn, e.call_no, (e.rec->>'call_at')::timestamptz, coalesce(e.rec->>'call_type', ''),
              coalesce(e.rec->>'party_name', ''), coalesce(e.rec->>'state', ''), coalesce(e.rec->>'city', ''),
              coalesce(e.rec->>'engineer', ''), coalesce(e.rec->>'item_code', ''), coalesce(e.rec->>'item_name', ''),
              coalesce(e.rec->>'serial', ''), coalesce(e.rec->>'standard_complaint', ''),
              coalesce(e.rec->>'complaint_reported', ''), coalesce(e.rec->>'item_status', ''),
              (e.rec->>'warranty_start')::date, coalesce(e.rec->>'contract_type', ''),
              coalesce(e.rec->>'call_status', ''), (e.rec->>'solved_at')::timestamptz,
              coalesce(e.rec->'extra', '{}'::jsonb) || jsonb_build_object('moved_by', '0501'),
              coalesce((e.rec->>'loaded_at')::timestamptz, now()), coalesce(e.rec->>'source', ''), e.yr,
              false, '[]'::jsonb, public.call_register_of(e.rec->>'call_type'));
      v_copies := v_copies + 1;
    end if;
  end loop;

  -- The views that read the old table, dropped here and rebuilt below on the new.
  drop view if exists public.call_history_summary;
  drop view if exists public.call_history_choices;

  -- The swap. The old table keeps its rows, under a name nothing reads, locked.
  alter index if exists public.call_history_key rename to call_history_pre_split_key;
  alter index if exists public.call_history_serial_idx rename to call_history_pre_split_serial_idx;
  alter index if exists public.call_history_call_at_idx rename to call_history_pre_split_call_at_idx;
  alter index if exists public.call_history_duplicate_idx rename to call_history_pre_split_duplicate_idx;
  alter table public.call_history rename to call_history_pre_split;
  revoke all on public.call_history_pre_split from anon, authenticated;
  alter table public.call_history_by_year rename to call_history;
  alter index public.call_history_by_year_key rename to call_history_key;

  if to_regclass('public.record_audit') is not null then
    insert into public.record_audit (table_name, op, record_key, actor, actor_email, old_data, new_data)
    values ('call_history', 'BULK MOVE', null, null, null, jsonb_build_object('stored', 'one table'),
            jsonb_build_object('rows', v_rows, 'copies', v_copies, 'kept_with_same_year', v_merged,
              'note', '0501: Call History stored year by year (partitioned by record_year); the copies of other years kept inside a record moved out into their own year; the old table kept as call_history_pre_split.'));
  end if;
  raise notice '0501: % record(s) copied; % copy(ies) of another year moved out into their own year; % kept with a record of the same year',
    v_rows, v_copies, v_merged;
end $$;

-- ---- 2. a table for every year 2015-2030 (also on a re-run) -------------------
do $$
declare y integer;
begin
  if (select relkind from pg_class where oid = to_regclass('public.call_history')) is distinct from 'p' then return; end if;
  for y in select generate_series(2015, 2030) loop
    if to_regclass('public.call_history_y' || y) is null then
      execute format('create table public.%I partition of public.call_history for values in (%s)', 'call_history_y' || y, y);
    end if;
  end loop;
end $$;

-- ---- 3. what the table needs, on the parent (copied to every year) -----------
create index if not exists call_history_serial_idx on public.call_history (serial);
create index if not exists call_history_call_at_idx on public.call_history (call_at);
create index if not exists call_history_duplicate_idx on public.call_history (duplicate) where duplicate;
create index if not exists call_history_id_idx on public.call_history (id);

-- A record of the call, whole -- for `duplicates`. Rebuilt on the new table's
-- row type; the one bound to the old table goes with it.
drop function if exists public.call_history_record(public.call_history_pre_split);
create or replace function public.call_history_record(r public.call_history)
returns jsonb language sql immutable set search_path = public as $$
  select jsonb_strip_nulls(jsonb_build_object(
    'source', r.source, 'record_year', r.record_year, 'call_at', r.call_at, 'call_type', r.call_type,
    'party_name', r.party_name, 'state', r.state, 'city', r.city, 'engineer', r.engineer,
    'item_code', r.item_code, 'item_name', r.item_name, 'serial', r.serial,
    'standard_complaint', r.standard_complaint, 'complaint_reported', r.complaint_reported,
    'item_status', r.item_status, 'warranty_start', r.warranty_start, 'contract_type', r.contract_type,
    'call_status', r.call_status, 'solved_at', r.solved_at, 'extra', r.extra, 'loaded_at', r.loaded_at))
$$;

-- THE SAME YEAR, ANOTHER SOURCE (0432's rule, within a year now): the newer
-- load shows, the held record is kept in `duplicates`. The record is built from
-- OLD's fields here rather than through call_history_record(), because inside a
-- year's table OLD has that table's row type, not the parent's.
create or replace function public.call_history_keep_latest()
returns trigger language plpgsql set search_path = public as $$
declare v_rest jsonb;
begin
  new.source := btrim(coalesce(new.source, ''));
  if new.source = coalesce(old.source, '') then
    new.duplicate := old.duplicate;
    new.duplicates := old.duplicates;
    return new;
  end if;
  select coalesce(jsonb_agg(e), '[]'::jsonb) into v_rest
    from jsonb_array_elements(coalesce(old.duplicates, '[]'::jsonb)) e
   where coalesce(e->>'source', '') not in (coalesce(old.source, ''), new.source);
  new.duplicates := v_rest || jsonb_build_array(jsonb_strip_nulls(jsonb_build_object(
    'source', old.source, 'record_year', old.record_year, 'call_at', old.call_at, 'call_type', old.call_type,
    'party_name', old.party_name, 'state', old.state, 'city', old.city, 'engineer', old.engineer,
    'item_code', old.item_code, 'item_name', old.item_name, 'serial', old.serial,
    'standard_complaint', old.standard_complaint, 'complaint_reported', old.complaint_reported,
    'item_status', old.item_status, 'warranty_start', old.warranty_start, 'contract_type', old.contract_type,
    'call_status', old.call_status, 'solved_at', old.solved_at, 'extra', old.extra, 'loaded_at', old.loaded_at)));
  new.duplicate := true;
  return new;
end $$;
revoke execute on function public.call_history_keep_latest() from public, anon, authenticated;

-- Triggers on the parent are copied to every year's table. The YEAR trigger is
-- not among them: the year routes the row, so the upload gives it.
drop trigger if exists call_history_year_default on public.call_history;
drop trigger if exists call_history_stamp on public.call_history;
create trigger call_history_stamp before insert or update on public.call_history
  for each row execute function public.call_history_stamp();
drop trigger if exists call_history_register on public.call_history;
create trigger call_history_register before insert or update on public.call_history
  for each row execute function public.call_history_register();
drop trigger if exists call_history_zz_keep_latest on public.call_history;
create trigger call_history_zz_keep_latest before update on public.call_history
  for each row execute function public.call_history_keep_latest();
do $$
begin
  if to_regprocedure('public.sys_stamp()') is not null
     and not exists (select 1 from pg_trigger where tgrelid = 'public.call_history'::regclass and tgname = 'zzz_sys_stamp') then
    create trigger zzz_sys_stamp before insert or update on public.call_history
      for each row execute function public.sys_stamp();
  end if;
end $$;

-- READ LIKE A CALL, WRITTEN WITH bulk.upload (0429's policies, word for word).
alter table public.call_history enable row level security;
drop policy if exists ch_read on public.call_history;
create policy ch_read on public.call_history for select using (
  (select public.has_perm('calls.view'))
  and ((select public.can_view_all_calls())
       or btrim(engineer) = ''
       or lower(btrim(engineer)) in (select lower(btrim(v.n)) from public.visible_engineer_names() v(n)))
);
drop policy if exists ch_insert on public.call_history;
create policy ch_insert on public.call_history for insert with check ((select public.has_perm('bulk.upload')));
drop policy if exists ch_update on public.call_history;
create policy ch_update on public.call_history for update
  using ((select public.has_perm('bulk.upload'))) with check ((select public.has_perm('bulk.upload')));
revoke all on public.call_history from anon, authenticated;
grant select, insert, update on public.call_history to authenticated;
revoke all on sequence public.call_history_id_seq from anon;

-- EACH YEAR'S TABLE IS REACHED ONLY THROUGH call_history: row-level security
-- on with no policy, and no API role granted anything, so nobody reads or
-- writes a year's table directly past the parent's policies.
do $$
declare p record;
begin
  for p in select c.oid::regclass as t from pg_inherits i join pg_class c on c.oid = i.inhrelid
            where i.inhparent = 'public.call_history'::regclass loop
    execute format('alter table %s enable row level security', p.t);
    execute format('revoke all on %s from anon, authenticated', p.t);
  end loop;
end $$;

-- THE FIVE SYSTEM COLUMNS (0244), attached to the parent: the columns and the
-- stamp reach every year's table from it, and each year's table gets its own
-- key. On a fresh apply sys_columns runs later and does the same.
do $$
begin
  if to_regprocedure('public.sys_columns_attach(regclass)') is null then return; end if;
  perform public.sys_columns_attach('public.call_history'::regclass);
end $$;

comment on table public.call_history is
  'Calls before RITHI (up to 2025), kept apart from every workflow (0429), STORED YEAR BY YEAR (0501): partitioned by record_year into call_history_y<year>, call_history_undated for a call with no year. One row per UC No. + Call No. + year -- the same call in two yearly sheets is kept in each; two sources of one year are one record with the other in `duplicates`. The year is given by the upload.';

-- ---- 4. the views that read it, rebuilt on it ---------------------------------
-- 0495's summary, word for word.
create or replace view public.call_history_summary as
select h.record_year,
       coalesce(nullif(btrim(h.source), ''), '(not recorded)')   as source,
       coalesce(h.register, '(not recorded)')                    as register,
       count(*)::int                                             as calls,
       count(*) filter (where h.duplicate)::int                  as duplicates,
       count(*) filter (where btrim(coalesce(h.serial, '')) = '')::int as without_serial,
       min(h.call_at)                                            as first_call_at,
       max(h.call_at)                                            as last_call_at,
       max(h.loaded_at)                                          as last_loaded_at,
       (array_agg(h.loaded_by order by h.loaded_at desc nulls last))[1] as last_loaded_by
  from public.call_history h
 group by 1, 2, 3;
alter view public.call_history_summary set (security_invoker = on);
grant select on public.call_history_summary to authenticated;
revoke all on public.call_history_summary from anon;

-- 0500's dropdown values, word for word.
create or replace view public.call_history_choices as
select 'product'::text as kind, h.item_name as value, count(*)::int as calls
  from public.call_history h where btrim(h.item_name) <> '' group by h.item_name
union all
select 'engineer', h.engineer, count(*)::int
  from public.call_history h where btrim(h.engineer) <> '' group by h.engineer
union all
select 'status', h.call_status, count(*)::int
  from public.call_history h where btrim(h.call_status) <> '' group by h.call_status;
alter view public.call_history_choices set (security_invoker = on);
grant select on public.call_history_choices to authenticated;
revoke all on public.call_history_choices from anon;
