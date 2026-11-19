-- ===========================================================================
-- FIX THE FIVE WARRANTY / CONTRACT OVERLAPS -- the user's decisions, 2026-11-19.
--
-- "Which comes first when a machine really has both a warranty and a contract
-- running - this should be erradicated. Lets first fix the raw data."
--
--   19146 MONNAL T60  contract MC6601 is extra   -> off MC6601, warranty kept
--   11260 MONNAL T75  contract MC6669 is extra   -> off MC6669, warranty kept
--   11204 MONNAL T75  contract MC6856 is extra   -> off MC6856, warranty kept
--         ("Cancel those MC and keep only the Warranty")
--   11430 MONNAL T75  warranty from the SALE date, not the installation's
--         solved date -> its installation's "Warranty Start Date?" answer
--         becomes "Invoice Date"; contract MC7121 kept
--   19163 MONNAL T60  warranty SA9198 shortened to end 27-Feb-2027, for this
--         machine only (its own line on the sale); contract MC7138 kept
--
-- A contract has no "cancelled" state here, only delete -- so the machine's
-- LINE is deleted from the contract, and the contract itself is deleted only
-- if no machine is left on it; the machine's saved copy of that contract is
-- cleared too. Every row deleted or changed is COPIED FIRST into
-- backup.cover_fix_backup, so it can be put back:
--   select source, row_data from backup.cover_fix_backup order by id;
--
-- HOW TO RUN: as it stands it is a PREVIEW -- it changes nothing and shows
-- what it would do. Read the grid, then change `apply boolean := false` to
-- `true` below and run it again. Run in the Supabase SQL editor (it names
-- customers -- never through the public GitHub workflow).
--
-- The saved Item Status of the five machines is brought up to date at the end
-- (refresh_product_item_status, 0490).
-- ===========================================================================

create temp table if not exists fix_report (n int, machine text, step text, before text, after text);
truncate fix_report;

-- THE BACKUP LIVES OUTSIDE `public`: the API exposes only `public`, and every
-- table there must carry the system columns (_status.sql row 187), which a
-- one-off copy has no business having. Nobody but the database owner reads it.
create schema if not exists backup;
revoke all on schema backup from public, anon, authenticated;
create table if not exists backup.cover_fix_backup (
  id         bigint generated always as identity primary key,
  taken_at   timestamptz not null default now(),
  source     text not null,
  row_data   jsonb not null
);
revoke all on backup.cover_fix_backup from public, anon, authenticated;

do $$
declare
  apply boolean := false;   -- <<< change to true to make the changes
  r record; k text; n int := 0; left_on int; before_txt text; after_txt text;
