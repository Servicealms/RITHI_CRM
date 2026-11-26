-- ===========================================================================
-- WHY IS CALL PENDING REASON BLANK ON THE FIELD CALL EXPORT? -- read-only.
--
-- The user, 2026-11-26: "In Field Call Register - Export CSV / Excel, Column
-- for Call Pending Reason is there, but Data is not Present."
--
-- The register (and so its export) reads call_dates.pending_reason (0433,
-- 0479): the Call Pending Reason of the call's LATEST visit entry, and ONLY
-- WHILE THE CALL IS OPEN -- a Solved call is pending nothing and a Cancelled
-- one is not waiting, so both read blank by design (the user's rule,
-- 2026-10-13). This counts, for the FIELD calls, where each blank comes from,
-- so the export can be read against it:
--   rows 1-7   the counts
--   rows 101+  up to 25 OPEN calls whose latest visit has no pending reason
--              (the only blanks that are not by design), newest first
-- Changes nothing. Paste into the Supabase SQL editor and Run; ONE grid.
-- It names calls -- SQL editor only.
-- ===========================================================================
with c as (
  select f.ucn, f.reg_date, f.open_state, f.cancelled_at, f.reopened_at,
         (f.cancelled_at is null and (coalesce(f.open_state, '') <> 'Solved' or f.reopened_at is not null)) as is_open
    from public.field_calls f
),
lv as (   -- the latest visit entry, as call_dates and sync_call_last_visit read it
  select distinct on (r.ucn) r.ucn, r.pending_reason, r.call_status, r.updated_at,
         coalesce(r.data->>'Call Pending Reason', r.data->>'Pending Reason', '') as reason_in_data
    from public.reports r
    join c on c.ucn = r.ucn
   order by r.ucn, r.updated_at desc nulls last, r.id desc
),
j as (
  select c.*, lv.ucn is not null as has_visit,
         nullif(btrim(coalesce(lv.pending_reason, '')), '') as reason,
         nullif(btrim(lv.reason_in_data), '') as reason_in_data, lv.call_status, lv.updated_at
    from c left join lv on lv.ucn = c.ucn
),
counts as (
  select 1 as n, 'Field calls' as what, count(*)::text as value from j
  union all select 2, 'Solved (blank by design)', count(*) filter (where not is_open and cancelled_at is null)::text from j
  union all select 3, 'Cancelled (blank by design)', count(*) filter (where cancelled_at is not null)::text from j
  union all select 4, 'Open with no visit yet (blank: nothing to be pending on)', count(*) filter (where is_open and not has_visit)::text from j
  union all select 5, 'Open, latest visit HAS a pending reason (shows on the export)', count(*) filter (where is_open and reason is not null)::text from j
  union all select 6, 'Open, latest visit has NO pending reason', count(*) filter (where is_open and has_visit and reason is null)::text from j
  union all select 7, '...of which the reason is in the visit''s other fields but not its Pending Reason', count(*) filter (where is_open and has_visit and reason is null and reason_in_data is not null)::text from j
)
select n as row, what, value, '' as ucn, '' as latest_visit_status, '' as latest_visit_entered
  from counts
union all
select 100 + row_number() over (order by j.updated_at desc nulls last)::int, 'Open call, latest visit has no pending reason', coalesce(j.reason_in_data, ''), j.ucn,
       coalesce(j.call_status, ''), coalesce(to_char(j.updated_at at time zone 'Asia/Kolkata', 'DD-Mon-YYYY HH24:MI:SS'), '')
  from j
 where j.is_open and j.has_visit and j.reason is null
order by 1
limit 32;
