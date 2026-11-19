-- ===========================================================================
-- CALLS WHOSE ITEM STATUS DOES NOT MATCH THE COVER ON THEIR REGISTRATION DATE
-- -- read-only.
--
-- The user, 2026-11-19: "Give me a List of Calls where the Item Status is not
-- Matching based on the Call Registration Date".
--
-- For every call (Field, Installation and PM; cancelled calls left out) it
-- works out what covered the machine ON THE DAY THE CALL WAS REGISTERED, from
-- the registers -- not from today's Product Database, which only knows the
-- latest period:
--
--   WARRANTY running that day, from any of the three places a warranty comes
--   from: a WARRANTY SALE line, an OWNERSHIP TRANSFER that gave a fresh
--   warranty, or an INSTALLATION whose "Warranty Start Date?" answer was the
--   solved date (its system-written start and end).
--   CONTRACT running that day: a contract line on the machine (its type as
--   CMC / AMC).
--   "Running" = started on or before that day and ending on or after it (0491).
--
-- `should_be` is WGP (warranty only), CMC / AMC (contract only), OGP (neither)
-- -- or BOTH where a warranty and a contract both covered the day, which the
-- user has said must not happen: such a call is listed whatever it says, so
-- the record behind it can be fixed. The call's own value is compared after
-- the cover vocabulary (cover_code: "WARRANTY" is WGP, and so on).
--
-- Changes nothing. Paste into the Supabase SQL editor and Run: ONE grid, one
-- row per call, most recent first. It names customers -- the SQL editor only,
-- never the public GitHub workflow. A call can be corrected on its register
-- with 🛡️ Update Product Details (cover as on the registration date) -- but
-- that reads WARRANTY SALES only, so a call whose warranty came from a
-- transfer or an installation answer is better corrected by hand; the
-- `warranty_from` column says which.
-- ===========================================================================
with c as (
  select row_number() over () as rid,
         x.ucn, x.call_type, x.reg_date as d, x.product_name, x.serial, x.party_name,
         x.item_status as on_call,
         coalesce(public.cover_code(nullif(btrim(x.item_status), '')), '') as on_call_code,
         lower(btrim(coalesce(x.product_name, ''))) || '|' || lower(btrim(coalesce(x.serial, ''))) as k
    from public.calls x
   where x.cancelled_at is null
     and x.reg_date is not null
     and btrim(coalesce(x.serial, '')) <> ''
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
  count(*) over ()                                         as calls_listed,
  v.ucn,
  v.call_type,
  to_char(v.d, 'DD-Mon-YYYY')                              as registered,
  v.product_name                                           as product,
  v.serial,
  v.party_name                                             as party,
  coalesce(nullif(v.on_call, ''), '(blank)')               as item_status_on_call,
  v.should_be,
  coalesce(v.warranty_from, '-')                           as warranty_from,
  coalesce(v.contract_from, '-')                           as contract_from
from verdict v
where v.should_be = 'BOTH'
   or v.on_call_code is distinct from v.should_be
order by v.d desc, v.ucn;
