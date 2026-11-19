-- ===========================================================================
-- SPARE REQUESTS RAISED FROM A DATE, ON CALLS WHOSE ITEM STATUS IS WRONG --
-- read-only.
--
-- The user, 2026-11-19: "And Drill down for those CAlls and give me the Spare
-- REquest List as well [only for Mis matches]" ... "Run the Spare Request for
-- all Requests done from 1Sep".
--
-- EVERY spare request raised on or after the date below (India date), on any
-- call -- Field, Installation or PM, whenever the call was registered. Its call
-- is judged by the rule in _field_calls_cover_check.sql (the cover running on
-- the call's REGISTRATION date, from the registers), and the lines are listed
-- where the call's Item Status is not correct. HandStock requests have no call
-- and are not in it.
--
-- One row per spare request LINE: the call, its verdict and what its cover
-- should be, the request, the cover it carried, the part, its stage and
-- approvals, and what the wrong cover did to the approval route -- Commercial
-- judges spares on AMC and OGP machines, so a call that read CMC or WGP when it
-- should be OGP sent its spares past Commercial.
--
-- CHANGE THE DATE on BOTH lines marked FROM. Delete the line marked "every
-- request" to list the correct ones too. Changes nothing. Paste into the
-- Supabase SQL editor and Run: ONE grid. It names customers and engineers --
-- SQL editor only.
-- ===========================================================================
with c as (
  select row_number() over () as rid,
         x.ucn, x.call_type, x.reg_date as d, x.product_name, x.serial, x.party_name,
         x.item_status as on_call,
         coalesce(public.cover_code(nullif(btrim(x.item_status), '')), '') as on_call_code,
         lower(btrim(coalesce(x.product_name, ''))) || '|' || lower(btrim(coalesce(x.serial, ''))) as k
    from public.calls x                     -- Field, Installation and PM calls
   where x.cancelled_at is null
     and x.ucn in (select r0.ucn from public.spare_requests r0
                    where (r0.created_at at time zone 'Asia/Kolkata')::date >= date '2026-09-01')  -- <<< FROM: requests raised on or after

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
),
judged_calls as (
  select verdict.*,
         case when btrim(coalesce(verdict.serial, '')) = '' then 'No serial -- cannot be checked'
              when verdict.should_be = 'BOTH' then 'Both a warranty and a contract covered the day -- fix the record'
              when verdict.on_call_code is not distinct from verdict.should_be then 'Correct'
              when btrim(coalesce(verdict.on_call, '')) = '' then 'Blank -- should be ' || verdict.should_be
              else 'Wrong -- should be ' || verdict.should_be end as verdict
    from verdict
)
select
  dense_rank() over (order by v.ucn) + dense_rank() over (order by v.ucn desc) - 1 as calls_with_spares,
  count(*) over ()                                                    as spare_lines,
  v.ucn,
  v.call_type,
  to_char(v.d, 'DD-Mon-YYYY')                                         as registered,
  v.verdict                                                           as call_verdict,
  coalesce(nullif(v.on_call, ''), '(blank)')                          as item_status_on_call,
  v.should_be,
  r.uid                                                               as spare_request,
  r.req_type,
  r.engineer,
  to_char(r.created_at at time zone 'Asia/Kolkata', 'DD-Mon-YYYY HH24:MI:SS') as raised,
  coalesce(nullif(r.item_status, ''), '(blank)')                      as cover_on_request,
  l.part,
  l.qty,
  l.stage                                                             as line_stage,
  coalesce(nullif(l.rm_approval, ''), '-')                            as rm,
  coalesce(nullif(l.commercial_approval, ''), '-')                    as commercial,
  coalesce(nullif(l.nsm_approval, ''), '-')                           as nsm,
  coalesce(l.dc_number, '')                                           as dc_no,
  -- WHAT THE WRONG COVER DID TO THE APPROVALS. Commercial judges a spare on an
  -- AMC or OGP machine (spare_needs_commercial, 0210); a request's cover is the
  -- call's, so a wrong cover routes the spare wrongly.
  case
    when v.should_be in ('AMC', 'OGP') and upper(coalesce(r.item_status, '')) not in ('AMC', 'OGP')
      then 'Its cover skips Commercial -- with ' || v.should_be || ' it needs Commercial approval'
    when v.should_be not in ('AMC', 'OGP') and upper(coalesce(r.item_status, '')) in ('AMC', 'OGP')
      then 'Its cover sends it to Commercial -- with ' || v.should_be || ' it needs no Commercial approval'
    else 'Same approval route'
  end                                                                 as approval_impact
from judged_calls v
join public.spare_requests r on r.ucn = v.ucn
                            and (r.created_at at time zone 'Asia/Kolkata')::date >= date '2026-09-01'  -- <<< FROM (the same date)
join public.spare_request_lines l on l.request_uid = r.uid
where v.verdict <> 'Correct'          -- <<< delete this line to list EVERY request, correct ones too
order by v.d, v.ucn, r.created_at, l.row_no nulls last, l.id;
