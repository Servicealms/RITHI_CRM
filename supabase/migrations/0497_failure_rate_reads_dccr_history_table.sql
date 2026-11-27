-- ===========================================================================
-- 0497 -- THE RECENT FAILURE RATE READS DCCR HISTORY (the user, 2026-11-27,
-- separating DCCR History from Call History, 0496).
--
-- _dccr_failure_calls() (0393, 0396, 0431) counts a failure from a FIELD CALL
-- and its DCCR REVIEW, plus -- since 0431 -- the 2025 DCCR-history calls through
-- their imported review. Those calls are in public.dccr_call_history since 0496,
-- so the second arm reads there: the failures the DCCR register recorded, with
-- the DCCR register's own product, serial, date and status, never a yearly
-- sheet's copy of the same call.
--
-- In THIS module (objective), after 0431, because the objective module runs
-- after daily_review and owns the last word on this function: filed with 0496,
-- a fresh apply would put 0431's definition back over it. Restated from 0431
-- word for word; only the arm's table and its comment change.
-- ===========================================================================

create or replace function public._dccr_failure_calls(p_product text, p_serial text, p_asof date)
returns table (ucn text, call_number text, reg_date date, product_name text, serial text,
               party_name text, installed_on date, commissioning_month date,
               days_to_failure integer, spare_category text, any_potential_effect text)
language sql stable security definer set search_path = public as $$
  with c as (
    select f.ucn, f.call_number, f.reg_date, f.product_name, f.serial, f.party_name
      from public.field_calls f
     where f.cancelled_at is null
    union all
    -- THE DCCR HISTORY (0430), in its own table since 0496, through its review.
    select h.ucn, h.call_no, (h.call_at at time zone 'Asia/Kolkata')::date, h.item_name, h.serial, h.party_name
      from public.dccr_call_history h
     where h.call_status !~* '^cancel'
       and exists (select 1 from public.call_reviews x where x.ucn = h.ucn and x.imported)
  )
  select c.ucn, c.call_number, c.reg_date, c.product_name, c.serial, c.party_name,
         m.warranty_start, date_trunc('month', m.warranty_start)::date,
         (c.reg_date - m.warranty_start)::integer,
         coalesce(r.spare_category, ''), coalesce(r.any_potential_effect, '')
    from c
    join public.call_reviews r on r.ucn = c.ucn
    join lateral (
      select pr.warranty_start
        from public.products pr
       where lower(btrim(pr.serial_number)) = lower(btrim(c.serial))
         and pr.item_name ilike p_product
         and pr.warranty_start is not null
         and pr.warranty_start <= c.reg_date
       order by pr.warranty_start desc, pr.id desc
       limit 1) m on true
   where btrim(coalesce(c.serial, '')) <> ''
     and c.product_name ilike p_product
     and coalesce(c.serial, '') ilike p_serial
     and c.reg_date <= p_asof
     and (upper(coalesce(r.spare_category, '')) like '%SPARE%'
          or upper(btrim(coalesce(r.any_potential_effect, ''))) = 'YES')
$$;
revoke execute on function public._dccr_failure_calls(text, text, date) from public, anon, authenticated;

