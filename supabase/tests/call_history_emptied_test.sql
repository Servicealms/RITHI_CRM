-- ===========================================================================
-- CALL HISTORY EMPTIED ONCE (0502): the first run empties every year's table;
-- a re-run -- as a bundle re-run is -- empties nothing. DCCR History and the
-- pre-split copy are not touched. No error is expected in this file.
-- ===========================================================================
\set ON_ERROR_STOP off
\pset pager off

select exists (select 1 from public.one_time_data_fixes where name = '0502_call_history_emptied')
       as "0502 recorded that it ran";

-- Loaded after the clean-up, as the re-load will be.
insert into public.call_history (ucn, call_no, call_at, source, record_year, register) values
  ('CHE-1', 'A', '2023-03-01 10:00+05:30', 'Yearly sheet', 2023, 'Field'),
  ('CHE-2', 'A', '2024-03-01 10:00+05:30', 'Yearly sheet', 2024, 'PM'),
  ('CHE-3', 'A', null,                     'Other',        null, 'Field');
\ir ../migrations/0502_call_history_emptied.sql
select (select count(*) from public.call_history where ucn like 'CHE-%') = 3
       as "a re-run empties nothing -- the re-load survives it";

-- The first run, on a project that has not had it: every year emptied, once.
delete from public.one_time_data_fixes where name = '0502_call_history_emptied';
create temp table pre_split_before as select count(*) as n from public.call_history_pre_split;
\ir ../migrations/0502_call_history_emptied.sql
select (select count(*) from public.call_history) = 0
       as "the first run empties every year, and Undated";
select (select note from public.one_time_data_fixes where name = '0502_call_history_emptied') like '%3 calls removed%'
       as "it records how many it removed";
select to_regclass('public.dccr_call_history') is not null
       as "DCCR History is a different table and is still there";
select (select count(*) from public.call_history_pre_split) = (select n from pre_split_before)
       as "the pre-split copy is left as it was";
