-- ===========================================================================
-- DAILY CUT-OUTS: CHECKED, AND THE VISIT DATE CORRECTED FROM THEM (the user,
-- 2026-11-18: "And how to update the actual entry? Visit Entry??? I dont see
-- any edit Provision.").
--
-- A person compares each daily cut-out (0487) with the Visit Date in RITHI and
-- decides: RITHI IS RIGHT (confirmed), or CHANGE the visit's Visit Date to the
-- date on the report (corrected). review_visit_report_crop(id, date):
--   date null  -> confirmed; the visit is untouched;
--   date given -> the visit's DAY moves to it, keeping its time of day; the
--                 Visit Entry Date (reports.updated_at) is not touched -- the
--                 same rule as resolve_visit_date_read() (0486).
-- Once per cut-out; a day in the future is refused; only a holder of
-- visitdate.fix (an administrator for now, granted to no role here). The
-- change to the visit is recorded by record_audit like any other, and the
-- cut-out keeps the old and new values with who and when.
-- ===========================================================================

alter table public.visit_report_crops
  add column if not exists review text check (review in ('confirmed', 'corrected')),
  add column if not exists reviewed_by uuid,
  add column if not exists reviewed_at timestamptz,
  add column if not exists old_visit_at timestamptz,
  add column if not exists new_visit_at timestamptz;

create or replace function public.review_visit_report_crop(p_id bigint, p_date date)
returns text language plpgsql security definer set search_path = public as $$
declare
  c public.visit_report_crops;
  v_old timestamptz;
  v_new timestamptz;
  v_today date := (now() at time zone 'Asia/Kolkata')::date;
begin
  if not coalesce(public.has_perm('visitdate.fix'), false) then
    raise exception 'Only an administrator may correct a Visit Date from a report cut-out'
      using errcode = 'insufficient_privilege';
  end if;

  select * into c from public.visit_report_crops where id = p_id for update;
  if not found then
    raise exception 'No such cut-out (%).', p_id using errcode = 'no_data_found';
  end if;
  if c.review is not null then
    raise exception 'This cut-out was already %.',
      case c.review when 'corrected' then 'used to change the Visit Date' else 'checked as right' end
      using errcode = 'check_violation';
  end if;

  select visit_at into v_old from public.reports where uid = c.report_uid for update;
  if not found then
    raise exception 'The visit % no longer exists.', c.report_uid using errcode = 'no_data_found';
  end if;

  if p_date is null then
    update public.visit_report_crops
       set review = 'confirmed', reviewed_by = auth.uid(), reviewed_at = now(), old_visit_at = v_old, new_visit_at = v_old
     where id = p_id;
    return 'confirmed';
  end if;

  if p_date > v_today then
    raise exception 'The date (%) is in the future -- not changed.', to_char(p_date, 'DD-Mon-YYYY')
      using errcode = 'check_violation';
  end if;

  -- Move the DAY, keep the time of day; a visit with no date gets the day at
  -- midnight India time.
  if v_old is null then
    v_new := p_date::timestamp at time zone 'Asia/Kolkata';
  else
    v_new := v_old + ((p_date - (v_old at time zone 'Asia/Kolkata')::date) * interval '1 day');
  end if;

  -- reports.updated_at is the Visit Entry Date and is deliberately left alone.
  update public.reports set visit_at = v_new where uid = c.report_uid;

  update public.visit_report_crops
     set review = 'corrected', reviewed_by = auth.uid(), reviewed_at = now(), old_visit_at = v_old, new_visit_at = v_new
   where id = p_id;
  return 'corrected';
end $$;

revoke execute on function public.review_visit_report_crop(bigint, date) from public, anon;
grant execute on function public.review_visit_report_crop(bigint, date) to authenticated;

-- NO record_audit trigger on visit_report_crops: it would copy the cut-out
-- image (tens of KB) into the audit log on every decision. The change that
-- matters -- the visit's Visit Date -- is audited on public.reports by its own
-- record_audit trigger, and the decision itself (who, when, old, new) is kept
-- on the cut-out row.
