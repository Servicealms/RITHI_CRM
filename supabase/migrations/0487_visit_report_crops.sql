-- ===========================================================================
-- DAILY CUT-OUTS OF THE SERVICE VISIT DATE (the user, 2026-11-17: "Create a
-- Scheduled task to do this read report and crop and present this as Data on
-- a daily basis.. Basically without involving Haiku.. just the presentation
-- of data. Say today do this check for all calls with report updated
-- yesterday." -- chosen: a GitHub scheduled workflow, 06:00 India time).
--
-- public.visit_report_crops -- ONE ROW PER VISIT (unique report_uid): the
-- cut-out of the "Call No/UC No + Service Visit Date" box of the visit's
-- manual report, found by the form's ruled lines (else the printed label),
-- beside the visit as RITHI held it when cropped. No model reads it: a person
-- compares the cut-out with the Visit Date by eye, on Reports -> Visit Date
-- Check -> Daily cut-outs.
--
-- WRITTEN ONLY BY THE DAILY WORKFLOW (.github/workflows/daily-report-crops.yml,
-- as the database owner through SUPABASE_DB_URL): there is no insert, update
-- or delete policy, so nobody signed in writes one.
--   status: found (a cut-out is stored) | no_box (the report was opened and no
--   box found -- nothing to show, recorded so it is not tried again).
--   A report that could not be OPENED is not recorded, so the next run tries
--   it again (the workflow looks back three days).
--   entry_day: the India-time day of the visit's Visit Entry Date
--   (reports.updated_at) -- "report updated yesterday".
--
-- Read with visitdate.view, the key Visit Date Check already uses (0486):
-- granted to no role, held by an administrator.
-- ===========================================================================

create table if not exists public.visit_report_crops (
  id bigint generated always as identity primary key,
  report_uid text not null,
  ucn text not null default '',
  engineer text not null default '',
  visit_at timestamptz,
  entry_at timestamptz,
  entry_day date,
  manual_report text not null default '',
  status text not null check (status in ('found', 'no_box')),
  method text not null default '',
  note text not null default '',
  crop_jpeg text not null default '',
  ms integer not null default 0,
  created_at timestamptz not null default now()
);

create unique index if not exists visit_report_crops_report_uid on public.visit_report_crops (report_uid);
create index if not exists visit_report_crops_day on public.visit_report_crops (entry_day desc, id desc);

comment on table public.visit_report_crops is
  'Daily cut-outs (0487): the Service Visit Date box of each visit''s manual report, cropped by the daily workflow (no model), one per visit, for a person to compare with the Visit Date.';

alter table public.visit_report_crops enable row level security;

drop policy if exists visit_report_crops_read on public.visit_report_crops;
create policy visit_report_crops_read on public.visit_report_crops
  for select using ((select public.has_perm('visitdate.view')));

grant select on public.visit_report_crops to authenticated;
revoke all on public.visit_report_crops from anon;
revoke insert, update, delete on public.visit_report_crops from authenticated;

do $$
begin
  if to_regprocedure('public.sys_columns_attach(regclass)') is not null then
    perform public.sys_columns_attach('public.visit_report_crops'::regclass);
  end if;
end $$;
