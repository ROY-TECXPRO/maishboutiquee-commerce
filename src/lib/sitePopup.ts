import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import type { Product, Size } from '@/types';

/**
 * Admin-controlled storefront popup (seasonal offer / announcement).
 *
 * The content lives in public.site_popups (see
 * supabase/migrations/20261122000000_site_popups.sql). Anyone can read it,
 * only admins can write it, and the table is in the realtime publication so a
 * save in the dashboard reaches every open browser tab immediately.
 */

/** The storefront shows the row with this slug. */
export const POPUP_SLUG = 'seasonal';

export type PopupCtaType = 'cart' | 'link';

export interface SitePopupConfig {
  slug: string;
  /** Raised by a database trigger on every save; never set by the client. */
  version: number;
  isActive: boolean;
  badgeText: string;
  headline: string;
  subtitle: string;
  highlightText: string;
  footerNote: string;
  imageUrl: string;
  productName: string;
  price: number;
  originalPrice: number | null;
  /** Empty = no size picker (the item is added as "One Size"). */
  sizes: string[];
  ctaType: PopupCtaType;
  ctaLabel: string;
  /** In-site path used when ctaType is 'link', e.g. /sale or /category/men-wear. */
  linkPath: string;
  delaySeconds: number;
  startsAt: string | null;
  endsAt: string | null;
  updatedAt: string | null;
}

/** What an admin can write (the server owns slug-version-updatedAt). */
export type SitePopupInput = Omit<SitePopupConfig, 'slug' | 'version' | 'updatedAt'>;

/** Raw database row (snake_case) as returned by PostgREST and realtime. */
export interface SitePopupRow {
  slug: string;
  version: number;
  is_active: boolean | null;
  badge_text: string | null;
  headline: string | null;
  subtitle: string | null;
  highlight_text: string | null;
  footer_note: string | null;
  image_url: string | null;
  product_name: string | null;
  price: number | string | null;
  original_price: number | string | null;
  sizes: string[] | null;
  cta_type: string | null;
  cta_label: string | null;
  link_path: string | null;
  delay_seconds: number | null;
  starts_at: string | null;
  ends_at: string | null;
  updated_at: string | null;
}

export const DEFAULT_CTA_LABEL = 'Add to Cart & Checkout';
export const POPUP_COLOR_NAME = 'Standard';

/* ------------------------------------------------------------------ *
 * Mapping
 * ------------------------------------------------------------------ */

export function mapPopupRow(row: SitePopupRow): SitePopupConfig {
  const originalPrice =
    row.original_price === null || row.original_price === undefined
      ? null
      : Number(row.original_price);
  return {
    slug: row.slug,
    version: Number(row.version) || 1,
    isActive: row.is_active === true,
    badgeText: row.badge_text ?? '',
    headline: row.headline ?? '',
    subtitle: row.subtitle ?? '',
    highlightText: row.highlight_text ?? '',
    footerNote: row.footer_note ?? '',
    imageUrl: row.image_url ?? '',
    productName: row.product_name ?? '',
    price: Number(row.price) || 0,
    originalPrice: originalPrice !== null && Number.isFinite(originalPrice) ? originalPrice : null,
    sizes: Array.isArray(row.sizes) ? row.sizes : [],
    ctaType: row.cta_type === 'link' ? 'link' : 'cart',
    ctaLabel: row.cta_label ?? DEFAULT_CTA_LABEL,
    linkPath: row.link_path ?? '',
    delaySeconds: Number.isFinite(row.delay_seconds) ? Number(row.delay_seconds) : 5,
    startsAt: row.starts_at ?? null,
    endsAt: row.ends_at ?? null,
    updatedAt: row.updated_at ?? null,
  };
}

function toDbRow(input: SitePopupInput) {
  return {
    slug: POPUP_SLUG,
    is_active: input.isActive,
    badge_text: input.badgeText,
    headline: input.headline,
    subtitle: input.subtitle,
    highlight_text: input.highlightText,
    footer_note: input.footerNote,
    image_url: input.imageUrl,
    product_name: input.productName,
    price: input.price,
    original_price: input.originalPrice,
    sizes: input.sizes,
    cta_type: input.ctaType,
    cta_label: input.ctaLabel,
    link_path: input.linkPath,
    delay_seconds: input.delaySeconds,
    starts_at: input.startsAt,
    ends_at: input.endsAt,
  };
}

