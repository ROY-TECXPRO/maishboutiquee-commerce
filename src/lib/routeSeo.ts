/**
 * Central route-level SEO map.
 *
 * This is the single source of truth for which routes are indexable and what
 * their metadata is. It also defines the private / noindex set, so a route
 * can never accidentally inherit the global "index, follow" from index.html.
 *
 * Descriptions reference only real, verifiable catalogue and policy facts.
 */
import { normalizePath, type SeoConfig } from '@/lib/seo';

export interface RouteSeoEntry {
  title: string;
  description: string;
  image?: string;
}

/** Public, indexable routes. */
export const PUBLIC_ROUTES: Record<string, RouteSeoEntry> = {
  '/': {
    title: "Maish Fashion Boutique - Kenya's Premier Fashion Destination",
    description:
      "Shop women wear, men wear, kids wear, work wear, uniforms, accessories, mattresses and hotel supplies at Maish Fashion Boutique. Countrywide delivery across Kenya in 1-5 days.",
  },
  '/categories': {
    title: 'Shop by Category',
    description:
      'Browse every Maish Fashion Boutique collection: women wear, men wear, kids wear, work wear, uniforms, handbags, luggage, sports equipment, mattresses and hotel supplies.',
  },
  '/new-arrivals': {
    title: 'New Arrivals',
    description:
      'Shop the latest additions to the Maish Fashion Boutique catalogue, updated as new stock arrives across clothing, uniforms, footwear and home essentials.',
  },
  '/sale': {
    title: 'Sale & Special Offers',
    description:
      'Current offers and discounted products at Maish Fashion Boutique, updated live. The weekend coupon code is shown on this page from Friday to Sunday.',
  },
  '/about': {
    title: 'About Us',
    description:
      'Maishboutique, established in May 2009, is a one-stop online and offline retail store in Kenya delivering countrywide in 1-5 days.',
  },
  '/faqs': {
    title: 'Frequently Asked Questions',
    description:
      'Answers about Maish Fashion Boutique ordering, delivery across Kenya, returns within 7 days, sizing, payment methods including M-Pesa, and order tracking.',
  },
  '/help': {
    title: 'Help & Support',
    description:
      'Get help with your Maish Fashion Boutique order: track an order, request a return or exchange, or contact our customer service team 7 days a week.',
  },
  '/shipping': {
    title: 'Shipping Information',
    description:
      'Delivery information for Maish Fashion Boutique orders, including countrywide delivery across Kenya, typical timelines and fees.',
  },
  '/location': {
    title: 'Our Store Location',
    description:
      'Find the Maish Fashion Boutique store in Narok, Kenya, with an interactive map and travel-time directions.',
  },
  '/privacy': {
    title: 'Privacy Policy',
    description:
      'How Maish Fashion Boutique collects, uses and protects your personal information when you browse or place an order.',
  },
  '/terms': {
    title: 'Terms of Service',
    description:
      'The terms that apply to your use of the Maish Fashion Boutique website and to orders placed through it.',
  },
  '/search': {
    title: 'Search Products',
    description:
      'Search the Maish Fashion Boutique catalogue by product name, style, category or colour.',
  },
};

/**
 * Routes that must never be indexed. These either expose private data, are
 * personalised, are transactional, or are dead ends. They stay crawlable
 * enough for internal linking (noindex, follow) so link equity still flows,
 * but are excluded from search results and from the sitemap.
 */
export const NOINDEX_ROUTES: Record<string, string> = {
  '/cart': 'Your shopping cart',
  '/checkout': 'Secure checkout',
  '/account': 'Your account',
  '/orders': 'Your orders',
  '/wishlist': 'Your wishlist',
  '/addresses': 'Your saved addresses',
  '/payments': 'Your saved payment methods',
  '/notifications': 'Your notifications',
  '/admin/login': 'Admin sign in',
  '/admin/products': 'Admin product dashboard',
};

const PRODUCT_PREFIX = '/product/';
const CATEGORY_PREFIX = '/category/';

/** True for cart, account, admin, checkout and other private routes. */
export function isNoIndexRoute(pathname: string): boolean {
  const path = normalizePath(pathname);
  if (NOINDEX_ROUTES[path]) return true;
  return path.startsWith('/admin/');
}

/** True for /product/<id>. */
export function isProductRoute(pathname: string): boolean {
  return normalizePath(pathname).startsWith(PRODUCT_PREFIX);
}

/** True for /category/<slug>. */
export function isCategoryRoute(pathname: string): boolean {
  return normalizePath(pathname).startsWith(CATEGORY_PREFIX);
}

/** Extracts the product id from a /product/<id> path, or null. */
export function productIdFromPath(pathname: string): string | null {
  const path = normalizePath(pathname);
  if (!path.startsWith(PRODUCT_PREFIX)) return null;
  const id = path.slice(PRODUCT_PREFIX.length).split('/')[0];
  return id ? decodeURIComponent(id) : null;
}

/** Extracts the category slug from a /category/<slug> path, or null. */
export function categorySlugFromPath(pathname: string): string | null {
  const path = normalizePath(pathname);
  if (!path.startsWith(CATEGORY_PREFIX)) return null;
  const slug = path.slice(CATEGORY_PREFIX.length).split('/')[0];
  return slug ? decodeURIComponent(slug) : null;
}

/**
 * Fallback metadata for a route with no explicit entry (e.g. the 404 page),
 * so no page is ever left without a title/description/canonical.
 */
export function fallbackSeoConfig(pathname: string): SeoConfig {
  const path = normalizePath(pathname);
  const known = PUBLIC_ROUTES[path];
  const privateLabel = NOINDEX_ROUTES[path];
  // A route is a genuine 404 only if it is neither a public page, nor a
  // private page, nor a dynamic product/category route.
  const isNotFound =
    !known && !privateLabel && !isProductRoute(path) && !isCategoryRoute(path);
  return {
    title: isNotFound
      ? 'Page Not Found'
      : privateLabel
        ? privateLabel
        : known?.title,
    description: isNotFound
      ? 'The page you were looking for could not be found on Maish Fashion Boutique.'
      : privateLabel
        ? `${privateLabel} on the Maish Fashion Boutique website.`
        : known?.description || '',
    canonicalPath: path,
    image: known?.image,
    noindex: isNoIndexRoute(path) || isNotFound,
  };
}
