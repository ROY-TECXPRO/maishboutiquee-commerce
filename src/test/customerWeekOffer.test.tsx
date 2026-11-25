import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { act, render, screen, cleanup, fireEvent } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { CartProvider, useCart } from '@/context/CartContext';
import CustomerWeekOffer from '@/components/customer-week/CustomerWeekOffer';

/**
 * The popup is now driven by the database row public.site_popups and kept in
 * sync through Supabase realtime. These tests replace the supabase client with
 * a controllable fake so we can (a) serve a row, and (b) simulate an admin
 * saving in the dashboard by firing the realtime callback.
 */
const fake = vi.hoisted(() => ({
  row: null as Record<string, unknown> | null,
  listeners: [] as Array<(payload: unknown) => void>,
}));

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({ data: fake.row, error: null }),
        }),
      }),
    }),
    channel: () => {
      const channel = {
        on: (_type: string, _filter: unknown, callback: (payload: unknown) => void) => {
          fake.listeners.push(callback);
          return channel;
        },
        subscribe: () => channel,
      };
      return channel;
    },
    removeChannel: vi.fn(),
  },
  safeInternalPath: (target: unknown, fallback = '/') =>
    typeof target === 'string' && /^\/(?![/\\])/.test(target) ? target : fallback,
}));

// Plain elements instead of animated ones, so open/close is synchronous.
vi.mock('framer-motion', async () => {
  const react = await import('react');
  const strip = ({
    children,
    initial: _i,
    animate: _a,
    exit: _e,
    transition: _t,
    ...rest
  }: Record<string, unknown> & { children?: React.ReactNode }) => ({ children, rest });
  return {
    AnimatePresence: ({ children }: { children: React.ReactNode }) =>
      react.createElement(react.Fragment, null, children),
    motion: new Proxy(
      {},
      {
        get: (_target, tag: string) => (props: Record<string, unknown>) => {
          const { children, rest } = strip(props as never);
          return react.createElement(tag, rest, children as React.ReactNode);
        },
      }
    ),
  };
});

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

const DISMISS_KEY = 'site-popup-dismissed';

function row(overrides: Record<string, unknown> = {}) {
  return {
    slug: 'seasonal',
    version: 1,
    is_active: true,
    badge_text: 'Customer Service Week',
    headline: 'Happy Customer Service Week dear customer!',
    subtitle: 'Shop with us on the website and claim 30% offers.',
    highlight_text: 'Rated 5/5',
    footer_note: 'Limited stock - 50 pairs left. Offer ends soon!',
    image_url: '/images/image-pop.webp',
    product_name: 'Nike Air Force 1 (Black)',
    price: 1500,
    original_price: 2500,
    sizes: ['39', '40', '41'],
    cta_type: 'cart',
    cta_label: 'Add to Cart & Checkout',
    link_path: '',
    delay_seconds: 5,
    starts_at: null,
    ends_at: null,
    updated_at: '2026-11-22T10:00:00.000Z',
    ...overrides,
  };
}

/** Simulates the admin pressing Save: the database trigger raises the version. */
function adminSaves(overrides: Record<string, unknown>) {
  const next = row({
    ...overrides,
    version: (overrides.version as number) ?? Number(fake.row?.version ?? 1) + 1,
    updated_at: new Date().toISOString(),
  });
  fake.row = next;
  fake.listeners.forEach((listener) => listener({ eventType: 'UPDATE', new: next }));
}

function CartProbe() {
  const { itemCount } = useCart();
  return <span data-testid="cart-count">{itemCount}</span>;
}

function renderPopup(path = '/') {
  render(
    <MemoryRouter initialEntries={[path]}>
      <CartProvider>
        <CartProbe />
        <Routes>
          <Route path="/checkout" element={<div>checkout page</div>} />
          <Route path="/sale" element={<div>sale page</div>} />
          <Route path="*" element={<CustomerWeekOffer />} />
        </Routes>
      </CartProvider>
    </MemoryRouter>
  );
}

/**
 * Moves the clock in two separate act() scopes. React only flushes effects
 * when an act() scope ends, and the popup schedules its show-timer from an
 * effect that runs after the (fake) fetch resolves. The second scope then runs
 * any timer that became due while the first one was still open.
 */
async function tick(ms: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
  await act(async () => {
    await vi.advanceTimersByTimeAsync(0);
  });
}

const HEADLINE = /Happy Customer Service Week dear customer!/i;

