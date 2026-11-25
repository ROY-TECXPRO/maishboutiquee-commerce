import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { act, render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { CartProvider, useCart } from '@/context/CartContext';
import type { Product } from '@/types';

const coupon = vi.hoisted(() => ({ check: vi.fn() }));

vi.mock('@/lib/supabase', () => ({ supabase: {} }));
vi.mock('@/lib/siteSale', async () => {
  const actual = await vi.importActual<typeof import('@/lib/siteSale')>('@/lib/siteSale');
  return { ...actual, validateSaleCoupon: coupon.check };
});

import CartPage from '@/pages/CartPage';

const item: Product = {
  id: 'p1', name: 'Red Dress', price: 1000, originalPrice: 1500,
  images: [{ src: '/placeholder.svg', alt: 'Red Dress' }],
  category: 'women-wear', sizes: ['M'], colors: [{ name: 'Red', hex: '#f00', available: true }],
  tags: [], rating: 4, reviewCount: 1, stock: 9, sku: 'p1',
} as Product;

function Seed() {
  const { addItem, itemCount } = useCart();
  React.useEffect(() => {
    if (itemCount === 0) addItem(item, 'M', item.colors[0], 2);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return null;
}

function renderCart() {
  return render(
    <MemoryRouter>
      <CartProvider>
        <Seed />
        <CartPage />
      </CartProvider>
    </MemoryRouter>
  );
}

describe('Cart promo code (server-checked, admin-controlled)', () => {
  beforeEach(() => {
    const store = new Map<string, string>();
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      value: {
        getItem: (k: string) => store.get(k) ?? null,
        setItem: (k: string, v: string) => void store.set(k, String(v)),
        removeItem: (k: string) => void store.delete(k),
        clear: () => store.clear(), key: () => null, length: 0,
      },
    });
    coupon.check.mockReset();
  });
  afterEach(cleanup);

  async function typeAndApply(code: string) {
    fireEvent.change(await screen.findByPlaceholderText('Promo code'), { target: { value: code } });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Apply' }));
    });
  }

  it('applies the percentage the server returns, not a fixed one', async () => {
    coupon.check.mockResolvedValue({ valid: true, percent: 25, reason: 'ok' });
    renderCart();
    await typeAndApply('ZAWADI25');

    expect(coupon.check).toHaveBeenCalledWith('ZAWADI25');
    expect(await screen.findByText(/ZAWADI25 applied: 25% off/)).toBeInTheDocument();
    expect(screen.getByText('Discount (25%)')).toBeInTheDocument();
    // 2 x KES 1,000 = 2,000 subtotal; 25% = 500
    expect(screen.getByText(/-\s*KES 500/)).toBeInTheDocument();
  });

  it('no longer accepts the old hardcoded code unless the admin set it', async () => {
    coupon.check.mockResolvedValue({ valid: false, percent: 0, reason: 'invalid' });
    renderCart();
    await typeAndApply('332211');
    expect(await screen.findByText('That promo code is not valid.')).toBeInTheDocument();
    expect(screen.queryByText(/Discount \(/)).toBeNull();
  });

  it('explains that coupons work on weekends only', async () => {
    coupon.check.mockResolvedValue({ valid: false, percent: 0, reason: 'not_weekend' });
    renderCart();
    await typeAndApply('WEEKEND15');
    expect(await screen.findByText(/only valid on Friday, Saturday and Sunday/)).toBeInTheDocument();
  });

  it('explains when no promotion is running', async () => {
    coupon.check.mockResolvedValue({ valid: false, percent: 0, reason: 'inactive' });
    renderCart();
    await typeAndApply('ANYTHING');
    expect(await screen.findByText(/no promotion running/i)).toBeInTheDocument();
  });

  it('shows a retry message, not "invalid", when the server cannot be reached', async () => {
    coupon.check.mockResolvedValue({ valid: false, percent: 0, reason: 'error' });
    renderCart();
    await typeAndApply('WEEKEND15');
    expect(await screen.findByText(/try again/i)).toBeInTheDocument();
    expect(screen.queryByText(/not valid/)).toBeNull();
  });

  it('keeps Apply disabled for an empty or blank code', async () => {
    renderCart();
    const apply = await screen.findByRole('button', { name: 'Apply' });
    expect(apply).toBeDisabled();
    fireEvent.change(screen.getByPlaceholderText('Promo code'), { target: { value: '   ' } });
    expect(apply).toBeDisabled();
    await waitFor(() => expect(coupon.check).not.toHaveBeenCalled());
  });
});
