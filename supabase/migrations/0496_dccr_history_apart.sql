-- ===========================================================================
-- 0496 -- DCCR HISTORY IS ITS OWN TABLE, APART FROM CALL HISTORY (the user,
-- 2026-11-27: "keep the DCCR Source, Keep this Separate" -- "DCCR is DCCR
-- History, This is Call History - 2 Separate Database, 2 Separate Containers /
-- Schema -- and Same for View as well"; asked, chose: not on Machine History).
--
-- Until now the old DCCR register's calls lived IN call_history with Source
-- "DCCR register" (0430, 0432), so a yearly sheet bringing the same UC No. +
-- Call No. REPLACED the DCCR record on screen and tucked it into `duplicates`
-- -- and the Recent Failure Rate (0431) then read the yearly sheet's product,
-- serial and status for a failure the DCCR register recorded. From here:
--
--   1. public.dccr_call_history holds the DCCR register's calls, one row per
--      UC No. + Call No., in the shape call_history has (less the duplicate
--      columns: there is one source here, so nothing to be a duplicate OF).
--   2. EVERY DCCR record leaves call_history, WHOLE, nothing dropped:
--        * a row shown as DCCR moves; if it held copies from other sources in
--          `duplicates`, the latest of them (by year, then load time) becomes
--          the Call History row and the rest stay its duplicates -- so a
--          yearly sheet's copy is not lost with the DCCR row;
--        * a DCCR copy inside another row's `duplicates` moves out, and the row
--          stays Duplicate only while it still holds another copy.
--      Done with the triggers paused, so no load time is rewritten; one
--      record_audit row says what moved.
--   3. dccr_history_apply() (the DCCR Register -- historical upload) files the
--      call HERE and no longer in call_history. Its review is filed exactly as
--      before. Re-read from the database before this rewrite (0430's body);
--      only the target table, the conflict update and the note change.
--   4. _dccr_failure_calls() reads its history arm from HERE -- in 0497, in
--      the objective module that owns that function (see there).
--   5. dccr_call_history_summary, the DCCR History screen's summary, and its
--      page key mod:/dccr-history for admin and technical_support (0495's
--      pattern).
--
-- A Call History upload never touches this table, and a DCCR upload never
-- touches call_history: a call in both is in both, and neither is flagged.
-- Machine History reads call_history only (the user's choice).
-- ===========================================================================

-- ---- 1. the table ----------------------------------------------------------
create table if not exists public.dccr_call_history (
  id                 bigserial primary key,
  ucn                text not null check (btrim(ucn) <> ''),
  call_no            text not null default '',
  call_at            timestamptz,
  call_type          text not null default '',
  register           text check (register is null or register in ('Field', 'Installation', 'PM')),
  party_name         text not null default '',
  state              text not null default '',
  city               text not null default '',
  engineer           text not null default '',
  item_code          text not null default '',
  item_name          text not null default '',
  serial             text not null default '',
  standard_complaint text not null default '',
  complaint_reported text not null default '',
  item_status        text not null default '',
  warranty_start     date,
  contract_type      text not null default '',
  call_status        text not null default '',
  solved_at          timestamptz,
  record_year        integer,
  extra              jsonb not null default '{}'::jsonb,
  loaded_at          timestamptz not null default now(),
  loaded_by          uuid
);
create unique index if not exists dccr_call_history_key on public.dccr_call_history (ucn, call_no);
create index if not exists dccr_call_history_serial_idx on public.dccr_call_history (serial);
create index if not exists dccr_call_history_call_at_idx on public.dccr_call_history (call_at);

comment on table public.dccr_call_history is
  'The old DCCR register''s calls (0496), apart from Call History: one row per UC No. + Call No., as the DCCR register has them, filed by the DCCR Register -- historical upload (dccr_history_apply). Nothing is created from a row; the Recent Failure Rate reads it through its imported review.';

-- Who loaded it and when, the year and the register -- what call_history's
-- stamp, year and register triggers do there, in one.
create or replace function public.dccr_call_history_stamp()
returns trigger language plpgsql set search_path = public as $$
begin
  new.ucn := btrim(new.ucn);
  new.call_no := btrim(coalesce(new.call_no, ''));
  new.record_year := coalesce(new.record_year, extract(year from (new.call_at at time zone 'Asia/Kolkata'))::int);
  new.register := coalesce(new.register, public.call_register_of(new.call_type));
  new.loaded_at := now();
  new.loaded_by := auth.uid();
  return new;
end $$;
revoke execute on function public.dccr_call_history_stamp() from public, anon, authenticated;

alter table public.dccr_call_history enable row level security;
-- READ LIKE A CALL, as call_history is read (0429 ch_read, word for word).
drop policy if exists dch_read on public.dccr_call_history;
create policy dch_read on public.dccr_call_history for select using (
  (select public.has_perm('calls.view'))
  and ((select public.can_view_all_calls())
       or btrim(engineer) = ''
       or lower(btrim(engineer)) in (select lower(btrim(v.n)) from public.visible_engineer_names() v(n)))
);
-- WRITTEN ONLY BY THE DCCR UPLOAD'S TRIGGER (security definer) and by
-- migrations: no write policy, no write grant, never through the public key.
revoke all on public.dccr_call_history from anon, authenticated;
grant select on public.dccr_call_history to authenticated;
revoke all on sequence public.dccr_call_history_id_seq from anon, authenticated;

-- ---- 2. every DCCR record leaves call_history, whole -----------------------
do $$
declare
  v_dccr_rows   bigint := 0;   -- rows shown as DCCR, moved
  v_promoted    bigint := 0;   -- of those, rows another source's copy took over
  v_deleted     bigint := 0;   -- of those, rows that had no other copy
  v_copies      bigint := 0;   -- DCCR copies taken out of another row's duplicates
begin
  if to_regclass('public.call_history') is null then return; end if;
  alter table public.call_history disable trigger user;
  alter table public.dccr_call_history disable trigger user;

  -- EVERY TEST BELOW IS NULL-SAFE (coalesce): a copy with no `extra` gives NULL
  -- for its imported_from, and NOT (false OR NULL) is NULL -- which once dropped
  -- such copies from the duplicates a row keeps (caught by
  -- dccr_history_apart_test, M2's WinMax copy).
  -- 2a. a DCCR copy inside another row's duplicates, out to its own table.
  insert into public.dccr_call_history (ucn, call_no, call_at, call_type, register, party_name, state, city,
         engineer, item_code, item_name, serial, standard_complaint, complaint_reported, item_status,
         warranty_start, contract_type, call_status, solved_at, record_year, extra, loaded_at)
  select h.ucn, h.call_no, r.call_at, coalesce(r.call_type, ''), public.call_register_of(r.call_type),
         coalesce(r.party_name, ''), coalesce(r.state, ''), coalesce(r.city, ''), coalesce(r.engineer, ''),
         coalesce(r.item_code, ''), coalesce(r.item_name, ''), coalesce(r.serial, ''),
         coalesce(r.standard_complaint, ''), coalesce(r.complaint_reported, ''), coalesce(r.item_status, ''),
         r.warranty_start, coalesce(r.contract_type, ''), coalesce(r.call_status, ''), r.solved_at,
         public.call_history_year(r.record_year, r.call_at),
         coalesce(r.extra, '{}'::jsonb) || jsonb_build_object('moved_by', '0496'),
         coalesce(r.loaded_at, now())
    from public.call_history h
   cross join lateral jsonb_array_elements(coalesce(h.duplicates, '[]'::jsonb)) e
   cross join lateral jsonb_populate_record(null::public.call_history, e) r
   where coalesce(h.source, '') <> 'DCCR register'
     and (coalesce(e->>'source', '') = 'DCCR register' or coalesce(e->'extra'->>'imported_from', '') = 'DCCR register (historical)')
  on conflict (ucn, call_no) do nothing;
  get diagnostics v_copies = row_count;

  update public.call_history h
     set duplicates = k.rest, duplicate = jsonb_array_length(k.rest) > 0
    from (select h2.id, coalesce(jsonb_agg(e) filter (
                   where not (coalesce(e->>'source', '') = 'DCCR register' or coalesce(e->'extra'->>'imported_from', '') = 'DCCR register (historical)')),
                 '[]'::jsonb) as rest
            from public.call_history h2
           cross join lateral jsonb_array_elements(h2.duplicates) e
           where coalesce(h2.source, '') <> 'DCCR register'
             and h2.duplicates @? '$[*] ? (@.source == "DCCR register" || @.extra.imported_from == "DCCR register (historical)")'
           group by h2.id) k
   where h.id = k.id;

  -- 2b. a row shown as DCCR, to its own table.
  insert into public.dccr_call_history (ucn, call_no, call_at, call_type, register, party_name, state, city,
         engineer, item_code, item_name, serial, standard_complaint, complaint_reported, item_status,
         warranty_start, contract_type, call_status, solved_at, record_year, extra, loaded_at, loaded_by)
  select h.ucn, h.call_no, h.call_at, h.call_type, coalesce(h.register, public.call_register_of(h.call_type)),
         h.party_name, h.state, h.city, h.engineer, h.item_code, h.item_name, h.serial, h.standard_complaint,
         h.complaint_reported, h.item_status, h.warranty_start, h.contract_type, h.call_status, h.solved_at,
         public.call_history_year(h.record_year, h.call_at),
         h.extra || jsonb_build_object('moved_by', '0496'), h.loaded_at, h.loaded_by
    from public.call_history h
   where (coalesce(h.source, '') = 'DCCR register' or (coalesce(h.source, '') = '' and coalesce(h.extra->>'imported_from', '') = 'DCCR register (historical)'))
  on conflict (ucn, call_no) do nothing;
  get diagnostics v_dccr_rows = row_count;

  -- ...and where it held copies from other sources, the latest of them (by
  -- year, then load time) becomes the Call History row; the rest stay with it.
  with dccr as (
    select h.id, h.duplicates
      from public.call_history h
     where (coalesce(h.source, '') = 'DCCR register' or (coalesce(h.source, '') = '' and coalesce(h.extra->>'imported_from', '') = 'DCCR register (historical)'))
  ), others as (
    select d.id, e, row_number() over (partition by d.id
             order by public.call_history_year((e->>'record_year')::int, (e->>'call_at')::timestamptz) desc nulls last,
                      (e->>'loaded_at')::timestamptz desc nulls last) as rk
      from dccr d
     cross join lateral jsonb_array_elements(coalesce(d.duplicates, '[]'::jsonb)) e
     where not (coalesce(e->>'source', '') = 'DCCR register' or coalesce(e->'extra'->>'imported_from', '') = 'DCCR register (historical)')
  ), pick as (
    select o.id, jsonb_populate_record(null::public.call_history, o.e) as r,
           (select coalesce(jsonb_agg(o2.e), '[]'::jsonb) from others o2 where o2.id = o.id and o2.rk > 1) as rest
      from others o where o.rk = 1
  )
  update public.call_history h
     set source = coalesce((p.r).source, ''), record_year = (p.r).record_year, call_at = (p.r).call_at,
         call_type = coalesce((p.r).call_type, ''), register = public.call_register_of((p.r).call_type),
         party_name = coalesce((p.r).party_name, ''), state = coalesce((p.r).state, ''), city = coalesce((p.r).city, ''),
         engineer = coalesce((p.r).engineer, ''), item_code = coalesce((p.r).item_code, ''),
         item_name = coalesce((p.r).item_name, ''), serial = coalesce((p.r).serial, ''),
         standard_complaint = coalesce((p.r).standard_complaint, ''), complaint_reported = coalesce((p.r).complaint_reported, ''),
         item_status = coalesce((p.r).item_status, ''), warranty_start = (p.r).warranty_start,
         contract_type = coalesce((p.r).contract_type, ''), call_status = coalesce((p.r).call_status, ''),
         solved_at = (p.r).solved_at, extra = coalesce((p.r).extra, '{}'::jsonb),
         loaded_at = coalesce((p.r).loaded_at, h.loaded_at), loaded_by = null,
         duplicates = p.rest, duplicate = jsonb_array_length(p.rest) > 0
    from pick p
   where h.id = p.id;
  get diagnostics v_promoted = row_count;

  delete from public.call_history h
   where (coalesce(h.source, '') = 'DCCR register' or (coalesce(h.source, '') = '' and coalesce(h.extra->>'imported_from', '') = 'DCCR register (historical)'))
     and exists (select 1 from public.dccr_call_history d where d.ucn = h.ucn and d.call_no = h.call_no);
  get diagnostics v_deleted = row_count;

  alter table public.dccr_call_history enable trigger user;
  alter table public.call_history enable trigger user;

  if (v_dccr_rows + v_copies) > 0 and to_regclass('public.record_audit') is not null then
    insert into public.record_audit (table_name, op, record_key, actor, actor_email, old_data, new_data)
    values ('call_history', 'BULK MOVE', null, null, null, jsonb_build_object('source', 'DCCR register'),
            jsonb_build_object('rows', v_dccr_rows, 'copies', v_copies, 'promoted', v_promoted, 'removed', v_deleted,
              'note', '0496: DCCR-register records moved from Call History to DCCR History (dccr_call_history), whole; where a DCCR row held another source''s copy, the latest copy became the Call History row.'));
  end if;
  raise notice '0496: % DCCR row(s) and % DCCR copy(ies) moved to DCCR History; % Call History row(s) taken over by another source''s copy, % removed',
    v_dccr_rows, v_copies, v_promoted, v_deleted;
end $$;

drop trigger if exists dccr_call_history_stamp on public.dccr_call_history;
create trigger dccr_call_history_stamp before insert or update on public.dccr_call_history
  for each row execute function public.dccr_call_history_stamp();

-- THE FIVE SYSTEM COLUMNS (0244), as every table created after it attaches them
-- itself: on a fresh apply sys_columns.sql runs last and would, but on the live
-- project a table added later reads NO on _status.sql row 187 until it is re-run.
do $$
begin
  if to_regprocedure('public.sys_columns_attach(regclass)') is not null then
    perform public.sys_columns_attach('public.dccr_call_history'::regclass);
  end if;
end $$;

-- ---- 3. the DCCR upload files its call here --------------------------------
create or replace function public.dccr_history_apply()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_live    boolean;
  v_note    text[] := '{}';
  v_status  text;
begin
  new.ucn := btrim(new.ucn);
  -- A cell the file left empty can arrive as NULL; every text field reads it as blank.
  new.call_number := coalesce(new.call_number, '');
  new.party_name := coalesce(new.party_name, '');
  new.place := coalesce(new.place, '');
  new.product_name := coalesce(new.product_name, '');
  new.serial := coalesce(new.serial, '');
  new.call_type := coalesce(new.call_type, '');
  new.standard_complaint := coalesce(new.standard_complaint, '');
  new.complaint_reported := coalesce(new.complaint_reported, '');
  new.item_status := coalesce(new.item_status, '');
  new.engineer := coalesce(new.engineer, '');
  new.call_status := coalesce(new.call_status, '');
  new.pending_reason := coalesce(new.pending_reason, '');
  new.current_call_status := coalesce(new.current_call_status, '');
  new.warranty_number := coalesce(new.warranty_number, '');
  new.warranty_start_text := coalesce(new.warranty_start_text, '');
  new.public_health_threat := coalesce(new.public_health_threat, '');
  new.death := coalesce(new.death, '');
  new.serious_incident := coalesce(new.serious_incident, '');
  new.risk_to_patient := coalesce(new.risk_to_patient, '');
  new.warranty_failure := coalesce(new.warranty_failure, '');
  new.frequent_failure := coalesce(new.frequent_failure, '');
  new.service_observation := coalesce(new.service_observation, '');
  new.complaint_grouping := coalesce(new.complaint_grouping, '');
  new.root_cause_keyword := coalesce(new.root_cause_keyword, '');
  new.spare_category := coalesce(new.spare_category, '');
  new.imported_updated_by := coalesce(new.imported_updated_by, '');
  new.extra := coalesce(new.extra, '{}'::jsonb);

  if new.ucn = '' then raise exception 'UC Number is required.'; end if;
  new.loaded_at := now();
  new.loaded_by := auth.uid();

  -- 1. THE CALL -- into DCCR History (0496), never a live register, never Call History.
  v_live := exists (select 1 from public.field_calls where ucn = new.ucn)
         or exists (select 1 from public.installation_calls where ucn = new.ucn)
         or exists (select 1 from public.pm_calls where ucn = new.ucn);
  if v_live then
    v_note := array_append(v_note, ('call already in the register -- left as it is')::text);
  else
    v_status := coalesce(nullif(btrim(new.current_call_status), ''), btrim(new.call_status));
    insert into public.dccr_call_history (ucn, call_no, call_at, call_type, party_name, city, engineer,
           item_name, serial, standard_complaint, complaint_reported, item_status, call_status, solved_at, extra)
    values (new.ucn, new.call_number,
            (new.call_date::timestamp at time zone 'Asia/Kolkata'),
            btrim(new.call_type), new.party_name, new.place, new.engineer, new.product_name, new.serial,
            new.standard_complaint, new.complaint_reported, new.item_status, v_status, new.call_solved_at,
            new.extra || jsonb_strip_nulls(jsonb_build_object(
              'imported_from', 'DCCR register (historical)',
              'complaint_date', new.complaint_date,
              'call_status_at_review', nullif(btrim(new.call_status), ''),
              'pending_reason', nullif(btrim(new.pending_reason), ''),
              'warranty_number', nullif(btrim(new.warranty_number), ''),
              'warranty_start_in_file', nullif(btrim(new.warranty_start_text), ''),
              'public_health_threat', nullif(btrim(new.public_health_threat), ''),
              'death', nullif(btrim(new.death), ''),
              'serious_incident', nullif(btrim(new.serious_incident), ''))))
    on conflict (ucn, call_no) do update set
      call_at = excluded.call_at, call_type = excluded.call_type, register = null,
      party_name = excluded.party_name,
      city = excluded.city, engineer = excluded.engineer, item_name = excluded.item_name,
      serial = excluded.serial, standard_complaint = excluded.standard_complaint,
      complaint_reported = excluded.complaint_reported, item_status = excluded.item_status,
      call_status = excluded.call_status, solved_at = excluded.solved_at, record_year = null,
      extra = excluded.extra;
    v_note := array_append(v_note, ('kept in DCCR History' || coalesce(': ' || nullif(v_status, ''), ''))::text);
  end if;

  -- 2. THE REVIEW (imported: reviewers and dates as the file has them, no FFR).
  -- A live call keeps its own review if it has one: only a missing one is added.
  if v_live then
    insert into public.call_reviews (ucn, call_number, imported, imported_updated_by, imported_updated_date,
           risk_to_patient, warranty_failure, frequent_failure, review2_at,
           complaint_grouping, root_cause_keyword, spare_category, service_observation, review3_at)
    values (new.ucn, new.call_number, true, new.imported_updated_by, new.imported_updated_date,
            new.risk_to_patient, new.warranty_failure, new.frequent_failure, new.review2_at,
            new.complaint_grouping, new.root_cause_keyword, new.spare_category, new.service_observation, new.review3_at)
    on conflict (ucn) do nothing;
  else
    insert into public.call_reviews (ucn, call_number, imported, imported_updated_by, imported_updated_date,
           risk_to_patient, warranty_failure, frequent_failure, review2_at,
           complaint_grouping, root_cause_keyword, spare_category, service_observation, review3_at)
    values (new.ucn, new.call_number, true, new.imported_updated_by, new.imported_updated_date,
            new.risk_to_patient, new.warranty_failure, new.frequent_failure, new.review2_at,
            new.complaint_grouping, new.root_cause_keyword, new.spare_category, new.service_observation, new.review3_at)
    on conflict (ucn) do update set
      call_number = excluded.call_number, imported = true,
      imported_updated_by = excluded.imported_updated_by, imported_updated_date = excluded.imported_updated_date,
      risk_to_patient = excluded.risk_to_patient, warranty_failure = excluded.warranty_failure,
      frequent_failure = excluded.frequent_failure, review2_at = excluded.review2_at,
      complaint_grouping = excluded.complaint_grouping, root_cause_keyword = excluded.root_cause_keyword,
      spare_category = excluded.spare_category, service_observation = excluded.service_observation,
      review3_at = excluded.review3_at;
  end if;
  v_note := array_append(v_note, ('review filed')::text);

  -- 3. NO VISIT (0430): the status is the file's, kept on the DCCR History row.
  new.result := array_to_string(v_note, '; ');
  return new;
end $$;
revoke execute on function public.dccr_history_apply() from public, anon, authenticated;

comment on table public.dccr_history_import is
  'The old DCCR register as loaded (0395), one row per UC Number. Since 0496 a row keeps its call in DCCR History (dccr_call_history) with the file''s status, and its review; no visit, nothing in a live register or in Call History. `result` says what was kept. A UC Number that is a live call is never overwritten.';

-- The import rows say where their call now is (trigger held off: it would
-- re-file every row).
do $$
begin
  if to_regclass('public.dccr_history_import') is null then return; end if;
  alter table public.dccr_history_import disable trigger dccr_history_apply;
  update public.dccr_history_import set result = replace(result, 'Call History', 'DCCR History')
   where result like '%Call History%';
  alter table public.dccr_history_import enable trigger dccr_history_apply;
end $$;

-- ---- 4. the Recent Failure Rate -- in 0497 (module objective) ------------
-- _dccr_failure_calls() is owned by the objective module, which runs after
-- this one, so its new definition lives there: filed here, a fresh apply would
-- put 0431's back over it.

-- ---- 5. the DCCR History screen: its summary and its key -------------------
create or replace view public.dccr_call_history_summary as
select h.record_year,
       'DCCR register'::text                                     as source,
       coalesce(h.register, '(not recorded)')                    as register,
       count(*)::int                                             as calls,
       0::int                                                    as duplicates,
       count(*) filter (where btrim(coalesce(h.serial, '')) = '')::int as without_serial,
       min(h.call_at)                                            as first_call_at,
       max(h.call_at)                                            as last_call_at,
       max(h.loaded_at)                                          as last_loaded_at,
       (array_agg(h.loaded_by order by h.loaded_at desc nulls last))[1] as last_loaded_by
  from public.dccr_call_history h
 group by 1, 2, 3;

alter view public.dccr_call_history_summary set (security_invoker = on);
grant select on public.dccr_call_history_summary to authenticated;
revoke all on public.dccr_call_history_summary from anon;

comment on view public.dccr_call_history_summary is
  'DCCR History by year x call type (0496), in the shape of call_history_summary so one screen reads both. security_invoker: counts only what the reader may read.';

do $$
declare n integer;
begin
  if to_regclass('public.app_roles') is null then return; end if;
  update public.app_roles ar
     set permissions = (
           select coalesce(jsonb_agg(distinct v), '[]'::jsonb)
             from (select jsonb_array_elements_text(ar.permissions) as v
                   union select 'mod:/dccr-history') u),
         updated_at = now()
   where jsonb_array_length(ar.permissions) > 0
     and ar.role in ('admin', 'technical_support')
     and not (ar.permissions ? 'mod:/dccr-history');
  get diagnostics n = row_count;
  raise notice '0496: % of 2 role(s) given mod:/dccr-history (admin + technical_support -- grant the rest on Roles & Permissions)', n;
end $$;
