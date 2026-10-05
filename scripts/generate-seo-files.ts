/**
 * Build-time SEO file generator.
 *
 * Reads the real catalogue and emits public/sitemap.xml and public/robots.txt
 * so Google gets a valid XML sitemap instead of the SPA shell that the
 * Netlify "/* -> /index.html" rewrite used to return for /sitemap.xml.
 *
 * Only indexable, canonical public URLs are included: homepage, category
 * index, the 11 category pages and every product. Cart, checkout, account,
 * orders, wishlist, search results and all /admin routes are excluded.
 *
 * Run via `npm run generate:seo` (also runs automatically before `npm run build`).
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { products, categories } from '../src/data/products';
import { DEFAULT_SITE_URL, resolveSiteUrl } from '../src/lib/siteConfig';

const SITE_URL = resolveSiteUrl(process.env.VITE_SITE_URL || DEFAULT_SITE_URL);
const PUBLIC_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'public');

const abs = (path: string) => `${SITE_URL}${path}`;

/** Strips characters XML 1.0 forbids and collapses whitespace. */
const xml = (value: string) =>
  value
    .replace(/[<>&'"]/g, (c) =>
      ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' })[c]!
    )
    .replace(/\s+/g, ' ')
    .trim();

interface SitemapEntry {
  loc: string;
  changefreq: string;
  priority: string;
}

const entries: SitemapEntry[] = [
  { loc: abs('/'), changefreq: 'daily', priority: '1.0' },
  { loc: abs('/categories'), changefreq: 'weekly', priority: '0.9' },
  { loc: abs('/new-arrivals'), changefreq: 'daily', priority: '0.8' },
  { loc: abs('/sale'), changefreq: 'daily', priority: '0.7' },
  { loc: abs('/about'), changefreq: 'monthly', priority: '0.5' },
  { loc: abs('/faqs'), changefreq: 'monthly', priority: '0.5' },
  { loc: abs('/help'), changefreq: 'monthly', priority: '0.4' },
  { loc: abs('/shipping'), changefreq: 'monthly', priority: '0.4' },
  { loc: abs('/location'), changefreq: 'monthly', priority: '0.4' },
  { loc: abs('/privacy'), changefreq: 'yearly', priority: '0.3' },
  { loc: abs('/terms'), changefreq: 'yearly', priority: '0.3' },
  ...categories.map<SitemapEntry>((category) => ({
    loc: abs(`/category/${category.id}`),
    changefreq: 'weekly',
    priority: '0.8',
  })),
  ...products.map<SitemapEntry>((product) => ({
    loc: abs(`/product/${product.id}`),
    changefreq: 'weekly',
    priority: '0.7',
  })),
];

// Guard against duplicate <loc> values, which Google flags as an error.
const seen = new Set<string>();
const deduped = entries.filter((entry) => {
  if (seen.has(entry.loc)) return false;
  seen.add(entry.loc);
  return true;
});

const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${deduped
  .map(
    (entry) => `  <url>
    <loc>${xml(entry.loc)}</loc>
    <changefreq>${entry.changefreq}</changefreq>
    <priority>${entry.priority}</priority>
  </url>`
  )
  .join('\n')}
</urlset>
`;

const robots = `# robots.txt for ${SITE_URL}
# Public pages are crawlable; private/account/admin routes are blocked so
# crawlers do not waste budget on them. The matching <meta name="robots">
# noindex is also emitted at runtime for defence in depth.

User-agent: *
Allow: /

# Account, checkout and admin surfaces
Disallow: /admin/
Disallow: /account
Disallow: /cart
Disallow: /checkout
Disallow: /orders
Disallow: /wishlist
Disallow: /addresses
Disallow: /payments
Disallow: /notifications
Disallow: /search

# Build output / PWA internals that should never appear in results
Disallow: /sw.js
Disallow: /workbox-
Disallow: /registerSW.js
Disallow: /manifest.json
Disallow: /assets/
Disallow: /*?*

User-agent: Googlebot
Allow: /
Disallow: /admin/
Disallow: /account
Disallow: /cart
Disallow: /checkout
Disallow: /orders
Disallow: /wishlist
Disallow: /addresses
Disallow: /payments
Disallow: /notifications
Disallow: /search
Disallow: /*?*

Sitemap: ${SITE_URL}/sitemap.xml
`;

mkdirSync(PUBLIC_DIR, { recursive: true });
writeFileSync(resolve(PUBLIC_DIR, 'sitemap.xml'), sitemap, 'utf8');
writeFileSync(resolve(PUBLIC_DIR, 'robots.txt'), robots, 'utf8');

console.log(
  `[seo] sitemap.xml (${deduped.length} URLs) and robots.txt written for ${SITE_URL}`
);
