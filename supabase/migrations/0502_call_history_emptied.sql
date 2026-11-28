-- ===========================================================================
-- 0502  CALL HISTORY EMPTIED, ONCE, FOR A CLEAN RE-LOAD
--
-- The user, 2026-11-28: "Clean up what is already Loaded in Call History";
-- asked what that should do, chose "Delete everything and re-load" -- every
-- year, every source -- so the files can be uploaded again in the F/I Call
-- Register format (0.10.290), whose "Call Registeration Date" the upload did
-- not read before, leaving those calls undated.
--
-- ONCE, AND ONLY ONCE. The apply bundles are RE-RUN (daily_review.sql is run
-- again whenever a row of _status.sql asks for it), and a bare TRUNCATE here
-- would empty Call History on every one of those runs -- deleting the re-load
-- this migration exists for. So it records that it has run in
-- public.one_time_data_fixes and does nothing when that row is present: a
-- re-run is a no-op; a fresh rebuild empties an empty table and records it.
--
-- WHAT IS EMPTIED: public.call_history -- the parent and every year's table
-- (TRUNCATE on a partitioned table empties every partition). Nothing else:
--   * dccr_call_history (DCCR History) is a different table and is untouched;
--   * call_history_pre_split, the one-table copy 0501 kept, is LEFT AS IT IS --
--     it is the only way back if this was not wanted, and has no API access;
--   * the upload audit lines (who loaded what, when) stay -- they are a record
--     of what happened, not the data.
-- Nothing reads call_history to make anything else (it is history kept apart,
-- 0429), so no call, visit, review or count elsewhere changes.
--
-- The counts it removed are printed (numbers only -- the Actions log is public).
-- ===========================================================================

create table if not exists public.one_time_data_fixes (
  name       text primary key,
  applied_at timestamptz not null default now(),
  note       text not null default ''
);
alter table public.one_time_data_fixes enable row level security;
revoke all on public.one_time_data_fixes from anon, authenticated;
do $$
begin
  if to_regprocedure('public.sys_columns_attach(regclass)') is not null then
    perform public.sys_columns_attach('public.one_time_data_fixes'::regclass);
  end if;
end $$;

do $$
declare
  n_calls bigint;
begin
  if to_regclass('public.call_history') is null then
    raise notice '0502: call_history missing -- nothing to empty';
    return;
  end if;
  if exists (select 1 from public.one_time_data_fixes where name = '0502_call_history_emptied') then
    raise notice '0502: Call History was emptied before -- not emptied again';
    return;
  end if;
  select count(*) into n_calls from public.call_history;
  truncate table public.call_history;
  insert into public.one_time_data_fixes (name, note)
  values ('0502_call_history_emptied', format('Call History emptied for a clean re-load: %s calls removed', n_calls));
  raise notice '0502: Call History emptied -- % calls removed', n_calls;
end $$;
