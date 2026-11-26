-- ===========================================================================
-- ONE CALL: EVERYTHING ABOUT IT, AND EVERY AUDIT ENTRY -- read-only.
--
-- The user, 2026-11-26: "I want to pull Full Details and Audit Log of
-- 26K11F0027".
--
-- ONE GRID, in this order (`section`):
--   1 Call            -- the call row, whichever register holds it
--   2 Request         -- the call registration request it came from
--   3 Visit           -- every visit report, oldest first
--   4 Review          -- the Daily Complaint Review
--   5 FFR             -- a Field Failure Report raised on it
--   6 Spare request   -- each request, then 7 Spare line for each line
--   8 Consumption     -- every spare booked against it (voided lines too)
--   9 Feedback        -- customer feedback on it
--  10 Database trail  -- record_audit: what the DATABASE saw change, with the
--                        values before and after, on the call and on its
--                        visits, requests, lines, consumption and feedback
--  11 App audit log   -- audit_log: what the app recorded people doing to it
-- `detail` is the row as JSON (system columns left out); `at` is India time.
--
-- Changes nothing. CHANGE THE UCN on the marked line. Paste into the Supabase
-- SQL editor and Run; "Download CSV" there keeps the whole grid. It names
-- customers and staff -- SQL editor only, never the public GitHub workflow.
-- ===========================================================================
with k as (select '26K11F0027'::text as ucn),          -- <<< the call
strip as (select array['sys_id', 'sys_created_by', 'sys_created_on', 'sys_updated_by', 'sys_updated_on'] as cols),
call_row as (
  select 'Field call' as reg, to_jsonb(f) as j, f.created_at as at from public.field_calls f, k where f.ucn = k.ucn
  union all select 'Installation call', to_jsonb(i), i.created_at from public.installation_calls i, k where i.ucn = k.ucn
  union all select 'PM call', to_jsonb(p), p.created_at from public.pm_calls p, k where p.ucn = k.ucn
),
keys as (   -- every record key that belongs to this call, for the database trail
  select k.ucn as key from k
  union select r.uid from public.reports r, k where r.ucn = k.ucn
  union select s.uid from public.spare_requests s, k where s.ucn = k.ucn
  union select l.line_uid from public.spare_request_lines l join public.spare_requests s on s.uid = l.request_uid, k where s.ucn = k.ucn
  union select c.id::text from public.spare_consumption c, k where c.ucn = k.ucn
  union select fb.id::text from public.feedback fb, k where fb.ucn = k.ucn
),
rows as (
  select 1 as section, 'Call' as what, c.at, coalesce(c.j->>'created_by', '') as who, c.reg as note, c.j as detail from call_row c
  union all
  select 2, 'Request', q.submitted_at, coalesce(q.engineer, q.email), coalesce(q.reqid, '') || ' ' || coalesce(q.status, ''), to_jsonb(q)
    from public.call_requests q, k where q.ucn = k.ucn
  union all
  select 3, 'Visit', coalesce(r.visit_at, r.updated_at), coalesce(r.engineer, ''), coalesce(r.call_status, '') || ' · entered ' || coalesce(to_char(r.updated_at at time zone 'Asia/Kolkata', 'DD-Mon-YYYY HH24:MI:SS'), '?'), to_jsonb(r)
    from public.reports r, k where r.ucn = k.ucn
  union all
  select 4, 'Review', coalesce(v.updated_at, v.created_at), coalesce(v.updated_by::text, ''), 'Review 2 ' || case when v.review2_done then 'done' else 'open' end || ' · Review 3 ' || case when v.review3_done then 'done' else 'open' end, to_jsonb(v)
    from public.call_reviews v, k where v.ucn = k.ucn
  union all
  select 5, 'FFR', f.created_at, '', coalesce(f.ffr_no, ''), to_jsonb(f)
    from public.field_failure_reports f, k where f.ucn = k.ucn
  union all
  select 6, 'Spare request', s.created_at, coalesce(s.engineer, ''), coalesce(s.uid, '') || ' · ' || coalesce(s.stage, ''), to_jsonb(s)
    from public.spare_requests s, k where s.ucn = k.ucn
  union all
  select 7, 'Spare line', l.created_at, coalesce(s.engineer, ''), coalesce(l.line_uid, '') || ' · ' || coalesce(l.part, '') || ' × ' || coalesce(l.qty::text, '') || ' · ' || coalesce(l.stage, ''), to_jsonb(l)
    from public.spare_request_lines l join public.spare_requests s on s.uid = l.request_uid, k where s.ucn = k.ucn
  union all
  select 8, 'Consumption', c.created_at, coalesce(c.engineer, ''), coalesce(c.part, '') || ' × ' || coalesce(c.qty::text, '') || case when c.original_qty is not null and c.qty = 0 then ' (voided)' else '' end, to_jsonb(c)
    from public.spare_consumption c, k where c.ucn = k.ucn
  union all
  select 9, 'Feedback', coalesce(fb.entry_at, fb.created_at), coalesce(fb.engineer, ''), '', to_jsonb(fb)
    from public.feedback fb, k where fb.ucn = k.ucn
  union all
  select 10, 'Database trail', a.changed_at, coalesce(a.actor_email, '(the database)'), a.op || ' ' || a.table_name || ' ' || coalesce(a.record_key, ''),
         jsonb_build_object('before', a.old_data, 'after', a.new_data)
    from public.record_audit a, k
   where a.record_key in (select key from keys)
      or a.new_data->>'ucn' = k.ucn or a.old_data->>'ucn' = k.ucn
  union all
  select 11, 'App audit log', l.at, coalesce(nullif(l.actor, ''), l.email, ''), l.action || ' · ' || coalesce(l.status, ''),
         jsonb_build_object('target', l.target, 'error', l.error, 'meta', l.meta, 'role', l.role)
    from public.audit_log l, k
   where l.target = k.ucn or l.meta::text like '%' || k.ucn || '%'
)
select r.section, r.what,
       to_char(r.at at time zone 'Asia/Kolkata', 'DD-Mon-YYYY HH24:MI:SS') as at,
       r.who, r.note,
       (select r.detail - s.cols from strip s)::text as detail
  from rows r
 order by r.section, r.at nulls first;
