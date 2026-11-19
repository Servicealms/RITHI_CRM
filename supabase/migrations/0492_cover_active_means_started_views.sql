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
--
-- HERE (product_database_2): the Product Database view (0239) -- what the
-- screen and the call form read, and what the nightly refresh (0490) copies --
-- and Product Database 2.0 (0465). Each re-created from its current definition
-- with only the status expressions changed: same columns in the same order,
-- security_invoker and grants re-set.
-- ===========================================================================

create or replace view public.product_database as
with contract_pick as (
  select distinct on (mk_name, mk_serial, party_key)
         mk_name, mk_serial, party_key,
         mc_number, contract_type, contract_start, contract_end
    from (
      select lower(btrim(coalesce(ci.product_name, '')))  as mk_name,
             lower(btrim(coalesce(ci.serial_number, ''))) as mk_serial,
             lower(btrim(coalesce(nullif(btrim(coalesce(ci.party_name, '')), ''),
                                  ce.party_name, '')))    as party_key,
             ci.mc_number,
             coalesce(nullif(btrim(coalesce(ci.contract_type, '')), ''), ce.contract_type) as contract_type,
             coalesce(ci.contract_start, ce.contract_start) as contract_start,
             coalesce(ci.contract_end,   ce.contract_end)   as contract_end,
             ci.id
        from public.contract_items ci
        join public.contract_entries ce on ce.mc_number = ci.mc_number
    ) c
   where mk_name <> '' and mk_serial <> ''
   order by mk_name, mk_serial, party_key, contract_end desc nulls last, id desc
),
install_pick as (
  select distinct on (mk_name, mk_serial, party_key)
         mk_name, mk_serial, party_key, ucn
    from (
      select lower(btrim(coalesce(c.product_name, ''))) as mk_name,
             lower(btrim(coalesce(c.serial, '')))       as mk_serial,
             lower(btrim(coalesce(c.party_name, '')))   as party_key,
             c.ucn, c.reg_date, c.id
        from public.installation_calls c
       where coalesce(c.cancelled_at, null) is null
    ) x
   where mk_name <> '' and mk_serial <> ''
   order by mk_name, mk_serial, party_key, reg_date desc nulls last, id desc
)
select
p.id,
  p.party_name,
  p.item_name,
  p.serial_number,
  p.warranty_number,
  p.warranty_start,
  p.warranty_end,
  p.active,
  p.extra,
  p.created_at,
  p.machine_key,
  p.serial_key,
  p.item_code,
  p.item_details_long,
  p.item_details,
  p.sold_through,
  p.state,
  p.city,
  p.address,
  p.po_no,
  p.po_date,
  p.warranty_status_keyed,
  p.contract_status_keyed,
  p.pm_visits,
  p.other_details,
  p.prod_final,
  p.installation_completed,
  p.inst_date,
  p.inst_call_status,
  p.report,
  p.associated_accessory,

  -- ---- ITEM STATUS -------------------------------------------------------
  -- Warranty first, then the contract THAT MATCHES THIS OWNER, else OGP. A
  -- machine whose only contract names the previous customer is out of contract,
  -- which is the point of the whole change.
  case
    -- ACTIVE = STARTED AND NOT YET ENDED (0492).
    when coalesce(p.warranty_start, '-infinity'::date) <= current_date
     and p.warranty_end >= current_date then 'WGP'
    when coalesce(cp.contract_start, '-infinity'::date) <= current_date
     and cp.contract_end >= current_date then
      coalesce(public.contract_cover_code(nullif(btrim(cp.contract_type), '')),
               'CONTRACT (TYPE NOT RECORDED)')
    else 'OGP'
  end                                               as item_status,

  -- ---- THE CONTRACT, where it names this owner ---------------------------
  coalesce(cp.mc_number, '')                        as contract_number,
  cp.contract_start                                 as contract_start,
  cp.contract_end                                   as contract_end,
  coalesce(cp.contract_type, '')                    as contract_type,

  -- ---- THE INSTALLATION CALL, where it names this owner ------------------
  coalesce(ip.ucn, '')                              as inst_call,

  -- ---- SERVICE ENGINEER, always the Party Master's -----------------------
  coalesce(nullif(btrim(pa.service_engineer), ''), '') as service_engineer,

  -- What the MIGRATED SYSTEM said, kept beside the matched answers.
  p.item_status                                     as item_status_keyed,
  p.service_engineer                                as service_engineer_keyed,
  p.contract_number                                 as contract_number_keyed,
  p.inst_call                                       as inst_call_keyed
from public.products p
left join public.parties pa
       on pa.name_key = lower(btrim(coalesce(p.party_name, '')))
-- THE PARTY IS PART OF THE JOIN KEY. That one clause is the whole rule: a
-- contract or a call that names a different customer simply does not join.
left join contract_pick cp
       on cp.mk_name   = lower(btrim(coalesce(p.item_name, '')))
      and cp.mk_serial = lower(btrim(coalesce(p.serial_number, '')))
      and cp.party_key = lower(btrim(coalesce(p.party_name, '')))
left join install_pick ip
       on ip.mk_name   = lower(btrim(coalesce(p.item_name, '')))
      and ip.mk_serial = lower(btrim(coalesce(p.serial_number, '')))
      and ip.party_key = lower(btrim(coalesce(p.party_name, '')));

alter view public.product_database set (security_invoker = on);
grant select on public.product_database to authenticated;

-- Product Database 2.0, only where its store exists (0465's own guard).
do $$
begin
  if to_regclass('public.product_database_v2_mv') is null then return; end if;
  execute $v$
    create or replace view public.product_database_v2 as
    select
      m.machine_key, m.product_name, m.serial_number, m.product_code,
      m.party_name, m.party_from,
      m.warranty_start, m.warranty_months, m.warranty_end, m.warranty_from,
      public.cover_state(m.warranty_end)                     as warranty_state,
      m.contract_number, m.contract_type_as_recorded, m.contract_type,
      m.contract_start, m.contract_months, m.contract_end, m.contract_from,
      public.cover_state(m.contract_end)                     as contract_state,
      case
        when coalesce(m.warranty_start, '-infinity'::date) <= current_date and coalesce(m.warranty_end, '-infinity'::date) >= current_date then 'WGP'
        when coalesce(m.contract_start, '-infinity'::date) <= current_date and coalesce(m.contract_end, '-infinity'::date) >= current_date
          then coalesce(public.contract_cover_code(m.contract_type_as_recorded),
                        'CONTRACT (TYPE NOT RECORDED)')
        else 'OGP'
      end                                                    as item_status,
      case
        when coalesce(m.warranty_start, '-infinity'::date) <= current_date and coalesce(m.warranty_end, '-infinity'::date) >= current_date
          then 'inside warranty — ' || coalesce(m.warranty_from, 'source not recorded')
        when coalesce(m.contract_start, '-infinity'::date) <= current_date and coalesce(m.contract_end, '-infinity'::date) >= current_date
          then 'under contract — ' || coalesce(m.contract_from, 'source not recorded')
        else 'no warranty and no contract covers today'
      end                                                    as item_status_reason,
      m.sa_number, m.state, m.city, m.engineer,
      m.from_party, m.to_party, m.transfer_date, m.reference_no,
      m.in_warranty_register, m.in_contract_register, m.in_additional_entries,
      m.installation_ucn,
      s.refreshed_at,
      s.stale
    from public.product_database_v2_gate m
    cross join public.product_database_v2_state s
  $v$;
  execute 'alter view public.product_database_v2 set (security_invoker = on)';
  execute 'grant select on public.product_database_v2 to authenticated';
end $$;
