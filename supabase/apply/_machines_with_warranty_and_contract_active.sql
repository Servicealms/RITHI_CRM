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
-- machine whose Product Database row has both still running today (India
-- date), says where its warranty came from, and how long the two overlap --
-- so each can be read as "the warranty is wrong" or "the contract is wrong".
--
-- Reads public.product_database (the screen's own answer) and the registers
-- behind it. Changes nothing. Paste into the Supabase SQL editor and Run; it
-- returns ONE grid, one row per machine, largest overlap first.
--
-- It names customers: run it in the SQL editor, never through the public
-- GitHub workflow.
-- ===========================================================================
with today as (
  select (now() at time zone 'Asia/Kolkata')::date as d
),
both_active as (
  select p.*
    from public.product_database p, today t
   where p.warranty_end >= t.d
     and p.contract_end >= t.d
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
  count(*) over ()                                         as machines_both_active,
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
  -- days both run: from the later start to the earlier end
  (least(b.warranty_end, b.contract_end)
     - greatest(coalesce(b.warranty_start, b.contract_start), coalesce(b.contract_start, b.warranty_start)) + 1)
                                                           as overlap_days,
  b.item_status                                            as status_shown,
  b.item_status_keyed                                      as status_saved
from both_active b
left join inst on inst.machine_key = b.machine_key
left join ot   on ot.machine_key   = b.machine_key
left join public.contract_entries ce on ce.mc_number = b.contract_number
order by overlap_days desc nulls last, b.item_name, b.serial_number;
