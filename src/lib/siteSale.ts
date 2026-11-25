import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';

/**
 * Admin-controlled sale page + weekend coupon.
 *
 * Settings live in public.site_sale (see
 * supabase/migrations/20261124000000_site_sale.sql). Everyone can read them,
 * only admins can write them, and a save reaches every open browser tab in
 * realtime. The coupon itself is checked on the SERVER (validate_sale_coupon),
 * which also enforces "Friday, Saturday and Sunday, Nairobi time".
 */

export const SALE_SLUG = 'weekend';

export interface SiteSaleConfig {
  slug: string;
  version: number;
  isActive: boolean;
  title: string;
  subtitle: string;
  /** Upper-case, empty when there is no coupon. */
  couponCode: string;
  discountPercent: number;
  updatedAt: string | null;
}

export type SiteSaleInput = Omit<SiteSaleConfig, 'slug' | 'version' | 'updatedAt'>;

export interface SiteSaleRow {
  slug: string;
  version: number;
  is_active: boolean | null;
  title: string | null;
  subtitle: string | null;
  coupon_code: string | null;
  discount_percent: number | null;
  updated_at: string | null;
}

/* ------------------------------------------------------------------ *
 * Mapping
 * ------------------------------------------------------------------ */

export function mapSaleRow(row: SiteSaleRow): SiteSaleConfig {
  return {
    slug: row.slug,
    version: Number(row.version) || 1,
    isActive: row.is_active === true,
    title: row.title ?? '',
    subtitle: row.subtitle ?? '',
    couponCode: (row.coupon_code ?? '').toUpperCase(),
    discountPercent: Number.isFinite(row.discount_percent) ? Number(row.discount_percent) : 15,
    updatedAt: row.updated_at ?? null,
  };
}

function toDbRow(input: SiteSaleInput) {
  return {
    slug: SALE_SLUG,
    is_active: input.isActive,
    title: input.title,
    subtitle: input.subtitle,
    coupon_code: input.couponCode,
    discount_percent: input.discountPercent,
  };
}

/* ------------------------------------------------------------------ *
 * Time: Nairobi is UTC+3 all year (no daylight saving)
 * ------------------------------------------------------------------ */

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/** 0 = Sunday ... 6 = Saturday, in Nairobi, whatever the visitor's own time zone. */
export function nairobiDayOfWeek(now: Date = new Date()): number {
  return new Date(now.getTime() + 3 * 60 * 60 * 1000).getUTCDay();
}

export function nairobiDayName(now: Date = new Date()): string {
  return DAY_NAMES[nairobiDayOfWeek(now)];
}

/** Friday, Saturday or Sunday in Nairobi. */
export function isCouponDay(now: Date = new Date()): boolean {
  const day = nairobiDayOfWeek(now);
  return day === 5 || day === 6 || day === 0;
}

/* ------------------------------------------------------------------ *
 * Admin form <-> config
 * ------------------------------------------------------------------ */

export interface SaleFormState {
  isActive: boolean;
  title: string;
  subtitle: string;
  couponCode: string;
  discountPercent: string;
}

export const emptySaleForm: SaleFormState = {
  isActive: false,
  title: 'Weekend Sale',
  subtitle: '',
  couponCode: '',
  discountPercent: '15',
};

export function normalizeCouponCode(value: string): string {
  return value.replace(/\s+/g, '').toUpperCase();
}

export function configToSaleForm(config: SiteSaleConfig | null): SaleFormState {
  if (!config) return { ...emptySaleForm };
  return {
    isActive: config.isActive,
    title: config.title,
    subtitle: config.subtitle,
    couponCode: config.couponCode,
    discountPercent: String(config.discountPercent),
  };
}

