import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { act, render, screen, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { CartProvider } from '@/context/CartContext';
import type { Product } from '@/types';

/**
 * The Sale page reads two live sources: the sale settings (public.site_sale,
 * kept current by realtime) and the catalogue (products flagged Offer). Both
 * are replaced here by controllable fakes.
 */
const fake = vi.hoisted(() => ({
  row: null as Record<string, unknown> | null,
  listeners: [] as Array<(payload: unknown) => void>,
  products: [] as unknown[],
}));

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: () => ({
      select: () => ({
        eq: () => ({ maybeSingle: async () => ({ data: fake.row, error: null }) }),
      }),
    }),
    channel: () => {
      const channel = {
        on: (_t: string, _f: unknown, cb: (payload: unknown) => void) => {
          fake.listeners.push(cb);
          return channel;
        },
        subscribe: () => channel,
      };
      return channel;
    },
    removeChannel: vi.fn(),
  },
}));

vi.mock('@/lib/catalog', async () => {
  const actual = await vi.importActual<typeof import('@/lib/catalog')>('@/lib/catalog');
  return { ...actual, useCatalog: () => ({ products: fake.products }) };
});

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import SalePage from '@/pages/SalePage';

// jsdom has no IntersectionObserver; the animated product cards need one.
class FakeIntersectionObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
  takeRecords() {
    return [];
  }
}
(globalThis as unknown as { IntersectionObserver: unknown }).IntersectionObserver = FakeIntersectionObserver;

const FRIDAY = new Date('2026-11-27T10:00:00Z');
const TUESDAY = new Date('2026-11-24T10:00:00Z');

function product(id: string, name: string, isOffer: boolean): Product {
  return {
    id, name, price: 1000, originalPrice: 1500,
    images: [{ src: '/placeholder.svg', alt: name }],
    category: 'men-wear', sizes: ['M'], colors: [{ name: 'Black', hex: '#000', available: true }],
    tags: [], rating: 4, reviewCount: 1, stock: 5, sku: id, isOffer,
  } as Product;
}

function saleRow(overrides: Record<string, unknown> = {}) {
  return {
    slug: 'weekend', version: 1, is_active: true,
    title: 'Weekend Sale', subtitle: 'Special offers this weekend.',
    coupon_code: 'WEEKEND15', discount_percent: 15,
    updated_at: '2026-11-24T08:00:00.000Z',
    ...overrides,
  };
}

function adminSaves(overrides: Record<string, unknown>) {
  const next = saleRow({
    ...overrides,
    version: Number(fake.row?.version ?? 1) + 1,
    updated_at: new Date().toISOString(),
  });
  fake.row = next;
  fake.listeners.forEach((listener) => listener({ eventType: 'UPDATE', new: next }));
}

async function settle() {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(0);
  });
}

function renderSale() {
  return render(
    <MemoryRouter>
      <CartProvider>
        <SalePage />
      </CartProvider>
    </MemoryRouter>
  );
}