begin
  -- 1-3. take the machine off the contract
  for r in select * from (values
      ('MONNAL T60', '19146', 'MC6601'),
      ('MONNAL T75', '11260', 'MC6669'),
      ('MONNAL T75', '11204', 'MC6856')) v(item, serial, mc) loop
    k := lower(btrim(r.item)) || '|' || lower(btrim(r.serial));
    n := n + 1;
    select string_agg(format('%s line %s: %s to %s', ci.mc_number, ci.id,
                             to_char(coalesce(ci.contract_start, ce.contract_start), 'DD-Mon-YYYY'),
                             to_char(coalesce(ci.contract_end, ce.contract_end), 'DD-Mon-YYYY')), '; ')
      into before_txt
      from public.contract_items ci join public.contract_entries ce on ce.mc_number = ci.mc_number
     where ci.mc_number = r.mc
       and lower(btrim(coalesce(ci.product_name, ''))) || '|' || lower(btrim(coalesce(ci.serial_number, ''))) = k;
    select count(*) into left_on from public.contract_items ci
     where ci.mc_number = r.mc
       and lower(btrim(coalesce(ci.product_name, ''))) || '|' || lower(btrim(coalesce(ci.serial_number, ''))) <> k;
    if before_txt is null then
      insert into fix_report values (n, r.item || ' ' || r.serial, 'Take off ' || r.mc, 'NOT FOUND on ' || r.mc, 'nothing to do');
      continue;
    end if;
    after_txt := case when left_on = 0 then r.mc || ' deleted (no other machine on it)'
                      else 'off ' || r.mc || '; ' || left_on || ' other machine(s) stay on it' end;
    if apply then
      insert into backup.cover_fix_backup (source, row_data)
        select 'contract_items', to_jsonb(ci) from public.contract_items ci
         where ci.mc_number = r.mc
           and lower(btrim(coalesce(ci.product_name, ''))) || '|' || lower(btrim(coalesce(ci.serial_number, ''))) = k;
      delete from public.contract_items ci
       where ci.mc_number = r.mc
         and lower(btrim(coalesce(ci.product_name, ''))) || '|' || lower(btrim(coalesce(ci.serial_number, ''))) = k;
      if left_on = 0 then
        insert into backup.cover_fix_backup (source, row_data)
          select 'contract_entries', to_jsonb(ce) from public.contract_entries ce where ce.mc_number = r.mc;
        delete from public.contract_entries ce where ce.mc_number = r.mc;
      end if;
      -- The machine's SAVED copy of the contract. sync_product_machine keeps a
      -- machine's values where no register mentions it any more (it cannot tell
      -- a deleted contract from one never loaded), so it is cleared here.
      insert into backup.cover_fix_backup (source, row_data)
        select 'products', to_jsonb(p) from public.products p where p.machine_key = k and p.contract_number = r.mc;
      update public.products p
         set contract_number = '', contract_start = null, contract_end = null,
             contract_type = '', contract_status_keyed = ''
       where p.machine_key = k and p.contract_number = r.mc;
    end if;
    insert into fix_report values (n, r.item || ' ' || r.serial, 'Take off ' || r.mc, before_txt,
                                   case when apply then after_txt else 'WOULD BE: ' || after_txt end);
  end loop;

  -- 4. 11430: warranty from the sale (Invoice Date), not the solved date
  n := n + 1;
  select string_agg(format('%s answered "%s", solved %s', w.ucn, w.warranty_choice, to_char(w.solved_date, 'DD-Mon-YYYY')), '; ')
    into before_txt
    from public.installation_warranty_starts w where w.machine_key = 'monnal t75|11430';
  if before_txt is null then
    insert into fix_report values (n, 'MONNAL T75 11430', 'Warranty from the sale date', 'NO installation record found', 'nothing to do');
  else
    if apply then
      insert into backup.cover_fix_backup (source, row_data)
        select 'installation_warranty_starts', to_jsonb(w) from public.installation_warranty_starts w where w.machine_key = 'monnal t75|11430';
      update public.installation_warranty_starts w
         set warranty_choice = 'Invoice Date',
             remarks = btrim(coalesce(w.remarks, '') || ' [2026-11-19: warranty from the sale date, the user''s decision -- the contract MC7121 starts 5 days before the solved-date warranty ended]')
       where w.machine_key = 'monnal t75|11430';
    end if;
    insert into fix_report values (n, 'MONNAL T75 11430', 'Warranty from the sale date', before_txt,
                                   case when apply then 'answer is now "Invoice Date"' else 'WOULD BE: answer "Invoice Date"' end);
  end if;

  -- 5. 19163: this machine's line on SA9198 ends 27-Feb-2027
  n := n + 1;
  select string_agg(format('SA9198 line %s: %s to %s', i.id,
                           to_char(coalesce(i.warranty_start, h.warranty_start), 'DD-Mon-YYYY'),
                           to_char(coalesce(i.warranty_end, h.warranty_end), 'DD-Mon-YYYY')), '; ')
    into before_txt
    from public.sale_items i join public.sale_entries h on h.sa_number = i.sa_number
   where i.sa_number = 'SA9198'
     and lower(btrim(coalesce(i.product_name, ''))) || '|' || lower(btrim(coalesce(i.serial_number, ''))) = 'monnal t60|19163';
  if before_txt is null then
    insert into fix_report values (n, 'MONNAL T60 19163', 'Warranty ends 27-Feb-2027', 'NOT FOUND on SA9198', 'nothing to do');
  else
    if apply then
      insert into backup.cover_fix_backup (source, row_data)
        select 'sale_items', to_jsonb(i) from public.sale_items i
         where i.sa_number = 'SA9198'
           and lower(btrim(coalesce(i.product_name, ''))) || '|' || lower(btrim(coalesce(i.serial_number, ''))) = 'monnal t60|19163';
      update public.sale_items i set warranty_end = date '2027-02-27'
       where i.sa_number = 'SA9198'
         and lower(btrim(coalesce(i.product_name, ''))) || '|' || lower(btrim(coalesce(i.serial_number, ''))) = 'monnal t60|19163';
    end if;
    insert into fix_report values (n, 'MONNAL T60 19163', 'Warranty ends 27-Feb-2027', before_txt,
                                   case when apply then 'this line ends 27-Feb-2027' else 'WOULD BE: this line ends 27-Feb-2027' end);
  end if;

  -- the saved status of every machine whose cover moved
  if apply then perform public.refresh_product_item_status(); end if;

  -- what the Product Database says for the five machines, after (or as it stands, in a preview)
  insert into fix_report
  select 100 + row_number() over (order by p.serial_number)::int,
         p.item_name || ' ' || p.serial_number,
         case when apply then 'Product Database NOW' else 'Product Database as it stands' end,
         format('warranty %s to %s', coalesce(to_char(p.warranty_start, 'DD-Mon-YYYY'), '-'), coalesce(to_char(p.warranty_end, 'DD-Mon-YYYY'), '-')),
         format('contract %s %s to %s; status %s',
                coalesce(nullif(p.contract_number, ''), 'none'),
                coalesce(to_char(p.contract_start, 'DD-Mon-YYYY'), '-'), coalesce(to_char(p.contract_end, 'DD-Mon-YYYY'), '-'),
                p.item_status)
    from public.product_database p
   where p.machine_key in ('monnal t60|19146', 'monnal t75|11260', 'monnal t75|11204', 'monnal t75|11430', 'monnal t60|19163');
end $$;

select n as row, machine, step, before, after from fix_report order by n;
