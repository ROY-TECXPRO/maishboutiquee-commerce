-- ============================================================
-- MAISH FASHION BOUTIQUE — ADMIN-CONTROLLED SALE + WEEKEND COUPON
-- Run AFTER 20261122000000_site_popups.sql
-- Paste into Supabase Dashboard > SQL Editor, or: npm run db:push
--
-- Replaces the hardcoded World Cup sale page and the hardcoded promo code
-- with settings an admin edits in the dashboard (Sale tab):
--
--   * ONE row (slug 'weekend'): sale on/off, title, message, coupon code and
--     discount percentage. Everyone can READ it; only ADMINS can change it.
--   * The coupon is checked by validate_sale_coupon(), which runs on the
--     SERVER: it knows the code, the percentage and that coupons work only on
--     Friday, Saturday and Sunday in Nairobi time. The browser can no longer
--     decide by itself that a code is valid.
--   * site_sale and products join the supabase_realtime publication, so a
--     save in the dashboard (the sale settings, or a product's Offer switch)
--     reaches every open browser tab immediately.
--
-- Every statement is IDEMPOTENT — safe to re-run.
-- ============================================================

create table if not exists public.site_sale (
  slug              text primary key,
  version           integer     not null default 1,
  is_active         boolean     not null default false,
  title             text        not null default 'Weekend Sale',
  subtitle          text        not null default '',
  -- Stored upper-case. Empty = no coupon.
  coupon_code       text        not null default ''
                      check (coupon_code = '' or coupon_code ~ '^[A-Z0-9]{3,20}$'),
  discount_percent  integer     not null default 15
                      check (discount_percent between 1 and 90),
  updated_at        timestamptz not null default now(),
  updated_by        uuid references auth.users(id) on delete set null
);

comment on table public.site_sale is
  'Admin-edited sale page settings and weekend coupon. Public read, admin write, realtime.';

-- ---- Server-controlled columns ---------------------------------------------
create or replace function public.site_sale_touch()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'INSERT' then
    new.version := 1;
  else
    new.version := old.version + 1;
  end if;
  new.coupon_code := upper(btrim(new.coupon_code));
  new.updated_at  := now();
  new.updated_by  := auth.uid();
  return new;
end;
$$;

drop trigger if exists trg_site_sale_touch on public.site_sale;
create trigger trg_site_sale_touch
  before insert or update on public.site_sale
  for each row execute function public.site_sale_touch();

-- ---- Row Level Security -----------------------------------------------------
alter table public.site_sale enable row level security;

drop policy if exists "Public read site sale"  on public.site_sale;
drop policy if exists "Admin insert site sale" on public.site_sale;
drop policy if exists "Admin update site sale" on public.site_sale;
drop policy if exists "Admin delete site sale" on public.site_sale;

create policy "Public read site sale"
  on public.site_sale for select
  to anon, authenticated
  using (true);

create policy "Admin insert site sale"
  on public.site_sale for insert
  to authenticated
  with check (public.is_admin());

create policy "Admin update site sale"
  on public.site_sale for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create policy "Admin delete site sale"
  on public.site_sale for delete
  to authenticated
  using (public.is_admin());

-- ---- Starting row: switched OFF, no code ------------------------------------
-- The admin switches it on from the dashboard. Never overwrites later edits.
insert into public.site_sale (slug, is_active, title, subtitle, coupon_code, discount_percent)
values ('weekend', false, 'Weekend Sale', 'Special offers, updated live.', '', 15)
on conflict (slug) do nothing;

-- ---- Server-side coupon check ------------------------------------------------
-- Returns {"valid": true, "percent": 15} or {"valid": false, "reason": ...}
-- reason: inactive (no running sale / no code), invalid (wrong code),
--         not_weekend (right code, but not Friday-Sunday in Nairobi).
create or replace function public.validate_sale_coupon(p_code text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  s    public.site_sale%rowtype;
  code text := upper(btrim(coalesce(p_code, '')));
  dow  integer;
begin
  select * into s from public.site_sale where slug = 'weekend';

  if not found or not s.is_active or s.coupon_code = '' then
    return jsonb_build_object('valid', false, 'reason', 'inactive');
  end if;

  if code = '' or code <> s.coupon_code then
    return jsonb_build_object('valid', false, 'reason', 'invalid');
  end if;

  -- ISO day of week in Nairobi: 5 = Friday, 6 = Saturday, 7 = Sunday.
  dow := extract(isodow from (now() at time zone 'Africa/Nairobi'))::integer;
  if dow not in (5, 6, 7) then
    return jsonb_build_object('valid', false, 'reason', 'not_weekend');
  end if;

  return jsonb_build_object('valid', true, 'percent', s.discount_percent);
end;
$$;

revoke all on function public.validate_sale_coupon(text) from public;
grant execute on function public.validate_sale_coupon(text) to anon, authenticated;

-- ---- Realtime ------------------------------------------------------------------
-- site_sale: sale settings reach open tabs at once.
-- products : the Offer switch (and any product edit) reaches open tabs at once,
--            so the homepage Offers row and the Sale page stay in step.
do $$
declare
  t text;
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    foreach t in array array['site_sale', 'products'] loop
      if not exists (
        select 1 from pg_publication_tables
        where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
      ) then
        execute format('alter publication supabase_realtime add table public.%I', t);
      end if;
    end loop;
  end if;
end $$;
