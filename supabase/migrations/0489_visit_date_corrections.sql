-- ===========================================================================
-- VISIT DATES CORRECTED, AS A REPORT (the user, 2026-11-18: "Add a Flag that
-- the Date was Corrected and Present this as a Report ... Make a note of these
-- things - When was it Corrected, What was Present, Was is there at the
-- Present, Who did it." -- a NON-AUDITABLE requirement: hidden with Visit
-- Date Check when Audit Mode is on, once the user says "Act on Non Auditable
-- Backlog"; see docs/NON_AUDITABLE_BACKLOG.md).
--
-- public.visit_date_corrections -- ONE ROW PER CORRECTION of a visit's Visit
-- Date made through Visit Date Check, from either place it can be made:
--   * a Daily cut-out marked "Change" (visit_report_crops.review = 'corrected', 0488)
--   * a Haiku Read reading applied (visit_date_reads.resolution = 'applied', 0486)
-- Each row answers the four questions asked:
--   corrected_at                 -- WHEN it was corrected
--   was_visit_at                 -- WHAT WAS PRESENT before it
--   set_to_visit_at              -- what it was set to
--   now_visit_at / still_as_set  -- WHAT IS THERE AT PRESENT, and whether it
--                                   is still what the correction set
--   corrected_by(_name)          -- WHO DID IT
-- Nothing is stored twice: the view reads the two decision records and the
-- visit as it stands now. security_invoker, so the readers are exactly those
-- who may read the two tables (visitdate.view -- an administrator for now).
-- ===========================================================================

create or replace view public.visit_date_corrections
with (security_invoker = on) as
select 'Daily cut-out'::text        as source,
       c.id                         as source_id,
       c.reviewed_at                as corrected_at,
       c.reviewed_by                as corrected_by,
       p.full_name                  as corrected_by_name,
       c.report_uid,
       coalesce(r.ucn, c.ucn)       as ucn,
       coalesce(r.engineer, c.engineer) as engineer,
       c.old_visit_at               as was_visit_at,
       c.new_visit_at               as set_to_visit_at,
       r.visit_at                   as now_visit_at,
       (r.visit_at is not distinct from c.new_visit_at) as still_as_set,
       coalesce(r.manual_report, c.manual_report) as manual_report
  from public.visit_report_crops c
  left join public.reports r on r.uid = c.report_uid
  left join public.profiles p on p.id = c.reviewed_by
 where c.review = 'corrected'
union all
select 'Haiku Read'::text,
       v.id,
       v.resolved_at,
       v.resolved_by,
       p.full_name,
       v.report_uid,
       coalesce(r.ucn, v.ucn),
       r.engineer,
       v.old_visit_at,
       v.new_visit_at,
       r.visit_at,
       (r.visit_at is not distinct from v.new_visit_at),
       r.manual_report
  from public.visit_date_reads v
  left join public.reports r on r.uid = v.report_uid
  left join public.profiles p on p.id = v.resolved_by
 where v.resolution = 'applied';

comment on view public.visit_date_corrections is
  'Visit Dates corrected through Visit Date Check (0489): when, who, what was present, what it was set to, what is there now. Non-auditable (docs/NON_AUDITABLE_BACKLOG.md).';

grant select on public.visit_date_corrections to authenticated;
