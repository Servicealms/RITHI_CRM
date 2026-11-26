-- ===========================================================================
-- THE "NO CAPA" CHOICE OF CAPA (IF REQD) RESPONSIBILITY IS A SETTING, AND IT
-- READS "No" (the user, 2026-11-26: "Reword "CAPA Not Required" to "No", add a
-- Provision in Admin Config to Change this and Apply it to all Records").
--
-- app_settings 'ffr.capa_none_label' holds the words (default "No"); the words
-- it replaced are kept in 'ffr.capa_none_label_previous', one per line, so a
-- file or sheet still carrying ANY of them is saved with today's words.
--
-- set_ffr_capa_none_label(words) -- Admin Config, for a holder of
-- config.manage (or an administrator): stores the new words and rewrites every
-- report reading the old ones (or any earlier wording) in one go, returning
-- how many. Each change lands in the report's own history (zz_ffr_history);
-- its last-updated is left as it was (zz_ffr_stamp lifted for that statement
-- and put straight back, as 0493 did; _status.sql row 400 checks it is on).
--
-- zz_ffr_capa_wording (0493) now rewrites every earlier wording -- "No closed
-- in FFR", "CAPA Not Required" and whatever the setting has been -- to the
-- setting's words, on every write.
-- ===========================================================================

insert into public.app_settings (key, value) values ('ffr.capa_none_label', 'CAPA Not Required')
on conflict (key) do nothing;
insert into public.app_settings (key, value) values ('ffr.capa_none_label_previous', 'No closed in FFR')
on conflict (key) do nothing;

-- the words, squashed the way they are compared (letters only, any case)
create or replace function public.ffr_capa_squash(p text)
returns text language sql immutable as $$
  select lower(regexp_replace(btrim(coalesce(p, '')), '[^a-z]', '', 'gi'))
$$;

create or replace function public.ffr_capa_none_label()
returns text language sql stable security definer set search_path = public as $$
  select coalesce(nullif(btrim((select value from public.app_settings where key = 'ffr.capa_none_label')), ''), 'No')
$$;
grant execute on function public.ffr_capa_none_label() to authenticated;
revoke execute on function public.ffr_capa_none_label() from public, anon;

-- every wording that means the current one: the legacy words and the history
create or replace function public.ffr_capa_none_earlier()
returns text[] language sql stable security definer set search_path = public as $$
  select array(
    select distinct public.ffr_capa_squash(w)
      from unnest(array['No closed in FFR', 'CAPA Not Required']
                  || string_to_array(coalesce((select value from public.app_settings where key = 'ffr.capa_none_label_previous'), ''), E'\n')) w
     where public.ffr_capa_squash(w) <> ''
       and public.ffr_capa_squash(w) <> public.ffr_capa_squash(public.ffr_capa_none_label()))
$$;
revoke execute on function public.ffr_capa_none_earlier() from public, anon, authenticated;

create or replace function public.ffr_capa_wording()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if public.ffr_capa_squash(new.capa_responsibility) = any (public.ffr_capa_none_earlier()) then
    new.capa_responsibility := public.ffr_capa_none_label();
  end if;
  return new;
end $$;
revoke execute on function public.ffr_capa_wording() from public, anon, authenticated;

drop trigger if exists zz_ffr_capa_wording on public.field_failure_reports;
create trigger zz_ffr_capa_wording before insert or update of capa_responsibility on public.field_failure_reports
  for each row execute function public.ffr_capa_wording();

create or replace function public.set_ffr_capa_none_label(p_label text)
returns integer language plpgsql security definer set search_path = public as $$
declare
  v_new  text := btrim(coalesce(p_label, ''));
  v_old  text := public.ffr_capa_none_label();
  v_prev text;
  n integer;
begin
  -- Called from a migration there is no signed-in user, and the migration is
  -- the authority; from Admin Config it must be somebody who may change it.
  if auth.uid() is not null and not (public.is_admin() or public.has_perm('config.manage')) then
    raise exception 'RBAC: your role cannot change Admin Config';
  end if;
  if v_new = '' then
    raise exception 'Give the words for "no CAPA" -- they cannot be blank';
  end if;
  if public.ffr_capa_squash(v_new) <> public.ffr_capa_squash(v_old) then
    select value into v_prev from public.app_settings where key = 'ffr.capa_none_label_previous';
    update public.app_settings set value = btrim(coalesce(v_prev, '') || E'\n' || v_old, E'\n'), updated_at = now()
     where key = 'ffr.capa_none_label_previous';
  end if;
  insert into public.app_settings (key, value) values ('ffr.capa_none_label', v_new)
  on conflict (key) do update set value = excluded.value, updated_at = now();

  -- Every report reading an earlier wording, or today's in another case.
  alter table public.field_failure_reports disable trigger zz_ffr_stamp;
  update public.field_failure_reports f
     set capa_responsibility = v_new
   where (public.ffr_capa_squash(f.capa_responsibility) = any (public.ffr_capa_none_earlier())
          or public.ffr_capa_squash(f.capa_responsibility) = public.ffr_capa_squash(v_new))
     and f.capa_responsibility is distinct from v_new;
  get diagnostics n = row_count;
  alter table public.field_failure_reports enable trigger zz_ffr_stamp;
  return n;
end $$;
revoke execute on function public.set_ffr_capa_none_label(text) from public, anon;
grant execute on function public.set_ffr_capa_none_label(text) to authenticated;

-- "CAPA Not Required" (0493) -> "No", on every report.
select public.set_ffr_capa_none_label('No');
