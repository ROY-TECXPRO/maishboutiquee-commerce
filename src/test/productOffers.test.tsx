import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { CartProvider } from '@/context/CartContext';
import type { Product } from '@/types';

/**
 * Regression tests for the admin-driven Offers row and live search.
 *
 * 1. The admin "Offer" button writes `products.is_offer`; the storefront
 *    selector must surface ONLY those products (no fallback pool — when the
 *    last offer ends the homepage row has to disappear completely).
 * 2. A product added through the admin dashboard lives only in the database,
 *    so search must read the live catalogue, not the static bundle.
 * 3. Clicking an offered item has to land the shopper in checkout.
 */

const chainable = (value: unknown) => {
  const q: Record<string, unknown> = {};
  ['select', 'order', 'eq', 'in', 'limit', 'single'].forEach((m) => {
    q[m] = () => q;
  });
  q.then = (onOk: (v: unknown) => unknown) => Promise.resolve(onOk(value));
  return q;
};

/** Minimal in-memory Storage so CartContext can persist in this environment. */
function createMemoryStorage(): Storage {
  const map = new Map<string, string>();
  return {
    get length() {
      return map.size;
    },
    clear: () => map.clear(),
    getItem: (k: string) => (map.has(k) ? map.get(k)! : null),
    key: (i: number) => Array.from(map.keys())[i] ?? null,
    removeItem: (k: string) => void map.delete(k),
    setItem: (k: string, v: string) => void map.set(k, String(v)),
  } as Storage;
}

const memoryStorage = createMemoryStorage();
Object.defineProperty(globalThis, 'localStorage', {
  value: memoryStorage,
  configurable: true,
  writable: true,
});
Object.defineProperty(window, 'localStorage', {
  value: memoryStorage,
  configurable: true,
  writable: true,
});

/**
 * jsdom has no IntersectionObserver, but framer-motion's `whileInView`
 * (used for the card entrance animation) mounts one. A no-op stub is enough:
 * the card renders fully regardless of viewport events.
 */
class NoopIntersectionObserver {
  root = null;
  rootMargin = '';
  thresholds: number[] = [];
  observe() {}
  unobserve() {}
  disconnect() {}
  takeRecords(): IntersectionObserverEntry[] {
    return [];
  }
}
Object.defineProperty(globalThis, 'IntersectionObserver', {
  value: NoopIntersectionObserver,
  configurable: true,
  writable: true,
});
Object.defineProperty(window, 'IntersectionObserver', {
  value: NoopIntersectionObserver,
  configurable: true,
  writable: true,
});

let productsRows: unknown[] = [];

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: (table: string) => {
      if (table === 'categories') return chainable([]);
      return chainable({ data: productsRows, error: null });
    },
    storage: { from: () => ({ upload: vi.fn(), getPublicUrl: vi.fn() }) },
  },
}));

// sonner renders toasts outside the tree; keep the test output clean.
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const { fetchCatalog, selectOfferProducts, searchCatalog } = await import('@/lib/catalog');
const { OfferProductCard } = await import('@/components/product/OfferProductCard');

/** An admin-created database row — no legacy_id, no sizes/colours, on offer. */
const OFFER_DB_ROW = {
  id: '0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d',
  legacy_id: null,
  sku: 'UNI-400',
  slug: 'embroidered-hotel-uniform',
  name: 'Embroidered Hotel Uniform',
  price: 1500,
  original_price: 2000,
  description: 'Embroidered hotel staff uniform stitched to order.',
  category_id: null,
  gender: 'Unisex',
  tags: [],
  use_case: ['hotel'],
  rating: 5,
  review_count: 0,
  is_new: true,
  is_sale: false,
  is_offer: true,
  stock: 10,
  size_prices: null,
  images: [{ src: '/images/uniform.webp', alt: 'Embroidered Hotel Uniform' }],
  colors: [],
  sizes: [],
  features: [],
  is_active: true,
};

