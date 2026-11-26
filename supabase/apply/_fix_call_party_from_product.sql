-- ===========================================================================
-- SET A CALL'S PARTY FROM ITS MACHINE -- preview by default.
--
-- The user, 2026-11-26: "fix the Call - 26K11F0027, Update the Party Name and
-- Details as per the Product" ... "Product + Serial No".
--
-- The machine is found by PRODUCT + SERIAL (machine_key), never by the serial
-- alone -- serials repeat across models. Its party is the Product Database's
-- (public.product_database: the latest sale or ownership transfer's owner).
-- The call's Party Name becomes that party; its City and State come from the
-- Party Master for that party, or from the machine's row where the Party
-- Master has none.
--
-- ONLY the call's Party Name, City and State change. Spare requests already
-- raised on the call keep the party they were raised with; the grid says how
-- many there are.
--
-- HOW TO RUN: change the UCN below if needed and Run -- it is a PREVIEW and
-- changes nothing. Then change `apply` to true and run it again. The call row
-- is copied first into backup.call_party_fix_backup. SQL editor only.
-- ===========================================================================

create temp table if not exists fix_report (n int, item text, was text, now_is text, note text);
truncate fix_report;

create schema if not exists backup;
revoke all on schema backup from public, anon, authenticated;
create table if not exists backup.call_party_fix_backup (
  id         bigint generated always as identity primary key,
  taken_at   timestamptz not null default now(),
  row_data   jsonb not null
);
revoke all on backup.call_party_fix_backup from public, anon, authenticated;

do $$
declare
  apply boolean := false;            -- <<< change to true to make the change
  v_ucn text    := '26K11F0027';     -- <<< the call
  c record; m record; pm record; n_sp int; v_city text; v_state text;
begin
  select * into c from public.field_calls f where f.ucn = v_ucn;
  if not found then
    insert into fix_report values (1, 'Call ' || v_ucn, '', '', 'NOT FOUND among the field calls -- nothing done');
    return;
  end if;
  select * into m from public.product_database p
   where p.machine_key = lower(btrim(coalesce(c.product_name, ''))) || '|' || lower(btrim(coalesce(c.serial, '')))
   limit 1;
  if not found then
    insert into fix_report values (1, 'Machine ' || coalesce(c.product_name, '') || ' / ' || coalesce(c.serial, ''), '', '',
      'NOT FOUND in the Product Database by product + serial -- nothing done');
    return;
  end if;
  if btrim(coalesce(m.party_name, '')) = '' then
    insert into fix_report values (1, 'Machine ' || m.item_name || ' / ' || m.serial_number, '', '', 'The Product Database names no party for it -- nothing done');
    return;
  end if;
  select * into pm from public.parties x where x.name_key = lower(btrim(m.party_name)) limit 1;
  v_city  := coalesce(nullif(btrim(pm.city), ''),  nullif(btrim(m.city), ''),  c.city);
  v_state := coalesce(nullif(btrim(pm.state), ''), nullif(btrim(m.state), ''), c.state);
  select count(*) into n_sp from public.spare_requests s where s.ucn = v_ucn;

  insert into fix_report values
    (1, 'Machine (product + serial)', '', m.item_name || ' / ' || m.serial_number, 'the call''s machine, as in the Product Database'),
    (2, 'Party Name', coalesce(c.party_name, ''), m.party_name, case when coalesce(c.party_name, '') = m.party_name then 'already right' else '' end),
    (3, 'City', coalesce(c.city, ''), coalesce(v_city, ''), case when pm.id is null then 'Party Master has no such party -- taken from the machine' else 'from the Party Master' end),
    (4, 'State', coalesce(c.state, ''), coalesce(v_state, ''), case when pm.id is null then 'taken from the machine' else 'from the Party Master' end),
    (5, 'Spare requests on the call', '', n_sp::text, 'left as raised');

  if apply then
    insert into backup.call_party_fix_backup (row_data) select to_jsonb(f) from public.field_calls f where f.ucn = v_ucn;
    update public.field_calls f
       set party_name = m.party_name, city = v_city, state = v_state
     where f.ucn = v_ucn;
    insert into fix_report values (9, 'Done', '', '', 'Call ' || v_ucn || ' updated');
  else
    insert into fix_report values (9, 'Preview', '', '', 'Nothing changed -- set apply to true and run again');
  end if;
end $$;

select n as row, item, was, now_is, note from fix_report order by n;