describe('Sale page (admin-controlled)', () => {
  beforeEach(() => {
    const store = new Map<string, string>();
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      value: {
        getItem: (k: string) => store.get(k) ?? null,
        setItem: (k: string, v: string) => void store.set(k, String(v)),
        removeItem: (k: string) => void store.delete(k),
        clear: () => store.clear(),
        key: () => null,
        length: 0,
      },
    });
    fake.row = saleRow();
    fake.listeners = [];
    fake.products = [product('p1', 'Red Dress', true), product('p2', 'Blue Suit', false)];
    vi.useFakeTimers({ toFake: ['Date', 'setInterval', 'clearInterval', 'setTimeout', 'clearTimeout'] });
    vi.setSystemTime(FRIDAY);
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it('never mentions the World Cup or the old hardcoded code', async () => {
    renderSale();
    await settle();
    expect(document.body.textContent).not.toMatch(/world cup/i);
    expect(document.body.textContent).not.toMatch(/332211|WORLDCUP/);
  });

  it('shows the admin title and message', async () => {
    renderSale();
    await settle();
    expect(screen.getByRole('heading', { name: 'Weekend Sale' })).toBeInTheDocument();
    expect(screen.getByText('Special offers this weekend.')).toBeInTheDocument();
  });

  it('lists only products with the Offer switch on, the same ones the homepage shows', async () => {
    renderSale();
    await settle();
    expect(screen.getByText('Red Dress')).toBeInTheDocument();
    expect(screen.queryByText('Blue Suit')).toBeNull();
    expect(screen.getByText(/1 item\./)).toBeInTheDocument();
  });

  it('shows more than the 12 the homepage row is limited to', async () => {
    fake.products = Array.from({ length: 15 }, (_, i) => product(`o${i}`, `Offer ${i}`, true));
    renderSale();
    await settle();
    expect(screen.getByText(/15 items\./)).toBeInTheDocument();
    expect(screen.getByText('Offer 14')).toBeInTheDocument();
  });

  it('says so when nothing is on offer yet', async () => {
    fake.products = [product('p2', 'Blue Suit', false)];
    renderSale();
    await settle();
    expect(screen.getByText('New offers are on the way')).toBeInTheDocument();
  });

  it('shows "No sale at the moment" when the admin switched the sale off', async () => {
    fake.row = saleRow({ is_active: false });
    renderSale();
    await settle();
    expect(screen.getByText('No sale at the moment')).toBeInTheDocument();
    expect(screen.queryByText('Red Dress')).toBeNull();
    expect(screen.queryByTestId('coupon-code')).toBeNull();
  });

  it('shows "No sale at the moment" when no settings row exists', async () => {
    fake.row = null;
    renderSale();
    await settle();
    expect(screen.getByText('No sale at the moment')).toBeInTheDocument();
  });

  it('shows the coupon code and percentage on a Friday', async () => {
    renderSale();
    await settle();
    expect(screen.getByTestId('coupon-code')).toHaveTextContent('WEEKEND15');
    expect(screen.getByText(/15% off/)).toBeInTheDocument();
    expect(screen.getByText(/Friday, Saturday and Sunday only/)).toBeInTheDocument();
  });

  it('shows the code on Saturday and Sunday too', async () => {
    for (const day of ['2026-11-28T10:00:00Z', '2026-11-29T10:00:00Z']) {
      cleanup();
      vi.setSystemTime(new Date(day));
      fake.listeners = [];
      renderSale();
      await settle();
      expect(screen.getByTestId('coupon-code')).toBeInTheDocument();
    }
  });

  it('hides the code on a weekday and says when it returns', async () => {
    vi.setSystemTime(TUESDAY);
    renderSale();
    await settle();
    expect(screen.queryByTestId('coupon-code')).toBeNull();
    expect(document.body.textContent).not.toContain('WEEKEND15');
    expect(screen.getByText(/appears on this page every Friday, Saturday and Sunday/)).toBeInTheDocument();
    expect(screen.getByText(/Today is Tuesday/)).toBeInTheDocument();
  });

  it('shows no coupon box when the admin set no code', async () => {
    fake.row = saleRow({ coupon_code: '' });
    renderSale();
    await settle();
    expect(screen.queryByTestId('coupon-code')).toBeNull();
    expect(screen.queryByText(/Weekend coupon/)).toBeNull();
    expect(screen.getByText('Red Dress')).toBeInTheDocument();
  });

  it('turns on live when the admin switches the sale on', async () => {
    fake.row = saleRow({ is_active: false });
    renderSale();
    await settle();
    expect(screen.getByText('No sale at the moment')).toBeInTheDocument();

    await act(async () => {
      adminSaves({ is_active: true, title: 'Black Friday' });
    });
    expect(screen.getByRole('heading', { name: 'Black Friday' })).toBeInTheDocument();
    expect(screen.queryByText('No sale at the moment')).toBeNull();
  });

  it('updates the code and percentage live', async () => {
    renderSale();
    await settle();
    expect(screen.getByTestId('coupon-code')).toHaveTextContent('WEEKEND15');

    await act(async () => {
      adminSaves({ coupon_code: 'ZAWADI20', discount_percent: 20 });
    });
    expect(screen.getByTestId('coupon-code')).toHaveTextContent('ZAWADI20');
    expect(screen.getByText(/20% off/)).toBeInTheDocument();
  });

  it('switches off live', async () => {
    renderSale();
    await settle();
    expect(screen.getByText('Red Dress')).toBeInTheDocument();

    await act(async () => {
      adminSaves({ is_active: false });
    });
    expect(screen.getByText('No sale at the moment')).toBeInTheDocument();
  });

  it('adds and removes products as the catalogue changes', async () => {
    const view = renderSale();
    await settle();
    expect(screen.queryByText('Green Hat')).toBeNull();

    fake.products = [product('p1', 'Red Dress', true), product('p3', 'Green Hat', true)];
    view.rerender(
      <MemoryRouter>
        <CartProvider>
          <SalePage />
        </CartProvider>
      </MemoryRouter>
    );
    expect(screen.getByText('Green Hat')).toBeInTheDocument();

    fake.products = [product('p3', 'Green Hat', true)];
    view.rerender(
      <MemoryRouter>
        <CartProvider>
          <SalePage />
        </CartProvider>
      </MemoryRouter>
    );
    expect(screen.queryByText('Red Dress')).toBeNull();
    expect(screen.getByText('Green Hat')).toBeInTheDocument();
  });
});
