-- ===========================================================================
-- VISIT DATE CHECK: what a model read on the manual report, kept, and the
-- Visit Date corrected from it on an administrator's say-so (the user,
-- 2026-11-17: "Lets do only Visit Date. Drop the UCN. If Haiku Fails then go
-- to Sonnet. And have a Mechanism to store the REsults back in Supabase DB and
-- Add it as a Report under Reports. And Also add a Provision for Admin [I will
-- change this later via Roles and Permission] to update the Visit Date in the
-- Actual Visit Record." -- and: "The Same records need not be re-run.")
--
-- 1. public.visit_date_reads -- ONE ROW PER VISIT (unique report_uid), so a
--    visit checked once is not checked again. Written ONLY by the Edge
--    Function read-report-box, as the service role: there is no insert,
--    update or delete policy, so a reading in this table is one a model
--    produced, not one somebody typed. A run where both models erred is NOT
--    stored, so that visit is tried again next time.
--    outcome: match (the date read is the visit's day in India time),
--    mismatch (a different day, or the visit has no date), unreadable
--    (neither model could read a date), no_box (the device found no Service
--    Visit Date box on the report, so nothing was sent -- stored so the visit
--    is not tried again; a report that could not be OPENED is not stored).
--
-- 2. public.visit_date_check -- the report: each reading beside the visit's
--    date as it stands NOW (it may have been corrected since).
--
-- 3. public.resolve_visit_date_read(id, apply) -- the administrator's
--    decision on a reading: APPLY moves the visit's Visit Date to the day read
--    (keeping its time of day; the Visit Entry Date, reports.updated_at, is
--    not touched), KEEP records that RITHI's date stands. Once only per
--    reading. The change to the visit is recorded by record_audit like any
--    other, and the reading keeps the old and new values.
--
-- PERMISSIONS: three new keys, granted to NO role here --
--   visitdate.view (the report), visitdate.check (send a cut-out to be read),
--   visitdate.fix (apply / keep).
-- An administrator passes has_perm() already, so "Admin only for now" needs
-- no grant; the keys are on Roles & Permissions to be ticked for other roles
-- when the user decides (the standing rule: Roles & Permissions are the
-- user's, not a migration's).
-- ===========================================================================

create table if not exists public.visit_date_reads (
  id bigint generated always as identity primary key,
  report_uid text not null,
  ucn text not null default '',
  recorded_visit_at timestamptz,
  read_date date,
  read_as_written text,
  notes text not null default '',
  outcome text not null check (outcome in ('match', 'mismatch', 'unreadable', 'no_box')),
  model text not null default '',
  tried text[] not null default '{}',
  first_error text not null default '',
  ms integer not null default 0,
  input_tokens integer not null default 0,
  output_tokens integer not null default 0,
  cost_usd numeric(12, 6) not null default 0,
  read_by uuid,
  created_at timestamptz not null default now(),
  resolution text check (resolution in ('applied', 'kept')),
  resolved_by uuid,
  resolved_at timestamptz,
  old_visit_at timestamptz,
  new_visit_at timestamptz
);

create unique index if not exists visit_date_reads_report_uid on public.visit_date_reads (report_uid);
create index if not exists visit_date_reads_created on public.visit_date_reads (created_at desc, id desc);

comment on table public.visit_date_reads is
  'Visit Date Check (0486): the Service Visit Date a model read on a visit''s manual report, one row per visit, written only by the Edge Function read-report-box; resolution set only by resolve_visit_date_read().';

alter table public.visit_date_reads enable row level security;

drop policy if exists visit_date_reads_read on public.visit_date_reads;
create policy visit_date_reads_read on public.visit_date_reads
  for select using ((select public.has_perm('visitdate.view')));

grant select on public.visit_date_reads to authenticated;
revoke insert, update, delete on public.visit_date_reads from anon, authenticated;

-- The report: each reading with the visit as it stands now.
create or replace view public.visit_date_check
with (security_invoker = on) as
select v.id,
       v.created_at as checked_at,
       v.report_uid,
       v.ucn,
       r.engineer,
       r.call_status,
       v.recorded_visit_at,
       r.visit_at as current_visit_at,
       v.read_date,
       v.read_as_written,
       v.outcome,
       v.notes,
       v.model,
       v.tried,
       v.first_error,
       v.ms,
       v.input_tokens,
       v.output_tokens,
       v.cost_usd,
       v.resolution,
       v.resolved_at,
       rb.full_name as resolved_by_name,
       v.old_visit_at,
       v.new_visit_at,
       r.manual_report
  from public.visit_date_reads v
  left join public.reports r on r.uid = v.report_uid
  left join public.profiles rb on rb.id = v.resolved_by;

grant select on public.visit_date_check to authenticated;

-- The administrator's decision on one reading.
create or replace function public.resolve_visit_date_read(p_id bigint, p_apply boolean)
returns text language plpgsql security definer set search_path = public as $$
declare
  r public.visit_date_reads;
  v_old timestamptz;
  v_new timestamptz;
  v_today date := (now() at time zone 'Asia/Kolkata')::date;
begin
  if not coalesce(public.has_perm('visitdate.fix'), false) then
    raise exception 'Only an administrator may correct a Visit Date from a report reading'
      using errcode = 'insufficient_privilege';
  end if;

  select * into r from public.visit_date_reads where id = p_id for update;
  if not found then
    raise exception 'No such reading (%).', p_id using errcode = 'no_data_found';
  end if;
  if r.resolution is not null then
    raise exception 'This reading was already %.',
      case r.resolution when 'applied' then 'applied to the visit' else 'kept as recorded' end
      using errcode = 'check_violation';
  end if;

  if not p_apply then
    update public.visit_date_reads
       set resolution = 'kept', resolved_by = auth.uid(), resolved_at = now()
     where id = p_id;
    return 'kept';
  end if;

  if r.read_date is null then
    raise exception 'The reading has no date to apply.' using errcode = 'check_violation';
  end if;
  if r.read_date > v_today then
    raise exception 'The date read (%) is in the future -- not applied.', to_char(r.read_date, 'DD-Mon-YYYY')
      using errcode = 'check_violation';
  end if;

  select visit_at into v_old from public.reports where uid = r.report_uid for update;
  if not found then
    raise exception 'The visit % no longer exists.', r.report_uid using errcode = 'no_data_found';
  end if;

  -- Move the DAY, keep the time of day: the visit's own clock time is not
  -- what was read, and is not changed. A visit with no date gets the day read
  -- at midnight India time.
  if v_old is null then
    v_new := r.read_date::timestamp at time zone 'Asia/Kolkata';
  else
    v_new := v_old + ((r.read_date - (v_old at time zone 'Asia/Kolkata')::date) * interval '1 day');
  end if;

  -- reports.updated_at is the Visit Entry Date and is deliberately left alone.
  update public.reports set visit_at = v_new where uid = r.report_uid;

  update public.visit_date_reads
     set resolution = 'applied', resolved_by = auth.uid(), resolved_at = now(),
         old_visit_at = v_old, new_visit_at = v_new
   where id = p_id;
  return 'applied';
end $$;

revoke execute on function public.resolve_visit_date_read(bigint, boolean) from public, anon;
grant execute on function public.resolve_visit_date_read(bigint, boolean) to authenticated;

-- Every reading and every decision on one is recorded (0048's record_audit).
do $$
begin
  if to_regprocedure('public.record_audit_fn()') is not null then
    drop trigger if exists record_audit_i on public.visit_date_reads;
    drop trigger if exists record_audit_u on public.visit_date_reads;
    create trigger record_audit_i after insert on public.visit_date_reads
      referencing new table as new_rows for each statement execute function public.record_audit_fn();
    create trigger record_audit_u after update on public.visit_date_reads
      referencing old table as old_rows new table as new_rows for each statement execute function public.record_audit_fn();
  end if;
end $$;

-- The five system columns every table carries (0244), attached now: sys_columns
-- runs LAST in a fresh apply, but on the live project it has already run.
do $$
begin
  if to_regprocedure('public.sys_columns_attach(regclass)') is not null then
    perform public.sys_columns_attach('public.visit_date_reads'::regclass);
  end if;
end $$;
