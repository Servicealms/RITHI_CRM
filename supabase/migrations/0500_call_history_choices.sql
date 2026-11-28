-- ===========================================================================
-- 0500 -- THE CALL HISTORY SEARCH'S DROPDOWNS (the user, 2026-11-28: "In Call
-- History Add Tabs Per year ... For Server Search Filters - Go with these
-- [UCN, Product, Serial, Party, Engineer, Call Status, Global] - Same as Field
-- Call").
--
-- On the Field Call register the Product and Engineer dropdowns offer today's
-- Product list and User Master. Call History is the OLD files, as written --
-- an engineer who has left, a product name as that year's sheet spelt it, a
-- status like "Solved - Report Completed" -- so a dropdown fed by today's lists
-- would offer names that match nothing and miss names that are there. This
-- view offers what Call History HOLDS: each distinct product, engineer and
-- call status, with how many calls carry it. The value is the column AS
-- STORED (not trimmed), so picking it matches those calls.
--
-- security_invoker: a reader is offered only values from calls they may read.
-- ===========================================================================

create or replace view public.call_history_choices as
select 'product'::text as kind, h.item_name as value, count(*)::int as calls
  from public.call_history h where btrim(h.item_name) <> '' group by h.item_name
union all
select 'engineer', h.engineer, count(*)::int
  from public.call_history h where btrim(h.engineer) <> '' group by h.engineer
union all
select 'status', h.call_status, count(*)::int
  from public.call_history h where btrim(h.call_status) <> '' group by h.call_status;

alter view public.call_history_choices set (security_invoker = on);
grant select on public.call_history_choices to authenticated;
revoke all on public.call_history_choices from anon;

comment on view public.call_history_choices is
  'The distinct products, engineers and call statuses Call History holds, with their counts (0500), for the Call History search dropdowns. security_invoker: only values from calls the reader may read.';
