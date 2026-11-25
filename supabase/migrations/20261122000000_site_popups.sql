-- ============================================================
-- MAISH FASHION BOUTIQUE — ADMIN-CONTROLLED SEASONAL POPUP
-- Run AFTER 20261014000000_order_management.sql
-- Paste into Supabase Dashboard > SQL Editor, or: npm run db:push
--
-- Moves the "Customer Service Week" popup out of the code and into the
-- database so an admin can edit it from the dashboard (Popup tab).
--
--   * ONE row per popup, keyed by slug. The storefront reads 'seasonal'.
--   * Everyone can READ it (it is public marketing copy, and anonymous
--     visitors need it). Only ADMINS can create / change / delete it.
--   * `version` goes up by one on every save, enforced by a trigger so a
--     client can never forge it. The storefront uses it to decide whether a
--     visitor has already dismissed THIS version, so every save pops up
--     again for everyone, including people who closed the previous one.
--   * The table joins the supabase_realtime publication, so a save reaches
--     every open browser tab immediately.
--
-- Every statement is IDEMPOTENT — safe to re-run.
-- ============================================================

create table if not exists public.site_popups (
  slug            text primary key,
  version         integer      not null default 1,
  is_active       boolean      not null default false,

  -- Copy
  badge_text      text         not null default '',
  headline        text         not null default '',
  subtitle        text         not null default '',
  highlight_text  text         not null default '',
  footer_note     text         not null default '',

  -- Offer
  image_url       text         not null default '',
  product_name    text         not null default '',
  price           numeric(12,2) not null default 0 check (price >= 0),
  original_price  numeric(12,2) check (original_price is null or original_price >= 0),
  sizes           text[]       not null default '{}',

  -- Button behaviour: 'cart' = add the offer to the cart and go to checkout,
  -- 'link' = send the visitor to an in-site page (link_path).
  cta_type        text         not null default 'cart' check (cta_type in ('cart', 'link')),
  cta_label       text         not null default 'Add to Cart & Checkout',
  link_path       text         not null default '',

  -- Timing
  delay_seconds   integer      not null default 5 check (delay_seconds between 0 and 120),
  starts_at       timestamptz,
  ends_at         timestamptz,

  updated_at      timestamptz  not null default now(),
  updated_by      uuid references auth.users(id) on delete set null,

  constraint site_popups_schedule_order
    check (starts_at is null or ends_at is null or ends_at > starts_at)
);

comment on table public.site_popups is
  'Admin-edited storefront popup (seasonal offer / announcement). Public read, admin write, realtime.';

-- ---- Server-controlled columns --------------------------------------------
-- version / updated_at / updated_by are set here, never trusted from the client.
create or replace function public.site_popups_touch()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'INSERT' then
    new.version := 1;
  else
    new.version := old.version + 1;
  end if;
  new.updated_at := now();
  new.updated_by := auth.uid();
  return new;
end;
$$;

drop trigger if exists trg_site_popups_touch on public.site_popups;
create trigger trg_site_popups_touch
  before insert or update on public.site_popups
  for each row execute function public.site_popups_touch();

-- ---- Row Level Security ----------------------------------------------------
alter table public.site_popups enable row level security;

drop policy if exists "Public read site popups"  on public.site_popups;
drop policy if exists "Admin insert site popups" on public.site_popups;
drop policy if exists "Admin update site popups" on public.site_popups;
drop policy if exists "Admin delete site popups" on public.site_popups;

create policy "Public read site popups"
  on public.site_popups for select
  to anon, authenticated
  using (true);

create policy "Admin insert site popups"
  on public.site_popups for insert
  to authenticated
  with check (public.is_admin());

create policy "Admin update site popups"
  on public.site_popups for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create policy "Admin delete site popups"
  on public.site_popups for delete
  to authenticated
  using (public.is_admin());

-- ---- Starting content: exactly what the site shows today -------------------
-- Inserted only when the row does not exist yet, so re-running this file never
-- overwrites what an admin has since edited.
insert into public.site_popups (
  slug, is_active, badge_text, headline, subtitle, highlight_text, footer_note,
  image_url, product_name, price, original_price, sizes,
  cta_type, cta_label, delay_seconds
) values (
  'seasonal', true,
  'Customer Service Week',
  'Happy Customer Service Week dear customer!',
  'Shop with us on the website and claim 30% offers.',
  'Rated 5/5',
  'Limited stock - 50 pairs left. Offer ends soon!',
  '/images/image-pop.webp',
  'Nike Air Force 1 (Black)',
  1500, 2500,
  array['39','40','41','42','43','44','45','46'],
  'cart', 'Add to Cart & Checkout', 5
)
on conflict (slug) do nothing;

-- ---- Realtime: a save reaches every open tab ---------------------------------
-- (guarded so a database without the publication, or one that already has the
-- table, both succeed).
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (
       select 1 from pg_publication_tables
       where pubname = 'supabase_realtime'
         and schemaname = 'public'
         and tablename = 'site_popups'
     ) then
    alter publication supabase_realtime add table public.site_popups;
  end if;
end $$;