/** Human-readable problems with the form; empty array = safe to save. */
export function validateSaleForm(form: SaleFormState): string[] {
  const errors: string[] = [];
  const code = normalizeCouponCode(form.couponCode);
  const percentText = form.discountPercent.trim();
  const percent = Number(percentText);

  if (form.title.length > 80) errors.push('Title is too long (maximum 80 characters).');
  if (form.subtitle.length > 300) errors.push('Message is too long (maximum 300 characters).');

  if (code && !/^[A-Z0-9]{3,20}$/.test(code)) {
    errors.push('Coupon code must be 3 to 20 letters or numbers, with no spaces or symbols.');
  }

  if (percentText === '' || !Number.isInteger(percent) || percent < 1 || percent > 90) {
    errors.push('Discount must be a whole number from 1 to 90.');
  }

  if (form.isActive && !form.title.trim()) {
    errors.push('Add a title before switching the sale on.');
  }

  return errors;
}

/** Form -> database input. Call only after validateSaleForm() returned no errors. */
export function formToSaleInput(form: SaleFormState): SiteSaleInput {
  const percent = Math.round(Number(form.discountPercent));
  return {
    isActive: form.isActive,
    title: form.title.trim(),
    subtitle: form.subtitle.trim(),
    couponCode: normalizeCouponCode(form.couponCode),
    discountPercent: Number.isFinite(percent) ? Math.min(90, Math.max(1, percent)) : 15,
  };
}

/* ------------------------------------------------------------------ *
 * Database access
 * ------------------------------------------------------------------ */

/** Reads the sale row; throws on a database error (used by the admin editor). */
export async function fetchSiteSaleStrict(): Promise<SiteSaleConfig | null> {
  const { data, error } = await supabase
    .from('site_sale')
    .select('*')
    .eq('slug', SALE_SLUG)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data ? mapSaleRow(data as SiteSaleRow) : null;
}

/** Storefront read: any failure means "no sale", never a broken page. */
export async function fetchSiteSale(): Promise<SiteSaleConfig | null> {
  try {
    return await fetchSiteSaleStrict();
  } catch (error) {
    console.warn('[sale] could not load the sale settings:', error);
    return null;
  }
}

/**
 * Saves the sale settings. Postgres Row Level Security allows this for admins
 * only; a trigger raises the version and normalises the coupon code.
 */
export async function saveSiteSale(input: SiteSaleInput): Promise<SiteSaleConfig> {
  const { data, error } = await supabase
    .from('site_sale')
    .upsert(toDbRow(input), { onConflict: 'slug' })
    .select()
    .single();

  if (error) {
    if (/row-level security|permission denied/i.test(error.message)) {
      throw new Error('Only administrators can change the sale.');
    }
    throw new Error(`Could not save the sale: ${error.message}`);
  }
  return mapSaleRow(data as SiteSaleRow);
}

/* ------------------------------------------------------------------ *
 * Coupon check (runs on the server)
 * ------------------------------------------------------------------ */

export type CouponFailure = 'inactive' | 'invalid' | 'not_weekend' | 'error';

/**
 * One flat shape (not a union), so it narrows correctly even though this
 * project compiles without strictNullChecks. percent is 0 and reason is the
 * failure whenever valid is false; reason is 'ok' when valid is true.
 */
export interface CouponResult {
  valid: boolean;
  percent: number;
  reason: CouponFailure | 'ok';
}

export function couponMessage(reason: CouponFailure | 'ok'): string {
  switch (reason) {
    case 'not_weekend':
      return 'This code is only valid on Friday, Saturday and Sunday.';
    case 'inactive':
      return 'There is no promotion running right now.';
    case 'invalid':
      return 'That promo code is not valid.';
    default:
      return 'We could not check the code. Please try again.';
  }
}

/** Parses the jsonb the validate_sale_coupon() function returns. */
export function parseCouponResponse(data: unknown): CouponResult {
  if (data && typeof data === 'object') {
    const body = data as { valid?: unknown; percent?: unknown; reason?: unknown };
    if (body.valid === true) {
      const percent = Number(body.percent);
      if (Number.isInteger(percent) && percent >= 1 && percent <= 90) {
        return { valid: true, percent, reason: 'ok' };
      }
      return { valid: false, percent: 0, reason: 'error' };
    }
    if (body.reason === 'inactive' || body.reason === 'invalid' || body.reason === 'not_weekend') {
      return { valid: false, percent: 0, reason: body.reason };
    }
  }
  return { valid: false, percent: 0, reason: 'error' };
}

