/**
 * Central technical-SEO configuration + head management.
 *
 * The canonical host is driven by VITE_SITE_URL so the production domain can be
 * changed without a code edit. Everything here is derived from data that
 * already exists in the app (real catalog, real business details) — no
 * placeholder or invented values.
 */

import { DEFAULT_SITE_URL, resolveSiteUrl } from '@/lib/siteConfig';

/** Production origin, never with a trailing slash. */
export const SITE_URL = resolveSiteUrl(import.meta.env.VITE_SITE_URL || DEFAULT_SITE_URL);

export const SITE_NAME = 'Maish Fashion Boutique';

/** Real, shipped brand asset (3508x2480). Replace with a 1200x630 image later. */
export const DEFAULT_OG_IMAGE = '/App-icon.webp';

/** Canonical currency used by the storefront (formatPrice renders "KES ..."). */
export const CURRENCY = 'KES';

export const DEFAULT_TITLE = "Maish Fashion Boutique - Kenya's Premier Fashion Destination";

export const DEFAULT_DESCRIPTION =
  'Maish Fashion Boutique - Kenya\'s Premier Fashion Destination. Shop Women Wear, Men Wear, Kids Wear, Work Wear, Uniforms, Accessories & More. Quality fashion at affordable prices.';

/** Builds an absolute URL from a root-relative path (leaves absolute URLs alone). */
export function absoluteUrl(path: string): string {
  if (/^https?:\/\//i.test(path)) return path;
  return `${SITE_URL}/${path.replace(/^\/+/, '')}`;
}

/**
 * Normalises an in-app pathname into a single canonical form:
 * drops query + hash, collapses duplicate slashes, and removes the trailing
 * slash (except for the homepage) so /category/women-wear and
 * /category/women-wear/ can never compete as separate URLs.
 */
export function normalizePath(pathname: string): string {
  const [withoutHash] = pathname.split('#');
  const [pathOnly] = withoutHash.split('?');
  const collapsed = `/${pathOnly}`.replace(/\/{2,}/g, '/');
  if (collapsed === '/') return '/';
  return collapsed.replace(/\/+$/, '');
}

/** "Product Name | Maish Fashion Boutique" — kept inside Google's ~60 char budget. */
export function pageTitle(title?: string): string {
  if (!title) return DEFAULT_TITLE;
  const full = `${title} | ${SITE_NAME}`;
  return full.length > 60 ? title.slice(0, 57).trimEnd() + '…' : full;
}

/** Clamps a description to Google's ~160 character snippet budget. */
export function metaDescription(text: string): string {
  const clean = text.replace(/\s+/g, ' ').trim();
  if (clean.length <= 160) return clean;
  return clean.slice(0, 157).trimEnd() + '…';
}

export interface SeoConfig {
  title?: string;
  description: string;
  /** Root-relative path used for the canonical + og:url. */
  canonicalPath: string;
  /** Root-relative or absolute image used for og:image / twitter:image. */
  image?: string;
  type?: 'website' | 'article' | 'product';
  /** Renders "noindex, follow" — used for private, cart and 404 routes. */
  noindex?: boolean;
  /** One object or an array of objects, serialised into a single JSON-LD script. */
  jsonLd?: unknown | unknown[];
}

/* ------------------------------------------------------------------ *
 * Head element helpers — idempotent upserts so repeated calls across
 * client-side navigations never leave duplicate tags behind.
 * ------------------------------------------------------------------ */

function upsertMeta(attr: 'name' | 'property', key: string, content: string) {
  let el = document.head.querySelector<HTMLMetaElement>(
    `meta[${attr}="${key}"]`
  );
  if (!el) {
    el = document.createElement('meta');
    el.setAttribute(attr, key);
    document.head.appendChild(el);
  }
  el.setAttribute('content', content);
}

function upsertLink(rel: string, href: string) {
  let el = document.head.querySelector<HTMLLinkElement>(`link[rel="${rel}"]`);
  if (!el) {
    el = document.createElement('link');
    el.setAttribute('rel', rel);
    document.head.appendChild(el);
  }
  el.setAttribute('href', href);
}

const JSONLD_SCRIPT_ID = 'maish-jsonld';

function setJsonLd(data: SeoConfig['jsonLd']) {
  const existing = document.getElementById(JSONLD_SCRIPT_ID);
  // Always clear first: a page with no structured data must not inherit the
  // previous route's Product/Breadcrumb schema.
  if (existing) existing.remove();
  if (!data) return;

  const payload = Array.isArray(data) ? data : [data];
  if (payload.length === 0) return;

  const script = document.createElement('script');
  script.id = JSONLD_SCRIPT_ID;
  script.type = 'application/ld+json';
  script.textContent = JSON.stringify(payload);
  document.head.appendChild(script);
}

/** Writes title, description, canonical, robots, OG, Twitter and JSON-LD to <head>. */
export function applySeo(config: SeoConfig) {
  if (typeof document === 'undefined') return;

  const canonicalUrl = absoluteUrl(normalizePath(config.canonicalPath));
  const imageUrl = absoluteUrl(config.image || DEFAULT_OG_IMAGE);
  const title = config.title
    ? pageTitle(config.title)
    : DEFAULT_TITLE;
  const description = metaDescription(config.description);
  const robots = config.noindex ? 'noindex, follow' : 'index, follow';

  document.title = title;

  upsertMeta('name', 'description', description);
  upsertMeta('name', 'robots', robots);
  upsertLink('canonical', canonicalUrl);

  upsertMeta('property', 'og:type', config.type || 'website');
  upsertMeta('property', 'og:site_name', SITE_NAME);
  upsertMeta('property', 'og:locale', 'en_KE');
  upsertMeta('property', 'og:title', title);
  upsertMeta('property', 'og:description', description);
  upsertMeta('property', 'og:url', canonicalUrl);
  upsertMeta('property', 'og:image', imageUrl);
  upsertMeta('property', 'og:image:alt', title);

  upsertMeta('name', 'twitter:card', 'summary_large_image');
  upsertMeta('name', 'twitter:title', title);
  upsertMeta('name', 'twitter:description', description);
  upsertMeta('name', 'twitter:image', imageUrl);
  upsertMeta('name', 'twitter:image:alt', title);

  setJsonLd(config.jsonLd);
}