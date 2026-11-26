-- ===========================================================================
-- "No closed in FFR" READS "CAPA Not Required" (the user, 2026-11-26: "CAPA
-- (if reqd) Responsibility - Reword this - "No Closed in FFR" -> "CAPA Not
-- Required"").
--
-- The words are a VALUE stored on each report, not only a label on the
-- picker, so a reword that changed the picker alone would leave every old
-- report reading the old words and offer them back first ("a value already on
-- the report"). So:
--   1. a trigger rewrites the old words to the new ones on every write --
--      the form, the Field Failure Register upload and the FFR update sheet
--      import alike -- so the old words cannot come back from a file;
--   2. the reports already carrying them are reworded once. Each change is in
--      the report's own history (zz_ffr_history) like any edit. Its "last
--      updated" is LEFT AS IT WAS: zz_ffr_stamp would set it to now, which
--      would make every reworded report look recently edited, so it is lifted
--      for this one statement and put straight back (_status.sql row 400
--      checks it is on).
-- The import staging rows (ffr_sheet_updates) are left as the sheet had them:
-- they are the record of what was imported.
-- ===========================================================================

create or replace function public.ffr_capa_wording()
returns trigger language plpgsql as $$
begin
  if lower(regexp_replace(btrim(coalesce(new.capa_responsibility, '')), '[^a-z]', '', 'gi')) = 'noclosedinffr' then
    new.capa_responsibility := 'CAPA Not Required';
  end if;
  return new;
end $$;
revoke execute on function public.ffr_capa_wording() from public, anon, authenticated;

drop trigger if exists zz_ffr_capa_wording on public.field_failure_reports;
create trigger zz_ffr_capa_wording before insert or update of capa_responsibility on public.field_failure_reports
  for each row execute function public.ffr_capa_wording();

-- the reports already reading the old words
alter table public.field_failure_reports disable trigger zz_ffr_stamp;
update public.field_failure_reports
   set capa_responsibility = capa_responsibility   -- the trigger above rewrites it
 where lower(regexp_replace(btrim(coalesce(capa_responsibility, '')), '[^a-z]', '', 'gi')) = 'noclosedinffr';
alter table public.field_failure_reports enable trigger zz_ffr_stamp;
