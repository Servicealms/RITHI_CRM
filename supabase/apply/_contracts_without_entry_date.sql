-- ===========================================================================
-- HOW MANY CONTRACT ENTRIES HAVE NO CONTRACT ENTRY DATE? -- read-only, counts
-- only (no MC numbers, no parties), so it can run through the public probe
-- workflow. Asked while filling MC7648's (the user, 2026-11-17).
--
-- The app stamps entry_at on a new contract only since 05-Oct-2026 ~16:12
-- India time (f26ec57c), and contract_entries.entry_at has no database
-- default -- so an entry saved before that, or written by an import that
-- carried no date, is blank. Each count below says which evidence the entry
-- still has to be dated from.
-- ===========================================================================
with e as (
  select entry_at, created_at, sys_created_on,
         exists (select 1 from public.contract_items i where i.mc_number = c.mc_number and i.entry_at is not null) as line_dated
    from public.contract_entries c
)
select * from (
  select 1 as n, 'contract entries in all' as what, count(*)::text as value from e
  union all select 2, 'with NO Contract Entry Date', count(*)::text from e where entry_at is null
  union all select 3, '  of which have created_at (when RITHI first wrote the row)', count(*)::text from e where entry_at is null and created_at is not null
  union all select 4, '  of which have only sys_created_on', count(*)::text from e where entry_at is null and created_at is null and sys_created_on is not null
  union all select 5, '  of which a machine line carries its own entry date', count(*)::text from e where entry_at is null and line_dated
  union all select 6, '  of which nothing dates them', count(*)::text from e where entry_at is null and created_at is null and sys_created_on is null and not line_dated
  union all select 7, '  created_at range of the blank ones (India time)',
         coalesce(to_char(min(created_at) at time zone 'Asia/Kolkata', 'DD-Mon-YYYY') || ' to ' ||
                  to_char(max(created_at) at time zone 'Asia/Kolkata', 'DD-Mon-YYYY'), '-')
         from e where entry_at is null
) r order by n;
