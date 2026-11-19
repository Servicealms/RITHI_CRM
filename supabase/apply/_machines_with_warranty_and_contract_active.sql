-- ===========================================================================
-- MACHINES WITH A WARRANTY AND A CONTRACT BOTH ACTIVE TODAY -- read-only.
--
-- The user, 2026-11-19: "In Ideal case scenario, there can not be an Active
-- Warranty and Active Contract. So first list such cases - Where Both are
-- Active."
--
-- The warranty's dates come from one of three places (sync_product_machine,
-- 0391): the INSTALLATION call's solved date (when the engineer said the
-- warranty starts then), an OWNERSHIP TRANSFER that gave the new owner a fresh
-- warranty, or the WARRANTY SALE entry. The contract follows. This lists every
-- machine whose Product Database warranty and contract OVERLAP and the overlap
-- has not ended (India date): `overlap` reads "Both running now" when it has
-- begun, or "Will overlap from <date>" for a contract entered ahead. A
-- contract starting the day after the warranty ends is the ideal case and is
-- not listed. It says where the warranty came from, so each row can be read
-- as "the warranty is wrong" or "the contract is wrong".
--
-- CORRECTED 2026-11-19: the first version called a contract "active" when
-- its END was still to come, without asking whether it had STARTED, so it
-- listed a contract beginning the day after the warranty (no overlap at all)
-- and called future overlaps current.
--
-- Reads public.product_database (the screen's own answer) and the registers
-- behind it. Changes nothing. Paste into the Supabase SQL editor and Run; it
-- returns ONE grid, one row per machine: running now first, then the
-- future overlaps, largest first.
--
-- It names customers: run it in the SQL editor, never through the public
-- GitHub workflow.
-- ===========================================================================
with today as (
  select (now() at time zone 'Asia/Kolkata')::date as d
),
overlapping as (
  select p.*,
         greatest(coalesce(p.warranty_start, p.contract_start), coalesce(p.contract_start, p.warranty_start)) as ov_from,
         least(p.warranty_end, p.contract_end)                                                             as ov_to
    from public.product_database p
   where p.warranty_end is not null and p.contract_end is not null
),
both_active as (
  select o.*
    from overlapping o, today t
   where o.ov_from <= o.ov_to      -- the two periods share at least a day
     and o.ov_to >= t.d            -- and that shared stretch has not ended
),
inst as (   -- the installation's warranty decision, latest per machine
  select distinct on (i.machine_key) i.machine_key, i.ucn, i.solved_date, i.warranty_start, i.warranty_end
    from public.installation_warranty_starts i
   order by i.machine_key, i.updated_at desc nulls last, i.id desc
),
ot as (     -- the latest transfer that gave a fresh warranty
  select distinct on (public.machine_key(o.item_name, o.serial_number))
         public.machine_key(o.item_name, o.serial_number) as machine_key,
         o.reference_no, o.transfer_date, o.warranty_start, o.warranty_end
    from public.ownership_transfers o
   where o.warranty_end is not null
   order by public.machine_key(o.item_name, o.serial_number), o.transferred_at desc nulls last, o.id desc
)
select
  count(*) over ()                                         as machines,
  count(*) filter (where b.ov_from <= t.d) over ()         as both_running_now,
  case when b.ov_from <= t.d then 'Both running now'
       else 'Will overlap from ' || to_char(b.ov_from, 'DD-Mon-YYYY') end as overlap,
  b.item_name                                              as product,
  b.serial_number                                          as serial,
  b.party_name                                             as party,
  b.warranty_number                                        as warranty_no,
  b.warranty_start,
  b.warranty_end,
  case
    when ot.warranty_end = b.warranty_end
      then 'Ownership transfer ' || coalesce(ot.reference_no, '') || ' (' || coalesce(to_char(ot.transfer_date, 'DD-Mon-YYYY'), '?') || ')'
    when inst.warranty_end = b.warranty_end
      then 'Installation ' || coalesce(inst.ucn, '') || ' solved ' || coalesce(to_char(inst.solved_date, 'DD-Mon-YYYY'), '?')
    when b.warranty_number <> '' then 'Warranty sale ' || b.warranty_number
    else 'Stored on the machine (no register matches)'
  end                                                      as warranty_from,
  b.contract_number                                        as contract_no,
  b.contract_type,
  b.contract_start,
  b.contract_end,
  ce.entry_at                                              as contract_entered,
  (b.ov_to - b.ov_from + 1)                                as overlap_days,
  b.item_status                                            as status_shown,
  b.item_status_keyed                                      as status_saved
from both_active b
cross join today t
left join inst on inst.machine_key = b.machine_key
left join ot   on ot.machine_key   = b.machine_key
left join public.contract_entries ce on ce.mc_number = b.contract_number
order by (b.ov_from <= t.d) desc, overlap_days desc, b.item_name, b.serial_number;
