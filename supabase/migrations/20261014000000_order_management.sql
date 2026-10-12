-- ============================================================
-- MAISH FASHION BOUTIQUE — ORDER MANAGEMENT (admin workflow)
-- Run AFTER 20261003000000_security_hardening.sql
-- Paste into Supabase Dashboard > SQL Editor, or: npm run db:push
--
-- Scope: add the two fields the Orders Management section needs and
-- nothing else. Existing tables, rows, statuses, checkout, payment and
-- RLS behaviour are untouched. Every statement is IDEMPOTENT.
--
-- 1. NEW COLUMNS (nullable -> fully backward compatible)
--    pickup_date    date   estimated pickup date entered by staff
--    status_message text   customer-facing update message
--    Nothing existing can serve these: shipping_instructions is the
--    CUSTOMER's own note and must not be overwritten with staff text.
--
-- 2. STATUS VALUES — no DDL required
--    orders.status is plain TEXT with NO check constraint, so the
--    workflow stages are added as new values without touching any
--    existing row:
--      pending         (existing) stage 1 — submitted, awaiting review
--      received                   stage 2 — acknowledged, awaiting approval
--      confirmed                  stage 3 — approved
--      ready_for_pickup           stage 4 — ready (pickup_date is separate:
--                                            entering a date does NOT set
--                                            this status)
--      collected                  stage 5 — completed
--    Legacy values (processing, shipped, delivered, cancelled) remain
--    valid and unchanged, so current orders and workflows keep working.
--
-- 3. SECURITY
--    RLS already limits order updates to the owner or staff, and
--    protect_order_state() already stops customers self-approving.
--    RLS is row-level and cannot restrict columns, so the same trigger
--    is extended: a customer can no longer write their own
--    pickup_date or status_message either.
--
-- 4. REALTIME
--    public.orders joins the supabase_realtime publication so the
--    customer tracking page can refresh without a page reload. Postgres
--    Changes respects RLS, and the client additionally filters events
--    by user_id.
-- ============================================================

alter table public.orders
  add column if not exists pickup_date date;

alter table public.orders
  add column if not exists status_message text;

comment on column public.orders.pickup_date is
  'Estimated pickup date entered by staff. Independent of status: setting a date does NOT mark the order ready.';

comment on column public.orders.status_message is
  'Customer-facing status message written by staff; shown verbatim on the order tracking page.';


-- ------------------------------------------------------------
-- Extend the existing customer-protection trigger.
-- Same function name => replaces in place; every check from
-- 20261003000000_security_hardening.sql is preserved and two
-- staff-only columns are added to the protected set.
-- ------------------------------------------------------------
create or replace function public.protect_order_state()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or public.is_staff() then
    return new;
  end if;

  -- Financial and ownership columns are staff-only, full stop.
  if new.payment_status  is distinct from old.payment_status
  or new.payment_method  is distinct from old.payment_method
  or new.delivery_status is distinct from old.delivery_status
  or new.delivery_price  is distinct from old.delivery_price
  or new.total           is distinct from old.total
  or new.subtotal        is distinct from old.subtotal
  or new.discount        is distinct from old.discount
  or new.user_id         is distinct from old.user_id
  then
    raise exception 'Order payment, totals and delivery can only be changed by staff.'
      using errcode = '42501';
  end if;

  -- NEW: staff-authored fulfilment details are staff-only too. Without
  -- this a customer could rewrite their own pickup date or forge the
  -- status message shown to them (RLS cannot restrict columns).
  if new.pickup_date    is distinct from old.pickup_date
  or new.status_message is distinct from old.status_message
  then
    raise exception 'Pickup date and status messages can only be changed by staff.'
      using errcode = '42501';
  end if;

  -- Status is the one field a customer may move, and only to
  -- 'cancelled', and only while the order has not shipped. The new
  -- workflow stages (received / confirmed / ready_for_pickup /
  -- collected) are therefore staff-only: a customer can never approve
  -- or advance their own order.
  if new.status is distinct from old.status then
    if new.status = 'cancelled' and old.status in ('pending', 'processing') then
      return new;
    end if;

    raise exception 'Only staff can change an order to %; customers may cancel their own order only.',
      new.status using errcode = '42501';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_protect_order_state on public.orders;
create trigger trg_protect_order_state
  before update on public.orders
  for each row execute function public.protect_order_state();


-- ------------------------------------------------------------
-- Realtime: add public.orders to the supabase_realtime publication
-- (guarded so a fresh database without the publication, or a database
-- that already has the table, both succeed).
-- ------------------------------------------------------------
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (
       select 1 from pg_publication_tables
       where pubname = 'supabase_realtime'
         and schemaname = 'public'
         and tablename = 'orders'
     ) then
    alter publication supabase_realtime add table public.orders;
  end if;
end $$;
