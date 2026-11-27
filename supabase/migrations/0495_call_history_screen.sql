-- ===========================================================================
-- 0495 -- THE CALL HISTORY SCREEN: A SUMMARY OF WHAT WAS LOADED, AND THE PAGE
-- KEY (the user, 2026-11-27: "Can U add a UI for me (Admin) to see these
-- Uploads and Provision the Upload also there itself?"; asked, chose: a
-- summary by year and a browsable list, next to Machine History, administrators
-- to begin with).
--
-- Until now a history call could be seen only machine by machine (Machine
-- History), so "did my 2023 PM file go in, and how many?" had no answer short
-- of the SQL editor. call_history_summary answers it: one row per YEAR x
-- SOURCE x CALL TYPE (register) with how many calls, how many are flagged
-- Duplicate, how many carry NO SERIAL (stored, but Machine History -- which
-- finds a history call by its serial -- cannot list them), the first and last
-- call date, and when the group was last loaded and by whom.
--
-- COUNTED BY THE DATABASE, not by the screen: the history runs to six figures,
-- and a screen adding up the rows it happened to load would print a total that
-- looks exact and is not. security_invoker, so it counts exactly the calls the
-- reader may read through ch_read (0429) -- never more.
--
-- THE KEY `mod:/call-history` goes to admin and technical_support (the role
-- that carries every page key the admin role holds, 0145; _status.sql row
-- 114), MERGED, and a role with an empty set is left alone. Others are ticked
-- on Roles & Permissions. The upload on the page still needs bulk.upload, as it
-- does in Bulk Uploads (ch_insert / ch_update, 0429): the page key opens the
-- page, it writes nothing.
-- ===========================================================================

create or replace view public.call_history_summary as
select h.record_year,
       coalesce(nullif(btrim(h.source), ''), '(not recorded)')   as source,
       coalesce(h.register, '(not recorded)')                    as register,
       count(*)::int                                             as calls,
       count(*) filter (where h.duplicate)::int                  as duplicates,
       count(*) filter (where btrim(coalesce(h.serial, '')) = '')::int as without_serial,
       min(h.call_at)                                            as first_call_at,
       max(h.call_at)                                            as last_call_at,
       max(h.loaded_at)                                          as last_loaded_at,
       (array_agg(h.loaded_by order by h.loaded_at desc nulls last))[1] as last_loaded_by
  from public.call_history h
 group by 1, 2, 3;

alter view public.call_history_summary set (security_invoker = on);
grant select on public.call_history_summary to authenticated;
revoke all on public.call_history_summary from anon;

comment on view public.call_history_summary is
  'Call History by year x source x call type (0495): calls, duplicates flagged, calls with no serial (not listed on Machine History), first and last call date, last load and who. security_invoker: counts only what the reader may read.';

-- ---- the key: administrators to begin with ---------------------------------
do $$
declare n integer;
begin
  if to_regclass('public.app_roles') is null then return; end if;
  update public.app_roles ar
     set permissions = (
           select coalesce(jsonb_agg(distinct v), '[]'::jsonb)
             from (select jsonb_array_elements_text(ar.permissions) as v
                   union select 'mod:/call-history') u),
         updated_at = now()
   where jsonb_array_length(ar.permissions) > 0
     and ar.role in ('admin', 'technical_support')
     and not (ar.permissions ? 'mod:/call-history');
  get diagnostics n = row_count;
  raise notice '0495: % of 2 role(s) given mod:/call-history (admin + technical_support -- grant the rest on Roles & Permissions)', n;
end $$;
