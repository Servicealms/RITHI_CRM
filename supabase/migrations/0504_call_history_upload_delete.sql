-- ===========================================================================
-- 0504  CALL HISTORY: EACH UPLOAD KNOWN, AND DELETABLE AS A WHOLE
--
-- The user, 2026-11-28: "Till i Finalize the Uploads, i might need to clean it
-- up quite often, Give me a Button to Clear it, Add it to Actions list in
-- Roles & Permission so that i can remove at my Will - the Whole Upload - So
-- keep it at Upload Level". Replaces asking for a one-time migration per
-- clean-up (0502, 0503).
--
-- THE UPLOAD IS A BATCH NUMBER, the hand stock counts' way (0483): the upload
-- stamps ONE upload_batch on every row it writes (and the file's name in
-- upload_file), so "this upload" is a question the table can answer.
--   * A row loaded before this has upload_batch '' -- listed as one group,
--     "before uploads were numbered", and deletable as one.
--   * A RE-UPLOAD TAKES THE ROW OVER: the key is UC No. + Call No. + year, so
--     loading a file again updates the rows it names and stamps them with the
--     NEW batch. Deleting the OLD upload afterwards removes only what the new
--     one did not load again -- and deleting the NEW one removes those rows
--     entirely; the earlier version is not brought back. Said on the screen.
--
-- DELETING IS ITS OWN PERMISSION, call_history.delete ("Delete a Call History
-- upload"), on the Call History row of Roles & Permissions -- an administrator
-- holds it (has_perm passes an administrator), anybody else only when ticked.
-- A DELETE policy that asks exactly that, wrapped so it is asked once per
-- statement, not once per row. Nothing else reads call_history to make
-- anything (0429), so nothing downstream changes.
-- ===========================================================================

alter table public.call_history add column if not exists upload_batch text not null default '';
alter table public.call_history add column if not exists upload_file  text not null default '';
create index if not exists call_history_upload_batch on public.call_history (upload_batch);

drop policy if exists ch_delete on public.call_history;
create policy ch_delete on public.call_history for delete
  using ((select public.has_perm('call_history.delete')));
grant delete on public.call_history to authenticated;

-- THE UPLOADS, ONE ROW EACH, newest first: what the Uploads tab lists and
-- deletes by. Read as its reader (the call policies bound it).
create or replace view public.call_history_uploads as
select h.upload_batch,
       max(h.upload_file)                                         as upload_file,
       count(*)::int                                              as calls,
       min(h.loaded_at)                                           as first_loaded_at,
       max(h.loaded_at)                                           as last_loaded_at,
       (array_agg(h.loaded_by order by h.loaded_at desc nulls last))[1] as loaded_by,
       array_to_string(array_agg(distinct coalesce(h.record_year::text, 'Undated') order by coalesce(h.record_year::text, 'Undated')), ', ') as years,
       array_to_string(array_agg(distinct nullif(h.source, '') order by nullif(h.source, '')), ', ')        as sources,
       array_to_string(array_agg(distinct nullif(h.register, '') order by nullif(h.register, '')), ', ')    as registers
  from public.call_history h
 group by h.upload_batch;
alter view public.call_history_uploads set (security_invoker = on);
grant select on public.call_history_uploads to authenticated;
revoke all on public.call_history_uploads from anon;