/* ------------------------------------------------------------------ *
 * Pure helpers (unit-tested)
 * ------------------------------------------------------------------ */

/** "39, 40, 41" or one per line -> ["39","40","41"] (trimmed, de-duplicated). */
export function parseSizes(input: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const part of input.split(/[,\n]/)) {
    const size = part.trim();
    if (size && !seen.has(size)) {
      seen.add(size);
      out.push(size);
    }
  }
  return out;
}

/** Percentage off, or null when there is no genuine discount to show. */
export function discountPercent(price: number, originalPrice: number | null): number | null {
  if (originalPrice === null || !(originalPrice > 0) || !(price >= 0) || originalPrice <= price) {
    return null;
  }
  const pct = Math.round(((originalPrice - price) / originalPrice) * 100);
  return pct > 0 ? pct : null;
}

/**
 * An in-site path only: starts with a single "/", no protocol-relative
 * "//host", no backslashes, no whitespace or control characters.
 */
export function isInternalPath(path: string): boolean {
  // eslint-disable-next-line no-control-regex -- control bytes are exactly what is rejected
  return /^\/(?![/\\])[^\\\s\u0000-\u001f\u007f]*$/.test(path);
}

/** True when an image reference is an in-site path or an https URL. */
export function isValidImageRef(value: string): boolean {
  if (!value) return true;
  if (isInternalPath(value)) return true;
  try {
    return new URL(value).protocol === 'https:';
  } catch {
    return false;
  }
}

/**
 * Whether the popup may be shown at `now`: switched on, started, not ended.
 * (Uses the visitor's clock, which is accurate enough for a seasonal window.)
 */
export function isPopupLive(config: SitePopupConfig, now: Date = new Date()): boolean {
  if (!config.isActive) return false;
  const t = now.getTime();
  if (config.startsAt && t < Date.parse(config.startsAt)) return false;
  if (config.endsAt && t >= Date.parse(config.endsAt)) return false;
  return true;
}

/**
 * The cart item for a 'cart' popup. The id includes the version, so a new
 * save is a new line item and an old cart line keeps the price it was added
 * at instead of silently changing.
 */
export function popupToProduct(config: SitePopupConfig): Product {
  return {
    id: `seasonal-offer-v${config.version}`,
    name: config.productName || config.headline,
    price: config.price,
    originalPrice:
      config.originalPrice !== null && config.originalPrice > config.price
        ? config.originalPrice
        : undefined,
    images: [{ src: config.imageUrl || '/placeholder.svg', alt: config.productName || config.headline }],
    category: 'men-wear',
    sizes: config.sizes as Size[],
    colors: [{ name: POPUP_COLOR_NAME, hex: '#9ca3af', available: true }],
    tags: ['seasonal offer', 'sale'],
    description: config.subtitle || undefined,
    rating: 0,
    reviewCount: 0,
    isSale: true,
    stock: 999,
    sku: `SEASONAL-OFFER-V${config.version}`,
  };
}

/* ------------------------------------------------------------------ *
 * Admin form <-> config
 * ------------------------------------------------------------------ */

export interface PopupFormState {
  isActive: boolean;
  badgeText: string;
  headline: string;
  subtitle: string;
  highlightText: string;
  footerNote: string;
  imageUrl: string;
  productName: string;
  price: string;
  originalPrice: string;
  sizes: string;
  ctaType: PopupCtaType;
  ctaLabel: string;
  linkPath: string;
  delaySeconds: string;
  /** <input type="datetime-local"> value, in the admin's local time. */
  startsAt: string;
  endsAt: string;
}

export const emptyPopupForm: PopupFormState = {
  isActive: false,
  badgeText: '',
  headline: '',
  subtitle: '',
  highlightText: '',
  footerNote: '',
  imageUrl: '',
  productName: '',
  price: '',
  originalPrice: '',
  sizes: '',
  ctaType: 'cart',
  ctaLabel: DEFAULT_CTA_LABEL,
  linkPath: '',
  delaySeconds: '5',
  startsAt: '',
  endsAt: '',
};

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

