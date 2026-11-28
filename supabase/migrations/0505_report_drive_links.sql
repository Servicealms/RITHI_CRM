-- ===========================================================================
-- 0505  DRIVE REPORT LINKS, MAPPED TO LIVE VISITS BY THEIR UID
--
-- The user, 2026-11-28: "I want to be able to Map Drive Links to the Live
-- calls as well. I has built 'Bulk Report Mapping', But i dont think that will
-- work... I want to upload Drive Report Links." Asked, chose:
--   * BY THE VISIT'S UID ("Per the UID we need to map in the visit Report");
--   * a visit that ALREADY HAS A REPORT LINK IS KEPT -- the row is skipped and
--     counted, nothing is replaced;
--   * a UID that matches NO VISIT is held back and named -- no visit is ever
--     created, so no call's status moves.
--
-- WHAT IT WRITES: `reports.manual_report` only -- the column the call screen's
-- "📄 Service Report" reads (serviceReportForCall). "Already has a link" is the
-- same test that screen uses: an http(s) address in manual_report, or in the
-- visit's data 'Manual Report'. A manual_report holding something that is NOT a
-- link (an AppSheet path, say) is not a report anybody can open, so it is
-- filled -- and the old value is kept in `source_ref` when that is empty, the
-- Bulk Report Mapping way (0071), so nothing that said which file it was is lost.
--
-- WHAT IT DOES NOT TOUCH: the call status, the visit date, updated_at (which
-- decides a call's latest visit). reports_touch_call re-derives the call from
-- the visit's own status, which this leaves alone, so no call changes state.
--
-- WHO: a holder of bulk.upload ("Load registers in bulk") -- the key that opens
-- Bulk Uploads, where this lives. SECURITY DEFINER because the visit policies
-- are per register and per engineer; the permission is asked here instead, and
-- the public key cannot run it.
-- ===========================================================================

create or replace function public.map_report_drive_links(p_rows jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  e jsonb;
  v_uid text; v_link text;
  v record;
  n_rows int := 0; n_mapped int := 0;
  already text[] := '{}'; not_found text[] := '{}'; bad_link text[] := '{}';
  n_blank int := 0;
begin
  if not public.has_perm('bulk.upload') then
    raise exception 'Mapping Drive report links needs "Load registers in bulk" on Roles & Permissions'
      using errcode = '42501';
  end if;
  if jsonb_typeof(p_rows) is distinct from 'array' then
    raise exception 'map_report_drive_links expects an array of {uid, link}' using errcode = '22023';
  end if;

  for e in select * from jsonb_array_elements(p_rows) loop
    n_rows := n_rows + 1;
    v_uid  := btrim(coalesce(e->>'uid', ''));
    v_link := btrim(coalesce(e->>'link', ''));
    if v_uid = '' then n_blank := n_blank + 1; continue; end if;
    if v_link !~* '^https?://[^[:space:]]+$' then bad_link := bad_link || v_uid; continue; end if;

    select r.id, r.manual_report, r.data, r.source_ref into v
      from public.reports r where r.uid = v_uid;
    if not found then not_found := not_found || v_uid; continue; end if;

    if coalesce(v.manual_report, '') ~* '^https?://'
       or coalesce(v.data->>'Manual Report', '') ~* '^https?://' then
      already := already || v_uid; continue;
    end if;

    update public.reports
       set manual_report = v_link,
           source_ref = case when coalesce(source_ref, '') = '' and btrim(coalesce(v.manual_report, '')) <> ''
                             then btrim(v.manual_report) else source_ref end
     where id = v.id;
    n_mapped := n_mapped + 1;
  end loop;

  return jsonb_build_object(
    'rows', n_rows, 'mapped', n_mapped, 'blank_uid', n_blank,
    'already', cardinality(already), 'not_found', cardinality(not_found), 'bad_link', cardinality(bad_link),
    -- The UIDs themselves, for the screen to name (at most 500 of each).
    'already_uids', to_jsonb(already[1:500]),
    'not_found_uids', to_jsonb(not_found[1:500]),
    'bad_link_uids', to_jsonb(bad_link[1:500]));
end $$;

revoke execute on function public.map_report_drive_links(jsonb) from public, anon;
grant execute on function public.map_report_drive_links(jsonb) to authenticated;