describe('CustomerWeekOffer popup (admin-controlled)', () => {
  beforeEach(() => {
    Object.defineProperty(globalThis, 'localStorage', {
      value: createMemoryStorage(),
      configurable: true,
      writable: true,
    });
    sessionStorage.clear();
    fake.row = row();
    fake.listeners = [];
    vi.useFakeTimers({
      toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date'],
    });
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it('is importable without calling hooks at module scope', () => {
    expect(typeof CustomerWeekOffer).toBe('function');
  });

  it('shows the admin-written content after the admin-set delay', async () => {
    renderPopup();
    await tick(4900);
    expect(screen.queryByText(HEADLINE)).toBeNull();

    await tick(200);
    expect(screen.getByText(HEADLINE)).toBeInTheDocument();
    expect(screen.getByText(/30% offers/i)).toBeInTheDocument();
    expect(screen.getByText('Nike Air Force 1 (Black)')).toBeInTheDocument();
    expect(screen.getByText(/40% off/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Add to Cart & Checkout/i })).toBeInTheDocument();
  });

  it('honours a different delay and different wording', async () => {
    fake.row = row({ delay_seconds: 1, headline: 'Merry Christmas shoppers!', badge_text: 'Christmas' });
    renderPopup();
    await tick(1100);
    expect(screen.getByText('Merry Christmas shoppers!')).toBeInTheDocument();
    expect(screen.queryByText(HEADLINE)).toBeNull();
  });

  it('never shows when the admin has switched it off', async () => {
    fake.row = row({ is_active: false });
    renderPopup();
    await tick(10000);
    expect(screen.queryByText(HEADLINE)).toBeNull();
  });

  it('shows nothing when no popup row exists', async () => {
    fake.row = null;
    renderPopup();
    await tick(10000);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('appears in realtime for a visitor who is already browsing', async () => {
    fake.row = row({ is_active: false });
    renderPopup();
    await tick(30000); // long past the delay, popup is off
    expect(screen.queryByRole('dialog')).toBeNull();

    await act(async () => {
      adminSaves({ is_active: true, headline: 'Black Friday starts now!' });
    });
    await tick(0);
    expect(screen.getByText('Black Friday starts now!')).toBeInTheDocument();
  });

  it('updates the visible text live when the admin saves again', async () => {
    renderPopup();
    await tick(5100);
    expect(screen.getByText(HEADLINE)).toBeInTheDocument();

    await act(async () => {
      adminSaves({ headline: 'Weekend flash sale!' });
    });
    expect(screen.getByText('Weekend flash sale!')).toBeInTheDocument();
    expect(screen.queryByText(HEADLINE)).toBeNull();
  });

  it('closes live when the admin switches it off', async () => {
    renderPopup();
    await tick(5100);
    expect(screen.getByRole('dialog')).toBeInTheDocument();

    await act(async () => {
      adminSaves({ is_active: false });
    });
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('stays dismissed for this version but pops up again after the next save', async () => {
    renderPopup();
    await tick(5100);
    act(() => {
      screen.getByRole('button', { name: /Cancel \/ close offer/i }).click();
    });
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(sessionStorage.getItem(DISMISS_KEY)).toBe('seasonal:1');

    // Same version, fresh mount in the same session: stays hidden.
    cleanup();
    fake.listeners = [];
    renderPopup();
    await tick(10000);
    expect(screen.queryByRole('dialog')).toBeNull();

    // The admin saves again: version 2 is shown to the same visitor at once.
    await act(async () => {
      adminSaves({ headline: 'New season, new offer' });
    });
    await tick(0);
    expect(screen.getByText('New season, new offer')).toBeInTheDocument();
  });

  it('does not interrupt checkout or cart', async () => {
    renderPopup('/cart');
    await tick(10000);
    expect(screen.queryByRole('dialog')).toBeNull();

    cleanup();
    fake.listeners = [];
    renderPopup('/checkout');
    await tick(10000);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('closes with the Escape key', async () => {
    renderPopup();
    await tick(5100);
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    act(() => {
      fireEvent.keyDown(window, { key: 'Escape' });
    });
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('waits for the admin start time and ignores an ended window', async () => {
    const inTenSeconds = new Date(Date.now() + 10_000).toISOString();
    fake.row = row({ starts_at: inTenSeconds });
    renderPopup();
    await tick(6000);
    expect(screen.queryByRole('dialog')).toBeNull();
    await tick(4500);
    expect(screen.getByRole('dialog')).toBeInTheDocument();

    cleanup();
    sessionStorage.clear();
    fake.listeners = [];
    fake.row = row({ ends_at: new Date(Date.now() - 1000).toISOString() });
    renderPopup();
    await tick(10000);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('asks for a size, then adds the offer to the cart and goes to checkout', async () => {
    renderPopup();
    await tick(5100);

    act(() => {
      screen.getByRole('button', { name: /Add to Cart & Checkout/i }).click();
    });
    expect(screen.getByRole('alert')).toHaveTextContent(/select a size/i);
    expect(screen.getByTestId('cart-count')).toHaveTextContent('0');

    act(() => {
      screen.getByRole('button', { name: '40' }).click();
    });
    expect(screen.getByRole('button', { name: '40' })).toHaveAttribute('aria-pressed', 'true');

    act(() => {
      screen.getByRole('button', { name: /Add to Cart & Checkout/i }).click();
    });
    expect(screen.getByText('checkout page')).toBeInTheDocument();
    expect(sessionStorage.getItem(DISMISS_KEY)).toBe('seasonal:1');
  });

  it('adds without a size picker when the admin lists no sizes', async () => {
    fake.row = row({ sizes: [] });
    renderPopup();
    await tick(5100);
    expect(screen.queryByRole('group', { name: /choose a size/i })).toBeNull();

    act(() => {
      screen.getByRole('button', { name: /Add to Cart & Checkout/i }).click();
    });
    expect(screen.getByText('checkout page')).toBeInTheDocument();
  });

  it('opens an in-site page when the admin chose a link button', async () => {
    fake.row = row({ cta_type: 'link', link_path: '/sale', cta_label: 'See the sale', sizes: [] });
    renderPopup();
    await tick(5100);
    act(() => {
      screen.getByRole('button', { name: /See the sale/i }).click();
    });
    expect(screen.getByText('sale page')).toBeInTheDocument();
  });

  it('refuses an off-site link even if one reaches the database', async () => {
    fake.row = row({ cta_type: 'link', link_path: '//evil.example', cta_label: 'Go', sizes: [] });
    renderPopup();
    await tick(5100);
    act(() => {
      screen.getByRole('button', { name: /^Go$/ }).click();
    });
    // Falls back to "/", which in this test renders the popup route, not a page.
    expect(screen.queryByText('sale page')).toBeNull();
    expect(screen.queryByText('checkout page')).toBeNull();
  });
});
