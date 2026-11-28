-- ===========================================================================
-- 0506  PRODUCT STATUS CHECK: EVERY CALL'S ITEM STATUS AGAINST ITS COVER AT
--       THE MOMENT IT WAS REGISTERED, IN ONE GO
--
-- The user, 2026-11-28: "I want to do a Product Status Check in 1 Go and
-- update it" -- asked, answered: "At the time of Call Registration - What is
-- the Status of the Product? - List all Mismatches and Update it - Do this in a
-- Separate Screen. Non Auditable, so should hide when i enable Audit Mode.
-- When i update all Affected Spare Request should also show and Update - But i
-- should be able to get this as a Report before I update." And the rule, by
-- example: "Call registered on 20Nov2026 11:00am, Contract Expired on
-- 10Nov2026 - it should be in OGP. Then on 21st Nov there is a Contract Entry
-- Stating that it is under CMC from 11Nov2026 - This call should have been OGP
-- at the Time of Call Registration."
--
-- THE RULE -- AS IT STOOD WHEN THE CALL WAS REGISTERED:
--   * only a warranty or contract ENTERED BY the call's registration moment
--     counts -- its entry time (sale_entry_date / contract_entry_date, the
--     Entry Date the register carries) at or before the call's reg_at, else
--     before the end of its reg_date. An entry made later, even one back-dated
--     to cover the day, did not exist when the call was registered. An entry
--     with NO entry time counts (old rows without one are not all made OGP);
--   * of those, the cover running ON the registration date: a warranty -> WGP;
--     else a contract (the latest-started, then latest-ending) -> its cover
--     (contract_cover_code), or 'CONTRACT (TYPE NOT RECORDED)'; else OGP;
--   * a call with no product or no serial -> OGP.
-- That is call_cover_as_of()'s rule (0271) plus the entry-time cut-off, and
-- set-based so every call is judged in one pass (call_cover_as_of asks per
-- call and scans both registers each time). product_status_check_test proves
-- the two agree wherever the cut-off does not apply, and that the cut-off
-- decides the user's example.
--
-- A MISMATCH is cover_code(stored) <> cover_code(correct).
--
-- THE UPDATE (fix_product_status): writes the correct status onto the chosen
-- calls -- the status only; the warranty and contract numbers on the call are
-- left as they are -- and the spare requests on each call follow by 0268's
-- trigger, as they do when a call is edited. Audit Mode off, the page key, and
-- calls.edit or calls.edit.customer (call_refresh_allowed, the gate "Update
-- Product Details" uses).
--
-- WHO: a holder of mod:/product-status-check (given here to admin and
-- technical_support; others on Roles & Permissions), never in Audit Mode
-- (NAR-031) -- refused here as well as hidden on the screen. SECURITY DEFINER
-- so the check covers the whole register, not the reader's visible part.
-- ===========================================================================

-- The judgement for every call. Internal: callable by nobody through the API.
create or replace function public._product_status_judged()
returns table (
  ucn text, register text, reg_date date, reg_at timestamptz, party_name text, product_name text, serial text,
  stored_status text, correct_status text,
  cover_ref text, late_ref text, late_kind text, late_entered_at timestamptz
)
language sql stable security definer set search_path = public as $$
  with c as (
    select k.ucn, k.call_type, k.reg_date, k.reg_at, k.party_name, k.product_name, k.serial, k.item_status,
           public.machine_key(k.product_name, k.serial) as mk,
           coalesce(k.reg_date, current_date) as d,
           -- the registration moment: its time, else the end of its day (India)
           coalesce(k.reg_at, ((coalesce(k.reg_date, current_date) + 1)::timestamp at time zone 'Asia/Kolkata')) as at,
           (btrim(coalesce(k.serial, '')) = '' or btrim(coalesce(k.product_name, '')) = '') as blank
      from public.calls k
     where btrim(coalesce(k.ucn, '')) <> ''
  ),
  w as (
    select public.machine_key(s.product_name, s.serial_number) as mk, s.sa_number as ref, s.warranty_start, s.warranty_end, s.sale_entry_date as entered
      from public.warranty_sale_details s
  ),
  x as (
    select public.machine_key(t.product_name, t.serial_number) as mk, t.mc_number as ref, t.contract_start, t.contract_end, t.contract_type,
           t.contract_entry_date as entered
      from public.contract_details t
  ),
  wr as (
    select distinct on (c.ucn) c.ucn, w.ref
      from c join w on w.mk = c.mk
     where not c.blank
       and coalesce(w.warranty_start, '-infinity'::date) <= c.d and w.warranty_end >= c.d
       and (w.entered is null or w.entered <= c.at)
     order by c.ucn, w.warranty_start desc nulls last, w.warranty_end desc
  ),
  -- WHAT WAS ENTERED AFTER THE CALL (the user, 2026-11-28: "Add the MC No and in
  -- the Next Column State that the Contract Entry was Made after the Call was
  -- Registered. Give the Contract Entry Time as well"): a contract, else a
  -- warranty, covering the registration date but entered after it -- the one
  -- that would count today and did not then. The latest-entered.
  lx as (
    select distinct on (c.ucn) c.ucn, x.ref, x.entered
      from c join x on x.mk = c.mk
     where not c.blank
       and coalesce(x.contract_start, '-infinity'::date) <= c.d and x.contract_end >= c.d
       and x.entered > c.at
     order by c.ucn, x.entered desc
  ),
  lw as (
    select distinct on (c.ucn) c.ucn, w.ref, w.entered
      from c join w on w.mk = c.mk
     where not c.blank
       and coalesce(w.warranty_start, '-infinity'::date) <= c.d and w.warranty_end >= c.d
       and w.entered > c.at
     order by c.ucn, w.entered desc
  ),
  cr as (
    select distinct on (c.ucn) c.ucn, x.contract_type, x.ref
      from c join x on x.mk = c.mk
     where not c.blank
       and coalesce(x.contract_start, '-infinity'::date) <= c.d and x.contract_end >= c.d
       and (x.entered is null or x.entered <= c.at)
     order by c.ucn, x.contract_start desc nulls last, x.contract_end desc
  )
  select c.ucn, c.call_type, c.reg_date, c.reg_at, c.party_name, c.product_name, c.serial,
         coalesce(c.item_status, ''),
         case when c.blank then 'OGP'
              when wr.ucn is not null then 'WGP'
              when cr.ucn is not null then coalesce(public.contract_cover_code(cr.contract_type), 'CONTRACT (TYPE NOT RECORDED)')
              else 'OGP' end,
         case when c.blank then null when wr.ucn is not null then wr.ref when cr.ucn is not null then cr.ref end,
         coalesce(lx.ref, lw.ref),
         case when lx.ucn is not null then 'Contract' when lw.ucn is not null then 'Warranty' end,
         coalesce(lx.entered, lw.entered)
    from c
    left join wr on wr.ucn = c.ucn
    left join cr on cr.ucn = c.ucn
    left join lx on lx.ucn = c.ucn
    left join lw on lw.ucn = c.ucn
$$;
revoke execute on function public._product_status_judged() from public, anon, authenticated;

create or replace function public._product_status_gate(p_fix boolean)
returns void language plpgsql stable security definer set search_path = public as $$
begin
  if coalesce(public.audit_mode(), false) then
    raise exception 'Audit Mode is ON: the Product Status Check is not available until an administrator turns it off.'
      using errcode = '42501';
  end if;
  if not public.has_perm('mod:/product-status-check') then
    raise exception 'RBAC: the Product Status Check needs its page on Roles & Permissions.' using errcode = '42501';
  end if;
  if p_fix and not (public.has_perm('calls.edit') or public.has_perm('calls.edit.customer')) then
    raise exception 'RBAC: updating a call''s Item Status needs calls.edit or calls.edit.customer.' using errcode = '42501';
  end if;
end $$;
revoke execute on function public._product_status_gate(boolean) from public, anon, authenticated;

-- THE REPORT: every call whose stored status is not what it was at registration,
-- with the spare requests on it whose own status would change with it.
create or replace function public.product_status_mismatches()
returns table (
  ucn text, register text, reg_date date, reg_at timestamptz, party_name text, product_name text, serial text,
  stored_status text, correct_status text, spare_requests integer, spare_request_refs text,
  cover_ref text, late_ref text, late_note text, late_entered_at timestamptz
)
language plpgsql stable security definer set search_path = public as $$
begin
  perform public._product_status_gate(false);
  return query
  with bad as (
    select j.* from public._product_status_judged() j
     where public.cover_code(j.stored_status) is distinct from public.cover_code(j.correct_status)
  ),
  sr as (
    select b.ucn, count(*)::int as n,
           string_agg(coalesce(nullif(r.or_no, ''), r.uid), ', ' order by r.uid) as refs
      from bad b
      join public.spare_requests r on upper(btrim(r.ucn)) = upper(btrim(b.ucn))
     where public.cover_code(coalesce(r.item_status, '')) is distinct from public.cover_code(b.correct_status)
     group by b.ucn
  )
  select b.ucn, b.register, b.reg_date, b.reg_at, b.party_name, b.product_name, b.serial,
         b.stored_status, b.correct_status, coalesce(sr.n, 0), coalesce(sr.refs, ''),
         coalesce(b.cover_ref, ''), coalesce(b.late_ref, ''),
         case when b.late_ref is not null then b.late_kind || ' entry made after the call was registered' else '' end,
         b.late_entered_at
    from bad b left join sr on sr.ucn = b.ucn
   order by b.reg_date desc nulls last, b.ucn;
end $$;
revoke execute on function public.product_status_mismatches() from public, anon;
grant execute on function public.product_status_mismatches() to authenticated;

-- THE UPDATE: the chosen calls (a mismatch only -- anything else is left), the
-- status as it was at registration. Returns how many calls and spare requests
-- changed.
create or replace function public.fix_product_status(p_ucns text[])
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  n_calls int := 0; n_spares_before int; n_spares_after int; v record;
begin
  perform public._product_status_gate(true);
  create temp table if not exists _psc_fix (ucn text primary key, correct text) on commit drop;
  -- A WHERE, because Supabase's pg_safeupdate refuses a DELETE without one --
  -- inside a definer function too (check:safe-updates).
  delete from _psc_fix where true;
  insert into _psc_fix
  select j.ucn, j.correct_status from public._product_status_judged() j
   where j.ucn = any(p_ucns)
     and public.cover_code(j.stored_status) is distinct from public.cover_code(j.correct_status);

  select count(*) into n_spares_before
    from public.spare_requests r join _psc_fix f on upper(btrim(r.ucn)) = upper(btrim(f.ucn))
   where public.cover_code(coalesce(r.item_status, '')) is distinct from public.cover_code(f.correct);

  for v in select * from _psc_fix loop
    update public.calls set item_status = v.correct where ucn = v.ucn;
    if found then n_calls := n_calls + 1; end if;
  end loop;

  select count(*) into n_spares_after
    from public.spare_requests r join _psc_fix f on upper(btrim(r.ucn)) = upper(btrim(f.ucn))
   where public.cover_code(coalesce(r.item_status, '')) is distinct from public.cover_code(f.correct);

  return jsonb_build_object('calls', n_calls, 'spare_requests', n_spares_before - n_spares_after,
                            'spare_requests_not_followed', n_spares_after);
end $$;
revoke execute on function public.fix_product_status(text[]) from public, anon;
grant execute on function public.fix_product_status(text[]) to authenticated;

-- ---- the page key: administrators to begin with (0495's pattern) ----------
do $$
declare n integer;
begin
  if to_regclass('public.app_roles') is null then return; end if;
  update public.app_roles ar
     set permissions = (
           select coalesce(jsonb_agg(distinct v), '[]'::jsonb)
             from (select jsonb_array_elements_text(ar.permissions) as v
                   union select 'mod:/product-status-check') u),
         updated_at = now()
   where jsonb_array_length(ar.permissions) > 0
     and ar.role in ('admin', 'technical_support')
     and not (ar.permissions ? 'mod:/product-status-check');
  get diagnostics n = row_count;
  raise notice '0506: % of 2 role(s) given mod:/product-status-check (admin + technical_support -- grant the rest on Roles & Permissions)', n;
end $$;

-- THE WHOLE REPORT IN ONE RESPONSE. A set-returning call is capped at 1,000
-- rows by PostgREST, and paging it would run the whole check once per page;
-- one jsonb value is neither capped nor repeated.
create or replace function public.product_status_report()
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(to_jsonb(m)), '[]'::jsonb) from public.product_status_mismatches() m
$$;
revoke execute on function public.product_status_report() from public, anon;
grant execute on function public.product_status_report() to authenticated;