function buildProduct(overrides: Partial<Product> = {}): Product {
  return {
    id: 'offer-1',
    name: 'Embroidered Hotel Uniform',
    price: 1500,
    originalPrice: 2000,
    images: [{ src: '/images/uniform.webp', alt: 'Embroidered Hotel Uniform' }],
    category: 'uniform-center',
    sizes: [],
    colors: [],
    tags: ['hotel', 'uniform'],
    rating: 5,
    reviewCount: 0,
    stock: 10,
    sku: 'UNI-400',
    isOffer: true,
    ...overrides,
  };
}

describe('admin offer flag drives the homepage Offers row', () => {
  beforeEach(() => {
    productsRows = [];
    window.localStorage.clear();
  });

  it('selectOfferProducts returns only the flagged products', () => {
    const flagged = buildProduct({ id: 'a', isOffer: true });
    const normal = buildProduct({ id: 'b', name: 'Everyday Shirt', isOffer: false });

    const result = selectOfferProducts([flagged, normal], 12);

    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('a');
  });

  it('returns an empty list when nothing is flagged so the row disappears', () => {
    expect(selectOfferProducts([buildProduct({ isOffer: false })], 12)).toEqual([]);
    expect(selectOfferProducts([], 12)).toEqual([]);
  });

  it('maps products.is_offer from the database into isOffer', async () => {
    productsRows = [OFFER_DB_ROW];

    const catalog = await fetchCatalog();

    expect(catalog.source).toBe('supabase');
    expect(catalog.products[0].isOffer).toBe(true);
    // The row must also survive into the Offers row selector.
    expect(selectOfferProducts(catalog.products, 12)).toHaveLength(1);
  });
});

describe('search finds admin-added products', () => {
  beforeEach(() => {
    productsRows = [];
  });

  it('finds a database-only product by name', async () => {
    productsRows = [OFFER_DB_ROW];
    const catalog = await fetchCatalog();

    const results = searchCatalog(catalog.products, 'embroidered hotel');

    expect(results).toHaveLength(1);
    expect(results[0].name).toBe('Embroidered Hotel Uniform');
  });

  it('matches the description and skips products missing a term', async () => {
    productsRows = [OFFER_DB_ROW];
    const catalog = await fetchCatalog();

    expect(searchCatalog(catalog.products, 'stitched')).toHaveLength(1);
    expect(searchCatalog(catalog.products, 'embroidered trousers')).toHaveLength(0);
    expect(searchCatalog(catalog.products, '')).toHaveLength(0);
  });
});

describe('OfferProductCard goes straight to checkout', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('adds the item to the cart and navigates to /checkout', () => {
    const product = buildProduct();

    render(
      <MemoryRouter initialEntries={['/']}>
        <CartProvider>
          <Routes>
            <Route path="/" element={<OfferProductCard product={product} />} />
            <Route path="/checkout" element={<div>CHECKOUT_PAGE</div>} />
          </Routes>
        </CartProvider>
      </MemoryRouter>
    );

    // The image itself is clickable — one tap from the homepage to checkout.
    fireEvent.click(screen.getByRole('button', { name: `Buy ${product.name} now` }));

    expect(screen.getByText('CHECKOUT_PAGE')).toBeInTheDocument();

    const cart = JSON.parse(window.localStorage.getItem('maish-cart') ?? '[]');
    expect(cart).toHaveLength(1);
    expect(cart[0].product.id).toBe(product.id);
    // Products without variants fall back to the "One Size" default.
    expect(cart[0].selectedSize).toBe('One Size');
    expect(cart[0].selectedColor.name).toBe('As supplied');
  });

  it('keeps the shopper on checkout when the Buy Now button is used', () => {
    const product = buildProduct();

    render(
      <MemoryRouter initialEntries={['/']}>
        <CartProvider>
          <Routes>
            <Route path="/" element={<OfferProductCard product={product} />} />
            <Route path="/checkout" element={<div>CHECKOUT_PAGE</div>} />
          </Routes>
        </CartProvider>
      </MemoryRouter>
    );

    fireEvent.click(screen.getByRole('button', { name: /buy now/i }));

    expect(screen.getByText('CHECKOUT_PAGE')).toBeInTheDocument();
  });
});
