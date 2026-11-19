-- ===========================================================================
-- CORRECT THE ITEM STATUS ON FIELD CALLS FROM A DATE -- preview by default.
--
-- The user, 2026-11-19: "Yes - give me the Query" (to correct the field calls
-- _field_calls_cover_check.sql marks as not correct).
--
-- Same calls, same rule as that check: every field call registered on or
-- after the FROM date (01-Sep-2026; cancelled calls left out), judged by the
-- cover running ON ITS REGISTRATION DATE from the registers (warranty sale,
-- ownership transfer's fresh warranty, installation answered "solved date";
-- contract lines; running = started and not yet ended). A call reading WRONG
-- or BLANK has its Item Status set to what it should be. NOT TOUCHED: a call
-- where a warranty AND a contract both covered the day (fix the record first
-- -- _fix_warranty_contract_overlaps.sql) and a call with no serial.
--
-- ONLY ITEM STATUS CHANGES on the call. Its warranty and contract fields are
-- left as they are. What follows from the change, by the database's own rules:
--   * each SPARE REQUEST on the call takes the call's new cover
--     (spare_requests_follow_call, 0268) -- so a line still waiting for RM
--     approval is routed by the corrected cover (Commercial for AMC / OGP);
--     a line already approved keeps the route it was given then;
--   * the change is in the audit trail (record_audit) as the database's.
--
-- HOW TO RUN: as it stands it is a PREVIEW -- it changes nothing and lists
-- each call with the status it WOULD get. Then change `apply` below to true
-- and run it again. Every call changed is copied first into
-- backup.call_status_fix_backup. SQL editor only (it names customers).
-- ===========================================================================

create temp table if not exists fix_report (n int, ucn text, registered text, product text, serial text, was text, now_is text, done text, spare_requests int);
truncate fix_report;

create schema if not exists backup;
revoke all on schema backup from public, anon, authenticated;
create table if not exists backup.call_status_fix_backup (
  id         bigint generated always as identity primary key,
  taken_at   timestamptz not null default now(),
  row_data   jsonb not null
);
revoke all on backup.call_status_fix_backup from public, anon, authenticated;

do $$
declare
  apply boolean := false;   -- <<< change to true to make the changes
  r record; n int := 0;
begin
  for r in
    with c as (
      select row_number() over () as rid,
             x.ucn, x.call_type, x.reg_date as d, x.product_name, x.serial, x.party_name,
             x.item_status as on_call,
             coalesce(public.cover_code(nullif(btrim(x.item_status), '')), '') as on_call_code,
             lower(btrim(coalesce(x.product_name, ''))) || '|' || lower(btrim(coalesce(x.serial, ''))) as k
        from public.field_calls x
       where x.cancelled_at is null
         and x.reg_date >= date '2026-09-01'      -- <<< FROM: change the date here

    ),
    w as (   -- every warranty period on record, keyed by machine
      select lower(btrim(coalesce(s.product_name, ''))) || '|' || lower(btrim(coalesce(s.serial_number, ''))) as k,
             s.warranty_start as ws, s.warranty_end as we, 'Warranty sale ' || s.sa_number as src
        from public.warranty_sale_details s
       where s.warranty_end is not null
      union all
      select lower(btrim(coalesce(o.item_name, ''))) || '|' || lower(btrim(coalesce(o.serial_number, ''))),
             o.warranty_start, o.warranty_end, 'Ownership transfer ' || coalesce(o.reference_no, '')
        from public.ownership_transfers o
       where o.warranty_end is not null
      union all
      select i.machine_key, i.warranty_start, i.warranty_end, 'Installation ' || coalesce(i.ucn, '') || ' (solved date)'
        from public.installation_warranty_starts i
       where lower(btrim(coalesce(i.warranty_choice, ''))) = 'installation call solved date'
         and i.warranty_end is not null
    ),
    k as (   -- every contract period on record, keyed by machine
      select lower(btrim(coalesce(x.product_name, ''))) || '|' || lower(btrim(coalesce(x.serial_number, ''))) as k,
             x.contract_start as cs, x.contract_end as ce, x.mc_number,
             coalesce(public.contract_cover_code(nullif(btrim(x.contract_type), '')), 'CONTRACT (TYPE NOT RECORDED)') as code
        from public.contract_details x
       where x.contract_end is not null
    ),
    cw as (   -- joined, not asked per call: one hash join over the whole register
      select c.rid, string_agg(distinct w.src, ', ') as warranty_from
        from c join w on w.k = c.k and coalesce(w.ws, '-infinity'::date) <= c.d and w.we >= c.d
       group by c.rid
    ),
    ck as (
      select c.rid, string_agg(distinct k.mc_number || ' ' || k.code, ', ') as contract_from, min(k.code) as contract_code
        from c join k on k.k = c.k and coalesce(k.cs, '-infinity'::date) <= c.d and k.ce >= c.d
       group by c.rid
    ),
    judged as (
      select c.*, cw.warranty_from, ck.contract_from, ck.contract_code
        from c left join cw on cw.rid = c.rid left join ck on ck.rid = c.rid
    ),
    verdict as (
      select j.*,
             case when j.warranty_from is not null and j.contract_from is not null then 'BOTH'
                  when j.warranty_from is not null then 'WGP'
                  when j.contract_from is not null then j.contract_code
                  else 'OGP' end as should_be
        from judged j
    )
    select v.ucn, v.d, v.product_name, v.serial, v.on_call, v.should_be
      from verdict v
     where btrim(coalesce(v.serial, '')) <> ''
       and v.should_be <> 'BOTH'
       and v.on_call_code is distinct from v.should_be
     order by v.d, v.ucn
  loop
    n := n + 1;
    if apply then
      insert into backup.call_status_fix_backup (row_data)
        select to_jsonb(f) from public.field_calls f where f.ucn = r.ucn;
      update public.field_calls f set item_status = r.should_be where f.ucn = r.ucn;
    end if;
    insert into fix_report values (n, r.ucn, to_char(r.d, 'DD-Mon-YYYY'), r.product_name, r.serial,
      coalesce(nullif(r.on_call, ''), '(blank)'), r.should_be,
      case when apply then 'changed' else 'WOULD change' end,
      (select count(*) from public.spare_requests s where s.ucn = r.ucn));
  end loop;
  if n = 0 then
    insert into fix_report values (0, '', '', '', '', '', '', 'nothing to correct', 0);
  end if;
end $$;

select n as row, ucn, registered, product, serial, was, now_is, done, spare_requests from fix_report order by n;
