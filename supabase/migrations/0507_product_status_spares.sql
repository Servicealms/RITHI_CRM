-- ===========================================================================
-- 0507  PRODUCT STATUS CHECK: SPARES REQUESTED AND CONSUMED, FOR THE
--       FINANCIAL RULE
--
-- The user, 2026-11-28, the rule the screen applies:
--   NON-IMPACTING: OGP -> CMC, OGP -> AMC, WGP -> CMC.
--   IMPACT: CMC -> OGP, CMC -> AMC, WGP -> OGP, WGP -> AMC --
--   EXCEPT that each becomes non-impacting when "No Spares Requested /
--   Consumed".
-- So the report carries, per call, how many spare requests it has (any
-- status) and how many spares were consumed on it (RITHI's lines with a
-- quantity -- a voided line reads 0 -- and the historical consumption, both by
-- UC No.). The rule itself is the screen's (ProductStatusCheck.tsx); this
-- gives it the two facts it needs.
--
-- The OUT columns change, so the function is dropped and made again, and
-- product_status_report() with it. Same grants as 0506.
-- ===========================================================================

drop function if exists public.product_status_report();
drop function if exists public.product_status_mismatches();

-- THE REPORT: every call whose stored status is not what it was at registration,
-- with the spare requests on it whose own status would change with it.
create or replace function public.product_status_mismatches()
returns table (
  ucn text, register text, reg_date date, reg_at timestamptz, party_name text, product_name text, serial text,
  stored_status text, correct_status text, spare_requests integer, spare_request_refs text,
  cover_ref text, late_ref text, late_note text, late_entered_at timestamptz,
  spares_requested integer, spares_consumed integer
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
  ),
  -- EVERY SPARE REQUESTED on the call (whatever its status) and every spare
  -- CONSUMED on it -- RITHI's lines with a quantity (a voided line reads 0) and
  -- the historical consumption -- for the financial rule's exception.
  rq as (
    select b.ucn, count(*)::int as n
      from bad b join public.spare_requests r on upper(btrim(r.ucn)) = upper(btrim(b.ucn))
     group by b.ucn
  ),
  cs as (
    select b.ucn, count(*)::int as n
      from bad b join (
        -- QUALIFIED: a bare `ucn` here is also this function's OUT column.
        select sc.ucn from public.spare_consumption sc where coalesce(sc.qty, 0) > 0
        union all
        select sh.ucn from public.spare_consumption_history sh where coalesce(sh.qty, 0) > 0
      ) x on upper(btrim(x.ucn)) = upper(btrim(b.ucn))
     group by b.ucn
  )
  select b.ucn, b.register, b.reg_date, b.reg_at, b.party_name, b.product_name, b.serial,
         b.stored_status, b.correct_status, coalesce(sr.n, 0), coalesce(sr.refs, ''),
         coalesce(b.cover_ref, ''), coalesce(b.late_ref, ''),
         case when b.late_ref is not null then b.late_kind || ' entry made after the call was registered' else '' end,
         b.late_entered_at,
         coalesce(rq.n, 0), coalesce(cs.n, 0)
    from bad b left join sr on sr.ucn = b.ucn
               left join rq on rq.ucn = b.ucn
               left join cs on cs.ucn = b.ucn
   order by b.reg_date desc nulls last, b.ucn;
end $$;
revoke execute on function public.product_status_mismatches() from public, anon;
grant execute on function public.product_status_mismatches() to authenticated;

create or replace function public.product_status_report()
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(to_jsonb(m)), '[]'::jsonb) from public.product_status_mismatches() m
$$;
revoke execute on function public.product_status_report() from public, anon;
grant execute on function public.product_status_report() to authenticated;