/** ISO timestamp -> value for <input type="datetime-local"> (local time). */
export function isoToLocalInput(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** <input type="datetime-local"> value -> ISO timestamp, or null when empty. */
export function localInputToIso(value: string): string | null {
  if (!value.trim()) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

export function configToForm(config: SitePopupConfig | null): PopupFormState {
  if (!config) return { ...emptyPopupForm };
  return {
    isActive: config.isActive,
    badgeText: config.badgeText,
    headline: config.headline,
    subtitle: config.subtitle,
    highlightText: config.highlightText,
    footerNote: config.footerNote,
    imageUrl: config.imageUrl,
    productName: config.productName,
    price: config.price ? String(config.price) : '',
    originalPrice: config.originalPrice !== null ? String(config.originalPrice) : '',
    sizes: config.sizes.join(', '),
    ctaType: config.ctaType,
    ctaLabel: config.ctaLabel,
    linkPath: config.linkPath,
    delaySeconds: String(config.delaySeconds),
    startsAt: isoToLocalInput(config.startsAt),
    endsAt: isoToLocalInput(config.endsAt),
  };
}

function toNumber(value: string): number {
  const cleaned = value.replace(/,/g, '').trim();
  return cleaned === '' ? NaN : Number(cleaned);
}

/**
 * Human-readable problems with the form; empty array = safe to save.
 * Requirements (headline, product, price…) apply only while the popup is
 * switched ON, so an admin can save a half-finished draft switched OFF.
 */
export function validatePopupForm(form: PopupFormState): string[] {
  const errors: string[] = [];

  const price = toNumber(form.price);
  const original = toNumber(form.originalPrice);
  const delay = toNumber(form.delaySeconds);

  if (form.headline.length > 120) errors.push('Headline is too long (maximum 120 characters).');
  if (form.badgeText.length > 60) errors.push('Badge text is too long (maximum 60 characters).');
  if (form.subtitle.length > 300) errors.push('Message is too long (maximum 300 characters).');
  if (form.footerNote.length > 200) errors.push('Footer note is too long (maximum 200 characters).');
  if (form.highlightText.length > 40) errors.push('Highlight text is too long (maximum 40 characters).');
  if (form.ctaLabel.length > 40) errors.push('Button label is too long (maximum 40 characters).');

  if (form.price.trim() !== '' && !(price >= 0)) errors.push('Price must be a number, 0 or more.');
  if (form.originalPrice.trim() !== '') {
    if (!(original >= 0)) {
      errors.push('"Was" price must be a number, 0 or more.');
    } else if (price >= 0 && original <= price) {
      errors.push('"Was" price must be higher than the offer price, or left empty.');
    }
  }

  if (!(delay >= 0 && delay <= 120) || !Number.isInteger(delay)) {
    errors.push('Delay must be a whole number of seconds between 0 and 120.');
  }

  const sizes = parseSizes(form.sizes);
  if (sizes.length > 20) errors.push('Use at most 20 sizes.');
  if (sizes.some((s) => s.length > 20)) errors.push('Each size must be 20 characters or fewer.');

  if (!isValidImageRef(form.imageUrl.trim())) {
    errors.push('Image must be an https:// link or a path starting with "/".');
  }

  if (form.ctaType === 'link' && form.linkPath.trim() !== '' && !isInternalPath(form.linkPath.trim())) {
    errors.push('Link must be a page on this site, starting with a single "/" (for example /sale).');
  }

  const startIso = localInputToIso(form.startsAt);
  const endIso = localInputToIso(form.endsAt);
  if (form.startsAt.trim() && !startIso) errors.push('Start date is not valid.');
  if (form.endsAt.trim() && !endIso) errors.push('End date is not valid.');
  if (startIso && endIso && Date.parse(endIso) <= Date.parse(startIso)) {
    errors.push('End date must be after the start date.');
  }

  if (form.isActive) {
    if (!form.headline.trim()) errors.push('Add a headline before switching the popup on.');
    if (form.ctaType === 'cart') {
      if (!form.productName.trim()) errors.push('Add the product name for the offer.');
      if (!(price > 0)) errors.push('Add the offer price (more than 0).');
      if (!form.ctaLabel.trim()) errors.push('Add a label for the button.');
    } else {
      if (!form.linkPath.trim()) errors.push('Add the page the button should open (for example /sale).');
      if (!form.ctaLabel.trim()) errors.push('Add a label for the button.');
    }
  }

  return errors;
}

/** Form -> database input. Call only after validatePopupForm() returned no errors. */
export function formToInput(form: PopupFormState): SitePopupInput {
  const price = toNumber(form.price);
  const original = toNumber(form.originalPrice);
  const delay = toNumber(form.delaySeconds);
  return {
    isActive: form.isActive,
    badgeText: form.badgeText.trim(),
    headline: form.headline.trim(),
    subtitle: form.subtitle.trim(),
    highlightText: form.highlightText.trim(),
    footerNote: form.footerNote.trim(),
    imageUrl: form.imageUrl.trim(),
    productName: form.productName.trim(),
    price: price >= 0 ? price : 0,
    originalPrice: original >= 0 && original > price ? original : null,
    sizes: parseSizes(form.sizes),
    ctaType: form.ctaType,
    ctaLabel: form.ctaLabel.trim(),
    linkPath: form.ctaType === 'link' ? form.linkPath.trim() : '',
    delaySeconds: delay >= 0 && delay <= 120 ? Math.round(delay) : 5,
    startsAt: localInputToIso(form.startsAt),
    endsAt: localInputToIso(form.endsAt),
  };
}

/* ------------------------------------------------------------------ *
 * Database access
 * ------------------------------------------------------------------ */

/** Reads the popup row; throws on a database error (used by the admin editor). */
export async function fetchSitePopupStrict(): Promise<SitePopupConfig | null> {
  const { data, error } = await supabase
    .from('site_popups')
    .select('*')
    .eq('slug', POPUP_SLUG)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data ? mapPopupRow(data as SitePopupRow) : null;
}

/** Storefront read: any failure means "no popup", never a broken page. */
export async function fetchSitePopup(): Promise<SitePopupConfig | null> {
  try {
    return await fetchSitePopupStrict();
  } catch (error) {
    console.warn('[popup] could not load the popup:', error);
    return null;
  }
}

/**
 * Saves the popup. Postgres Row Level Security allows this for admins only;
 * the version number is raised by a database trigger, which is what makes the
 * storefront show the popup again to everyone.
 */
export async function saveSitePopup(input: SitePopupInput): Promise<SitePopupConfig> {
  const { data, error } = await supabase
    .from('site_popups')
    .upsert(toDbRow(input), { onConflict: 'slug' })
    .select()
    .single();

  if (error) {
    if (/row-level security|permission denied/i.test(error.message)) {
      throw new Error('Only administrators can change the popup.');
    }
    throw new Error(`Could not save the popup: ${error.message}`);
  }
  return mapPopupRow(data as SitePopupRow);
}

/* ------------------------------------------------------------------ *
 * Storefront hook: load once, then stay in sync in realtime
 * ------------------------------------------------------------------ */

/** True when `a` was saved after `b` (timestamp first, version as the tie-break). */
function isNewer(a: SitePopupConfig, b: SitePopupConfig): boolean {
  const ta = a.updatedAt ? Date.parse(a.updatedAt) : NaN;
  const tb = b.updatedAt ? Date.parse(b.updatedAt) : NaN;
  if (Number.isFinite(ta) && Number.isFinite(tb) && ta !== tb) return ta > tb;
  return a.version > b.version;
}

/**
 * Newer wins, so a slow read can never overwrite a fresher realtime event.
 * A failed/empty read never wipes a popup that is already known.
 */
export function mergeIncoming(
  previous: SitePopupConfig | null,
  incoming: SitePopupConfig | null
): SitePopupConfig | null {
  if (incoming === null) return previous;
  if (previous && isNewer(previous, incoming)) return previous;
  return incoming;
}

export function useSitePopup(enabled = true): { config: SitePopupConfig | null; loaded: boolean } {
  const [config, setConfig] = useState<SitePopupConfig | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;

    const load = async () => {
      const next = await fetchSitePopup();
      if (cancelled) return;
      setConfig((prev) => mergeIncoming(prev, next));
      setLoaded(true);
    };
    void load();

    // Realtime: an admin save arrives here within moments, whatever page the
    // visitor is on. Postgres Changes respects RLS; the SELECT policy is public.
    const channel = supabase
      .channel('site-popup-live')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'site_popups', filter: `slug=eq.${POPUP_SLUG}` },
        (payload) => {
          if (cancelled) return;
          if (payload.eventType === 'DELETE') {
            setConfig(null);
            return;
          }
          setConfig((prev) => mergeIncoming(prev, mapPopupRow(payload.new as SitePopupRow)));
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
