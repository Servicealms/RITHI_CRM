-- ===========================================================================
-- FILL A MISSING CONTRACT ENTRY DATE FROM THE RECORD ITSELF (the user,
-- 2026-11-17: "MC7648 - doesnt have a Contract Entry Date, check the Logs and
-- add the date").
--
-- The date written is the moment RITHI first wrote the entry (`created_at`,
-- else `sys_created_on`) -- the same moment the app would have stamped had the
-- entry been saved after 05-Oct-2026 ~16:12 India time, when stamping began.
-- For MC7648 that is 05-Oct-2026 15:17:14 India time (probe
-- _contract_entry_date_evidence.sql; record_audit and audit_log hold nothing
-- for it).
--
-- ONLY A BLANK DATE IS FILLED: an entry that already has one is left exactly
-- as it is, so this is safe to run twice.
--
-- HOW TO RUN IT (Supabase SQL editor):
--   1. Run it AS IT IS: `apply` is false, nothing changes, and the grid shows
--      the date each listed contract would get.
--   2. Change false to true on the apply line and run it again.
-- ===========================================================================
with ask as (
  select false as apply,                 -- <<<< SET TO true TO WRITE THE DATE
         array['MC7648']::text[] as mcs
),
found as (
  select e.mc_number, e.entry_at, coalesce(e.created_at, e.sys_created_on) as evidence
    from public.contract_entries e, ask a
   where e.mc_number = any (a.mcs)
),
done as (
  update public.contract_entries e set entry_at = f.evidence
    from found f, ask a
   where a.apply and e.mc_number = f.mc_number and e.entry_at is null and f.evidence is not null
  returning e.mc_number, e.entry_at
)
select * from (
  select 0 as n, 'mode' as mc_number,
         case when (select apply from ask) then 'APPLIED' else 'DRY RUN -- nothing changed; set apply = true to write' end as result
  union all
  select 1, u, 'not in the Contract Register -- check the MC Number'
    from unnest((select mcs from ask)) u where u not in (select mc_number from found)
  union all
  select 2, f.mc_number,
         case when f.entry_at is not null then 'already has a Contract Entry Date: ' || to_char(f.entry_at at time zone 'Asia/Kolkata', 'DD-Mon-YYYY HH24:MI:SS') || ' -- left as it is'
              when f.evidence is null then 'nothing in the record dates it -- left blank'
              when (select apply from ask) then 'Contract Entry Date set to ' || to_char(f.evidence at time zone 'Asia/Kolkata', 'DD-Mon-YYYY HH24:MI:SS')
              else 'would be set to ' || to_char(f.evidence at time zone 'Asia/Kolkata', 'DD-Mon-YYYY HH24:MI:SS') end
    from found f
  union all
  select 3, 'written', (select count(*) from done)::text
) r order by n, mc_number;
