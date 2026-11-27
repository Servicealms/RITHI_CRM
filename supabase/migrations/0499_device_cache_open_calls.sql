-- ===========================================================================
-- 0499 -- DEVICE CACHE STATUS: THE OPEN CALLS TOO (the user, 2026-11-27:
-- "Add it to the device cache report").
--
-- Since v0.10.283 each device keeps the open calls the signed-in person may
-- see (machinestore.ts, `open-calls`). It is reported the way 0380 reports the
-- Part Master: how many open calls, and when they were downloaded. Nothing
-- else about them is sent.
--
-- The report function is DROPPED AND REBUILT because its return columns grow;
-- the two new columns are LAST. 0380's body otherwise word for word -- the
-- permission check, the definer rights and the revoke. A device on an older
-- build sends no open calls -- the columns default.
-- ===========================================================================

alter table public.device_cache_status
  add column if not exists open_calls    integer not null default 0,
  add column if not exists open_calls_at timestamptz;

drop function if exists public.device_cache_report();
create function public.device_cache_report()
returns table (
  user_id uuid, full_name text, email text, role text, active boolean,
  device_id text, device_label text, user_agent text, app_version text, storage_ok boolean,
  machines integer, machines_at timestamptz, machines_error text,
  customers integer, customers_at timestamptz, customers_error text,
  first_reported_at timestamptz, reported_at timestamptz,
  complaints integer, complaints_at timestamptz,
  parts integer, parts_at timestamptz,
  open_calls integer, open_calls_at timestamptz
)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.has_perm('mod:/device-cache') then
    raise exception 'RBAC: the Device Cache Status report needs the mod:/device-cache permission.'
      using errcode = '42501';
  end if;
  return query
    select coalesce(p.id, d.user_id), coalesce(p.full_name, ''), coalesce(p.email, ''),
           coalesce(p.role, ''), coalesce(p.active, true),
           d.device_id, d.device_label, d.user_agent, d.app_version, d.storage_ok,
           d.machines, d.machines_at, d.machines_error,
           d.customers, d.customers_at, d.customers_error,
           d.created_at, d.updated_at,
           d.complaints, d.complaints_at,
           d.parts, d.parts_at,
           d.open_calls, d.open_calls_at
      from public.profiles p
      full join public.device_cache_status d on d.user_id = p.id
     order by coalesce(p.full_name, ''), d.updated_at desc nulls last;
end $$;

revoke execute on function public.device_cache_report() from public, anon;
grant execute on function public.device_cache_report() to authenticated;
