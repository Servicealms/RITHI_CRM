-- ===========================================================================
-- THE STORED ITEM STATUS IS BROUGHT UP TO TODAY, EVERY NIGHT.
--
-- The user, 2026-11-19: "Contract Expired Yesterday, but still the Status
-- shows as CMC in Product Database. Why?" ... "A database job each morning
-- that rewrites the saved status for every machine - Ideally this should
-- happen."
--
-- WHY IT WAS WRONG. products.item_status is written by sync_product_machine
-- (0330) only when a machine's sale, contract, transfer or installation is
-- written -- so it is right on that day and wrong once an end date passes.
-- The Product Database screen and the call form's prefill read the device copy
-- of `products`, which carries that stored value, so a contract that ran out
-- yesterday still read CMC, and a call registered on it was CMC too.
-- (v0.10.269 also works the status out on the device when it is read; this
-- keeps the STORED value right for everything else that reads it.)
--
-- THE RULE IS THE VIEW'S, NOT A THIRD ONE. public.product_database (0239)
-- already works the status out for today -- warranty first, then the contract
-- that names this owner, else OGP. This copies that answer onto the row, ONLY
-- where it differs, so a night with nothing expiring writes nothing.
--
-- 00:05 India time (18:35 UTC): the first minutes of the day the cover ended.
--
-- NOT CALLABLE FROM THE APP: the schedule is the only caller, so EXECUTE is
-- revoked from the API roles (lockdown rule). Run by hand in the SQL editor:
--   select public.refresh_product_item_status();
-- ===========================================================================

create or replace function public.refresh_product_item_status()
returns integer language plpgsql security definer set search_path = public as $$
declare n integer;
begin
  update public.products p
     set item_status = v.item_status
    from public.product_database v
   where v.id = p.id
     and v.item_status is not null
     and p.item_status is distinct from v.item_status;
  get diagnostics n = row_count;
  return n;
end $$;

revoke execute on function public.refresh_product_item_status() from public, anon, authenticated;

comment on function public.refresh_product_item_status() is
  'Nightly (00:05 IST): copies public.product_database''s worked-out Item Status onto public.products where they differ; returns how many machines changed.';

-- Same guarded shape as 0124: enable pg_cron if we can, never fail over it.
do $$
begin
  create extension if not exists pg_cron;
exception when others then
  raise notice 'Could not enable pg_cron automatically (%). Enable it in Dashboard -> Database -> Extensions, then re-run this file.', sqlerrm;
end $$;

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    if exists (select 1 from cron.job where jobname = 'refresh-product-item-status') then
      perform cron.unschedule('refresh-product-item-status');
    end if;
    perform cron.schedule('refresh-product-item-status', '35 18 * * *', 'select public.refresh_product_item_status();');
    raise notice 'Scheduled refresh-product-item-status at 18:35 UTC = 00:05 Asia/Kolkata.';
  else
    raise notice 'pg_cron is not enabled, so the stored Item Status is not refreshed nightly. Enable pg_cron and re-run this file.';
  end if;
end $$;

-- NOT RUN HERE. The first run may rewrite thousands of machines, each through
-- the products triggers, and the migration workflow runs every file in one
-- transaction with a short lock timeout against the live app -- a long first
-- run belongs to the schedule (or the SQL editor), not to the deploy.
