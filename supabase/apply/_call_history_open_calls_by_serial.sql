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
--   * for the same serial in the same register, registered ON OR AFTER the
--     history call's date (what a carried-forward call would look like).
-- Joins on pre-aggregated keys, so it is quick on the live project.
-- READ-ONLY, ONE GRID, COUNTS ONLY (the Actions log is public).
-- ===========================================================================
with live as (
  select upper(btrim(serial)) as k_serial, 'Field' as reg, reg_date from public.field_calls
  union all
  select upper(btrim(serial)), 'Installation', reg_date from public.installation_calls
  union all
  select upper(btrim(serial)), 'PM', reg_date from public.pm_calls
),
any_reg as (select k_serial from live where k_serial <> '' group by k_serial),
same_reg as (select k_serial, reg, max(reg_date) as last_reg from live where k_serial <> '' group by k_serial, reg),
h as (
  select coalesce(h.record_year::text, 'Undated') as yr,
         coalesce(nullif(btrim(h.register), ''), '(none)') as hreg,
         coalesce(nullif(btrim(h.call_status), ''), '(blank)') as file_status,
         upper(btrim(coalesce(h.serial, ''))) as k_serial,
         (h.call_at at time zone 'Asia/Kolkata')::date as call_day
    from public.call_history h
   where coalesce((select nullif(btrim(e.value), '') from jsonb_each_text(coalesce(h.extra, '{}'::jsonb)) e
                    where lower(regexp_replace(e.key, '[^A-Za-z0-9]', '', 'g')) = 'openclose' limit 1), '') ilike 'open'
),
m as (
  select h.*, a.k_serial is not null as in_any, s.k_serial is not null as in_same,
         (s.last_reg is not null and h.call_day is not null and s.last_reg >= h.call_day) as in_same_after
    from h
    left join any_reg a on a.k_serial = h.k_serial and h.k_serial <> ''
    left join same_reg s on s.k_serial = h.k_serial and s.reg = h.hreg and h.k_serial <> ''
)
select case when grouping(yr) = 1 then 'ALL YEARS' else yr end          as "Year",
       case when grouping(hreg) = 1 then '— total —' else hreg end        as "Loaded as",
       case when grouping(file_status) = 1 then '' else file_status end   as "File Call Status",
       count(*)                                                           as "Open calls in the file",
       count(*) filter (where k_serial = '')                              as "No serial",
       count(*) filter (where in_any)                                     as "Live call, same serial",
       count(*) filter (where in_same)                                    as "...in the same register",
       count(*) filter (where in_same_after)                              as "...registered on or after it"
  from m
 group by grouping sets ((yr, hreg, file_status), (yr), ())
 order by grouping(yr), yr desc, grouping(hreg) desc, hreg, file_status;

-- THE CALLS THEMSELVES (Supabase SQL editor only -- never through the public
-- Actions log): every open Call History call of 2025 with no live call for the
-- same serial in the same register registered on or after it.
-- with live as (
--   select upper(btrim(serial)) s, 'Field' reg, reg_date from public.field_calls
--   union all select upper(btrim(serial)), 'Installation', reg_date from public.installation_calls
--   union all select upper(btrim(serial)), 'PM', reg_date from public.pm_calls)
-- select h.record_year, h.register, h.ucn, h.call_no, h.party_name, h.item_name, h.serial, h.call_status,
--        (h.call_at at time zone 'Asia/Kolkata')::date as call_day
--   from public.call_history h
--  where h.record_year = 2025
--    and exists (select 1 from jsonb_each_text(h.extra) e
--                 where lower(regexp_replace(e.key, '[^A-Za-z0-9]', '', 'g')) = 'openclose' and btrim(e.value) ilike 'open')
--    and not exists (select 1 from live l where l.s = upper(btrim(h.serial)) and l.reg = h.register
--                     and l.reg_date >= (h.call_at at time zone 'Asia/Kolkata')::date)
--  order by h.register, h.ucn;
