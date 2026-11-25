/**
 * Single source of truth for the canonical origin.
 *
 * Shared by the runtime (src/lib/seo.ts, which reads VITE_SITE_URL through
 * Vite) and by the build-time generator (scripts/generate-seo-files.ts, which
 * runs under plain Node) so the sitemap, robots.txt, canonicals and structured
 * data can never drift apart.
 *
 * NOTE: https://maishadmin.netlify.app is a deployment preview host and is
 * deliberately NOT the canonical. Override with VITE_SITE_URL.
 */
export const DEFAULT_SITE_URL = 'https://maishfashionboutique.co.ke';

/** WhatsApp business number in international format (no leading +). */
export const WHATSAPP_NUMBER = '254799921036';

/** Full WhatsApp deep link with pre-filled message. */
export const WHATSAPP_URL = `https://wa.me/${WHATSAPP_NUMBER}?text=Hello%20Maish%2C%20I%20need%20emergency%20service`;

/** Resolves the canonical origin from an optional environment value. */
export function resolveSiteUrl(raw?: string | undefined): string {
  const candidate = (raw || '').trim() || DEFAULT_SITE_URL;
  return candidate.replace(/\/+$/, '');
}
