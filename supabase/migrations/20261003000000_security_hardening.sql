-- ============================================================
-- MAISH FASHION BOUTIQUE â€” SECURITY HARDENING
-- Run AFTER 20261002000000_init_maish_schema.sql
-- Paste into Supabase Dashboard > SQL Editor, or: supabase db push
--
-- Closes concrete, exploitable holes found while auditing the
-- deployed policies. Every statement is IDEMPOTENT â€” safe to re-run.
--
--   1. admin_activity_log_viewers had NO RLS. It lives in the public
--      schema, so the anon key could read it AND insert their own
--      email, which makes can_view_admin_activity_log() return true
--      and exposes the entire admin audit trail.
--   2. profiles.email was self-editable. can_view_admin_activity_log()
--      authorises on lower(email), so a customer could rewrite their
--      own email to the owner's address and inherit owner rights.
--   3. "Public insert orders" (with check true) let anyone file an
--      order against ANY user_id, attributing fabricated orders to
--      real customers.
--   4. "Public insert order items" (with check true) let anyone
--      attach line items to any order, editing other people's orders.
--   5. "Users update own orders" let a customer mark their OWN order
--      delivered/shipped or rewrite payment_status, forging proof of
--      delivery/payment. Only 'cancelled' is now self-service.
--
-- Guest checkout is deliberately preserved: anonymous inserts still
-- work, they just can no longer be aimed at somebody else.
-- ============================================================


-- ------------------------------------------------------------
-- 1. Lock down the activity-log allow-list
--
-- RLS enabled and client writes revoked. Only staff may read it, and
-- nobody may change it from the client: the allow-list is security
-- configuration and is edited in the SQL Editor only.
-- ------------------------------------------------------------
alter table public.admin_activity_log_viewers enable row level security;

drop policy if exists "Staff read activity log viewers" on public.admin_activity_log_viewers;
drop policy if exists "Public read activity log viewers" on public.admin_activity_log_viewers;

create policy "Staff read activity log viewers"
  on public.admin_activity_log_viewers for select
  to authenticated
  using (public.is_staff());

-- Belt and braces: even with RLS on, take INSERT/UPDATE/DELETE away
-- from the client roles so the allow-list cannot be self-edited.
revoke insert, update, delete on public.admin_activity_log_viewers from anon, authenticated;


-- ------------------------------------------------------------
-- 2. Stop users rewriting their own email (and therefore their role)
--
-- can_view_admin_activity_log() authorises on lower(profiles.email)
-- and the self-service policy is "for all" on the caller's own row.
-- RLS cannot restrict columns, so a customer could previously set
-- their email to the owner's address and then read the audit log.
-- Role was already guarded by protect_profile_role; email is the
-- remaining column with the same reach.
-- ------------------------------------------------------------
create or replace function public.protect_profile_identity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Trusted direct connection (SQL Editor, service_role, migrations)
  -- has no auth.uid() and passes through untouched.
  if auth.uid() is null then
    return new;
  end if;

  if not public.is_admin() and (
       new.role is distinct from old.role
    or lower(new.email) is distinct from lower(old.email)
  ) then
    raise exception 'Only an administrator can change a profile role or email.'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_protect_profile_role on public.profiles;
drop trigger if exists trg_protect_profile_identity on public.profiles;
create trigger trg_protect_profile_identity
  before update on public.profiles
  for each row execute function public.protect_profile_identity();

-- ------------------------------------------------------------
-- 3. Guest checkout may only file an order AS ITSELF
--
-- Keeps anonymous checkout working, but a row can no longer be
-- planted against somebody else's user_id, and the insert policy no
-- longer relies on a blanket "with check (true)".
-- ------------------------------------------------------------
drop policy if exists "Public insert orders" on public.orders;
create policy "Guest or owner inserts own order"
  on public.orders for insert
  with check (
    user_id is null                      -- guest checkout
    or user_id = auth.uid()              -- signed-in shopper filing their own
    or public.is_staff()
  );


-- ------------------------------------------------------------
-- 4. Line items may only be attached to the caller's own order
--
-- "with check (true)" previously let anyone write rows against any
-- order_id, i.e. edit another customer's basket. A guest order has
-- user_id null so ownership cannot be proven by uid; it is bounded
-- instead by requiring the parent order to be brand new.
-- ------------------------------------------------------------
drop policy if exists "Public insert order items" on public.order_items;
create policy "Insert items into own new order"
  on public.order_items for insert
  with check (
    public.is_staff()
    or exists (
      select 1
      from public.orders o
      where o.id = order_id
        and (
          o.user_id = auth.uid()
          or (o.user_id is null and o.created_at > now() - interval '15 minutes')
        )
    )
  );


-- ------------------------------------------------------------
-- 5. Customers cannot self-approve or re-price their own order
--
-- RLS is row-level and cannot restrict columns, so "Users update own
-- orders" let a shopper set status='delivered' (forging proof of
-- delivery) or payment_status='paid' on a cash-on-delivery order.
-- A trigger is the only place this can be enforced. Staff and trusted
-- direct connections are unaffected.
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

  -- Status is the one field a customer may move, and only to
  -- 'cancelled', and only while the order has not shipped.
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
-- Verify: relrowsecurity should now be true for all four tables,
-- and both triggers should appear as enabled.
-- ------------------------------------------------------------
select relname, relrowsecurity
from pg_class
where relname in ('admin_activity_log_viewers','orders','order_items','profiles')
order by relname;

select tgname, tgenabled
from pg_trigger
where tgrelid in ('public.profiles'::regclass, 'public.orders'::regclass)
  and not tgisinternal
order by tgname;