export async function validateSaleCoupon(code: string): Promise<CouponResult> {
  try {
    const { data, error } = await supabase.rpc('validate_sale_coupon', { p_code: code });
    if (error) {
      console.warn('[sale] coupon check failed:', error.message);
      return { valid: false, percent: 0, reason: 'error' };
    }
    return parseCouponResponse(data);
  } catch (error) {
    console.warn('[sale] coupon check failed:', error);
    return { valid: false, percent: 0, reason: 'error' };
  }
}

/**
 * What checkout should do when it re-checks a code that was applied earlier,
 * just before the order is saved (the weekend may have ended, or the admin may
 * have changed the code or the percentage in the meantime).
 *
 *   ok          - still valid at the same percentage: place the order
 *   unverified  - the server could not be reached: stop, keep the code, retry
 *   removed     - no longer valid: stop and drop the discount
 *   changed     - valid but at a different percentage: stop and show the new one
 */
export interface CouponRecheck {
  outcome: 'ok' | 'unverified' | 'removed' | 'changed';
  percent: number;
  message: string;
}

export function recheckAppliedCoupon(check: CouponResult, appliedPercent: number): CouponRecheck {
  if (!check.valid && check.reason === 'error') {
    return { outcome: 'unverified', percent: appliedPercent, message: couponMessage('error') };
  }
  if (!check.valid) {
    return {
      outcome: 'removed',
      percent: 0,
      message:
        'Your promo code is no longer valid, so the discount was removed. Please check your total and place the order again.',
    };
  }
  if (check.percent !== appliedPercent) {
    return {
      outcome: 'changed',
      percent: check.percent,
      message: `The discount is now ${check.percent}%. Please check your total and place the order again.`,
    };
  }
  return { outcome: 'ok', percent: appliedPercent, message: '' };
}

/* ------------------------------------------------------------------ *
 * Storefront hook: load once, then stay in sync in realtime
 * ------------------------------------------------------------------ */

function isNewer(a: SiteSaleConfig, b: SiteSaleConfig): boolean {
  const ta = a.updatedAt ? Date.parse(a.updatedAt) : NaN;
  const tb = b.updatedAt ? Date.parse(b.updatedAt) : NaN;
  if (Number.isFinite(ta) && Number.isFinite(tb) && ta !== tb) return ta > tb;
  return a.version > b.version;
}

/**
 * Newer wins, so a slow read can never overwrite a fresher realtime event.
 * A failed/empty read never wipes settings that are already known.
 */
export function mergeSale(
  previous: SiteSaleConfig | null,
  incoming: SiteSaleConfig | null
): SiteSaleConfig | null {
  if (incoming === null) return previous;
  if (previous && isNewer(previous, incoming)) return previous;
  return incoming;
}

export function useSiteSale(enabled = true): { config: SiteSaleConfig | null; loaded: boolean } {
  const [config, setConfig] = useState<SiteSaleConfig | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;

    const load = async () => {
      const next = await fetchSiteSale();
      if (cancelled) return;
      setConfig((prev) => mergeSale(prev, next));
      setLoaded(true);
    };
    void load();

    const channel = supabase
      .channel('site-sale-live')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'site_sale', filter: `slug=eq.${SALE_SLUG}` },
        (payload) => {
          if (cancelled) return;
          if (payload.eventType === 'DELETE') {
            setConfig(null);
            return;
          }
          setConfig((prev) => mergeSale(prev, mapSaleRow(payload.new as SiteSaleRow)));
        }
      )
      .subscribe();

    // Safety net for a socket that silently dropped (sleeping phone, flaky
    // network): re-read whenever the tab becomes visible again.
    const onVisible = () => {
      if (document.visibilityState === 'visible') void load();
    };
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onVisible);
      void supabase.removeChannel(channel);
    };
  }, [enabled]);

  return { config, loaded };
}
