-- ============================================================
-- MAISH FASHION BOUTIQUE — PRODUCT OFFER FLAG
-- Run AFTER 20261003000000_security_hardening.sql
-- Paste into Supabase Dashboard > SQL Editor, or: npm run db:push
--
-- Adds the per-product "Offer" switch used by the admin dashboard.
-- When an admin turns the switch ON the product is pinned in the
-- priority Offers row on the homepage (directly under the Campaign
-- Collections boxes); turning it OFF removes it from that row and the
-- product stays exactly where it was before (category, search, …).
--
-- Every statement is IDEMPOTENT — safe to re-run.
-- ============================================================

alter table public.products
  add column if not exists is_offer boolean not null default false;

comment on column public.products.is_offer is
  'Admin-controlled homepage offer flag: TRUE pins the product in the priority Offers row until turned off.';

create index if not exists idx_products_is_offer on public.products(is_offer);
