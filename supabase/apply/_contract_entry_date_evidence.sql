-- ===========================================================================
-- WHEN WAS THIS CONTRACT ENTERED? -- every timestamp the database holds for one
-- MC Number, so a missing Contract Entry Date can be filled from the record
-- rather than guessed (the user, 2026-11-17: "MC7648 - doesnt have a Contract
-- Entry Date, check the Logs and add the date").
--
-- READ-ONLY. One grid, numbered rows, oldest evidence first. Prints times
-- only -- no party, no person -- so it can run through the public probe
-- workflow. Dates are India time.
--
-- Change the MC Number on the `ask` line to look at another contract.
-- ===========================================================================
with ask as (select 'MC7648'::text as mc),
ev as (
  select 'entry: entry_at (Contract Entry Date)' as source, e.entry_at as at from public.contract_entries e, ask a where e.mc_number = a.mc
  union all select 'entry: created_at', e.created_at from public.contract_entries e, ask a where e.mc_number = a.mc
  union all select 'entry: sys_created_on (row first written)', e.sys_created_on from public.contract_entries e, ask a where e.mc_number = a.mc
  union all select 'entry: updated_at', e.updated_at from public.contract_entries e, ask a where e.mc_number = a.mc
  union all select 'entry: contract_start (a DATE)', e.contract_start::timestamptz from public.contract_entries e, ask a where e.mc_number = a.mc
  union all select 'line ' || i.id || ': entry_at', i.entry_at from public.contract_items i, ask a where i.mc_number = a.mc
  union all select 'line ' || i.id || ': created_at', i.created_at from public.contract_items i, ask a where i.mc_number = a.mc
  union all select 'line ' || i.id || ': sys_created_on', i.sys_created_on from public.contract_items i, ask a where i.mc_number = a.mc
  union all
  select 'record_audit: ' || r.table_name || ' ' || r.op, r.changed_at
    from public.record_audit r, ask a
   where r.table_name in ('contract_entries', 'contract_items')
     and (r.new_data->>'mc_number' = a.mc or r.old_data->>'mc_number' = a.mc)
  union all
  select 'audit_log: ' || l.action || coalesce(' (' || l.status || ')', ''), l.at
    from public.audit_log l, ask a
   where l.target ilike '%' || a.mc || '%' or l.meta::text ilike '%' || a.mc || '%'
)
select row_number() over (order by at nulls first, source) as n,
       source,
       case when at is null then '(blank)'
            else to_char(at at time zone 'Asia/Kolkata', 'DD-Mon-YYYY HH24:MI:SS') end as ist
  from ev
union all
select 999, 'EARLIEST of the above (excluding contract_start)',
       coalesce(to_char(min(at) filter (where source <> 'entry: contract_start (a DATE)') at time zone 'Asia/Kolkata', 'DD-Mon-YYYY HH24:MI:SS'), '(none)')
  from ev
order by 1;
