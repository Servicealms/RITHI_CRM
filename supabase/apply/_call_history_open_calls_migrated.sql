-- ===========================================================================
-- WERE THE OPEN CALLS IN CALL HISTORY MOVED INTO THE LIVE REGISTERS?
--
-- The user, 2026-11-28: "All Open Calls from Previous year were migrated to
-- the Current Call register - Field / Installation / PM - Can you check and
-- Confirm on that?"
--
-- READ-ONLY. ONE GRID (the SQL editor shows only the last). COUNTS ONLY -- no
-- UCN, name or call number -- because it is also run through the Actions
-- probe, whose log is public. For the UCNs themselves, run the commented query
-- at the end in the Supabase SQL editor.
--
-- For every Call History call, grouped by year, the register it was loaded as,
-- the file's own Call Status and the file's Open/Close: how many are in a live
-- register by UC No. (the same register or another), how many are in none,
-- how many of those are found by Call Number instead, and what state the live
-- copy is in now. "Open" is not decided here -- the file's own two columns are
-- shown, so the reader sees exactly which calls the file called open.
-- Matching ignores case and surrounding spaces.
-- ===========================================================================
with live as (
  select upper(btrim(ucn)) as k_ucn, upper(btrim(coalesce(call_number, ''))) as k_no,
         'Field' as reg, open_state, cancelled_at from public.field_calls
  union all
  select upper(btrim(ucn)), upper(btrim(coalesce(call_number, ''))),
         'Installation', open_state, cancelled_at from public.installation_calls
  union all
  select upper(btrim(ucn)), upper(btrim(coalesce(call_number, ''))),
         'PM', open_state, cancelled_at from public.pm_calls
),
by_ucn as (
  select distinct on (k_ucn) k_ucn, reg, open_state, cancelled_at
    from live where k_ucn <> '' order by k_ucn, reg
),
by_no as (
  select distinct k_no from live where k_no <> ''
),
h as (
  select coalesce(h.record_year::text, 'Undated') as yr,
         coalesce(nullif(btrim(h.register), ''), '(none)') as hreg,
         coalesce(nullif(btrim(h.call_status), ''), '(blank)') as file_status,
         coalesce((select nullif(btrim(e.value), '') from jsonb_each_text(coalesce(h.extra, '{}'::jsonb)) e
                    where lower(regexp_replace(e.key, '[^A-Za-z0-9]', '', 'g')) = 'openclose' limit 1), '(blank)') as file_open_close,
         u.reg as live_reg, u.open_state, u.cancelled_at,
         (u.k_ucn is null and n.k_no is not null) as found_by_call_no_only
    from public.call_history h
    left join by_ucn u on u.k_ucn = upper(btrim(h.ucn))
    left join by_no  n on n.k_no  = upper(btrim(coalesce(h.call_no, ''))) and btrim(coalesce(h.call_no, '')) <> ''
)
select case when grouping(yr) = 1 then 'ALL YEARS' else yr end           as "Year",
       case when grouping(hreg) = 1 then '— total —' else hreg end         as "Loaded as",
       case when grouping(file_status) = 1 then '' else file_status end    as "File Call Status",
       case when grouping(file_open_close) = 1 then '' else file_open_close end as "File Open/Close",
       count(*)                                                            as "Calls",
       count(*) filter (where live_reg = hreg)                             as "In the same live register",
       count(*) filter (where live_reg is not null and live_reg <> hreg)   as "In another live register",
       count(*) filter (where live_reg is null)                            as "In no live register (by UC No.)",
       count(*) filter (where found_by_call_no_only)                       as "...of those, found by Call Number",
       count(*) filter (where live_reg is not null and cancelled_at is null
                          and coalesce(open_state, '') not ilike 'solved%'
                          and coalesce(open_state, '') <> 'Cancelled')     as "Live copy open now",
       count(*) filter (where live_reg is not null and coalesce(open_state, '') ilike 'solved%') as "Live copy solved",
       count(*) filter (where live_reg is not null and (cancelled_at is not null or open_state = 'Cancelled')) as "Live copy cancelled"
  from h
 group by grouping sets ((yr, hreg, file_status, file_open_close), (yr), ())
 order by grouping(yr), yr desc, grouping(hreg) desc, hreg, file_open_close, file_status;

-- THE UCNs (Supabase SQL editor only -- never through the public Actions log):
-- select h.record_year, h.register, h.ucn, h.call_no, h.call_status
--   from public.call_history h
--  where not exists (select 1 from public.field_calls c where upper(btrim(c.ucn)) = upper(btrim(h.ucn)))
--    and not exists (select 1 from public.installation_calls c where upper(btrim(c.ucn)) = upper(btrim(h.ucn)))
--    and not exists (select 1 from public.pm_calls c where upper(btrim(c.ucn)) = upper(btrim(h.ucn)))
--  order by h.record_year desc, h.ucn;
