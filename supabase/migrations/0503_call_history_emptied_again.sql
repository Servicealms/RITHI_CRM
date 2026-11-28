-- ===========================================================================
-- 0503  CALL HISTORY EMPTIED A SECOND TIME
--
-- The user, 2026-11-28, after 0502 had emptied it (9,234 calls) and files had
-- been loaded again: "clean it again". 0502 cannot do it -- it is ONCE by
-- design and its record is present -- so this is the second once, with its own
-- record, exactly 0502's rules:
--   * TRUNCATE public.call_history: the parent and every year's table;
--   * once only: a re-run of daily_review.sql finds the
--     '0503_call_history_emptied_again' row in one_time_data_fixes and does
--     nothing, so it can never delete a later re-load;
--   * NOT touched: dccr_call_history, call_history_pre_split (the way back),
--     the upload audit lines;
--   * prints the count removed, numbers only (the Actions log is public).
-- ===========================================================================

do $$
declare
  n_calls bigint;
begin
  if to_regclass('public.call_history') is null or to_regclass('public.one_time_data_fixes') is null then
    raise notice '0503: call_history or one_time_data_fixes missing -- nothing to empty';
    return;
  end if;
  if exists (select 1 from public.one_time_data_fixes where name = '0503_call_history_emptied_again') then
    raise notice '0503: Call History was emptied the second time before -- not emptied again';
    return;
  end if;
  select count(*) into n_calls from public.call_history;
  truncate table public.call_history;
  insert into public.one_time_data_fixes (name, note)
  values ('0503_call_history_emptied_again', format('Call History emptied a second time: %s calls removed', n_calls));
  raise notice '0503: Call History emptied -- % calls removed', n_calls;
end $$;
