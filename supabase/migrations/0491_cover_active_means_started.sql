-- ===========================================================================
-- "ACTIVE" MEANS STARTED AND NOT YET ENDED (the user, 2026-11-19, reading the
-- machines with a warranty and a contract both active: "Yes, do 1").
--
-- Every cover status asked only whether the END date was still to come, so a
-- contract entered in advance -- one starting next year -- already counted as
-- running: a machine inside its warranty read CMC on the saved status, and a
-- machine between a warranty and a contract that has not begun read as
-- covered. Now a cover is active only from its START date (a blank start counts
-- as started, as call_cover_as_of() (0271) already reads it) to its END date.
--
-- THE ORDER IS UNCHANGED (warranty vs contract is on hold, the user's call):
-- each rule keeps the order it had, and gains the start date only.
-- ===========================================================================
--
-- HERE (sales_contracts): sync_product_machine() -- the SAVED status --
-- copied verbatim from its current definition (0391), only the status branch
-- changed; and machine_cover (0036), the view Machine History reads, only its
-- item_status changed (same columns; security_invoker re-set, 0106).
-- The Product Database view and Product Database 2.0: 0492.
-- ===========================================================================

create or replace function public.sync_product_machine(p_item text, p_serial text)
 returns void
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  n text := lower(btrim(coalesce(p_item, '')));
  s text := lower(btrim(coalesce(p_serial, '')));
  k text;
  w record; c record; a record; t record; cur record; pm record;
  v_party text;
  foreign_contract boolean := false;
  foreign_warranty boolean := false;
  v_inst date; v_months numeric; v_inst_end date;
  ft record; use_ft boolean := false;
  ti record; use_ti boolean := false;
begin
  if n = '' or s = '' then return; end if;
  k := n || '|' || s;

  select i.sa_number,
         coalesce(i.warranty_start, h.warranty_start) as ws,
         coalesce(i.warranty_end,   h.warranty_end)   as we,
         coalesce(i.pm_visits,      h.pm_visits)      as pm,
         coalesce(nullif(btrim(coalesce(i.invoice_no, '')), ''), nullif(btrim(coalesce(h.invoice_no, '')), '')) as inv,
         coalesce(i.invoice_date,    h.invoice_date)    as invd,
         coalesce(i.warranty_years,  h.warranty_years)  as wy,
         coalesce(i.warranty_months, h.warranty_months) as wm,
         i.accessories_included as acc
    into w
    from public.sale_items i left join public.sale_entries h on h.sa_number = i.sa_number
   where lower(btrim(coalesce(i.product_name, ''))) = n
     and lower(btrim(coalesce(i.serial_number, ''))) = s
   order by coalesce(i.warranty_end, h.warranty_end) desc nulls last, i.id desc limit 1;

  -- THE ENGINEER'S CHOICE AT INSTALLATION (0331, the user, 2026-10-03): where
  -- the installation's customer feedback answers "Warranty Start Date?" with
  -- "Installation Call Solved Date", the warranty starts on the day that call
  -- was solved and ends a warranty period later; "Invoice Date" keeps the
  -- documented start on the sale.
  v_inst := public.machine_install_warranty_start(p_item, p_serial);
  if v_inst is not null then
    select coalesce(i.warranty_months, h.warranty_months, i.warranty_years * 12, h.warranty_years * 12)
      into v_months
      from public.sale_items i left join public.sale_entries h on h.sa_number = i.sa_number
     where lower(btrim(coalesce(i.product_name, ''))) = n
       and lower(btrim(coalesce(i.serial_number, ''))) = s
     order by coalesce(i.warranty_end, h.warranty_end) desc nulls last, i.id desc limit 1;
    -- cover_period_end() (0218) reproduces the application's own arithmetic;
    -- asked by name because its module runs after this one on a fresh build.
    if v_months is not null and v_months > 0 and to_regprocedure('public.cover_period_end(date,numeric)') is not null then
      execute 'select public.cover_period_end($1, $2)' into v_inst_end using v_inst, v_months;
    end if;
  end if;

  select i.mc_number, i.product_code,
         coalesce(nullif(btrim(coalesce(i.contract_type, '')), ''), h.contract_type) as ct,
         coalesce(i.contract_start, h.contract_start) as cs,
         coalesce(i.contract_end,   h.contract_end)   as ce,
         coalesce(i.pm_visits_total, h.pm_visits_total) as pm,
         coalesce(nullif(btrim(coalesce(i.status, '')), ''), h.status) as st,
         coalesce(nullif(btrim(coalesce(i.party_name, '')), ''), h.party_name) as party
    into c
    from public.contract_items i left join public.contract_entries h on h.mc_number = i.mc_number
   where lower(btrim(coalesce(i.product_name, ''))) = n
     and lower(btrim(coalesce(i.serial_number, ''))) = s
   order by coalesce(i.contract_end, h.contract_end) desc nulls last, i.id desc limit 1;

  -- The recovered detail, used only where the registers are silent.
  select e.warranty_number, e.warranty_start, e.warranty_end,
         e.contract_number, e.contract_type, e.contract_start, e.contract_end
    into a
    from public.product_additional_entries e where e.machine_key = k limit 1;

  select x.reference_no as ref, x.transfer_date as d
    into t
    from public.ownership_transfers x
   where lower(btrim(coalesce(x.item_name, ''))) = n
     and lower(btrim(coalesce(x.serial_number, ''))) = s
   order by coalesce(x.transferred_at, x.created_at, x.transfer_date::timestamptz) desc nulls last, x.id desc
   limit 1;

  -- A FRESH WARRANTY GIVEN ON A TRANSFER (0383, the user, 2026-10-05: "During
  -- Transfer, the new Owner gets a Fresh warranty date"): the latest transfer
  -- of this machine that carries one. It decides the machine's warranty when
  -- it starts on or after the warranty the sale (or the installation) gives,
  -- so a re-sale after the transfer takes the warranty back, and an old sale
  -- saved again does not.
  select x.reference_no as ref, x.warranty_start as ws, x.warranty_end as we,
         x.warranty_months as wm, x.warranty_years as wy
    into ft
    from public.ownership_transfers x
   where lower(btrim(coalesce(x.item_name, ''))) = n
     and lower(btrim(coalesce(x.serial_number, ''))) = s
     and x.warranty_start is not null
   order by coalesce(x.transferred_at, x.created_at, x.transfer_date::timestamptz) desc nulls last, x.id desc
   limit 1;

  -- THE INVOICE A TRANSFER CARRIES (0391, the user, 2026-10-06: an invoice on
  -- a transfer goes to the Product Database, with or without a fresh
  -- warranty): the latest transfer of this machine that names one. It is the
  -- machine's invoice when it is dated on or after the sale's (a transfer with
  -- no invoice date is dated by the transfer), so a re-sale after it takes the
  -- invoice back and the old sale saved again does not.
  select nullif(btrim(coalesce(x.invoice_no, '')), '') as inv,
         x.invoice_date as invd,
         coalesce(x.invoice_date, x.transfer_date, (x.created_at at time zone 'Asia/Kolkata')::date) as on_day
    into ti
    from public.ownership_transfers x
   where lower(btrim(coalesce(x.item_name, ''))) = n
     and lower(btrim(coalesce(x.serial_number, ''))) = s
     and (btrim(coalesce(x.invoice_no, '')) <> '' or x.invoice_date is not null)
   order by coalesce(x.transferred_at, x.created_at, x.transfer_date::timestamptz) desc nulls last, x.id desc
   limit 1;
  use_ti := ti.on_day is not null and ti.on_day >= coalesce(w.invd, '-infinity'::date);

  -- A CONTRACT FOR A MACHINE NOT YET HELD is inserted (the user's choice), for
  -- the owner the registers name, with that owner's Party Master address.
  if c.mc_number is not null and not exists (select 1 from public.products where machine_key = k) then
    v_party := coalesce(nullif(btrim(coalesce(public.machine_current_party(p_item, p_serial), '')), ''),
                        nullif(btrim(coalesce(c.party, '')), ''), '');
    select nullif(btrim(x.address), '') as address, nullif(btrim(x.city), '') as city,
           nullif(btrim(x.state), '') as state, nullif(btrim(x.service_engineer), '') as engineer
      into pm from public.parties x where x.name_key = lower(v_party) limit 1;
    insert into public.products (item_name, serial_number, party_name, item_code,
                                 address, city, state, service_engineer)
    values (btrim(p_item), btrim(p_serial), v_party, coalesce(c.product_code, ''),
            coalesce(pm.address, ''), coalesce(pm.city, ''), coalesce(pm.state, ''), coalesce(pm.engineer, ''))
    on conflict (machine_key) do nothing;
  end if;

  use_ft := ft.ws is not null
    and ft.ws >= coalesce(case when v_inst is not null then v_inst end, w.ws, a.warranty_start, '-infinity'::date);

  select p.contract_number, p.warranty_number into cur from public.products p where p.machine_key = k;
  if not found then return; end if;

  -- WHAT THE SERIAL-ONLY SYNC LEFT BEHIND: a number this machine carries that a
  -- register line DOES hold, but for another model sharing the serial.
  if c.mc_number is null and nullif(btrim(coalesce(a.contract_number, '')), '') is null
     and btrim(coalesce(cur.contract_number, '')) <> '' then
    foreign_contract := exists (select 1 from public.contract_items x where x.mc_number = cur.contract_number);
  end if;
  if w.sa_number is null and nullif(btrim(coalesce(a.warranty_number, '')), '') is null
     and btrim(coalesce(cur.warranty_number, '')) <> '' then
    foreign_warranty := exists (select 1 from public.sale_items x where x.sa_number = cur.warranty_number);
  end if;

  update public.products p set
    warranty_number = case when use_ft then ft.ref
                           when foreign_warranty then ''
                           else coalesce(w.sa_number, nullif(a.warranty_number, ''), p.warranty_number) end,
    warranty_start  = case when use_ft then ft.ws
                           when v_inst is not null then v_inst
                           when foreign_warranty then null else coalesce(w.ws, a.warranty_start, p.warranty_start) end,
    warranty_end    = case when use_ft then ft.we
                           when v_inst is not null and v_inst_end is not null then v_inst_end
                           when foreign_warranty then null else coalesce(w.we, a.warranty_end,   p.warranty_end) end,
    invoice_no      = case when use_ti then coalesce(ti.inv, '') else coalesce(w.inv,  p.invoice_no) end,
    invoice_date    = case when use_ti then ti.invd else coalesce(w.invd, p.invoice_date) end,
    warranty_years  = case when use_ft then ft.wy else coalesce(w.wy,   p.warranty_years) end,
    warranty_months = case when use_ft then ft.wm::integer else coalesce(w.wm,   p.warranty_months) end,
    accessories_included = coalesce(w.acc, p.accessories_included),
    contract_number = case when foreign_contract then ''
                           else coalesce(c.mc_number, nullif(a.contract_number, ''), p.contract_number) end,
    contract_start  = case when foreign_contract then null else coalesce(c.cs, a.contract_start, p.contract_start) end,
    contract_end    = case when foreign_contract then null else coalesce(c.ce, a.contract_end,   p.contract_end) end,
    contract_type   = case when foreign_contract then ''
                           else coalesce(nullif(c.ct, ''), nullif(a.contract_type, ''), p.contract_type) end,
    contract_status_keyed = case when foreign_contract then ''
                                 else coalesce(nullif(btrim(coalesce(c.st, '')), ''), p.contract_status_keyed) end,
    -- THE CONTRACT'S PM VISITS OVERWRITE THE SALE'S (the user's choice), while
    -- the machine has a contract line saying how many.
    pm_visits       = case when c.mc_number is not null and c.pm is not null then c.pm
                           else coalesce(w.pm, p.pm_visits) end,
    transfer_ref    = coalesce(nullif(btrim(coalesce(t.ref, '')), ''), p.transfer_ref),
    transfer_date   = coalesce(t.d, p.transfer_date),
    -- machine_cover's rule (0036): a current contract is its type, a current
    -- warranty WGP, and a machine the registers know with neither is OGP. One
    -- no register mentions keeps the status it was imported with. CURRENT
    -- means STARTED and not yet ended (0491): the start dates are the ones
    -- written above, a blank start counting as started.
    item_status     = case
      when coalesce(c.cs, a.contract_start, '-infinity'::date) <= current_date
       and coalesce(c.ce, a.contract_end) >= current_date
        then coalesce(nullif(c.ct, ''), nullif(a.contract_type, ''), 'CMC')
      when coalesce(case when use_ft then ft.ws
                         when v_inst is not null then v_inst
                         else coalesce(w.ws, a.warranty_start) end, '-infinity'::date) <= current_date
       and case when use_ft then ft.we
                else coalesce(case when v_inst is not null then v_inst_end end, w.we, a.warranty_end) end >= current_date then 'WGP'
      when use_ft or w.sa_number is not null or c.mc_number is not null or a.warranty_number is not null
        or a.contract_number is not null or foreign_contract or foreign_warranty then 'OGP'
      else p.item_status end
  where p.machine_key = k;
end $function$;
revoke execute on function public.sync_product_machine(text, text) from public, anon, authenticated;

create or replace view public.machine_cover as
with w as (
  select distinct on (lower(trim(serial_number)))
         lower(trim(serial_number)) as skey, serial_number, product_name, product_code, party_name,
         sa_number, warranty_start, warranty_end, state, city, engineer
    from public.warranty_sale_details
   where coalesce(serial_number, '') <> ''
   order by lower(trim(serial_number)), warranty_end desc nulls last, id desc
), c as (
  select distinct on (lower(trim(serial_number)))
         lower(trim(serial_number)) as skey, serial_number, product_name, product_code, party_name,
         mc_number, contract_type, contract_start, contract_end, present_item_status
    from public.contract_details
   where coalesce(serial_number, '') <> ''
   order by lower(trim(serial_number)), contract_end desc nulls last, id desc
)
select
  coalesce(w.skey, c.skey)                       as serial_key,
  coalesce(w.serial_number, c.serial_number)     as serial_number,
  coalesce(c.product_name, w.product_name)       as product_name,
  coalesce(c.product_code, w.product_code)       as product_code,
  coalesce(c.party_name, w.party_name)           as party_name,
  w.sa_number, w.warranty_start, w.warranty_end,
  public.cover_state(w.warranty_end)             as warranty_state,
  c.mc_number, c.contract_type, c.contract_start, c.contract_end,
  public.cover_state(c.contract_end)             as contract_state,
  c.present_item_status, w.state, w.city, w.engineer,
  -- What the machine is under TODAY. A live contract outranks a live warranty
  -- (contract items carry priority 2, warranty items 1 — the same order
  -- AppSheet used), and OGP means out of both.
  case
    -- ACTIVE = STARTED AND NOT YET ENDED (0491).
    when coalesce(c.contract_start, '-infinity'::date) <= current_date
     and c.contract_end >= current_date then coalesce(nullif(c.contract_type, ''), 'CMC')
    when coalesce(w.warranty_start, '-infinity'::date) <= current_date
     and w.warranty_end >= current_date then 'WGP'
    else 'OGP' end                               as item_status
from w full join c on c.skey = w.skey;
alter view public.machine_cover set (security_invoker = on);
grant select on public.machine_cover to authenticated;
