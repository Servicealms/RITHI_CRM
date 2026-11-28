-- ===========================================================================
-- DOES THE CONSUMPTION ALREADY IN RITHI BELONG TO THE CALL HISTORY CALLS?
--
-- The user, 2026-11-28: "I want to link the Consumption for these Historical
-- Calls. I Think the Data is already there." Before anything is linked, this
-- counts, for each table that records a spare consumed, how many of its lines
-- name a Call History call (by UC No., else by Call Number), how many name a
-- live call instead, and how many name neither -- and, from the other side,
-- how many Call History calls (per year) have any consumption at all.
-- Matching ignores case and surrounding spaces.
-- READ-ONLY, ONE GRID, COUNTS ONLY (the Actions log is public).
-- ===========================================================================
with hist as (
  select distinct upper(btrim(ucn)) as k from public.call_history where btrim(ucn) <> ''
),
hist_no as (
  select distinct upper(btrim(call_no)) as k from public.call_history where btrim(coalesce(call_no, '')) <> ''
),
live as (
  select upper(btrim(ucn)) as k from public.field_calls where btrim(coalesce(ucn, '')) <> ''
  union select upper(btrim(ucn)) from public.installation_calls where btrim(coalesce(ucn, '')) <> ''
  union select upper(btrim(ucn)) from public.pm_calls where btrim(coalesce(ucn, '')) <> ''
),
lines as (
  select 'spare_consumption' as tbl, upper(btrim(coalesce(ucn, ''))) as k_ucn, upper(btrim(coalesce(call_number, ''))) as k_no
    from public.spare_consumption
  union all
  select 'spare_consumption_history', upper(btrim(coalesce(ucn, ''))), upper(btrim(coalesce(call_number, '')))
    from public.spare_consumption_history
),
by_line as (
  select l.tbl,
         count(*) as lines,
         count(*) filter (where l.k_ucn = '') as no_ucn,
         count(*) filter (where h.k is not null) as hist_by_ucn,
         count(*) filter (where h.k is null and hn.k is not null) as hist_by_call_no_only,
         count(*) filter (where lv.k is not null) as live_by_ucn,
         count(*) filter (where h.k is not null and lv.k is not null) as in_both,
         count(*) filter (where h.k is null and hn.k is null and lv.k is null) as neither
    from lines l
    left join hist h on h.k = l.k_ucn and l.k_ucn <> ''
    left join hist_no hn on hn.k = l.k_no and l.k_no <> ''
    left join live lv on lv.k = l.k_ucn and l.k_ucn <> ''
   group by l.tbl
),
calls_with as (
  select coalesce(c.record_year::text, 'Undated') as yr,
         count(*) as calls,
         count(*) filter (where exists (select 1 from lines l where l.k_ucn = upper(btrim(c.ucn)) and l.tbl = 'spare_consumption')) as with_sc,
         count(*) filter (where exists (select 1 from lines l where l.k_ucn = upper(btrim(c.ucn)) and l.tbl = 'spare_consumption_history')) as with_sch
    from public.call_history c
   group by 1
)
select 'Lines in ' || tbl as "What", lines as "Count",
       hist_by_ucn as "Name a Call History call (UC No.)",
       hist_by_call_no_only as "...only by Call Number",
       live_by_ucn as "Name a live call (UC No.)",
       in_both as "Name both",
       neither as "Name neither",
       no_ucn as "No UC No."
  from by_line
union all
select 'Call History ' || yr || ': calls', calls, with_sc, with_sch, null, null, null, null
  from calls_with
order by 1;
