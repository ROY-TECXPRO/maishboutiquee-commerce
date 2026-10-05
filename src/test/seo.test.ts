import { describe, it, expect } from 'vitest';
import { isCrawlerUserAgent } from '@/components/ui/RedirectToHomeOnLoad';
import { normalizePath, absoluteUrl, metaDescription } from '@/lib/seo';
import {
  fallbackSeoConfig,
  isNoIndexRoute,
  isProductRoute,
  productIdFromPath,
  categorySlugFromPath,
  NOINDEX_ROUTES,
  PUBLIC_ROUTES,
} from '@/lib/routeSeo';

describe('isCrawlerUserAgent', () => {
  it('detects major search engine crawlers', () => {
    expect(
      isCrawlerUserAgent(
        'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)'
      )
    ).toBe(true);
    expect(
      isCrawlerUserAgent('Mozilla/5.0 (compatible; bingbot/2.0; +http://www.bing.com/bingbot.htm)')
    ).toBe(true);
    expect(isCrawlerUserAgent('facebookexternalhit/1.1')).toBe(true);
    expect(isCrawlerUserAgent('Twitterbot/1.0')).toBe(true);
  });

  it('does not treat normal browsers as crawlers', () => {
    expect(
      isCrawlerUserAgent(
        'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1'
      )
    ).toBe(false);
    expect(isCrawlerUserAgent('Mozilla/5.0 (Windows NT 10.0) Chrome/120.0')).toBe(
      false
    );
    expect(isCrawlerUserAgent(undefined)).toBe(false);
  });
});

describe('normalizePath', () => {
  it('removes trailing slashes so URLs cannot compete', () => {
    expect(normalizePath('/category/women-wear/')).toBe('/category/women-wear');
    expect(normalizePath('/categories')).toBe('/categories');
  });

  it('keeps the root path intact', () => {
    expect(normalizePath('/')).toBe('/');
  });

  it('strips query strings and hashes', () => {
    expect(normalizePath('/search?q=dress')).toBe('/search');
    expect(normalizePath('/product/abc#top')).toBe('/product/abc');
  });
});

describe('absoluteUrl', () => {
  it('produces canonical absolute URLs on the production host', () => {
    expect(absoluteUrl('/category/women-wear')).toBe(
      'https://maishfashionboutique.co.ke/category/women-wear'
    );
  });

  it('never points at the Netlify deployment-preview host', () => {
    expect(absoluteUrl('/')).not.toContain('netlify.app');
  });
});

describe('metaDescription', () => {
  it('clamps to the Google snippet budget', () => {
    expect(metaDescription('a'.repeat(400)).length).toBeLessThanOrEqual(160);
  });
});

describe('route SEO helpers', () => {
  it('keeps public pages indexable', () => {
    expect(isNoIndexRoute('/')).toBe(false);
    expect(isNoIndexRoute('/categories')).toBe(false);
    expect(isNoIndexRoute('/about')).toBe(false);
  });

  it('blocks private, transactional and admin routes from indexing', () => {
    for (const path of [
      '/cart',
      '/checkout',
      '/account',
      '/orders',
      '/wishlist',
      '/admin/login',
      '/admin/products',
    ]) {
      expect(isNoIndexRoute(path)).toBe(true);
    }
  });

  it('identifies product and category routes and extracts their ids', () => {
    expect(isProductRoute('/product/women-dress-001')).toBe(true);
    expect(productIdFromPath('/product/women-dress-001')).toBe('women-dress-001');
    expect(categorySlugFromPath('/category/women-wear/')).toBe('women-wear');
  });

  it('noindexes unknown routes so soft 404s are not indexed', () => {
    const config = fallbackSeoConfig('/totally-made-up-page');
    expect(config.noindex).toBe(true);
    expect(config.title).toBe('Page Not Found');
  });

  it('labels private routes with their own title, not "Page Not Found"', () => {
    for (const [path, label] of Object.entries(NOINDEX_ROUTES)) {
      const config = fallbackSeoConfig(path);
      expect(config.noindex).toBe(true);
      expect(config.title).toBe(label);
      expect(config.title).not.toBe('Page Not Found');
    }
  });

  it('gives every public route a unique, non-empty title and description', () => {
    const titles = new Set<string>();
    for (const [path, entry] of Object.entries(PUBLIC_ROUTES)) {
      expect(entry.title.length).toBeGreaterThan(0);
      expect(entry.description.length).toBeGreaterThan(50);
      titles.add(entry.title);
    }
    expect(titles.size).toBe(Object.keys(PUBLIC_ROUTES).length);
  });
});
