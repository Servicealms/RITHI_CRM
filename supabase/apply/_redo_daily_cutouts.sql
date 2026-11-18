-- ===========================================================================
-- CLEAR THE DAILY CUT-OUTS MADE BEFORE A MOMENT, SO THEY ARE CROPPED AGAIN
-- (the user, 2026-11-18: "Crops look like this. Keep only the starting point
-- on the left, go till end of the width"). The cut-outs stored before the
-- full-width change (v0.10.261) stop at the label column; the daily job never
-- crops a visit twice, so they must be cleared for "Crop this day now" (or the
-- next 06:00 run, for the last three days) to make them again.
--
-- Only visit_report_crops is touched: a cut-out is a derived picture, not a
-- record -- the visit and its manual report are untouched.
--
-- HOW TO RUN IT (Supabase SQL editor):
--   1. Run it AS IT IS: nothing changes; the grid shows, per day entered, how
--      many cut-outs were made before the cut-off.
--   2. Change false to true on the apply line and run it again.
--   3. On Visit Date Check -> Daily cut-outs, pick each day and press
--      "Crop this day now".
-- ===========================================================================
with ask as (
  select false as apply,                                      -- <<<< SET TO true TO CLEAR
         timestamptz '2026-11-18 12:00:00+05:30' as before    -- cut-outs made before this moment
),
old as (
  select c.id, c.entry_day from public.visit_report_crops c, ask a where c.created_at < a.before
),
gone as (
  delete from public.visit_report_crops c using ask a
   where a.apply and c.id in (select id from old)
  returning c.id
)
select * from (
  select 0 as n, 'mode' as what,
         case when (select apply from ask) then 'APPLIED' else 'DRY RUN -- nothing changed; set apply = true to clear' end as value
  union all
  select 1, 'cut-outs made before ' || to_char((select before from ask) at time zone 'Asia/Kolkata', 'DD-Mon-YYYY HH24:MI') || ' (India time)',
         (select count(*) from old)::text
  union all
  select 100 + row_number() over (order by entry_day)::int, '  entered on ' || to_char(entry_day, 'DD-Mon-YYYY'), count(*)::text
    from old group by entry_day
  union all
  select 999, 'cleared', (select count(*) from gone)::text
) r order by n;
