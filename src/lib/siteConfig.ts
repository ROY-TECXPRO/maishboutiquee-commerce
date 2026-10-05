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

/** Resolves the canonical origin from an optional environment value. */
export function resolveSiteUrl(raw?: string | undefined): string {
  const candidate = (raw || '').trim() || DEFAULT_SITE_URL;
  return candidate.replace(/\/+$/, '');
}
