-- ===========================================================================
-- FIELD CALLS FROM A DATE: IS EACH ONE'S ITEM STATUS RIGHT? -- read-only.
--
-- The user, 2026-11-19: "Lets say - Start Date 1 Oct for Call Registeration -
-- Scan all Field Calls from 1 Oct and Tell me if they are correct or Not and
-- Tell what should be the Status".
--
-- EVERY field call registered on or after the date below -- 01-Sep-2026 (cancelled calls left
-- out), each with a verdict: Correct, Wrong -- should be X, Blank -- should be
-- X, Both a warranty and a contract covered the day, or No serial. The rule is
-- the one in _calls_cover_not_matching.sql: the cover running ON THE
-- REGISTRATION DATE, from the registers --
--   WARRANTY: a warranty sale line, an ownership transfer's fresh warranty, or
--   an installation answered "solved date"; CONTRACT: a contract line (CMC /
--   AMC); running = started on or before that day and not yet ended.
--   WGP if only a warranty, the contract's type if only a contract, OGP if
--   neither. "WARRANTY" on a call reads as WGP (cover_code).
--
-- CHANGE THE DATE on the line marked FROM. Paste into the Supabase SQL editor
-- and Run: ONE grid, the calls that are not correct first, oldest first; the
-- first three columns are the totals. It names customers -- SQL editor only.
-- ===========================================================================
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
select
  count(*) over ()                                                    as field_calls,
  count(*) filter (where v.verdict = 'Correct') over ()               as correct,
  count(*) filter (where v.verdict <> 'Correct') over ()              as not_correct,
  v.verdict,
  v.ucn,
  to_char(v.d, 'DD-Mon-YYYY')                                         as registered,
  v.product_name                                                      as product,
  v.serial,
  v.party_name                                                        as party,
  coalesce(nullif(v.on_call, ''), '(blank)')                          as item_status_on_call,
  v.should_be,
  coalesce(v.warranty_from, '-')                                      as warranty_from,
  coalesce(v.contract_from, '-')                                      as contract_from
from (
  select verdict.*,
         case when btrim(coalesce(verdict.serial, '')) = '' then 'No serial -- cannot be checked'
              when verdict.should_be = 'BOTH' then 'Both a warranty and a contract covered the day -- fix the record'
              when verdict.on_call_code is not distinct from verdict.should_be then 'Correct'
              when btrim(coalesce(verdict.on_call, '')) = '' then 'Blank -- should be ' || verdict.should_be
              else 'Wrong -- should be ' || verdict.should_be end as verdict
    from verdict
) v
order by (v.verdict = 'Correct'), v.d, v.ucn;
