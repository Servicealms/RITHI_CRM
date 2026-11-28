-- ===========================================================================
-- THE OPEN CALLS OF CALL HISTORY: IS THERE A LIVE CALL FOR THE SAME MACHINE?
--
-- Follows _call_history_open_calls_migrated.sql, which found NO Call History
-- call in any live register by UC No. (2026-11-28) -- so a call carried into
-- RITHI, if it was, carries a NEW UC No. This asks by the MACHINE instead.
--
-- "Open" is the FILE'S OWN Open/Close = Open. For each, grouped by year, the
-- register it was loaded as and the file's Call Status: is there a live call
--   * for the same serial (any register),
--   * for the same serial in the same register,
--   * for the same serial, registered ON OR AFTER the history call's date,
--   * whose extra (the columns its own upload kept) mentions the old UC No.
-- READ-ONLY, ONE GRID, COUNTS ONLY (the Actions log is public).
-- ===========================================================================
with live as (
  select upper(btrim(serial)) as k_serial, 'Field' as reg, reg_date, extra::text as x from public.field_calls
  union all
  select upper(btrim(serial)), 'Installation', reg_date, extra::text from public.installation_calls
  union all
  select upper(btrim(serial)), 'PM', reg_date, extra::text from public.pm_calls
),
h as (
  select coalesce(h.record_year::text, 'Undated') as yr,
         coalesce(nullif(btrim(h.register), ''), '(none)') as hreg,
         coalesce(nullif(btrim(h.call_status), ''), '(blank)') as file_status,
         upper(btrim(h.serial)) as k_serial, upper(btrim(h.ucn)) as k_ucn,
         (h.call_at at time zone 'Asia/Kolkata')::date as call_day
    from public.call_history h
   where coalesce((select nullif(btrim(e.value), '') from jsonb_each_text(coalesce(h.extra, '{}'::jsonb)) e
                    where lower(regexp_replace(e.key, '[^A-Za-z0-9]', '', 'g')) = 'openclose' limit 1), '') ilike 'open'
)
select case when grouping(yr) = 1 then 'ALL YEARS' else yr end          as "Year",
       case when grouping(hreg) = 1 then '— total —' else hreg end        as "Loaded as",
       case when grouping(file_status) = 1 then '' else file_status end   as "File Call Status",
       count(*)                                                           as "Open calls in the file",
       count(*) filter (where k_serial = '')                              as "No serial",
       count(*) filter (where exists (select 1 from live l where l.k_serial = h.k_serial and h.k_serial <> ''))
                                                                          as "Live call, same serial",
       count(*) filter (where exists (select 1 from live l where l.k_serial = h.k_serial and h.k_serial <> '' and l.reg = h.hreg))
                                                                          as "...in the same register",
       count(*) filter (where exists (select 1 from live l where l.k_serial = h.k_serial and h.k_serial <> ''
                                        and l.reg = h.hreg and l.reg_date >= h.call_day))
                                                                          as "...registered on or after it",
       count(*) filter (where exists (select 1 from live l where h.k_ucn <> '' and l.x ilike '%' || h.k_ucn || '%'))
                                                                          as "Live call naming the old UC No."
  from h
 group by grouping sets ((yr, hreg, file_status), (yr), ())
 order by grouping(yr), yr desc, grouping(hreg) desc, hreg, file_status;
